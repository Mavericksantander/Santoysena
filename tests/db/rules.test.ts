import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { createUser, type Db, expectRejected, migratedDatabase } from './database.ts'

const HASH = 'b'.repeat(64)
const OTHER_HASH = 'c'.repeat(64)
const NOBODY = '00000000-0000-4000-8000-000000000000'
const DAY = 86_400

let db: Db

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

/** Desde aquí todo corre con el rol que usan las Edge Functions. */
const actAsService = () => db.exec('set local role service_role')

async function one<T>(sql: string, params: unknown[]): Promise<T> {
  const result = await db.query<{ value: T }>(`select ${sql} as value`, params)
  return result.rows[0]!.value
}

const createFamily = (actor: string) =>
  one<string>("app.create_family($1, 'Familia Pérez')", [actor])
const invite = (actor: string, family: string, hash = HASH, ttl = DAY) =>
  one<Date>('app.create_invitation($1, $2, $3, $4)', [actor, family, hash, ttl])
const accept = (actor: string, hash = HASH) =>
  one<string>('app.accept_invitation($1, $2)', [actor, hash])
const remove = (actor: string, family: string, target: string) =>
  one('app.remove_family_member($1, $2, $3)', [actor, family, target])
const setRole = (actor: string, family: string, target: string, role: string) =>
  one('app.set_member_role($1, $2, $3, $4)', [actor, family, target, role])

async function members(actor: string, family: string) {
  const result = await db.query<{ user_id: string; role: string; is_owner: boolean }>(
    'select user_id, role, is_owner from app.list_family_members($1, $2)',
    [actor, family],
  )
  return result.rows
}

const codeEpoch = (family: string) =>
  one<number>('(select code_epoch from public.families where id = $1)', [family])

/** Familia con dueña, un segundo admin y un miembro regular. */
async function familyOfThree() {
  const owner = await createUser(db, 'Rosa')
  const admin = await createUser(db, 'Pedro')
  const member = await createUser(db, 'Camila')
  await actAsService()
  const family = await createFamily(owner)
  await invite(owner, family, HASH)
  await accept(admin, HASH)
  await setRole(owner, family, admin, 'admin')
  await invite(owner, family, OTHER_HASH)
  await accept(member, OTHER_HASH)
  return { owner, admin, member, family }
}

describe('perfil', () => {
  test('crear el usuario crea su perfil con el nombre entregado', async () => {
    const user = await createUser(db, '  Abuela Rosa  ')
    expect(await one('(select display_name from public.profiles where id = $1)', [user])).toBe(
      'Abuela Rosa',
    )
  })

  test.each([undefined, '', '   '])('sin nombre útil (%j) el perfil nace como Familiar', async (name) => {
    const user = await createUser(db, name)
    expect(await one('(select display_name from public.profiles where id = $1)', [user])).toBe(
      'Familiar',
    )
  })

  test('el alta hecha por Supabase Auth, con su propio rol, también crea el perfil', async () => {
    await db.exec('set local role supabase_auth_admin')
    const user = await createUser(db, 'Rosa')
    await db.exec('reset role')
    expect(await one('(select display_name from public.profiles where id = $1)', [user])).toBe(
      'Rosa',
    )
  })

  test('un nombre demasiado largo se recorta a 60 caracteres', async () => {
    const user = await createUser(db, 'x'.repeat(200))
    expect(await one('(select display_name from public.profiles where id = $1)', [user])).toBe(
      'x'.repeat(60),
    )
  })

  test('set_display_name cambia solo el perfil del actor', async () => {
    const rosa = await createUser(db, 'Rosa')
    const pedro = await createUser(db, 'Pedro')
    await actAsService()
    await one('app.set_display_name($1, $2)', [rosa, ' Tata Rosa '])
    const names = await db.query(
      'select display_name from public.profiles where id in ($1, $2) order by display_name',
      [rosa, pedro],
    )
    expect(names.rows).toEqual([{ display_name: 'Pedro' }, { display_name: 'Tata Rosa' }])
  })
})

describe('el cliente no puede ejecutar las reglas', () => {
  test.each(['anon', 'authenticated'])('%s no puede llamar a app.create_family', async (role) => {
    const user = await createUser(db)
    await db.exec(`set local role ${role}`)
    await expectRejected(db, () => createFamily(user), /permission denied for schema app/)
  })

  test('ninguna función de app es ejecutable por anon o authenticated', async () => {
    const executable = await db.query(
      `select r.rolname, p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
       where n.nspname = 'app'
         and has_function_privilege(r.rolname, p.oid, 'execute')`,
    )
    expect(executable.rows).toEqual([])
  })

  test('una función creada después en app nace sin execute para el cliente', async () => {
    await db.exec('set local role postgres')
    await db.exec("create function app.funcion_futura() returns integer language sql as 'select 1'")
    const executable = await db.query(
      `select rolname from pg_roles
       where rolname in ('anon', 'authenticated')
         and has_function_privilege(rolname, 'app.funcion_futura()', 'execute')`,
    )
    expect(executable.rows).toEqual([])
  })
})

describe('crear familia', () => {
  test('quien la crea queda como dueño y administrador', async () => {
    const owner = await createUser(db)
    await actAsService()
    const family = await createFamily(owner)
    expect(await members(owner, family)).toEqual([{ user_id: owner, role: 'admin', is_owner: true }])
    await db.exec('set constraints all immediate')
  })

  test('rechaza una zona horaria inválida', async () => {
    const owner = await createUser(db)
    await actAsService()
    await expectRejected(
      db,
      () => one("app.create_family($1, 'F', 'Marte/Olympus')", [owner]),
      /families_timezone_valid/,
    )
  })
})

describe('invariante: el dueño siempre es administrador', () => {
  // La invariante es diferida. Aquí se vuelve inmediata después de armar la
  // familia, para que cada escritura directa sea rechazada por su propio trigger.
  async function familyWithImmediateChecks() {
    const people = await familyOfThree()
    await db.exec('set constraints all immediate')
    return people
  }

  test('no se puede degradar al dueño escribiendo la tabla directo', async () => {
    const { owner, family } = await familyWithImmediateChecks()
    await expectRejected(
      db,
      () =>
        db.query(
          "update public.family_members set role = 'member' where family_id = $1 and user_id = $2",
          [family, owner],
        ),
      /owner_must_be_admin/,
    )
  })

  test('no se puede borrar la membresía del dueño escribiendo la tabla directo', async () => {
    const { owner, family } = await familyWithImmediateChecks()
    await expectRejected(
      db,
      () =>
        db.query('delete from public.family_members where family_id = $1 and user_id = $2', [
          family,
          owner,
        ]),
      /owner_must_be_admin/,
    )
  })

  test('no puede existir una familia sin su dueño como miembro', async () => {
    const owner = await createUser(db)
    await db.exec('set constraints all immediate')
    await expectRejected(
      db,
      () => db.query("insert into public.families (name, owner_id) values ('F', $1)", [owner]),
      /owner_must_be_admin/,
    )
  })

  test('no se puede traspasar la familia a quien no es administrador', async () => {
    const { member, family } = await familyWithImmediateChecks()
    await expectRejected(
      db,
      () => db.query('update public.families set owner_id = $1 where id = $2', [member, family]),
      /owner_must_be_admin/,
    )
  })

  test('borrar la familia completa sí está permitido', async () => {
    const { family } = await familyWithImmediateChecks()
    await db.query('delete from public.families where id = $1', [family])
  })
})

describe('crear invitación', () => {
  test('un administrador la crea y vence según el plazo pedido', async () => {
    const { owner, family } = await familyOfThree()
    const expiresAt = await invite(owner, family, 'd'.repeat(64), 3600)
    const now = await one<Date>('now()', [])
    expect(expiresAt.getTime() - now.getTime()).toBe(3600 * 1000)
  })

  test('un miembro regular no puede invitar', async () => {
    const { member, family } = await familyOfThree()
    await expectRejected(db, () => invite(member, family, 'd'.repeat(64)), /not_an_admin/)
  })

  test('un extraño recibe el mismo error para una familia ajena y para una inexistente', async () => {
    const { family } = await familyOfThree()
    await db.exec('reset role')
    const stranger = await createUser(db)
    await actAsService()
    await expectRejected(db, () => invite(stranger, family, 'd'.repeat(64)), /^not_a_member$/)
    await expectRejected(db, () => invite(stranger, NOBODY, 'd'.repeat(64)), /^not_a_member$/)
  })

  test.each([299, 604_801, 0, -1, null])('rechaza el plazo %j segundos', async (ttl) => {
    const { owner, family } = await familyOfThree()
    await expectRejected(
      db,
      () => one('app.create_invitation($1, $2, $3, $4)', [owner, family, 'd'.repeat(64), ttl]),
      /invalid_ttl/,
    )
  })
})

describe('aceptar invitación', () => {
  async function familyWithInvitation() {
    const owner = await createUser(db, 'Rosa')
    const guest = await createUser(db, 'Camila')
    const other = await createUser(db, 'Extraño')
    await actAsService()
    const family = await createFamily(owner)
    await invite(owner, family)
    return { owner, guest, other, family }
  }

  test('quien acepta entra a esa familia como miembro regular', async () => {
    const { owner, guest, family } = await familyWithInvitation()
    expect(await accept(guest)).toBe(family)
    const list = await members(guest, family)
    expect(list).toHaveLength(2)
    expect(list).toContainEqual({ user_id: owner, role: 'admin', is_owner: true })
    expect(list).toContainEqual({ user_id: guest, role: 'member', is_owner: false })
  })

  test('un token no se puede usar dos veces', async () => {
    const { guest, other, family } = await familyWithInvitation()
    await accept(guest)
    await expectRejected(db, () => accept(other), /invitation_invalid/)
    await expectRejected(db, () => members(other, family), /^not_a_member$/)
  })

  test('una invitación vencida no se puede aceptar', async () => {
    const { owner, guest, family } = await familyWithInvitation()
    await db.query(
      `insert into public.family_invitations (family_id, token_hash, created_by, created_at, expires_at)
       values ($1, $2, $3, now() - interval '2 hours', now())`,
      [family, OTHER_HASH, owner],
    )
    await expectRejected(db, () => accept(guest, OTHER_HASH), /invitation_invalid/)
    await expectRejected(db, () => members(guest, family), /^not_a_member$/)
  })

  test('un token desconocido se rechaza', async () => {
    const { guest } = await familyWithInvitation()
    await expectRejected(db, () => accept(guest, 'e'.repeat(64)), /invitation_invalid/)
  })

  test('quien ya es miembro no consume la invitación', async () => {
    const { owner, guest } = await familyWithInvitation()
    await expectRejected(db, () => accept(owner), /already_a_member/)
    await accept(guest)
  })

  test('deja de valer si quien la creó fue degradado a miembro', async () => {
    const { owner, admin, family } = await familyOfThree()
    await db.exec('reset role')
    const guest = await createUser(db)
    await actAsService()
    await invite(admin, family, 'd'.repeat(64))
    await setRole(owner, family, admin, 'member')
    await expectRejected(db, () => accept(guest, 'd'.repeat(64)), /invitation_invalid/)
  })

  test('deja de valer si quien la creó fue expulsado', async () => {
    const { owner, admin, family } = await familyOfThree()
    await db.exec('reset role')
    const guest = await createUser(db)
    await actAsService()
    await invite(admin, family, 'd'.repeat(64))
    await remove(owner, family, admin)
    await expectRejected(db, () => accept(guest, 'd'.repeat(64)), /invitation_invalid/)
  })
})

describe('listar miembros', () => {
  test('un extraño no puede listar una familia ajena ni distinguirla de una inexistente', async () => {
    const { family } = await familyOfThree()
    await db.exec('reset role')
    const stranger = await createUser(db)
    await actAsService()
    await expectRejected(db, () => members(stranger, family), /^not_a_member$/)
    await expectRejected(db, () => members(stranger, NOBODY), /^not_a_member$/)
  })
})

describe('sacar miembros', () => {
  test('un administrador saca a un miembro, que pierde el acceso al instante', async () => {
    const { owner, member, family } = await familyOfThree()
    await remove(owner, family, member)
    await expectRejected(db, () => members(member, family), /^not_a_member$/)
    expect((await members(owner, family)).map((m) => m.user_id)).not.toContain(member)
  })

  test('sacar a alguien cambia el código de hoy (code_epoch sube en uno)', async () => {
    const { owner, member, family } = await familyOfThree()
    const before = await codeEpoch(family)
    await remove(owner, family, member)
    expect(await codeEpoch(family)).toBe(before + 1)
  })

  test('irse por cuenta propia también cambia el código', async () => {
    const { member, family } = await familyOfThree()
    const before = await codeEpoch(family)
    await remove(member, family, member)
    expect(await codeEpoch(family)).toBe(before + 1)
  })

  test('un intento rechazado no cambia el código', async () => {
    const { owner, member, family } = await familyOfThree()
    const before = await codeEpoch(family)
    await expectRejected(db, () => remove(member, family, owner), /not_an_admin/)
    expect(await codeEpoch(family)).toBe(before)
  })

  test('un miembro regular no puede sacar a un administrador', async () => {
    const { admin, member, family } = await familyOfThree()
    await expectRejected(db, () => remove(member, family, admin), /not_an_admin/)
    expect(await members(admin, family)).toHaveLength(3)
  })

  test('un miembro regular no puede sacar a otro miembro regular', async () => {
    const { owner, member, family } = await familyOfThree()
    await db.exec('reset role')
    const second = await createUser(db)
    await actAsService()
    await invite(owner, family, 'd'.repeat(64))
    await accept(second, 'd'.repeat(64))
    await expectRejected(db, () => remove(member, family, second), /not_an_admin/)
  })

  test('un administrador puede sacar a otro administrador que no es el dueño', async () => {
    const { owner, admin, family } = await familyOfThree()
    await remove(owner, family, admin)
    await expectRejected(db, () => members(admin, family), /^not_a_member$/)
  })

  test('nadie puede sacar al dueño, ni el dueño irse', async () => {
    const { owner, admin, family } = await familyOfThree()
    await expectRejected(db, () => remove(admin, family, owner), /cannot_remove_owner/)
    await expectRejected(db, () => remove(owner, family, owner), /cannot_remove_owner/)
  })

  test('un extraño no puede sacar a nadie', async () => {
    const { member, family } = await familyOfThree()
    await db.exec('reset role')
    const stranger = await createUser(db)
    await actAsService()
    await expectRejected(db, () => remove(stranger, family, member), /^not_a_member$/)
    await expectRejected(db, () => remove(stranger, family, stranger), /^target_not_a_member$/)
  })

  test('sacar a quien no es miembro falla sin cambiar el código', async () => {
    const { owner, family } = await familyOfThree()
    const before = await codeEpoch(family)
    await expectRejected(db, () => remove(owner, family, NOBODY), /^target_not_a_member$/)
    expect(await codeEpoch(family)).toBe(before)
  })
})

describe('cambiar roles', () => {
  test('un administrador asciende a un miembro', async () => {
    const { admin, member, family } = await familyOfThree()
    await setRole(admin, family, member, 'admin')
    expect((await members(admin, family)).find((m) => m.user_id === member)?.role).toBe('admin')
  })

  test('nadie puede cambiar su propio rol', async () => {
    const { admin, family } = await familyOfThree()
    await expectRejected(db, () => setRole(admin, family, admin, 'member'), /cannot_change_own_role/)
  })

  test('un miembro regular no puede ascenderse ni ascender a otros', async () => {
    const { admin, member, family } = await familyOfThree()
    await expectRejected(db, () => setRole(member, family, member, 'admin'), /not_an_admin/)
    await expectRejected(db, () => setRole(member, family, admin, 'member'), /not_an_admin/)
    expect((await members(admin, family)).find((m) => m.user_id === member)?.role).toBe('member')
  })

  test('nadie puede degradar al dueño', async () => {
    const { owner, admin, family } = await familyOfThree()
    await expectRejected(db, () => setRole(admin, family, owner, 'member'), /cannot_change_owner_role/)
  })

  test('rechaza un rol que no existe', async () => {
    const { owner, member, family } = await familyOfThree()
    await expectRejected(db, () => setRole(owner, family, member, 'owner'), /family_members_role_valid/)
  })

  test('cambiar el rol de quien no es miembro falla', async () => {
    const { owner, family } = await familyOfThree()
    await expectRejected(db, () => setRole(owner, family, NOBODY, 'admin'), /^target_not_a_member$/)
  })

  test('un extraño no puede cambiar roles', async () => {
    const { member, family } = await familyOfThree()
    await db.exec('reset role')
    const stranger = await createUser(db)
    await actAsService()
    await expectRejected(db, () => setRole(stranger, family, member, 'admin'), /^not_a_member$/)
  })
})

describe('contexto del código diario', () => {
  const context = async (actor: string, family: string) =>
    (
      await db.query<{ timezone: string; code_epoch: number }>(
        'select timezone, code_epoch from app.family_code_context($1, $2)',
        [actor, family],
      )
    ).rows

  test('todo miembro recibe la misma zona horaria y época de su familia', async () => {
    const { owner, member, family } = await familyOfThree()
    const expected = [{ timezone: 'America/Santiago', code_epoch: 0 }]
    expect(await context(owner, family)).toEqual(expected)
    expect(await context(member, family)).toEqual(expected)
  })

  test('cada familia recibe su propio contexto, aunque la persona esté en varias', async () => {
    const { owner, member, family } = await familyOfThree()
    const island = await one<string>("app.create_family($1, 'Familia Pakarati', 'Pacific/Easter')", [owner])
    await remove(owner, family, member)
    expect(await context(owner, family)).toEqual([{ timezone: 'America/Santiago', code_epoch: 1 }])
    expect(await context(owner, island)).toEqual([{ timezone: 'Pacific/Easter', code_epoch: 0 }])
  })

  test('un extraño no lo recibe, ni distingue una familia ajena de una inexistente', async () => {
    const { family } = await familyOfThree()
    await db.exec('reset role')
    const stranger = await createUser(db)
    await actAsService()
    await expectRejected(db, () => context(stranger, family), /^not_a_member$/)
    await expectRejected(db, () => context(stranger, NOBODY), /^not_a_member$/)
  })

  test('quien es expulsado lo pierde al instante, y la época que ven los demás ya cambió', async () => {
    const { owner, member, family } = await familyOfThree()
    await remove(owner, family, member)
    await expectRejected(db, () => context(member, family), /^not_a_member$/)
    expect(await context(owner, family)).toEqual([{ timezone: 'America/Santiago', code_epoch: 1 }])
  })
})

describe('listar mis familias', () => {
  const families = async (actor: string) =>
    (await db.query<{ id: string; name: string; role: string }>('select * from app.list_families($1)', [actor])).rows

  test('cada persona ve solo sus familias, con su rol en cada una', async () => {
    const { owner, member, family } = await familyOfThree()
    const island = await one<string>("app.create_family($1, 'Familia Pakarati')", [member])
    expect(await families(owner)).toEqual([{ id: family, name: 'Familia Pérez', role: 'admin' }])
    expect(await families(member)).toEqual([
      { id: family, name: 'Familia Pérez', role: 'member' },
      { id: island, name: 'Familia Pakarati', role: 'admin' },
    ])
  })

  test('quien no pertenece a ninguna recibe una lista vacía', async () => {
    await familyOfThree()
    await db.exec('reset role')
    const stranger = await createUser(db)
    await actAsService()
    expect(await families(stranger)).toEqual([])
  })

  test('una familia desaparece de la lista de quien fue expulsado', async () => {
    const { owner, member, family } = await familyOfThree()
    await remove(owner, family, member)
    expect(await families(member)).toEqual([])
  })
})
