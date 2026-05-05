import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { habits, habitLogs, tasks, tags, dailyMetrics, journalEntries, goals, bodyProfiles } from '../db/schema.js'

// Loose schemas — accept whatever shape localStorage stored
const habitSchema = z.object({
  name: z.string(),
  emoji: z.string().optional(),
  freq: z.array(z.string()).optional(),
  time: z.string().optional(),
  target: z.number().optional(),
  notes: z.string().nullable().optional(),
  position: z.number().optional(),
  createdAt: z.string().optional(),
})

const habitLogSchema = z.object({
  habitId: z.string(),          // old (local) habitId — will be remapped
  date: z.string(),
  count: z.union([z.string(), z.number()]),
})

const taskSchema = z.object({
  text: z.string(),
  description: z.string().nullable().optional(),
  list: z.enum(['plan', 'later']).optional(),
  done: z.boolean().optional(),
  pinned: z.boolean().optional(),
  importance: z.number().optional(),
  urgency: z.number().optional(),
  position: z.number().optional(),
  deadline: z.string().nullable().optional(),
  reminder: z.string().nullable().optional(),
  tagId: z.string().nullable().optional(),  // old local tagId — will be remapped
})

const tagSchema = z.object({ name: z.string() })

const metricSchema = z.object({
  date: z.string(),
  water: z.union([z.string(), z.number()]).optional(),
  calories: z.union([z.string(), z.number()]).optional(),
  sleep: z.union([z.string(), z.number()]).nullable().optional(),
  steps: z.number().optional(),
})

const journalSchema = z.object({
  date: z.string(),
  text: z.string(),
})

const goalsSchema = z.object({
  waterMin: z.union([z.string(), z.number()]).optional(),
  waterNorm: z.union([z.string(), z.number()]).optional(),
  waterMax: z.union([z.string(), z.number()]).optional(),
  sleepMin: z.union([z.string(), z.number()]).optional(),
  sleepNorm: z.union([z.string(), z.number()]).optional(),
  sleepMax: z.union([z.string(), z.number()]).optional(),
  calMin: z.union([z.string(), z.number()]).optional(),
  calNorm: z.union([z.string(), z.number()]).optional(),
  calMax: z.union([z.string(), z.number()]).optional(),
  stepsMin: z.union([z.string(), z.number()]).optional(),
  stepsNorm: z.union([z.string(), z.number()]).optional(),
  stepsMax: z.union([z.string(), z.number()]).optional(),
}).optional()

const profileSchema = z.object({
  gender: z.string().nullable().optional(),
  weightKg: z.union([z.string(), z.number()]).nullable().optional(),
  heightCm: z.union([z.string(), z.number()]).nullable().optional(),
  age: z.union([z.string(), z.number()]).nullable().optional(),
  goal: z.string().nullable().optional(),
  activity: z.union([z.string(), z.number()]).nullable().optional(),
}).optional()

const migrateBody = z.object({
  // keyed by old local ID
  habits: z.record(z.string(), habitSchema).optional(),
  habitLogs: z.array(habitLogSchema).optional(),
  tasks: z.array(taskSchema).optional(),
  laterTasks: z.array(taskSchema).optional(),
  tags: z.record(z.string(), tagSchema).optional(),
  metrics: z.array(metricSchema).optional(),
  journal: z.array(journalSchema).optional(),
  goals: goalsSchema,
  bodyProfile: profileSchema,
})

function toNum(v: string | number | null | undefined): string | undefined {
  if (v === null || v === undefined) return undefined
  return String(Number(v))
}

export default async function migrateRoutes(app: FastifyInstance) {
  app.post('/migrate', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sub: userId } = req.user as { sub: string }

    // Only allow migration once — if user already has habits, skip
    const existing = await db.select().from(habits).where(eq(habits.userId, userId)).limit(1)
    if (existing.length > 0) {
      return reply.code(409).send({ error: 'Migration already applied. Account already has data.' })
    }

    const body = migrateBody.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const {
      habits: habitsMap = {},
      habitLogs: logs = [],
      tasks: planTasks = [],
      laterTasks = [],
      tags: tagsMap = {},
      metrics = [],
      journal = [],
      goals: goalsData,
      bodyProfile: profileData,
    } = body.data

    // ── 1. Insert tags, build old→new ID map ──────────────────────────────────
    const tagIdMap: Record<string, string> = {}
    for (const [oldId, tag] of Object.entries(tagsMap)) {
      const [inserted] = await db
        .insert(tags)
        .values({ userId, name: tag.name })
        .onConflictDoUpdate({ target: [tags.userId, tags.name], set: { name: tag.name } })
        .returning()
      tagIdMap[oldId] = inserted.id
    }

    // ── 2. Insert habits, build old→new ID map ────────────────────────────────
    const habitIdMap: Record<string, string> = {}
    for (const [oldId, habit] of Object.entries(habitsMap)) {
      const [inserted] = await db
        .insert(habits)
        .values({
          userId,
          name: habit.name,
          emoji: habit.emoji ?? '🎯',
          freq: habit.freq ?? ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          time: (habit.time as 'morning' | 'afternoon' | 'evening' | 'anytime') ?? 'anytime',
          target: habit.target ?? 1,
          notes: habit.notes ?? null,
          position: habit.position ?? 0,
        })
        .returning()
      habitIdMap[oldId] = inserted.id
    }

    // ── 3. Insert habit logs (remap habit IDs) ────────────────────────────────
    for (const log of logs) {
      const newHabitId = habitIdMap[log.habitId]
      if (!newHabitId) continue
      await db
        .insert(habitLogs)
        .values({ habitId: newHabitId, userId, date: log.date, count: String(Number(log.count)) })
        .onConflictDoNothing()
    }

    // ── 4. Insert tasks (remap tag IDs) ───────────────────────────────────────
    const allTasks = [
      ...planTasks.map(t => ({ ...t, list: 'plan' as const })),
      ...laterTasks.map(t => ({ ...t, list: 'later' as const })),
    ]
    for (const task of allTasks) {
      const newTagId = task.tagId ? (tagIdMap[task.tagId] ?? null) : null
      await db.insert(tasks).values({
        userId,
        text: task.text,
        description: task.description ?? null,
        list: task.list,
        done: task.done ?? false,
        pinned: task.pinned ?? false,
        importance: task.importance ?? 3,
        urgency: task.urgency ?? 3,
        position: task.position ?? 0,
        deadline: task.deadline ? new Date(task.deadline) : null,
        reminder: task.reminder ? new Date(task.reminder) : null,
        tagId: newTagId,
      })
    }

    // ── 5. Insert metrics ─────────────────────────────────────────────────────
    for (const m of metrics) {
      await db
        .insert(dailyMetrics)
        .values({
          userId,
          date: m.date,
          water: toNum(m.water) ?? '0',
          calories: toNum(m.calories) ?? '0',
          sleep: m.sleep !== undefined && m.sleep !== null ? toNum(m.sleep) ?? null : null,
          steps: m.steps ?? 0,
        })
        .onConflictDoNothing()
    }

    // ── 6. Insert journal entries ─────────────────────────────────────────────
    for (const entry of journal) {
      await db.insert(journalEntries).values({ userId, date: entry.date, text: entry.text })
    }

    // ── 7. Upsert goals ───────────────────────────────────────────────────────
    if (goalsData) {
      const goalsValues = {
        userId,
        ...(goalsData.waterMin !== undefined && { waterMin: toNum(goalsData.waterMin) }),
        ...(goalsData.waterNorm !== undefined && { waterNorm: toNum(goalsData.waterNorm) }),
        ...(goalsData.waterMax !== undefined && { waterMax: toNum(goalsData.waterMax) }),
        ...(goalsData.sleepMin !== undefined && { sleepMin: toNum(goalsData.sleepMin) }),
        ...(goalsData.sleepNorm !== undefined && { sleepNorm: toNum(goalsData.sleepNorm) }),
        ...(goalsData.sleepMax !== undefined && { sleepMax: toNum(goalsData.sleepMax) }),
        ...(goalsData.calMin !== undefined && { calMin: Number(goalsData.calMin) }),
        ...(goalsData.calNorm !== undefined && { calNorm: Number(goalsData.calNorm) }),
        ...(goalsData.calMax !== undefined && { calMax: Number(goalsData.calMax) }),
        ...(goalsData.stepsMin !== undefined && { stepsMin: Number(goalsData.stepsMin) }),
        ...(goalsData.stepsNorm !== undefined && { stepsNorm: Number(goalsData.stepsNorm) }),
        ...(goalsData.stepsMax !== undefined && { stepsMax: Number(goalsData.stepsMax) }),
      }
      await db
        .insert(goals)
        .values(goalsValues)
        .onConflictDoUpdate({ target: [goals.userId], set: goalsValues })
    }

    // ── 8. Upsert body profile ────────────────────────────────────────────────
    if (profileData) {
      const profileValues = {
        userId,
        ...(profileData.gender !== undefined && { gender: profileData.gender }),
        ...(profileData.weightKg !== undefined && { weightKg: toNum(profileData.weightKg) }),
        ...(profileData.heightCm !== undefined && { heightCm: toNum(profileData.heightCm) }),
        ...(profileData.age !== undefined && { age: profileData.age !== null ? Number(profileData.age) : null }),
        ...(profileData.goal !== undefined && { goal: profileData.goal }),
        ...(profileData.activity !== undefined && { activity: toNum(profileData.activity) }),
      }
      await db
        .insert(bodyProfiles)
        .values(profileValues)
        .onConflictDoUpdate({ target: [bodyProfiles.userId], set: profileValues })
    }

    return {
      ok: true,
      imported: {
        habits: Object.keys(habitIdMap).length,
        habitLogs: logs.length,
        tasks: allTasks.length,
        tags: Object.keys(tagIdMap).length,
        metrics: metrics.length,
        journal: journal.length,
      },
    }
  })
}
