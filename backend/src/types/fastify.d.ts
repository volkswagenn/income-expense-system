import '@fastify/jwt'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      accountId: string
      username: string
      role: string
      shopIds?: string[]
    }
    user: {
      accountId: string
      username: string
      role: string
      shopIds?: string[]
    }
  }
}

