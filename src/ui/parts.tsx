import type { ReactNode } from 'react'
import type { DataSource } from '../data/source.ts'

export function Screen({ title, children, back }: { title: string; children: ReactNode; back?: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-6 pt-4">
      {back && (
        <header className="flex min-h-14 items-center">
<a
            href="#/"
            className="-ml-3 flex min-h-14 items-center rounded-xl px-3 text-xl font-semibold underline-offset-4 hover:underline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:focus-visible:outline-yellow-300"
          >
            <span aria-hidden="true" className="mr-2">
              ←
            </span>
            Volver
          </a>
        </header>
      )}
      <main className="flex flex-1 flex-col">
        <h1 className="text-center text-2xl font-extrabold tracking-[0.2em]">{title}</h1>
        {children}
      </main>
    </div>
  )
}

export function BigLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="flex min-h-16 items-center justify-center rounded-2xl border-2 border-neutral-950 px-4 text-center text-xl font-bold tracking-wide focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-700 active:bg-neutral-200 dark:border-white dark:focus-visible:outline-yellow-300 dark:active:bg-neutral-800"
    >
      {children}
    </a>
  )
}

export function DemoBanner() {
  return (
    <p
      role="note"
      className="bg-yellow-300 px-4 py-2 text-center text-base font-bold text-neutral-950"
    >
      MUESTRA: datos de ejemplo. Este código no protege a nadie.
    </p>
  )
}

export function Loading({ what }: { what: string }) {
  return (
    <p role="status" className="py-10 text-center text-xl">
      Cargando {what}…
    </p>
  )
}

export function LoadError({ what, onRetry }: { what: string; onRetry(): void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-xl">No pudimos cargar {what}. Revisa tu conexión a internet.</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-16 rounded-2xl bg-neutral-950 px-8 text-xl font-bold text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:bg-white dark:text-neutral-950 dark:focus-visible:outline-yellow-300"
      >
        Intentar de nuevo
      </button>
    </div>
  )
}

const fieldClass =
  'min-h-16 w-full rounded-2xl border-2 border-neutral-950 bg-white px-4 text-2xl text-neutral-950 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:border-white dark:bg-neutral-900 dark:text-white dark:focus-visible:outline-yellow-300'

export function Field({
  label,
  value,
  onChange,
  ...input
}: {
  label: string
  value: string
  onChange(value: string): void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'>) {
  return (
    <label className="flex flex-col gap-2 text-xl font-semibold">
      {label}
      <input {...input} value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass} />
    </label>
  )
}

export function BigButton({
  children,
  busy,
  quiet,
  ...button
}: {
  children: ReactNode
  busy?: boolean
  /** Botón secundario: con borde en vez de relleno. */
  quiet?: boolean
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'disabled'>) {
  const look = quiet
    ? 'border-2 border-neutral-950 dark:border-white'
    : 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
  return (
    <button
      type="button"
      {...button}
      disabled={busy}
      className={`min-h-16 w-full rounded-2xl px-4 text-xl font-bold tracking-wide focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-60 dark:focus-visible:outline-yellow-300 ${look}`}
    >
      {busy ? 'Un momento…' : children}
    </button>
  )
}

export function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl border-2 border-red-700 p-4 text-xl font-semibold dark:border-red-400">
      {children}
    </p>
  )
}

/** Salida de la cuenta. En la muestra no hay cuenta de la que salir. */
export function SignOut({ source, onSignOut }: { source: DataSource; onSignOut(): void }) {
  if (source.isDemo) return null
  return (
    <div className="mt-10">
      <BigButton quiet onClick={onSignOut}>
        CERRAR SESIÓN
      </BigButton>
    </div>
  )
}
