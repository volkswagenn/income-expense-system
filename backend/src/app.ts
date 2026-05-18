import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import { env } from './config/env.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { shopRoutes } from './modules/shops/shops.routes.js'
import { syncRoutes } from './modules/sync/sync.routes.js'
import { syncWsRoute } from './modules/sync/sync.ws.js'
import { attachmentRoutes } from './modules/attachments/attachments.routes.js'

export async function buildApp() {
  const app = Fastify({ logger: true })

  await app.register(helmet)
  await app.register(cors, {
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      const allowed = env.FRONTEND_ORIGIN.split(',').map((item) => item.trim()).filter(Boolean)
      const vercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)
      cb(null, allowed.includes(origin) || vercelPreview)
    },
    credentials: true,
  })
  await app.register(rateLimit, { max: 240, timeWindow: '1 minute' })
  await app.register(jwt, { secret: env.JWT_SECRET })
  await app.register(websocket)

  app.get('/health', async () => ({ ok: true, status: 'healthy', service: 'income-expense-cloud-backend' }))

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(shopRoutes, { prefix: '/api/shops' })
  await app.register(syncRoutes, { prefix: '/api/sync' })
  await app.register(syncWsRoute, { prefix: '/api/sync' })
  await app.register(attachmentRoutes, { prefix: '/api/attachments' })

  return app
}

