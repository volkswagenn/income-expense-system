import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../../db/prisma.js'
import { requireAuth, requireShopAccess } from '../../middleware/auth.js'
import { assertAllowedTable, TABLE_ORDER } from './allowedTables.js'
import { getPayloadUpdatedAt, sanitizePayload } from './sanitize.js'
import { wsManager } from './ws.manager.js'

const changeSchema = z.object({
  id: z.string().min(1).optional(),
  tableName: z.string().min(1),
  recordId: z.string().min(1),
  action: z.enum(['upsert', 'delete']),
  payload: z.unknown().optional(),
})

const pushSchema = z.object({
  shopId: z.string().min(1),
  deviceId: z.string().min(1).default('unknown-device'),
  changes: z.array(changeSchema),
})

function jsonPayload(payload: unknown): Prisma.InputJsonValue {
  return sanitizePayload(payload ?? {}) as Prisma.InputJsonValue
}

export async function syncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  app.post('/push', async (request, reply) => {
    const input = pushSchema.parse(request.body)
    if (!await requireShopAccess(request, reply, input.shopId)) return reply

    await prisma.shop.upsert({
      where: { id: input.shopId },
      update: {},
      create: { id: input.shopId, name: input.shopId },
    })

    await prisma.device.upsert({
      where: { deviceId: input.deviceId },
      update: { shopId: input.shopId },
      create: { deviceId: input.deviceId, shopId: input.shopId },
    })

    const ordered = [...input.changes].sort(
      (a, b) => (TABLE_ORDER[a.tableName] ?? 999) - (TABLE_ORDER[b.tableName] ?? 999),
    )
    const applied: string[] = []
    const failed: Array<{ id?: string; recordId: string; tableName: string; message: string }> = []
    const serverTime = new Date()

    for (const change of ordered) {
      try {
        assertAllowedTable(change.tableName)
        const payload = jsonPayload(change.payload)
        const incomingUpdatedAt = getPayloadUpdatedAt(payload, serverTime)
        const updatedAt = incomingUpdatedAt > serverTime ? serverTime : serverTime

        if (change.action === 'delete') {
          await prisma.syncRecord.upsert({
            where: { shopId_tableName_recordId: { shopId: input.shopId, tableName: change.tableName, recordId: change.recordId } },
            update: { payload, deviceId: input.deviceId, updatedAt, deletedAt: updatedAt },
            create: {
              shopId: input.shopId,
              tableName: change.tableName,
              recordId: change.recordId,
              payload,
              deviceId: input.deviceId,
              updatedAt,
              deletedAt: updatedAt,
            },
          })
        } else {
          const existing = await prisma.syncRecord.findUnique({
            where: { shopId_tableName_recordId: { shopId: input.shopId, tableName: change.tableName, recordId: change.recordId } },
          })
          if (!existing || existing.updatedAt <= updatedAt) {
            await prisma.syncRecord.upsert({
              where: { shopId_tableName_recordId: { shopId: input.shopId, tableName: change.tableName, recordId: change.recordId } },
              update: { payload, deviceId: input.deviceId, updatedAt, deletedAt: null },
              create: {
                shopId: input.shopId,
                tableName: change.tableName,
                recordId: change.recordId,
                payload,
                deviceId: input.deviceId,
                updatedAt,
                deletedAt: null,
              },
            })
          }
        }

        await prisma.syncLog.create({
          data: {
            shopId: input.shopId,
            deviceId: input.deviceId,
            tableName: change.tableName,
            recordId: change.recordId,
            action: change.action,
          },
        })
        applied.push(change.id ?? change.recordId)
      } catch (error) {
        failed.push({
          id: change.id,
          recordId: change.recordId,
          tableName: change.tableName,
          message: error instanceof Error ? error.message : 'Sync failed',
        })
      }
    }

    const syncedAt = new Date().toISOString()
    if (applied.length > 0) wsManager.notify(input.shopId, input.deviceId, syncedAt)

    return { ok: failed.length === 0, applied, failed, syncedAt }
  })

  app.get('/pull', async (request, reply) => {
    const query = z.object({
      shopId: z.string().min(1),
      since: z.string().datetime().optional(),
    }).parse(request.query)
    if (!await requireShopAccess(request, reply, query.shopId)) return reply

    const since = query.since ? new Date(query.since) : new Date(0)
    const [records, deletes] = await Promise.all([
      prisma.syncRecord.findMany({
        where: { shopId: query.shopId, updatedAt: { gt: since }, deletedAt: null },
        orderBy: { updatedAt: 'asc' },
      }),
      prisma.syncRecord.findMany({
        where: { shopId: query.shopId, deletedAt: { gt: since } },
        orderBy: { deletedAt: 'asc' },
      }),
    ])

    const timestamps = [
      ...records.map((item) => item.updatedAt.getTime()),
      ...deletes.map((item) => item.deletedAt?.getTime() ?? 0),
    ].filter(Boolean)
    const syncedAt = timestamps.length
      ? new Date(Math.max(...timestamps)).toISOString()
      : (query.since ?? new Date(0).toISOString())

    return {
      syncedAt,
      changes: records.map((record) => ({
        tableName: record.tableName,
        recordId: record.recordId,
        action: 'upsert',
        payload: record.payload,
        updatedAt: record.updatedAt.toISOString(),
        deviceId: record.deviceId,
      })),
      deletes: deletes.map((record) => ({
        tableName: record.tableName,
        recordId: record.recordId,
        action: 'delete',
        updatedAt: record.deletedAt?.toISOString() ?? record.updatedAt.toISOString(),
        deviceId: record.deviceId,
      })),
    }
  })

  app.get('/status', async (request, reply) => {
    const query = z.object({ shopId: z.string().min(1) }).parse(request.query)
    if (!await requireShopAccess(request, reply, query.shopId)) return reply
    const latest = await prisma.syncLog.findFirst({
      where: { shopId: query.shopId },
      orderBy: { syncedAt: 'desc' },
    })
    const counts = await prisma.syncRecord.groupBy({
      by: ['tableName'],
      where: { shopId: query.shopId, deletedAt: null },
      _count: true,
    })
    return {
      shopId: query.shopId,
      lastSyncedAt: latest?.syncedAt.toISOString() ?? null,
      lastDeviceId: latest?.deviceId ?? null,
      tables: counts.map((item) => ({ tableName: item.tableName, count: item._count })),
    }
  })
}

