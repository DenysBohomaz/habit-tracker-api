import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, gte, lte } from 'drizzle-orm'
import { db } from '../db/index.js'
import { habits, habitLogs } from '../db/schema.js'

const habitBody = z.object({
  name: z.string().min(1),
  emoji: z.string().optional(),
  freq: z.array(z.string()).min(1),
  time: z.enum(['morning', 'afternoon', 'evening', 'anytime']).optional(),
  target: z.number().int().min(1).optional(),
  notes: z.string().nullable().optional(),
  position: z.number().int().optional(),
})

const logBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().min(0),
})

export default async function habitsRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // GET /habits
  app.get('/habits', auth, async (req) => {
    const { sub: userId } = req.user as { sub: string }
    return db.select().from(habits).where(eq(habits.userId, userId))
  })

  // POST /habits
  app.post('/habits', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const body = habitBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const [habit] = await db.insert(habits).values({ ...body.data, userId }).returning()
    return reply.code(201).send(habit)
  })

  // PATCH /habits/:id
  app.patch('/habits/:id', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const { id } = req.params as { id: string }
    const body = habitBody.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const [updated] = await db
      .update(habits)
      .set(body.data)
      .where(and(eq(habits.id, id), eq(habits.userId, userId)))
      .returning()
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return updated
  })

  // DELETE /habits/:id
  app.delete('/habits/:id', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const { id } = req.params as { id: string }
    const [deleted] = await db
      .delete(habits)
      .where(and(eq(habits.id, id), eq(habits.userId, userId)))
      .returning()
    if (!deleted) return reply.code(404).send({ error: 'Not found' })
    return reply.code(204).send()
  })

  // POST /habits/:id/logs — upsert log for a date
  app.post('/habits/:id/logs', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const { id: habitId } = req.params as { id: string }
    const body = logBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    // verify habit belongs to user
    const [habit] = await db.select().from(habits).where(and(eq(habits.id, habitId), eq(habits.userId, userId))).limit(1)
    if (!habit) return reply.code(404).send({ error: 'Habit not found' })

    const [log] = await db
      .insert(habitLogs)
      .values({ habitId, userId, date: body.data.date, count: String(body.data.count) })
      .onConflictDoUpdate({
        target: [habitLogs.habitId, habitLogs.date],
        set: { count: String(body.data.count) },
      })
      .returning()
    return reply.code(201).send(log)
  })

  // GET /habits/:id/logs?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/habits/:id/logs', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const { id: habitId } = req.params as { id: string }
    const { from, to } = req.query as { from?: string; to?: string }

    const conditions = [eq(habitLogs.habitId, habitId), eq(habitLogs.userId, userId)]
    if (from) conditions.push(gte(habitLogs.date, from))
    if (to) conditions.push(lte(habitLogs.date, to))

    return db.select().from(habitLogs).where(and(...conditions))
  })
}
