import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { tasks } from '../db/schema.js'

const taskBody = z.object({
  tagId: z.string().uuid().nullable().optional(),
  text: z.string().min(1),
  description: z.string().nullable().optional(),
  list: z.enum(['plan', 'later']).optional(),
  done: z.boolean().optional(),
  pinned: z.boolean().optional(),
  importance: z.number().int().min(1).max(5).optional(),
  urgency: z.number().int().min(1).max(5).optional(),
  position: z.number().int().optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  reminder: z.string().datetime({ offset: true }).nullable().optional(),
})

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null
  return new Date(v)
}

function parseDates<T extends { deadline?: string | null; reminder?: string | null }>(
  data: T,
): Omit<T, 'deadline' | 'reminder'> & { deadline: Date | null; reminder: Date | null } {
  return { ...data, deadline: toDate(data.deadline), reminder: toDate(data.reminder) }
}

export default async function tasksRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // GET /tasks
  app.get('/tasks', auth, async (req) => {
    const { sub: userId } = req.user as { sub: string }
    return db.select().from(tasks).where(eq(tasks.userId, userId))
  })

  // POST /tasks
  app.post('/tasks', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const body = taskBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const [task] = await db.insert(tasks).values({ ...parseDates(body.data), userId }).returning()
    return reply.code(201).send(task)
  })

  // PATCH /tasks/:id
  app.patch('/tasks/:id', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const { id } = req.params as { id: string }
    const body = taskBody.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const [updated] = await db
      .update(tasks)
      .set(parseDates(body.data as z.infer<typeof taskBody>))
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning()
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return updated
  })

  // DELETE /tasks/:id
  app.delete('/tasks/:id', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const { id } = req.params as { id: string }
    const [deleted] = await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning()
    if (!deleted) return reply.code(404).send({ error: 'Not found' })
    return reply.code(204).send()
  })
}
