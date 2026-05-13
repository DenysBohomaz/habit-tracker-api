import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { eq, and, gt, isNull } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import nodemailer from 'nodemailer'
import { db } from '../db/index.js'
import { users, goals, bodyProfiles, passwordResetTokens } from '../db/schema.js'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  name: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const forgotSchema = z.object({
  email: z.string().email(),
})

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(4),
})

// ── Email transport ────────────────────────────────────────────────────────────
function makeTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

async function sendResetEmail(to: string, token: string) {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  const resetUrl = `${frontendUrl}?reset=${token}`
  const from = process.env.EMAIL_FROM ?? 'noreply@habit-tracker.app'

  const transport = makeTransport()
  await transport.sendMail({
    from,
    to,
    subject: 'Reset your Habit Tracker password',
    text: `Click the link to reset your password (valid for 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px">
        <h2 style="margin:0 0 8px;color:#111">Reset your password</h2>
        <p style="color:#555;margin:0 0 24px">Click the button below to set a new password. The link is valid for <strong>1 hour</strong>.</p>
        <a href="${resetUrl}"
           style="display:inline-block;padding:14px 28px;background:#111;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px">
          Reset password
        </a>
        <p style="color:#999;font-size:12px;margin-top:24px">If you didn't request this, just ignore this email.</p>
      </div>
    `,
  })
}

// ── Routes ─────────────────────────────────────────────────────────────────────
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

  // POST /auth/forgot-password — rate limited
  app.post('/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const body = forgotSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const { email } = body.data

    // Always return 200 to avoid email enumeration
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (!user) return reply.code(200).send({ ok: true })

    // Generate a 32-byte random token
    const rawToken = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token: rawToken,
      expiresAt,
    })

    // Send email (fire-and-forget — don't block response on SMTP)
    if (process.env.SMTP_HOST) {
      sendResetEmail(email, rawToken).catch((err) => {
        app.log.error({ err }, 'Failed to send reset email')
      })
    } else {
      // Dev mode: log token to console
      app.log.warn(`[DEV] Password reset token for ${email}: ${rawToken}`)
      app.log.warn(`[DEV] Reset URL: ${process.env.FRONTEND_URL ?? 'http://localhost:5173'}?reset=${rawToken}`)
    }

    return reply.code(200).send({ ok: true })
  })

  // POST /auth/reset-password
  app.post('/auth/reset-password', async (req, reply) => {
    const body = resetSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const { token, password } = body.data
    const now = new Date()

    // Find a valid, unused, non-expired token
    const [record] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.token, token),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now)
        )
      )
      .limit(1)

    if (!record) return reply.code(400).send({ error: 'Invalid or expired reset link' })

    // Update password + mark token as used (in parallel)
    const newHash = await bcrypt.hash(password, 12)
    await Promise.all([
      db.update(users).set({ passwordHash: newHash }).where(eq(users.id, record.userId)),
      db.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.id, record.id)),
    ])

    // Return a fresh JWT so the user is immediately logged in
    const [user] = await db.select().from(users).where(eq(users.id, record.userId)).limit(1)
    const jwtToken = app.jwt.sign({ sub: user.id, email: user.email })

    return reply.code(200).send({
      token: jwtToken,
      user: { id: user.id, email: user.email, name: user.name, lang: user.lang, theme: user.theme },
    })
  })
}
