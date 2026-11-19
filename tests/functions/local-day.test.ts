import { describe, expect, test } from 'vitest'
import {
  endOfLocalDay,
  formatWithOffset,
  isSupportedTimezone,
  localDateAt,
  parseLocalDate,
} from '../../supabase/functions/_shared/local-day.ts'

const SANTIAGO = 'America/Santiago'
const at = (iso: string) => new Date(iso)
const HOUR = 3_600_000

describe('localDateAt', () => {
  test('la fecha cambia exactamente en la medianoche de Santiago', () => {
    expect(localDateAt(at('2026-11-19T02:59:59.999Z'), SANTIAGO)).toBe('2026-11-18')
    expect(localDateAt(at('2026-11-19T03:00:00.000Z'), SANTIAGO)).toBe('2026-11-19')
  })

  test('en el mismo instante, cada zona tiene su propia fecha', () => {
    const instant = at('2026-11-19T03:30:00Z')
    expect(localDateAt(instant, SANTIAGO)).toBe('2026-11-19')
    expect(localDateAt(instant, 'Pacific/Easter')).toBe('2026-11-18')
    expect(localDateAt(instant, 'Asia/Tokyo')).toBe('2026-11-19')
    expect(localDateAt(at('2026-11-18T16:00:00Z'), 'Asia/Tokyo')).toBe('2026-11-19')
  })

  test('no depende de la zona horaria de la máquina', () => {
    // Los gates corren esta suite con TZ=UTC y con TZ=America/Santiago.
    expect(localDateAt(at('2026-01-01T02:59:59Z'), SANTIAGO)).toBe('2025-12-31')
  })

  test('rechaza una zona que no existe', () => {
    expect(() => localDateAt(at('2026-11-18T12:00:00Z'), 'Marte/Olympus')).toThrow(RangeError)
  })
})

describe('endOfLocalDay', () => {
  test('un día normal termina a las 00:00 del día siguiente', () => {
    const end = endOfLocalDay(at('2026-11-18T15:00:00Z'), SANTIAGO)
    expect(end.toISOString()).toBe('2026-11-19T03:00:00.000Z')
    expect(formatWithOffset(end, SANTIAGO)).toBe('2026-11-19T00:00:00-03:00')
  })

  test('da lo mismo a cualquier hora del día', () => {
    const ends = ['2026-11-18T03:00:00Z', '2026-11-18T15:00:00Z', '2026-11-19T02:59:59.999Z'].map(
      (iso) => endOfLocalDay(at(iso), SANTIAGO).toISOString(),
    )
    expect(new Set(ends)).toEqual(new Set(['2026-11-19T03:00:00.000Z']))
  })

  test('al empezar el horario de verano en Chile, el día siguiente parte a la 01:00', () => {
    // El sábado 4 de septiembre de 2027 termina cuando los relojes saltan de 00:00 a 01:00.
    const end = endOfLocalDay(at('2027-09-04T15:00:00Z'), SANTIAGO)
    expect(end.toISOString()).toBe('2027-09-05T04:00:00.000Z')
    expect(formatWithOffset(end, SANTIAGO)).toBe('2027-09-05T01:00:00-03:00')
    // Y ese domingo dura 23 horas.
    const sundayEnd = endOfLocalDay(end, SANTIAGO)
    expect(sundayEnd.getTime() - end.getTime()).toBe(23 * HOUR)
  })

  test('al terminar el horario de verano en Chile, el sábado dura 25 horas', () => {
    const start = endOfLocalDay(at('2027-04-02T15:00:00Z'), SANTIAGO)
    const end = endOfLocalDay(start, SANTIAGO)
    expect(localDateAt(start, SANTIAGO)).toBe('2027-04-03')
    expect(end.getTime() - start.getTime()).toBe(25 * HOUR)
    expect(formatWithOffset(end, SANTIAGO)).toBe('2027-04-04T00:00:00-04:00')
    // Durante la hora repetida la fecha sigue siendo sábado.
    expect(localDateAt(new Date(end.getTime() - 1), SANTIAGO)).toBe('2027-04-03')
  })

  test('recorriendo hora por hora los fines de semana de cambio de hora, la fecha nunca retrocede', () => {
    for (const from of ['2027-04-02T00:00:00Z', '2027-09-03T00:00:00Z', '2026-04-03T00:00:00Z']) {
      let previous = ''
      for (let hour = 0; hour < 96; hour += 1) {
        const date = localDateAt(new Date(at(from).getTime() + hour * HOUR), SANTIAGO)
        expect(date >= previous).toBe(true)
        previous = date
      }
    }
  })

  test('en toda zona horaria, el fin del día es el límite exacto entre dos fechas', () => {
    const zones = Intl.supportedValuesOf('timeZone')
    expect(zones.length).toBeGreaterThan(300)
    const failures: string[] = []
    for (const zone of zones) {
      for (let sample = 0; sample < 40; sample += 1) {
        const now = new Date(Date.UTC(2026, 0, 1) + sample * (9 * 24 + 7) * HOUR)
        const today = localDateAt(now, zone)
        const end = endOfLocalDay(now, zone)
        const ok =
          end.getTime() > now.getTime() &&
          end.getTime() - now.getTime() <= 26 * HOUR &&
          localDateAt(new Date(end.getTime() - 1), zone) === today &&
          localDateAt(end, zone) > today
        if (!ok) failures.push(`${zone} ${now.toISOString()}`)
      }
    }
    expect(failures).toEqual([])
  })
})

describe('formatWithOffset', () => {
  test.each([
    ['Asia/Kolkata', '2026-11-18T18:30:00Z', '2026-11-19T00:00:00+05:30'],
    ['UTC', '2026-11-19T00:00:00Z', '2026-11-19T00:00:00+00:00'],
    ['Pacific/Easter', '2026-11-19T05:00:00Z', '2026-11-19T00:00:00-05:00'],
  ])('%s', (zone, instant, expected) => {
    expect(formatWithOffset(at(instant), zone)).toBe(expected)
  })

  test('el texto representa el mismo instante', () => {
    const instant = at('2027-09-05T04:00:00Z')
    expect(new Date(formatWithOffset(instant, SANTIAGO)).getTime()).toBe(instant.getTime())
  })
})

describe('parseLocalDate', () => {
  test('acepta una fecha de calendario real', () => {
    expect(parseLocalDate('2028-02-29')).toBe('2028-02-29')
  })

  test.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-1-1', 'hoy', '', '2026-11-18T00:00'])(
    'rechaza %j',
    (value) => {
      expect(() => parseLocalDate(value)).toThrow('invalid_local_date')
    },
  )
})

describe('isSupportedTimezone', () => {
  test.each(['America/Santiago', 'Pacific/Easter', 'America/Punta_Arenas', 'UTC'])('acepta %s', (zone) => {
    expect(isSupportedTimezone(zone)).toBe(true)
  })

  test.each(['Marte/Olympus', '', 'santiago'])('rechaza %j', (zone) => {
    expect(isSupportedTimezone(zone)).toBe(false)
  })
})
