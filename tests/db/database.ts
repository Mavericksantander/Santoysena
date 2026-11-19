import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import pg from 'pg'
import { expect } from 'vitest'

const root = join(import.meta.dirname, '..', '..')
const migrationsDir = join(root, 'supabase', 'migrations')

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  exec(sql: string): Promise<void>
  close(): Promise<void>
}

/**
 * Base con todas las migraciones aplicadas.
 *
 * Sin TEST_DATABASE_URL: Postgres en memoria (PGlite) con el stub de Supabase.
 * Con TEST_DATABASE_URL: una base Supabase real que ya tiene las migraciones
 * (el CI la levanta con `supabase db start`), para que el stub no pueda
 * esconder una diferencia con Supabase.
 */
export async function migratedDatabase(): Promise<Db> {
  const url = process.env.TEST_DATABASE_URL
  if (url) {
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    return {
      query: async (sql, params) => ({ rows: (await client.query(sql, params)).rows }),
      exec: async (sql) => {
        await client.query(sql)
      },
      close: () => client.end(),
    }
  }

  const lite = new PGlite()
  await lite.exec(readFileSync(join(import.meta.dirname, 'supabase-stub.sql'), 'utf8'))
  for (const file of readdirSync(migrationsDir).sort()) {
    await lite.exec(readFileSync(join(migrationsDir, file), 'utf8'))
  }
  return {
    query: (sql, params) => lite.query(sql, params),
    exec: async (sql) => {
      await lite.exec(sql)
    },
    close: () => lite.close(),
  }
}

/** Crea un usuario de auth; el trigger de la base le crea el perfil. */
export async function createUser(db: Db, displayName?: string): Promise<string> {
  const user = await db.query<{ id: string }>(
    'insert into auth.users (id, raw_user_meta_data) values (gen_random_uuid(), $1) returning id',
    [displayName === undefined ? null : JSON.stringify({ display_name: displayName })],
  )
  return user.rows[0]!.id
}

/**
 * Afirma que `run` falla con un error que calza con `pattern`, y deja la
 * transacción utilizable (un error de Postgres la aborta entera si no hay
 * savepoint). Así un mismo test puede comprobar el estado después del rechazo.
 */
export async function expectRejected(
  db: Db,
  run: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await db.exec('savepoint expect_rejected')
  let message = 'la operación no fue rechazada'
  try {
    await run()
  } catch (error) {
    message = error instanceof Error ? error.message : String(error)
  }
  await db.exec('rollback to savepoint expect_rejected')
  expect(message).toMatch(pattern)
}
