import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { requireAuth, requireShopAccess } from '../../middleware/auth.js'

const registerAttachmentSchema = z.object({
  shopId: z.string().min(1),
  recordTable: z.string().min(1),
  recordId: z.string().min(1),
  path: z.string().min(1),
  storageKey: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  sizeBytes: z.number().int().optional().nullable(),
  checksum: z.string().optional().nullable(),
})

export async function attachmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  app.post('/register', async (request, reply) => {
    const input = registerAttachmentSchema.parse(request.body)
    if (!await requireShopAccess(request, reply, input.shopId)) return reply
    const item = await prisma.attachmentObject.create({
      data: {
        ...input,
        storageKey: input.storageKey ?? null,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes ?? null,
        checksum: input.checksum ?? null,
        uploadedBy: request.user.accountId,
      },
    })
    return { attachment: item }
  })

  app.get('/', async (request, reply) => {
    const query = z.object({
      shopId: z.string().min(1),
      recordTable: z.string().optional(),
      recordId: z.string().optional(),
    }).parse(request.query)
    if (!await requireShopAccess(request, reply, query.shopId)) return reply
    const attachments = await prisma.attachmentObject.findMany({
      where: {
        shopId: query.shopId,
        deletedAt: null,
        ...(query.recordTable ? { recordTable: query.recordTable } : {}),
        ...(query.recordId ? { recordId: query.recordId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    })
    return { attachments }
  })
}

