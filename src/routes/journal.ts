import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { journalEntries } from '../db/schema.js'

const entryBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: z.string().min(1),
})

export default async function journalRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // GET /journal
  app.get('/journal', auth, async (req) => {
    const { sub: userId } = req.user as { sub: string }
    return db.select().from(journalEntries).where(eq(journalEntries.userId, userId))
  })

  // POST /journal
  app.post('/journal', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const body = entryBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const [entry] = await db.insert(journalEntries).values({ ...body.data, userId }).returning()
    return reply.code(201).send(entry)
  })

  // PATCH /journal/:id
  app.patch('/journal/:id', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const { id } = req.params as { id: string }
    const body = entryBody.partial().omit({ date: true }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const [updated] = await db
      .update(journalEntries)
      .set(body.data)
      .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
      .returning()
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return updated
  })

  // DELETE /journal/:id
  app.delete('/journal/:id', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const { id } = req.params as { id: string }
    const [deleted] = await db
      .delete(journalEntries)
      .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
      .returning()
    if (!deleted) return reply.code(404).send({ error: 'Not found' })
    return reply.code(204).send()
  })
}
