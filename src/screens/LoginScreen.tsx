import { type FormEvent, useState } from 'react'
import type { Auth } from '../auth/auth.ts'
import { BigButton, Field, Problem, Screen } from '../ui/parts.tsx'

type Step = { name: 'email' } | { name: 'code'; email: string }

export function LoginScreen({ auth }: { auth: Auth }) {
  const [step, setStep] = useState<Step>({ name: 'email' })
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function attempt(action: () => Promise<void>, onFailure: string, onSuccess?: () => void) {
    setBusy(true)
    setProblem(null)
    try {
      await action()
      onSuccess?.()
    } catch {
      setProblem(onFailure)
    } finally {
      setBusy(false)
    }
  }

  function requestCode(event: FormEvent) {
    event.preventDefault()
    // Un campo de tipo email ya entrega el valor sin espacios en los bordes.
    void attempt(
      () => auth.requestCode(email, displayName.trim()),
      'No pudimos enviar el código. Revisa el correo e intenta de nuevo en un minuto.',
      () => setStep({ name: 'code', email }),
    )
  }

  function verifyCode(event: FormEvent) {
    event.preventDefault()
    if (step.name !== 'code') return
    void attempt(
      () => auth.verifyCode(step.email, code.trim()),
      'Ese código no es correcto o ya venció. Revisa el correo o pide otro.',
    )
  }

  if (step.name === 'email') {
    return (
      <Screen title="SANTO Y SEÑA">
        <form onSubmit={requestCode} className="mt-8 flex flex-col gap-6">
          <p className="text-xl">Para entrar te enviamos un código a tu correo. No hay contraseñas.</p>
          <Field
            label="Tu nombre, como te dice tu familia"
            value={displayName}
            onChange={setDisplayName}
            autoComplete="given-name"
            maxLength={60}
            required
          />
          <Field
            label="Tu correo"
            value={email}
            onChange={setEmail}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
          />
          {problem && <Problem>{problem}</Problem>}
          <BigButton type="submit" busy={busy}>
            ENVIARME UN CÓDIGO
          </BigButton>
        </form>
      </Screen>
    )
  }

  return (
    <Screen title="SANTO Y SEÑA">
      <form onSubmit={verifyCode} className="mt-8 flex flex-col gap-6">
        <p className="text-xl">
          Te enviamos un código de 6 números a <strong className="break-all">{step.email}</strong>.
        </p>
        <Field
          label="Código del correo"
          value={code}
          onChange={setCode}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
        />
        {problem && <Problem>{problem}</Problem>}
        <BigButton type="submit" busy={busy}>
          ENTRAR
        </BigButton>
        <BigButton
          quiet
          onClick={() => {
            setStep({ name: 'email' })
            setCode('')
            setProblem(null)
          }}
        >
          USAR OTRO CORREO
        </BigButton>
      </form>
    </Screen>
  )
}
