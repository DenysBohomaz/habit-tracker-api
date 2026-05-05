import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ── Users ──────────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  lang: text('lang').default('en').notNull(),
  theme: text('theme').default('morning').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Habits ─────────────────────────────────────────────────────────────────────
export const habits = pgTable('habits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  emoji: text('emoji').default('🎯').notNull(),
  freq: text('freq').array().notNull(),           // ['sun','mon',...]
  time: text('time').default('morning').notNull(), // morning|afternoon|evening|anytime
  target: integer('target').default(1).notNull(),
  notes: text('notes'),
  position: integer('position').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Habit Logs ─────────────────────────────────────────────────────────────────
export const habitLogs = pgTable('habit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  habitId: uuid('habit_id').notNull().references(() => habits.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  count: numeric('count', { precision: 5, scale: 2 }).default('0').notNull(),
}, (t) => [
  unique().on(t.habitId, t.date),
  index('habit_logs_user_date_idx').on(t.userId, t.date),
  index('habit_logs_habit_date_idx').on(t.habitId, t.date),
])

// ── Tags ───────────────────────────────────────────────────────────────────────
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
}, (t) => [unique().on(t.userId, t.name)])

// ── Tasks ──────────────────────────────────────────────────────────────────────
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').references(() => tags.id, { onDelete: 'set null' }),
  text: text('text').notNull(),
  description: text('description'),
  list: text('list').default('plan').notNull(),   // 'plan' | 'later'
  done: boolean('done').default(false).notNull(),
  pinned: boolean('pinned').default(false).notNull(),
  importance: integer('importance').default(3).notNull(),
  urgency: integer('urgency').default(3).notNull(),
  position: integer('position').default(0).notNull(),
  deadline: timestamp('deadline'),
  reminder: timestamp('reminder'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Daily Metrics ──────────────────────────────────────────────────────────────
export const dailyMetrics = pgTable('daily_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  water: numeric('water', { precision: 5, scale: 2 }).default('0').notNull(),
  calories: numeric('calories', { precision: 7, scale: 2 }).default('0').notNull(),
  sleep: numeric('sleep', { precision: 4, scale: 2 }),
  steps: integer('steps').default(0).notNull(),
}, (t) => [
  unique().on(t.userId, t.date),
  index('daily_metrics_user_date_idx').on(t.userId, t.date),
])

// ── Journal Entries ────────────────────────────────────────────────────────────
export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  text: text('text').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Goals ──────────────────────────────────────────────────────────────────────
export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  waterMin: numeric('water_min', { precision: 4, scale: 2 }).default('1').notNull(),
  waterNorm: numeric('water_norm', { precision: 4, scale: 2 }).default('3').notNull(),
  waterMax: numeric('water_max', { precision: 4, scale: 2 }).default('4').notNull(),
  sleepMin: numeric('sleep_min', { precision: 4, scale: 2 }).default('6').notNull(),
  sleepNorm: numeric('sleep_norm', { precision: 4, scale: 2 }).default('8').notNull(),
  sleepMax: numeric('sleep_max', { precision: 4, scale: 2 }).default('10').notNull(),
  calMin: integer('cal_min').default(1200).notNull(),
  calNorm: integer('cal_norm').default(2000).notNull(),
  calMax: integer('cal_max').default(2800).notNull(),
  stepsMin: integer('steps_min').default(5000).notNull(),
  stepsNorm: integer('steps_norm').default(8000).notNull(),
  stepsMax: integer('steps_max').default(15000).notNull(),
})

// ── Body Profile ───────────────────────────────────────────────────────────────
export const bodyProfiles = pgTable('body_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  gender: text('gender'),               // 'male' | 'female'
  weightKg: numeric('weight_kg', { precision: 5, scale: 2 }),
  heightCm: numeric('height_cm', { precision: 5, scale: 2 }),
  age: integer('age'),
  goal: text('goal'),                   // 'maintain' | 'lose' | 'gain'
  activity: numeric('activity', { precision: 4, scale: 3 }),
})

// ── Relations ──────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many, one }) => ({
  habits: many(habits),
  tasks: many(tasks),
  tags: many(tags),
  dailyMetrics: many(dailyMetrics),
  journalEntries: many(journalEntries),
  goals: one(goals),
  bodyProfile: one(bodyProfiles),
}))

export const habitsRelations = relations(habits, ({ one, many }) => ({
  user: one(users, { fields: [habits.userId], references: [users.id] }),
  logs: many(habitLogs),
}))

export const tasksRelations = relations(tasks, ({ one }) => ({
  user: one(users, { fields: [tasks.userId], references: [users.id] }),
  tag: one(tags, { fields: [tasks.tagId], references: [tags.id] }),
}))

// ── Types ──────────────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Habit = typeof habits.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Tag = typeof tags.$inferSelect
export type DailyMetric = typeof dailyMetrics.$inferSelect
export type JournalEntry = typeof journalEntries.$inferSelect
export type Goal = typeof goals.$inferSelect
export type BodyProfile = typeof bodyProfiles.$inferSelect
