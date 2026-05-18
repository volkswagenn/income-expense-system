import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../config/env.js'

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (env.ALLOW_DEV_NO_AUTH) {
    request.user = {
      accountId: 'dev-account',
      username: 'dev',
      role: 'owner',
      shopIds: undefined,
    }
    return
  }

  try {
    await request.jwtVerify()
  } catch {
    reply.code(401).send({ message: 'Unauthorized' })
  }
}

export function canAccessShop(request: FastifyRequest, shopId: string) {
  if (request.user.role === 'owner' || request.user.role === 'superadmin') return true
  if (!request.user.shopIds?.length) return false
  return request.user.shopIds.includes(shopId)
}

export async function requireShopAccess(request: FastifyRequest, reply: FastifyReply, shopId: string) {
  if (!canAccessShop(request, shopId)) {
    reply.code(403).send({ message: 'No access to this shop' })
    return false
  }
  return true
}

