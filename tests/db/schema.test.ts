import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { createUser, type Db, migratedDatabase } from './database.ts'

const TABLES = ['profiles', 'families', 'family_members', 'family_invitations']
const CLIENT_ROLES = ['anon', 'authenticated']
const HASH = 'a'.repeat(64)

let db: Db

const createProfile = (db: Db) => createUser(db, 'Abuela Rosa')

/** Inserta la fila sin pasar por app.create_family: estos tests miran solo el esquema. */
async function createFamily(db: Db, ownerId: string): Promise<string> {
  const family = await db.query<{ id: string }>(
    "insert into public.families (name, owner_id) values ('Familia Pérez', $1) returning id",
    [ownerId],
  )
  return family.rows[0]!.id
}

beforeAll(async () => {
  db = await migratedDatabase()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
})
afterEach(async () => {
  await db.exec('rollback')
})

describe('acceso del cliente', () => {
  test('las tablas esperadas existen y ninguna guarda códigos diarios', async () => {
    const tables = await db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    )
    expect(tables.rows.map((row) => row.tablename)).toEqual([...TABLES].sort())
  })

  test('toda tabla de public tiene RLS activo', async () => {
    const withoutRls = await db.query<{ relname: string }>(
      `select c.relname from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    )
    expect(withoutRls.rows).toEqual([])
  })

  test('anon y authenticated no tienen privilegios sobre ninguna tabla', async () => {
    const grants = await db.query(
      `select grantee, table_name, privilege_type
       from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated')`,
    )
    expect(grants.rows).toEqual([])
  })

  test('una tabla creada después nace sin privilegios para el cliente', async () => {
    // Las migraciones corren como postgres; sus privilegios por defecto son los que importan.
    await db.exec('set local role postgres')
    await db.exec('create table public.tabla_futura (id integer)')
    const grants = await db.query(
      `select grantee from information_schema.role_table_grants
       where table_name = 'tabla_futura' and grantee in ('anon', 'authenticated')`,
    )
    expect(grants.rows).toEqual([])
  })

  for (const role of CLIENT_ROLES) {
    for (const table of TABLES) {
      test(`${role} no puede leer ${table}`, async () => {
        await db.exec(`set local role ${role}`)
        await expect(db.query(`select * from public.${table}`)).rejects.toThrow(
          /permission denied/,
        )
      })
    }
  }

  test('service_role, que usan las Edge Functions, sí puede operar', async () => {
    const owner = await createProfile(db)
    await db.exec('set local role service_role')
    const familyId = await createFamily(db, owner)
    const found = await db.query('select id from public.families where id = $1', [familyId])
    expect(found.rows).toHaveLength(1)
  })
})

describe('familias', () => {
  test('nacen en America/Santiago y con code_epoch 0', async () => {
    const familyId = await createFamily(db, await createProfile(db))
    const family = await db.query('select timezone, code_epoch from public.families where id = $1', [
      familyId,
    ])
    expect(family.rows).toEqual([{ timezone: 'America/Santiago', code_epoch: 0 }])
  })

  test.each(['Marte/Olympus', '', 'UTC+3', 'america/santiago'])(
    'rechaza la zona horaria %j',
    async (timezone) => {
      const owner = await createProfile(db)
      await expect(
        db.query("insert into public.families (name, owner_id, timezone) values ('F', $1, $2)", [
          owner,
          timezone,
        ]),
      ).rejects.toThrow(/families_timezone_valid/)
    },
  )

  test('acepta otra zona IANA válida', async () => {
    const owner = await createProfile(db)
    await db.query(
      "insert into public.families (name, owner_id, timezone) values ('F', $1, 'Pacific/Easter')",
      [owner],
    )
  })

  test('rechaza code_epoch negativo', async () => {
    const familyId = await createFamily(db, await createProfile(db))
    await expect(
      db.query('update public.families set code_epoch = -1 where id = $1', [familyId]),
    ).rejects.toThrow(/families_code_epoch_non_negative/)
  })

  test('rechaza un nombre de familia de puros espacios', async () => {
    const owner = await createProfile(db)
    await expect(
      db.query("insert into public.families (name, owner_id) values ('   ', $1)", [owner]),
    ).rejects.toThrow(/families_name_length/)
  })

  test('rechaza un nombre de persona vacío', async () => {
    const owner = await createProfile(db)
    await expect(
      db.query("update public.profiles set display_name = '' where id = $1", [owner]),
    ).rejects.toThrow(/profiles_display_name_length/)
  })

  test('borrar la familia borra sus miembros e invitaciones', async () => {
    const owner = await createProfile(db)
    const familyId = await createFamily(db, owner)
    await db.query('insert into public.family_members (family_id, user_id) values ($1, $2)', [
      familyId,
      owner,
    ])
    await db.query(
      `insert into public.family_invitations (family_id, token_hash, expires_at, created_by)
       values ($1, $2, now() + interval '1 day', $3)`,
      [familyId, HASH, owner],
    )
    await db.query('delete from public.families where id = $1', [familyId])
    const left = await db.query(
      `select (select count(*)::int from public.family_members) as members,
              (select count(*)::int from public.family_invitations) as invitations`,
    )
    expect(left.rows).toEqual([{ members: 0, invitations: 0 }])
  })
})

describe('miembros', () => {
  test('el rol por defecto es member', async () => {
    const owner = await createProfile(db)
    const familyId = await createFamily(db, owner)
    const member = await db.query(
      'insert into public.family_members (family_id, user_id) values ($1, $2) returning role',
      [familyId, owner],
    )
    expect(member.rows).toEqual([{ role: 'member' }])
  })

  test.each(['owner', 'ADMIN', ''])('rechaza el rol %j', async (role) => {
    const owner = await createProfile(db)
    const familyId = await createFamily(db, owner)
    await expect(
      db.query('insert into public.family_members (family_id, user_id, role) values ($1, $2, $3)', [
        familyId,
        owner,
        role,
      ]),
    ).rejects.toThrow(/family_members_role_valid/)
  })

  test('una persona no puede estar dos veces en la misma familia', async () => {
    const owner = await createProfile(db)
    const familyId = await createFamily(db, owner)
    const insert = 'insert into public.family_members (family_id, user_id) values ($1, $2)'
    await db.query(insert, [familyId, owner])
    await expect(db.query(insert, [familyId, owner])).rejects.toThrow(
      /family_members_family_user_unique/,
    )
  })
})

describe('invitaciones', () => {
  const insert = `insert into public.family_invitations
    (family_id, token_hash, expires_at, created_by) values ($1, $2, $3, $4)`

  test.each(['token-en-claro', 'A'.repeat(64), 'a'.repeat(63)])(
    'rechaza token_hash que no es un SHA-256 en hex: %j',
    async (tokenHash) => {
      const owner = await createProfile(db)
      const familyId = await createFamily(db, owner)
      await expect(
        db.query(insert, [familyId, tokenHash, '2999-01-01T00:00:00Z', owner]),
      ).rejects.toThrow(/family_invitations_token_hash_format/)
    },
  )

  test('rechaza un token_hash repetido', async () => {
    const owner = await createProfile(db)
    const familyId = await createFamily(db, owner)
    await db.query(insert, [familyId, HASH, '2999-01-01T00:00:00Z', owner])
    await expect(db.query(insert, [familyId, HASH, '2999-01-01T00:00:00Z', owner])).rejects.toThrow(
      /family_invitations_token_hash_unique/,
    )
  })

  test('rechaza una invitación que nace vencida', async () => {
    const owner = await createProfile(db)
    const familyId = await createFamily(db, owner)
    await expect(
      db.query(insert, [familyId, HASH, '2000-01-01T00:00:00Z', owner]),
    ).rejects.toThrow(/family_invitations_expires_after_creation/)
  })

  test('rechaza una invitación usada antes de haber sido creada', async () => {
    const owner = await createProfile(db)
    const familyId = await createFamily(db, owner)
    await db.query(insert, [familyId, HASH, '2999-01-01T00:00:00Z', owner])
    await expect(
      db.query("update public.family_invitations set used_at = created_at - interval '1 second'"),
    ).rejects.toThrow(/family_invitations_used_after_creation/)
  })
})
