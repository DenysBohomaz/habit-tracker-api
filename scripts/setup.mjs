import 'dotenv/config'
import pg from 'pg'
import bcrypt from 'bcrypt'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// 1. Create password_reset_tokens table
await pool.query(`
  CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "token" text NOT NULL,
    "expires_at" timestamp NOT NULL,
    "used_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
  );
`)
console.log('✅ Table password_reset_tokens ready')

// 2. Upsert 3 accounts with password "1111"
const hash = await bcrypt.hash('1111', 12)
const emails = [
  'denys.bogomaz.work@gmail.com',
  'denisbogomaz5@gmail.com',
  'denys_pm@upiple.com',
]

for (const email of emails) {
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (rows.length) {
    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email])
    console.log(`✅ Updated password for ${email}`)
  } else {
    const { rows: created } = await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
      [email, hash, email.split('@')[0]]
    )
    await pool.query('INSERT INTO goals (user_id) VALUES ($1)', [created[0].id])
    console.log(`✅ Created account for ${email}`)
  }
}

await pool.end()
console.log('🎉 Done')
