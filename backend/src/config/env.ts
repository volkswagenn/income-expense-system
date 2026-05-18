import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.string().default('development'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  ALLOW_DEV_NO_AUTH: z.string().optional().transform((value) => value === 'true'),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_SERVICE_KEY: z.string().optional().default(''),
  SUPABASE_BACKUP_BUCKET: z.string().optional().default('backups'),
})

export const env = envSchema.parse(process.env)

if (env.NODE_ENV === 'production' && env.ALLOW_DEV_NO_AUTH) {
  throw new Error('ALLOW_DEV_NO_AUTH must be disabled in production')
}
