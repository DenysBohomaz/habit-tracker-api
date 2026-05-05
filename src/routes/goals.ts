import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { goals } from '../db/schema.js'

const goalsBody = z.object({
  waterMin: z.number().optional(),
  waterNorm: z.number().optional(),
  waterMax: z.number().optional(),
  sleepMin: z.number().optional(),
  sleepNorm: z.number().optional(),
  sleepMax: z.number().optional(),
  calMin: z.number().int().optional(),
  calNorm: z.number().int().optional(),
  calMax: z.number().int().optional(),
  stepsMin: z.number().int().optional(),
  stepsNorm: z.number().int().optional(),
  stepsMax: z.number().int().optional(),
})

export default async function goalsRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // GET /goals
  app.get('/goals', auth, async (req) => {
    const { sub: userId } = req.user as { sub: string }
    const [row] = await db.select().from(goals).where(eq(goals.userId, userId)).limit(1)
    return row ?? null
  })

  // PUT /goals — upsert
  app.put('/goals', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const body = goalsBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    // convert numbers to strings for numeric columns
    const toStr = (v: number | undefined) => (v !== undefined ? String(v) : undefined)
    const set = {
      ...(body.data.waterMin !== undefined && { waterMin: toStr(body.data.waterMin) }),
      ...(body.data.waterNorm !== undefined && { waterNorm: toStr(body.data.waterNorm) }),
      ...(body.data.waterMax !== undefined && { waterMax: toStr(body.data.waterMax) }),
      ...(body.data.sleepMin !== undefined && { sleepMin: toStr(body.data.sleepMin) }),
      ...(body.data.sleepNorm !== undefined && { sleepNorm: toStr(body.data.sleepNorm) }),
      ...(body.data.sleepMax !== undefined && { sleepMax: toStr(body.data.sleepMax) }),
      ...(body.data.calMin !== undefined && { calMin: body.data.calMin }),
      ...(body.data.calNorm !== undefined && { calNorm: body.data.calNorm }),
      ...(body.data.calMax !== undefined && { calMax: body.data.calMax }),
      ...(body.data.stepsMin !== undefined && { stepsMin: body.data.stepsMin }),
      ...(body.data.stepsNorm !== undefined && { stepsNorm: body.data.stepsNorm }),
      ...(body.data.stepsMax !== undefined && { stepsMax: body.data.stepsMax }),
    }

    const [row] = await db
      .insert(goals)
      .values({ userId, ...set })
      .onConflictDoUpdate({ target: [goals.userId], set })
      .returning()
    return row
  })
}
