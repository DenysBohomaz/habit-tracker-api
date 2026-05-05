import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import jwtPlugin from './plugins/jwt.js'
import authRoutes from './routes/auth.js'
import bootstrapRoutes from './routes/bootstrap.js'
import habitsRoutes from './routes/habits.js'
import tasksRoutes from './routes/tasks.js'
import tagsRoutes from './routes/tags.js'
import metricsRoutes from './routes/metrics.js'
import journalRoutes from './routes/journal.js'
import goalsRoutes from './routes/goals.js'
import profileRoutes from './routes/profile.js'
import migrateRoutes from './routes/migrate.js'

const app = Fastify({ logger: process.env.NODE_ENV !== 'production' })

// ── Plugins ────────────────────────────────────────────────────────────────────
await app.register(cors, {
  origin: process.env.FRONTEND_URL ?? '*',
  credentials: true,
})
await app.register(cookie)
await app.register(rateLimit, {
  global: false,
})
await app.register(jwtPlugin)

// ── Routes ─────────────────────────────────────────────────────────────────────
await app.register(authRoutes)
await app.register(bootstrapRoutes)
await app.register(habitsRoutes)
await app.register(tasksRoutes)
await app.register(tagsRoutes)
await app.register(metricsRoutes)
await app.register(journalRoutes)
await app.register(goalsRoutes)
await app.register(profileRoutes)
await app.register(migrateRoutes)

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
