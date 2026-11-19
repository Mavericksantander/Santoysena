import { useEffect, useState } from 'react'

export type Loaded<T> =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; value: T; loadedAt: Date }

const never = () => null

/** Espera antes de reintentar cuando el dato ya venció según el reloj de este teléfono. */
export const RETRY_WHEN_ALREADY_DUE_MS = 30_000

/** Tope de espera: un plazo enorme desborda setTimeout y se dispara de inmediato. */
export const LONGEST_WAIT_MS = 3_600_000

// Si el reloj del teléfono va adelantado, el servidor sigue entregando un dato
// que aquí parece vencido. Sin esta espera la aplicación lo pediría sin pausa.
function delayUntil(at: Date): number {
  const remaining = at.getTime() - Date.now()
  return remaining > 0 ? Math.min(remaining, LONGEST_WAIT_MS) : RETRY_WHEN_ALREADY_DUE_MS
}

/**
 * Carga un dato y lo vuelve a pedir cuando cambia `load`, cuando la aplicación
 * vuelve a primer plano y cuando llega el instante `refreshAt`. Ambas
 * funciones deben ser estables entre renders (useCallback o nivel de módulo).
 */
export function useLoad<T>(
  load: () => Promise<T>,
  refreshAt: (value: T) => Date | null = never,
): Loaded<T> & { retry(): void } {
  const [result, setResult] = useState<Loaded<T>>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const again = () => setAttempt((n) => n + 1)

    load().then(
      (value) => {
        if (cancelled) return
        setResult({ state: 'ready', value, loadedAt: new Date() })
        const at = refreshAt(value)
        if (at) timer = setTimeout(again, delayUntil(at))
      },
      () => {
        if (!cancelled) setResult({ state: 'error' })
      },
    )

    const onVisible = () => {
      if (document.visibilityState === 'visible') again()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load, refreshAt, attempt])

  return { ...result, retry: () => setAttempt((n) => n + 1) }
}
