/** Hora local de la familia, por ejemplo "00:00". El día del cambio de hora puede ser "01:00". */
export function expiryTime(expiresAt: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(expiresAt)
}

/** Hora del teléfono de quien mira. */
export function clockTime(date: Date): string {
  return new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}
