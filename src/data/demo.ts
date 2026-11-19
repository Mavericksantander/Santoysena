// Fuente de muestra: no habla con ningún servidor y sus códigos no protegen
// a nadie. Las palabras salen de una lista corta y fija que rota por día,
// solo para mostrar cómo se ve la aplicación.

import { endOfLocalDay, localDateAt } from '../../supabase/functions/_shared/local-day.ts'
import type { DataSource } from './source.ts'

const TIMEZONE = 'America/Santiago'

const SAMPLE_CODES = [
  ['COPIHUE', 'PLANEADOR'],
  ['VOLCÁN', 'BRÚJULA'],
  ['ALERCE', 'MARIPOSA'],
  ['CORDILLERA', 'PINGÜINO'],
  ['SOPAIPILLA', 'VELERO'],
  ['GUITARRA', 'ARRAYÁN'],
  ['CHUCAO', 'LINTERNA'],
] as const

const FAMILY = { id: 'muestra', name: 'Familia Pérez Soto' }

export function demoSource(now: () => Date = () => new Date()): DataSource {
  return {
    isDemo: true,
    listFamilies: () => Promise.resolve([FAMILY]),
    getFamilyCode: (familyId) => {
      const instant = now()
      const date = localDateAt(instant, TIMEZONE)
      const dayNumber = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000)
      const [wordOne, wordTwo] = SAMPLE_CODES[dayNumber % SAMPLE_CODES.length]!
      return Promise.resolve({
        familyId,
        date,
        timezone: TIMEZONE,
        wordOne,
        wordTwo,
        expiresAt: endOfLocalDay(instant, TIMEZONE),
      })
    },
    listMembers: () =>
      Promise.resolve([
        { userId: '1', displayName: 'Abuela Rosa', role: 'admin', isOwner: true },
        { userId: '2', displayName: 'Pedro', role: 'admin', isOwner: false },
        { userId: '3', displayName: 'Camila', role: 'member', isOwner: false },
        { userId: '4', displayName: 'Tata Luis', role: 'member', isOwner: false },
      ]),
  }
}
