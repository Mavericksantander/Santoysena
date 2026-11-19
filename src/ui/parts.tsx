import type { ReactNode } from 'react'

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
