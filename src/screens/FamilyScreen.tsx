import { useCallback, useState } from 'react'
import type { DataSource, Family, Invitation, Member } from '../data/source.ts'
import { useLoad } from '../data/useLoad.ts'
import { invitationLink } from '../invitation.ts'
import { BigButton, LoadError, Loading, Problem, Screen } from '../ui/parts.tsx'

function roleLabel(member: Member): string {
  if (member.isOwner) return 'Creó la familia'
  return member.role === 'admin' ? 'Administra' : 'Miembro'
}

function Invite({ source, family }: { source: DataSource; family: Family }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  async function create() {
    setBusy(true)
    setFailed(false)
    setCopied(false)
    try {
      setInvitation(await source.createInvitation(family.id))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const link = invitation ? invitationLink(invitation.token, window.location) : ''

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: 'Santo y Seña', text: `Únete a ${family.name}`, url: link }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    }
  }

  return (
    <section aria-labelledby="invitar" className="mt-8 flex flex-col gap-4">
      <h2 id="invitar" className="text-2xl font-extrabold">
        Invitar a alguien
      </h2>
      {failed && <Problem>No pudimos crear la invitación. Intenta de nuevo.</Problem>}
      {invitation ? (
        <>
          <p className="text-xl">
            Manda este enlace solo a tu familiar. Sirve una sola vez y vence en 24 horas.
          </p>
          <p
            data-testid="enlace"
            className="break-all rounded-2xl bg-neutral-100 p-4 font-mono text-base dark:bg-neutral-800"
          >
            {link}
          </p>
          <BigButton onClick={() => void share()}>ENVIAR INVITACIÓN</BigButton>
          {copied && (
            <p role="status" className="text-center text-xl font-semibold">
              Enlace copiado.
            </p>
          )}
        </>
      ) : (
        <BigButton onClick={() => void create()} busy={busy}>
          CREAR INVITACIÓN
        </BigButton>
      )}
    </section>
  )
}

export function FamilyScreen({
  source,
  family,
  others,
  onSelect,
  onSignOut,
}: {
  source: DataSource
  family: Family
  /** Las otras familias de esta persona, para cambiar entre ellas. */
  others: Family[]
  onSelect(familyId: string): void
  onSignOut(): void
}) {
  const members = useLoad(useCallback(() => source.listMembers(family.id), [source, family.id]))

  return (
    <Screen title="MI FAMILIA" back>
      <p className="mt-2 text-center text-xl font-semibold">{family.name}</p>
      {members.state === 'loading' && <Loading what="tu familia" />}
      {members.state === 'error' && <LoadError what="tu familia" onRetry={members.retry} />}
      {members.state === 'ready' && (
        <>
          <ul aria-label="Miembros" className="mt-6 flex flex-col gap-3">
            {members.value.map((member) => (
              <li
                key={member.userId}
                className="flex min-h-16 items-center justify-between gap-4 rounded-2xl bg-neutral-100 px-4 py-3 dark:bg-neutral-800"
              >
                <span className="text-xl font-bold">{member.displayName}</span>
                <span className="text-right text-lg text-neutral-700 dark:text-neutral-300">
                  {roleLabel(member)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-lg leading-snug text-neutral-700 dark:text-neutral-300">
            Todas estas personas ven el mismo código. Si alguien sale de la familia, el código cambia
            de inmediato.
          </p>
        </>
      )}
      {family.role === 'admin' && <Invite source={source} family={family} />}
      {others.length > 0 && (
        <section aria-labelledby="otras" className="mt-8 flex flex-col gap-3">
          <h2 id="otras" className="text-2xl font-extrabold">
            Tus otras familias
          </h2>
          {others.map((other) => (
            <BigButton key={other.id} quiet onClick={() => onSelect(other.id)}>
              {other.name}
            </BigButton>
          ))}
        </section>
      )}
      {!source.isDemo && (
        <div className="mt-10">
          <BigButton quiet onClick={onSignOut}>
            CERRAR SESIÓN
          </BigButton>
        </div>
      )}
    </Screen>
  )
}
