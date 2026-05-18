import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { requireAuth, requireShopAccess } from '../../middleware/auth.js'

const shopSchema = z.object({
  id: z.string().min(1),
  code: z.string().optional().nullable(),
  name: z.string().min(1),
})

export async function shopRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  app.get('/', async (request) => {
    const where = request.user.role === 'owner' || request.user.role === 'superadmin'
      ? {}
      : { id: { in: request.user.shopIds ?? [] } }
    const shops = await prisma.shop.findMany({ where, orderBy: { updatedAt: 'desc' } })
    return { shops }
  })

  app.post('/', async (request) => {
    const input = shopSchema.parse(request.body)
    const shop = await prisma.shop.upsert({
      where: { id: input.id },
      update: { name: input.name.trim(), code: input.code ?? null, deletedAt: null },
      create: { id: input.id, name: input.name.trim(), code: input.code ?? null, ownerId: request.user.accountId },
    })

    if (request.user.accountId !== 'dev-account') {
      await prisma.shopMember.upsert({
        where: { shopId_accountId: { shopId: shop.id, accountId: request.user.accountId } },
        update: { role: 'owner' },
        create: { shopId: shop.id, accountId: request.user.accountId, role: 'owner' },
      })
    }

    return { shop }
  })

  app.patch('/:shopId', async (request, reply) => {
    const params = z.object({ shopId: z.string().min(1) }).parse(request.params)
    if (!await requireShopAccess(request, reply, params.shopId)) return reply
    const input = z.object({ name: z.string().min(1), code: z.string().optional().nullable() }).parse(request.body)
    const shop = await prisma.shop.update({
      where: { id: params.shopId },
      data: { name: input.name.trim(), code: input.code ?? null },
    })
    return { shop }
  })
}

