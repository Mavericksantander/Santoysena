// Fecha local de una familia. El día de una familia va de una medianoche
// local a la siguiente, y no siempre dura 24 horas ni empieza a las 00:00:
// en Chile, el día en que comienza el horario de verano parte a la 01:00.
// Por eso el fin del día se busca, no se calcula sumando horas.

declare const brand: unique symbol
/** Fecha de calendario YYYY-MM-DD. Solo se obtiene con localDateAt o parseLocalDate. */
export type LocalDate = string & { readonly [brand]: 'LocalDate' }

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(timezone, formatter)
  }
  return formatter
}

function wallClockAt(instant: Date, timezone: string): WallClock {
  const parts: Record<string, number> = {}
  for (const part of formatterFor(timezone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return parts as unknown as WallClock
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0')

export function isSupportedTimezone(timezone: string): boolean {
  try {
    formatterFor(timezone)
    return true
  } catch {
    return false
  }
}

export function parseLocalDate(value: string): LocalDate {
  // Solo una fecha real escrita como YYYY-MM-DD sobrevive la ida y vuelta por Date.
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) {
    return value as LocalDate
  }
  throw new Error('invalid_local_date')
}

export function localDateAt(instant: Date, timezone: string): LocalDate {
  const { year, month, day } = wallClockAt(instant, timezone)
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}` as LocalDate
}

const SEARCH_WINDOW_MS = 26 * 60 * 60 * 1000

/** Primer instante en que la fecha local deja de ser la de `instant`. */
export function endOfLocalDay(instant: Date, timezone: string): Date {
  const today = localDateAt(instant, timezone)
  let stillToday = instant.getTime()
  let alreadyOver = stillToday + SEARCH_WINDOW_MS
  if (localDateAt(new Date(alreadyOver), timezone) === today) {
    throw new Error('local_day_longer_than_expected')
  }
  while (alreadyOver - stillToday > 1) {
    const middle = Math.floor((stillToday + alreadyOver) / 2)
    if (localDateAt(new Date(middle), timezone) === today) stillToday = middle
    else alreadyOver = middle
  }
  return new Date(alreadyOver)
}

/** ISO 8601 con la hora local y su desfase, por ejemplo 2026-11-19T00:00:00-03:00. */
export function formatWithOffset(instant: Date, timezone: string): string {
  const wall = wallClockAt(instant, timezone)
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  const offsetMinutes = Math.round((wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000)
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absolute = Math.abs(offsetMinutes)
  return (
    `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}` +
    `T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  )
}
