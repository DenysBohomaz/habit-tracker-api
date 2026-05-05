import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwtPlugin from './plugins/jwt.js'
import authRoutes from './routes/auth.js'
import bootstrapRoutes from './routes/bootstrap.js'

const app = Fastify({ logger: process.env.NODE_ENV !== 'production' })

// ── Plugins ────────────────────────────────────────────────────────────────────
await app.register(cors, {
  origin: process.env.FRONTEND_URL ?? '*',
  credentials: true,
})
await app.register(cookie)
await app.register(jwtPlugin)

// ── Routes ─────────────────────────────────────────────────────────────────────
await app.register(authRoutes)
await app.register(bootstrapRoutes)

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

// ── Start ──────────────────────────────────────────────────────────────────────
const port = parseInt(process.env.PORT ?? '3000')
try {
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`🚀  Server running on port ${port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
