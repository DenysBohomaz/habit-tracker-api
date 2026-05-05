import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, gte, lte } from 'drizzle-orm'
import { db } from '../db/index.js'
import { dailyMetrics } from '../db/schema.js'

const metricsBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  water: z.number().min(0).optional(),
  calories: z.number().min(0).optional(),
  sleep: z.number().min(0).nullable().optional(),
  steps: z.number().int().min(0).optional(),
})

export default async function metricsRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // GET /metrics?from=&to=
  app.get('/metrics', auth, async (req) => {
    const { sub: userId } = req.user as { sub: string }
    const { from, to } = req.query as { from?: string; to?: string }
    const conditions = [eq(dailyMetrics.userId, userId)]
    if (from) conditions.push(gte(dailyMetrics.date, from))
    if (to) conditions.push(lte(dailyMetrics.date, to))
    return db.select().from(dailyMetrics).where(and(...conditions))
  })

  // POST /metrics — upsert by (userId, date)
  app.post('/metrics', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const body = metricsBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { date, water, calories, sleep, steps } = body.data
    const values = {
      userId,
      date,
      ...(water !== undefined && { water: String(water) }),
      ...(calories !== undefined && { calories: String(calories) }),
      ...(sleep !== undefined && { sleep: sleep !== null ? String(sleep) : null }),
      ...(steps !== undefined && { steps }),
    }
    const [row] = await db
      .insert(dailyMetrics)
      .values(values)
      .onConflictDoUpdate({
        target: [dailyMetrics.userId, dailyMetrics.date],
        set: values,
      })
      .returning()
    return reply.code(201).send(row)
  })
}
