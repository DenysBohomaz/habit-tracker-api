import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { habits, habitLogs, tasks, tags, dailyMetrics, journalEntries, goals, bodyProfiles } from '../db/schema.js'

export default async function bootstrapRoutes(app: FastifyInstance) {
  // GET /bootstrap — all user data in one shot
  app.get('/bootstrap', { preHandler: [app.authenticate] }, async (req) => {
    const { sub: userId } = req.user as { sub: string }

    const [
      habitsData,
      habitLogsData,
      tasksData,
      tagsData,
      metricsData,
      journalData,
      goalsData,
      bodyData,
    ] = await Promise.all([
      db.select().from(habits).where(eq(habits.userId, userId)),
      db.select().from(habitLogs).where(eq(habitLogs.userId, userId)),
      db.select().from(tasks).where(eq(tasks.userId, userId)),
      db.select().from(tags).where(eq(tags.userId, userId)),
      db.select().from(dailyMetrics).where(eq(dailyMetrics.userId, userId)),
      db.select().from(journalEntries).where(eq(journalEntries.userId, userId)),
      db.select().from(goals).where(eq(goals.userId, userId)).limit(1),
      db.select().from(bodyProfiles).where(eq(bodyProfiles.userId, userId)).limit(1),
    ])

    return {
      habits: habitsData,
      habitLogs: habitLogsData,
      tasks: tasksData.filter(t => t.list === 'plan'),
      laterTasks: tasksData.filter(t => t.list === 'later'),
      tags: tagsData,
      metrics: metricsData,
      journal: journalData,
      goals: goalsData[0] ?? null,
      bodyProfile: bodyData[0] ?? null,
    }
  })
}
