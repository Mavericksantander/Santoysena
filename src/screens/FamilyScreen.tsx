import { useCallback, useState } from 'react'
import type { DataSource, Family, Invitation, Member, Role } from '../data/source.ts'
import { useLoad } from '../data/useLoad.ts'
import { invitationLink } from '../invitation.ts'
import { BigButton, LoadError, Loading, Problem, Screen, SignOut } from '../ui/parts.tsx'

function roleLabel(member: Member): string {
  if (member.isOwner) return 'Creó la familia'
  return member.role === 'admin' ? 'Administra' : 'Miembro'
}

const rowClass = 'rounded-2xl bg-neutral-100 dark:bg-neutral-800'
const rowContentClass = 'flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 text-left'

function NameAndRole({ member }: { member: Member }) {
  return (
    <>
      <span className="text-xl font-bold">{member.displayName}</span>
      <span className="text-right text-lg text-neutral-700 dark:text-neutral-300">{roleLabel(member)}</span>
    </>
  )
}

/** Una acción que cambia la familia: mientras corre bloquea los botones y, si falla, lo dice. */
function useAction() {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setFailed(false)
    try {
      await action()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return { busy, failed, run }
}

/** Fila de alguien a quien esta persona puede sacar o cambiarle el rol. Estados en docs/estados.md. */
function ManagedMember({
  member,
  onRemove,
  onSetRole,
}: {
  member: Member
  onRemove(): Promise<void>
  onSetRole(role: Role): Promise<void>
}) {
  const [step, setStep] = useState<'closed' | 'open' | 'confirming'>('closed')
  const { busy, failed, run } = useAction()
  const act = (action: () => Promise<void>) => {
    setStep('open')
    void run(action)
  }

  return (
    <li className={rowClass}>
      <button
        type="button"
        aria-expanded={step !== 'closed'}
        onClick={() => setStep(step === 'closed' ? 'open' : 'closed')}
        className={`${rowContentClass} rounded-2xl focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:focus-visible:outline-yellow-300`}
      >
        <NameAndRole member={member} />
      </button>
      {step !== 'closed' && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {failed && <Problem>No pudimos hacer el cambio. Intenta de nuevo.</Problem>}
          {step === 'confirming' ? (
            <>
              <p className="text-xl">
                ¿Sacar a {member.displayName}? El código de hoy cambia de inmediato para toda la familia.
              </p>
              <BigButton quiet busy={busy} onClick={() => setStep('open')}>
                NO, DEJAR
              </BigButton>
              <BigButton busy={busy} onClick={() => act(onRemove)}>
                SÍ, SACAR A {member.displayName.toUpperCase()}
              </BigButton>
            </>
          ) : (
            <>
              {member.role === 'admin' ? (
                <BigButton quiet busy={busy} onClick={() => act(() => onSetRole('member'))}>
                  QUE YA NO ADMINISTRE
                </BigButton>
              ) : (
                <BigButton quiet busy={busy} onClick={() => act(() => onSetRole('admin'))}>
                  DEJAR QUE ADMINISTRE
                </BigButton>
              )}
              <BigButton quiet busy={busy} onClick={() => setStep('confirming')}>
                SACAR DE LA FAMILIA
              </BigButton>
            </>
          )}
        </div>
      )}
    </li>
  )
}

function Leave({ family, onLeave }: { family: Family; onLeave(): Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const { busy, failed, run } = useAction()

  return (
    <section aria-label="Salir de la familia" className="mt-8 flex flex-col gap-3">
      {failed && <Problem>No pudimos sacarte de la familia. Intenta de nuevo.</Problem>}
      {confirming ? (
        <>
          <p className="text-xl">
            ¿Salir de {family.name}? Dejarás de ver su código. Para volver necesitas una invitación nueva.
          </p>
          <BigButton quiet busy={busy} onClick={() => setConfirming(false)}>
            NO, QUEDARME
          </BigButton>
          <BigButton busy={busy} onClick={() => void run(onLeave)}>
            SÍ, SALIR
          </BigButton>
        </>
      ) : (
        <BigButton quiet onClick={() => setConfirming(true)}>
          SALIR DE ESTA FAMILIA
        </BigButton>
      )}
    </section>
  )
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
  me,
  others,
  onSelect,
  onLeft,
  onSignOut,
}: {
  source: DataSource
  family: Family
  /** Quién está mirando. */
  me: string
  /** Las otras familias de esta persona, para cambiar entre ellas. */
  others: Family[]
  onSelect(familyId: string): void
  onLeft(): void
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
            {members.value.map((member) =>
              family.role === 'admin' && !member.isOwner && member.userId !== me ? (
                <ManagedMember
                  key={member.userId}
                  member={member}
                  onRemove={async () => {
                    await source.removeMember(family.id, member.userId)
                    members.retry()
                  }}
                  onSetRole={async (role) => {
                    await source.setMemberRole(family.id, member.userId, role)
                    members.retry()
                  }}
                />
              ) : (
                <li key={member.userId} className={`${rowClass} ${rowContentClass}`}>
                  <NameAndRole member={member} />
                </li>
              ),
            )}
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
      {members.state === 'ready' && members.value.some((member) => member.userId === me && !member.isOwner) && (
        <Leave
          family={family}
          onLeave={async () => {
            await source.removeMember(family.id, me)
            onLeft()
          }}
        />
      )}
      <SignOut source={source} onSignOut={onSignOut} />
    </Screen>
  )
}
