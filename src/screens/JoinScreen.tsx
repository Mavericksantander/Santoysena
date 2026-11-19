import { useState } from 'react'
import { type DataSource, RequestError } from '../data/source.ts'
import { BigButton, Problem, Screen } from '../ui/parts.tsx'

export function JoinScreen({
  source,
  token,
  onDone,
}: {
  source: DataSource
  token: string
  /** Se llama cuando la invitación ya no está pendiente: aceptada o descartada. */
  onDone(): void
}) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function join() {
    setBusy(true)
    setProblem(null)
    try {
      await source.acceptInvitation(token)
      onDone()
    } catch (error) {
      const code = error instanceof RequestError ? error.code : ''
      if (code === 'already_a_member') onDone()
      else if (code === 'invitation_invalid') {
        setProblem('Esta invitación ya no sirve: se usó, venció o fue anulada. Pide una nueva a tu familia.')
      } else setProblem('No pudimos unirte. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="SANTO Y SEÑA">
      <div className="mt-8 flex flex-col gap-6">
        <h2 className="text-2xl font-extrabold">Te invitaron a una familia</h2>
        <p className="text-xl">
          Acepta solo si la invitación te la mandó alguien de tu familia. Al unirte verás el mismo
          código diario que ellos.
        </p>
        {problem && <Problem>{problem}</Problem>}
        <BigButton onClick={() => void join()} busy={busy}>
          UNIRME A LA FAMILIA
        </BigButton>
        <BigButton quiet onClick={onDone}>
          NO, GRACIAS
        </BigButton>
      </div>
    </Screen>
  )
}
