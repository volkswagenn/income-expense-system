import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import { wsManager } from './ws.manager.js'

export async function syncWsRoute(app: FastifyInstance) {
  app.get<{ Querystring: { token?: string; deviceId?: string; shopId?: string } }>(
    '/ws',
    { websocket: true },
    (connection: SocketStream, request: FastifyRequest<{ Querystring: { token?: string; deviceId?: string; shopId?: string } }>) => {
      const { token, deviceId = 'unknown-device', shopId } = request.query
      const socket = connection.socket

      if (!token) {
        socket.close(4001, 'Missing token')
        return
      }

      try {
        app.jwt.verify(token)
      } catch {
        socket.close(4001, 'Invalid token')
        return
      }

      if (!shopId) {
        socket.close(4002, 'Missing shopId')
        return
      }

      const conn = { ws: socket, deviceId }
      wsManager.add(shopId, conn)

      const pingInterval = setInterval(() => {
        if (socket.readyState === 1) socket.ping()
      }, 30_000)

      socket.on('close', () => {
        clearInterval(pingInterval)
        wsManager.remove(shopId, conn)
      })
      socket.on('error', () => {
        clearInterval(pingInterval)
        wsManager.remove(shopId, conn)
      })
    },
  )
}
