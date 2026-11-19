import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  ALGORITHM_VERSION,
  codeMessage,
  dailyCode,
  drawIndexes,
  importServerSecret,
  type DailyCodeInput,
} from '../../supabase/functions/_shared/daily-code.ts'
import { parseUuid } from '../../supabase/functions/_shared/input.ts'
import { parseLocalDate } from '../../supabase/functions/_shared/local-day.ts'
import { WORDLIST_ES_V1 } from '../../supabase/functions/_shared/wordlist-es-v1.ts'

const SECRET = Buffer.alloc(32, 7)
const OTHER_SECRET = Buffer.alloc(32, 8)
const FAMILY = parseUuid('22222222-2222-4222-8222-222222222222', 'family')
const DATE = parseLocalDate('2026-11-18')

const keyFrom = (secret: Buffer) => importServerSecret(secret.toString('base64'))
const familyNumber = (n: number) =>
  parseUuid(`00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`, 'family')

async function code(overrides: Partial<Omit<DailyCodeInput, 'key'>> = {}, secret = SECRET) {
  const input = { familyId: FAMILY, date: DATE, epoch: 0, wordCount: 2 as const, ...overrides }
  return (await dailyCode({ key: await keyFrom(secret), ...input })).join(' ')
}

/** Implementación independiente del mismo algoritmo, escrita sobre node:crypto y texto binario. */
function referenceIndexes(secret: Buffer, message: string, count: number, size: number): number[] {
  const bits = Math.ceil(Math.log2(size))
  const indexes: number[] = []
  for (let counter = 0; indexes.length < count; counter += 1) {
    const digest = createHmac('sha256', secret).update(`${message}\nblock=${counter}`).digest()
    const binary = [...digest].map((byte) => byte.toString(2).padStart(8, '0')).join('')
    for (let i = 0; i + bits <= 256 && indexes.length < count; i += bits) {
      const candidate = Number.parseInt(binary.slice(i, i + bits), 2)
      if (candidate < size) indexes.push(candidate)
    }
  }
  return indexes
}

function chiSquare(observed: number[]): number {
  const expected = observed.reduce((a, b) => a + b, 0) / observed.length
  return observed.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('determinismo', () => {
  test('la misma familia y fecha dan siempre el mismo código', async () => {
    expect(await code()).toBe(await code())
  })

  test('son dos palabras de la lista', async () => {
    const words = (await code()).split(' ')
    expect(words).toHaveLength(2)
    for (const word of words) expect(WORDLIST_ES_V1).toContain(word)
  })

  // Vector fijo de la versión 1. Si falla, cambió el algoritmo o la lista: eso
  // cambia los códigos de todas las familias y exige subir ALGORITHM_VERSION.
  test('vector conocido de la versión 1', async () => {
    expect(ALGORITHM_VERSION).toBe(1)
    expect(await code()).toBe('COCIENTE PROCESIÓN')
    expect(await code({ wordCount: 3 })).toBe('MISIONERO LLEGAR DANZAR')
  })

  test('el mensaje firmado tiene exactamente esta forma', () => {
    expect(codeMessage({ familyId: FAMILY, date: DATE, epoch: 4, wordCount: 2 })).toBe(
      'santo-y-sena/daily-code\nv=1\nfamily=22222222-2222-4222-8222-222222222222\ndate=2026-11-18\nepoch=4\nwords=2',
    )
  })
})

describe('independencia', () => {
  test('cada fecha de un año tiene su propio código', async () => {
    const codes = new Set<string>()
    for (let day = 0; day < 366; day += 1) {
      const date = new Date(Date.UTC(2028, 0, 1 + day)).toISOString().slice(0, 10)
      codes.add(await code({ date: parseLocalDate(date) }))
    }
    expect(codes.size).toBe(366)
  })

  test('mil familias distintas tienen códigos distintos el mismo día', async () => {
    const codes = new Set<string>()
    for (let n = 0; n < 1000; n += 1) codes.add(await code({ familyId: familyNumber(n) }))
    expect(codes.size).toBeGreaterThanOrEqual(999)
  })

  test('subir code_epoch cambia el código de hoy', async () => {
    expect(await code({ epoch: 1 })).not.toBe(await code({ epoch: 0 }))
  })

  test('otra llave del servidor da otros códigos', async () => {
    expect(await code({}, OTHER_SECRET)).not.toBe(await code())
  })

  test('el código de tres palabras no es el de dos con una palabra más', async () => {
    const three = await code({ wordCount: 3 })
    expect(three.split(' ')).toHaveLength(3)
    expect(three.startsWith(await code())).toBe(false)
  })
})

describe('HMAC-SHA256 y muestreo sin sesgo', () => {
  test('coincide con una implementación independiente sobre la lista real', async () => {
    const key = await keyFrom(SECRET)
    for (let n = 0; n < 50; n += 1) {
      const message = codeMessage({ familyId: familyNumber(n), date: DATE, epoch: n, wordCount: 3 })
      expect(await drawIndexes(key, message, 3, 4096)).toEqual(referenceIndexes(SECRET, message, 3, 4096))
    }
  })

  test.each([2, 3, 5, 7, 1000, 4097, 7776])(
    'coincide con la implementación independiente cuando la lista tiene %d palabras',
    async (size) => {
      const key = await keyFrom(SECRET)
      expect(await drawIndexes(key, 'mensaje', 300, size)).toEqual(
        referenceIndexes(SECRET, 'mensaje', 300, size),
      )
    },
  )

  test('todos los índices caen dentro de la lista', async () => {
    const indexes = await drawIndexes(await keyFrom(SECRET), 'mensaje', 5000, 5)
    expect(indexes.every((index) => Number.isInteger(index) && index >= 0 && index < 5)).toBe(true)
  })

  test('con una lista de 5 palabras, las cinco salen con la misma frecuencia', async () => {
    const counts = [0, 0, 0, 0, 0]
    for (const index of await drawIndexes(await keyFrom(SECRET), 'mensaje', 50_000, 5)) counts[index]! += 1
    // 4 grados de libertad: sobre 18,47 ocurre por azar 1 vez en 1.000. Un sesgo por módulo da miles.
    expect(chiSquare(counts)).toBeLessThan(18.47)
  })

  test('sobre la lista real, las palabras se reparten parejo entre familias', async () => {
    const key = await keyFrom(SECRET)
    const buckets = Array.from({ length: 16 }, () => 0)
    for (let n = 0; n < 4000; n += 1) {
      const message = codeMessage({ familyId: familyNumber(n), date: DATE, epoch: 0, wordCount: 2 })
      for (const index of await drawIndexes(key, message, 2, 4096)) buckets[index % 16]! += 1
    }
    // 15 grados de libertad: sobre 37,70 ocurre por azar 1 vez en 1.000.
    expect(chiSquare(buckets)).toBeLessThan(37.7)
  })

  test('no usa Math.random', async () => {
    const insecure = vi.spyOn(Math, 'random')
    await code()
    expect(insecure).not.toHaveBeenCalled()
  })

  test.each([1, 0, -4, 2.5, 2 ** 32 + 1])('rechaza una lista de tamaño %d', async (size) => {
    await expect(drawIndexes(await keyFrom(SECRET), 'mensaje', 1, size)).rejects.toThrow('invalid_size')
  })
})

describe('entradas inválidas', () => {
  test.each([-1, 1.5, Number.NaN, Infinity])('rechaza la época %d', async (epoch) => {
    await expect(code({ epoch })).rejects.toThrow('invalid_epoch')
  })
})

describe('llave del servidor', () => {
  test('se importa como llave HMAC que solo firma y no se puede extraer', async () => {
    const key = await keyFrom(SECRET)
    expect(key.extractable).toBe(false)
    expect(key.usages).toEqual(['sign'])
    expect(key.algorithm).toMatchObject({ name: 'HMAC', hash: { name: 'SHA-256' } })
  })

  test('acepta exactamente 32 bytes', async () => {
    await expect(importServerSecret(Buffer.alloc(32, 1).toString('base64'))).resolves.toBeDefined()
  })

  test.each([undefined, '', Buffer.alloc(31, 1).toString('base64'), 'Y29ydGE='])(
    'rechaza una llave ausente o de menos de 32 bytes: %j',
    async (secret) => {
      await expect(importServerSecret(secret)).rejects.toThrow('server_secret_too_short')
    },
  )

  test('rechaza una llave que no es base64', async () => {
    await expect(importServerSecret('¡esto no es base64! '.repeat(4))).rejects.toThrow(
      'server_secret_not_base64',
    )
  })
})
