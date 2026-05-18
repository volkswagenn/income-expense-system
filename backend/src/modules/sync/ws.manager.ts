type Conn = {
  ws: { readyState: number; send: (data: string) => void }
  deviceId: string
}

class WsManager {
  private rooms = new Map<string, Set<Conn>>()

  add(shopId: string, conn: Conn) {
    if (!this.rooms.has(shopId)) this.rooms.set(shopId, new Set())
    this.rooms.get(shopId)!.add(conn)
  }

  remove(shopId: string, conn: Conn) {
    this.rooms.get(shopId)?.delete(conn)
  }

  notify(shopId: string, fromDeviceId: string, syncedAt: string) {
    const room = this.rooms.get(shopId)
    if (!room) return
    const message = JSON.stringify({ type: 'changes', syncedAt })
    for (const conn of room) {
      if (conn.deviceId === fromDeviceId) continue
      if (conn.ws.readyState === 1) conn.ws.send(message)
    }
  }
}

export const wsManager = new WsManager()

