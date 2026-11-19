import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const root = join(import.meta.dirname, '..', '..')
const migrationsDir = join(root, 'supabase', 'migrations')

/** Postgres en memoria con el stub de Supabase y todas las migraciones aplicadas en orden. */
export async function migratedDatabase(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(readFileSync(join(import.meta.dirname, 'supabase-stub.sql'), 'utf8'))
  for (const file of readdirSync(migrationsDir).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'))
  }
  return db
}

export async function createProfile(db: PGlite, displayName = 'Abuela Rosa'): Promise<string> {
  const user = await db.query<{ id: string }>('insert into auth.users default values returning id')
  const id = user.rows[0]!.id
  await db.query('insert into public.profiles (id, display_name) values ($1, $2)', [id, displayName])
  return id
}

export async function createFamily(db: PGlite, ownerId: string): Promise<string> {
  const family = await db.query<{ id: string }>(
    "insert into public.families (name, owner_id) values ('Familia Pérez', $1) returning id",
    [ownerId],
  )
  return family.rows[0]!.id
}
