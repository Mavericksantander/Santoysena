import { Screen } from '../ui/parts.tsx'

const INSTRUCTIONS = [
  'Nunca digas el código cuando recibas una llamada sospechosa.',
  'Pide a quien dice ser tu familiar que te diga el código de hoy.',
  'Nunca aceptes un código antiguo.',
  'Si no sabe el código, no está verificado que sea tu familiar.',
  'Si te piden dinero, una transferencia o hay una emergencia, corta y llama tú a tu familiar a un número que ya conocías.',
]

export function InstructionsScreen() {
  return (
    <Screen title="INSTRUCCIONES" back>
      <ol className="mt-6 flex flex-col gap-4">
        {INSTRUCTIONS.map((text, index) => (
          <li key={text} className="flex gap-4 rounded-2xl bg-neutral-100 p-4 dark:bg-neutral-800">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-xl font-black text-white dark:bg-white dark:text-neutral-950"
            >
              {index + 1}
            </span>
            <span className="text-xl leading-snug">{text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-lg leading-snug text-neutral-700 dark:text-neutral-300">
        Un código correcto no autoriza por sí solo una transferencia. Santo y Seña no detecta voces
        falsas: te da una pregunta que un estafador no puede responder.
      </p>
    </Screen>
  )
}
