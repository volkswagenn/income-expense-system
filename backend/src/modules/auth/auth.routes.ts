import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { hashPassword, randomToken, verifyPassword } from '../../utils/password.js'
import { requireAuth } from '../../middleware/auth.js'

const registerSchema = z.object({
  username: z.string().min(3),
  displayName: z.string().min(1),
  password: z.string().min(8),
})

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

function publicAccount(account: { id: string; username: string; displayName: string; role: string }) {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
  }
}

async function issueSession(app: FastifyInstance, account: { id: string; username: string; displayName: string; role: string }) {
  const memberships = await prisma.shopMember.findMany({ where: { accountId: account.id } })
  const shopIds = memberships.map((item) => item.shopId)
  const accessToken = app.jwt.sign({
    accountId: account.id,
    username: account.username,
    role: account.role,
    shopIds,
  }, { expiresIn: '15m' })
  const refreshToken = randomToken()
  await prisma.refreshToken.create({
    data: {
      accountId: account.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  })
  return { user: publicAccount(account), accessToken, refreshToken, shopIds }
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const input = registerSchema.parse(request.body)
    const exists = await prisma.cloudAccount.findUnique({ where: { username: input.username.trim().toLowerCase() } })
    if (exists) return reply.code(409).send({ message: 'Username already exists' })

    const account = await prisma.cloudAccount.create({
      data: {
        username: input.username.trim().toLowerCase(),
        displayName: input.displayName.trim(),
        passwordHash: await hashPassword(input.password),
        role: 'owner',
      },
    })
    return issueSession(app, account)
  })

  app.post('/login', async (request, reply) => {
    const input = loginSchema.parse(request.body)
    const account = await prisma.cloudAccount.findUnique({ where: { username: input.username.trim().toLowerCase() } })
    if (!account || !account.isActive) return reply.code(401).send({ message: 'Invalid username or password' })
    const ok = await verifyPassword(input.password, account.passwordHash)
    if (!ok) return reply.code(401).send({ message: 'Invalid username or password' })
    return issueSession(app, account)
  })

  app.post('/refresh', async (request, reply) => {
    const input = z.object({ refreshToken: z.string().min(1) }).parse(request.body)
    const token = await prisma.refreshToken.findUnique({ where: { token: input.refreshToken } })
    if (!token || token.revokedAt || token.expiresAt < new Date()) {
      return reply.code(401).send({ message: 'Invalid refresh token' })
    }
    const account = await prisma.cloudAccount.findUnique({ where: { id: token.accountId } })
    if (!account || !account.isActive) return reply.code(401).send({ message: 'Invalid refresh token' })
    await prisma.refreshToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() },
    })
    return issueSession(app, account)
  })

  app.post('/logout', { preHandler: requireAuth }, async (request) => {
    const input = z.object({ refreshToken: z.string().optional() }).parse(request.body ?? {})
    if (input.refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: input.refreshToken, accountId: request.user.accountId },
        data: { revokedAt: new Date() },
      })
    }
    return { ok: true }
  })

  app.get('/me', { preHandler: requireAuth }, async (request) => {
    return { user: request.user }
  })
}
