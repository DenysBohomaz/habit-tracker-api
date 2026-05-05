import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { tags } from '../db/schema.js'

const tagBody = z.object({ name: z.string().min(1) })

export default async function tagsRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // GET /tags
  app.get('/tags', auth, async (req) => {
    const { sub: userId } = req.user as { sub: string }
    return db.select().from(tags).where(eq(tags.userId, userId))
  })

  // POST /tags
  app.post('/tags', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const body = tagBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const [tag] = await db
      .insert(tags)
      .values({ ...body.data, userId })
      .onConflictDoUpdate({ target: [tags.userId, tags.name], set: { name: body.data.name } })
      .returning()
    return reply.code(201).send(tag)
  })

  // DELETE /tags/:id
  app.delete('/tags/:id', auth, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }
    const { id } = req.params as { id: string }
    const [deleted] = await db
      .delete(tags)
      .where(and(eq(tags.id, id), eq(tags.userId, userId)))
      .returning()
    if (!deleted) return reply.code(404).send({ error: 'Not found' })
    return reply.code(204).send()
  })
}
