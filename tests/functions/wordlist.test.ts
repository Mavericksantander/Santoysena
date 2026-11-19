import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { WORDLIST_ES_V1 } from '../../supabase/functions/_shared/wordlist-es-v1.ts'

/** Cómo suena una palabra en el español de Chile: b=v, s=z=c suave, ll=y, h muda, sin tildes. */
function soundOf(word: string): string {
  return word
    .toLowerCase()
    .replaceAll('gü', 'gU')
    .replace(/[áéíóúü]/g, (c) => 'aeiouu'['áéíóúü'.indexOf(c)]!)
    .replaceAll('ch', 'C')
    .replaceAll('ll', 'y')
    .replaceAll('h', '')
    .replace(/qu(?=[ei])/g, 'k')
    .replaceAll('q', 'k')
    .replace(/gu(?=[ei])/g, 'G')
    .replace(/g(?=[ei])/g, 'j')
    .replaceAll('G', 'g')
    .replaceAll('U', 'u')
    .replace(/c(?=[ei])/g, 's')
    .replaceAll('c', 'k')
    .replaceAll('z', 's')
    .replaceAll('v', 'b')
    .replaceAll('x', 'ks')
    .replaceAll('w', 'u')
    .replace(/y$/, 'i')
    .replace(/ss+/g, 's')
}

/** Raíz sin plural ni vocal final: detecta pares como GATO/GATA o PERRO/PERROS. */
function stemOf(word: string): string {
  const sound = soundOf(word)
  return (sound.length > 4 ? sound.replace(/(es|s)$/, '') : sound).replace(/[oae]$/, '')
}

function duplicatesBy(key: (word: string) => string): string[][] {
  const groups = new Map<string, string[]>()
  for (const word of WORDLIST_ES_V1) groups.set(key(word), [...(groups.get(key(word)) ?? []), word])
  return [...groups.values()].filter((group) => group.length > 1)
}

describe('lista de palabras es-v1', () => {
  test('tiene exactamente 4.096 palabras: 12 bits por palabra', () => {
    expect(WORDLIST_ES_V1).toHaveLength(4096)
  })

  test('no repite palabras', () => {
    expect(new Set(WORDLIST_ES_V1).size).toBe(4096)
  })

  test('cada palabra tiene de 4 a 10 letras mayúsculas del español', () => {
    expect(WORDLIST_ES_V1.filter((word) => !/^[A-ZÑÁÉÍÓÚÜ]{4,10}$/.test(word))).toEqual([])
  })

  test('no hay dos palabras que suenen igual por teléfono', () => {
    expect(duplicatesBy(soundOf)).toEqual([])
  })

  test('no hay pares que solo difieran en la vocal final o el plural', () => {
    expect(duplicatesBy(stemOf)).toEqual([])
  })

  test('la lista no se puede modificar en ejecución', () => {
    expect(Object.isFrozen(WORDLIST_ES_V1)).toBe(true)
  })

  // Cambiar una sola palabra cambia los códigos de todas las familias. Si este
  // test falla, no actualices el hash: restaura la lista, o crea
  // wordlist-es-v2.ts y sube ALGORITHM_VERSION en daily-code.ts.
  test('su contenido es exactamente el de la versión 1', () => {
    const hash = createHash('sha256').update(WORDLIST_ES_V1.join('\n')).digest('hex')
    expect(hash).toBe('032b12e69db66af4fc00f2f240820c58711b0c9a90590b272e73e154a62f908d')
  })
})
