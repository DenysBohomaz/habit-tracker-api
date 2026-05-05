import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users, goals, bodyProfiles } from '../db/schema.js'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export default async function authRoutes(app: FastifyInstance) {
  // POST /auth/register
  app.post('/auth/register', async (req, reply) => {
    const body = registerSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const { email, password, name } = body.data
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (existing.length) return reply.code(409).send({ error: 'Email already registered' })

    const passwordHash = await bcrypt.hash(password, 12)
    const [user] = await db.insert(users).values({ email, passwordHash, name }).returning()

    // Create default goals row
    await db.insert(goals).values({ userId: user.id })

    const token = app.jwt.sign({ sub: user.id, email: user.email })
    return reply.code(201).send({ token, user: { id: user.id, email: user.email, name: user.name } })
  })

  // POST /auth/login — rate limited
  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = loginSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const { email, password } = body.data
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })

    const token = app.jwt.sign({ sub: user.id, email: user.email })
    return { token, user: { id: user.id, email: user.email, name: user.name, lang: user.lang, theme: user.theme } }
  })

  // GET /auth/me
  app.get('/auth/me', { preHandler: [app.authenticate] }, async (req) => {
    const { sub } = req.user as { sub: string }
    const [user] = await db.select().from(users).where(eq(users.id, sub)).limit(1)
    return { id: user.id, email: user.email, name: user.name, lang: user.lang, theme: user.theme }
  })
}
