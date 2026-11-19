// Motor del código diario.
//
//   bloque_i = HMAC-SHA256(SERVER_SECRET, mensaje + "\nblock=" + i)
//
// El mensaje identifica algoritmo, familia, fecha local, época y cantidad de
// palabras. Los bloques forman un flujo de bits del que se sacan índices de
// la lista con muestreo por rechazo, así ningún índice es más probable que
// otro aunque el tamaño de la lista no sea potencia de dos.
//
// El código no se guarda en ninguna parte: se deriva cada vez que se pide.

import type { Uuid } from './input.ts'
import type { LocalDate } from './local-day.ts'
import { WORDLIST_ES_V1 } from './wordlist-es-v1.ts'

/** Identifica algoritmo y lista de palabras. Cambiarlo cambia todos los códigos. */
export const ALGORITHM_VERSION = 1

export type WordCount = 2 | 3

export interface DailyCodeInput {
  key: CryptoKey
  familyId: Uuid
  date: LocalDate
  /** families.code_epoch: sube cuando alguien sale de la familia. */
  epoch: number
  wordCount: WordCount
}

const MIN_SECRET_BYTES = 32

/** Importa SERVER_SECRET (base64 de al menos 32 bytes) como llave HMAC no extraíble. */
export async function importServerSecret(base64: string | undefined): Promise<CryptoKey> {
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = Uint8Array.from(atob(base64 ?? ''), (char) => char.charCodeAt(0))
  } catch {
    throw new Error('server_secret_not_base64')
  }
  if (bytes.length < MIN_SECRET_BYTES) throw new Error('server_secret_too_short')
  return await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

/** Cada campo tiene forma fija, así que dos entradas distintas nunca dan el mismo mensaje. */
export function codeMessage(input: Omit<DailyCodeInput, 'key'>): string {
  if (!Number.isSafeInteger(input.epoch) || input.epoch < 0) throw new Error('invalid_epoch')
  return [
    'santo-y-sena/daily-code',
    `v=${ALGORITHM_VERSION}`,
    `family=${input.familyId}`,
    `date=${input.date}`,
    `epoch=${input.epoch}`,
    `words=${input.wordCount}`,
  ].join('\n')
}

const BLOCK_BITS = 256

function bitsNeededFor(size: number): number {
  let bits = 1
  while (2 ** bits < size) bits += 1
  return bits
}

/** `count` índices uniformes en [0, size), deterministas para (key, message). */
export async function drawIndexes(
  key: CryptoKey,
  message: string,
  count: number,
  size: number,
): Promise<number[]> {
  if (!Number.isSafeInteger(size) || size < 2 || size > 2 ** 32) throw new Error('invalid_size')
  const bits = bitsNeededFor(size)
  const encoder = new TextEncoder()
  const indexes: number[] = []

  for (let counter = 0; indexes.length < count; counter += 1) {
    const block = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, encoder.encode(`${message}\nblock=${counter}`)),
    )
    for (let offset = 0; offset + bits <= BLOCK_BITS && indexes.length < count; offset += bits) {
      let candidate = 0
      for (let bit = offset; bit < offset + bits; bit += 1) {
        candidate = candidate * 2 + ((block[bit >> 3]! >> (7 - (bit & 7))) & 1)
      }
      if (candidate < size) indexes.push(candidate)
    }
  }
  return indexes
}

export async function dailyCode(
  input: DailyCodeInput,
  wordlist: readonly string[] = WORDLIST_ES_V1,
): Promise<string[]> {
  const indexes = await drawIndexes(input.key, codeMessage(input), input.wordCount, wordlist.length)
  return indexes.map((index) => wordlist[index]!)
}
