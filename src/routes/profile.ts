import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { bodyProfiles } from '../db/schema.js'

const profileBody = z.object({
  gender: z.enum(['male', 'female']).nullable().optional(),
  weightKg: z.number().positive().nullable().optional(),
  heightCm: z.number().positive().nullable().optional(),
  age: z.number().int().positive().nullable().optional(),
  goal: z.enum(['maintain', 'lose', 'gain']).nullable().optional(),
  activity: z.number().min(1).max(2).nullable().optional(),
})

export default async function profileRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // GET /profile
  app.get('/profile', auth, async (req) => {
    const { sub: userId } = req.user as { sub: string }
    const [row] = await db.select().from(bodyProfiles).where(eq(bodyProfiles.userId, userId)).limit(1)
    return row ?? null
  })

  // PUT /profile — upsert
  app.put('/profile', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const body = profileBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const toStr = (v: number | null | undefined) => (v !== undefined && v !== null ? String(v) : v)
    const set = {
      ...(body.data.gender !== undefined && { gender: body.data.gender }),
      ...(body.data.weightKg !== undefined && { weightKg: toStr(body.data.weightKg) }),
      ...(body.data.heightCm !== undefined && { heightCm: toStr(body.data.heightCm) }),
      ...(body.data.age !== undefined && { age: body.data.age }),
      ...(body.data.goal !== undefined && { goal: body.data.goal }),
      ...(body.data.activity !== undefined && { activity: toStr(body.data.activity) }),
    }

    const [row] = await db
      .insert(bodyProfiles)
      .values({ userId, ...set })
      .onConflictDoUpdate({ target: [bodyProfiles.userId], set })
      .returning()
    return row
  })
}
