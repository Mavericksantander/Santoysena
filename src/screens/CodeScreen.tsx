import { useCallback } from 'react'
import { clockTime, expiryTime } from '../data/format.ts'
import type { DailyCode, DataSource, Family } from '../data/source.ts'
import { useLoad } from '../data/useLoad.ts'
import { BigLink, LoadError, Loading, Screen } from '../ui/parts.tsx'

const whenItExpires = (code: DailyCode) => code.expiresAt

export function CodeScreen({ source, family }: { source: DataSource; family: Family }) {
  const code = useLoad(
    useCallback(() => source.getFamilyCode(family.id), [source, family.id]),
    whenItExpires,
  )

  return (
    <Screen title="SANTO Y SEÑA">
      <p className="mt-2 text-center text-xl font-semibold">{family.name}</p>

      <section aria-labelledby="hoy" className="flex flex-1 flex-col justify-center py-6">
        <h2 id="hoy" className="text-center text-xl font-semibold text-neutral-700 dark:text-neutral-300">
          Código de hoy
        </h2>
        {code.state === 'loading' && <Loading what="el código" />}
        {code.state === 'error' && <LoadError what="el código" onRetry={code.retry} />}
        {code.state === 'ready' && (
          <>
            <p
              data-testid="codigo"
              className="mt-4 flex flex-col items-center gap-2 text-center text-[clamp(2.25rem,12vw,4.5rem)] font-black leading-tight tracking-wide"
            >
              <span>{code.value.wordOne}</span>
              <span>{code.value.wordTwo}</span>
            </p>
            <p className="mt-6 text-center text-xl font-semibold">
              Válido hasta las {expiryTime(code.value.expiresAt, code.value.timezone)}
            </p>
            <p className="mt-2 text-center text-base text-neutral-700 dark:text-neutral-300">
              Actualizado a las {clockTime(code.loadedAt)}
            </p>
          </>
        )}
      </section>

      <p className="mb-4 rounded-2xl bg-neutral-100 p-4 text-center text-lg font-semibold dark:bg-neutral-800">
        Nunca digas este código. Pídeselo a quien te llama.
      </p>
      <nav aria-label="Secciones" className="flex flex-col gap-3">
        <BigLink href="#/instrucciones">VER INSTRUCCIONES</BigLink>
        <BigLink href="#/familia">MI FAMILIA</BigLink>
      </nav>
    </Screen>
  )
}
