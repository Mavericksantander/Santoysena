import { useCallback } from 'react'
import type { DataSource, Family, Member } from '../data/source.ts'
import { useLoad } from '../data/useLoad.ts'
import { LoadError, Loading, Screen } from '../ui/parts.tsx'

function roleLabel(member: Member): string {
  if (member.isOwner) return 'Creó la familia'
  return member.role === 'admin' ? 'Administra' : 'Miembro'
}

export function FamilyScreen({ source, family }: { source: DataSource; family: Family }) {
  const members = useLoad(useCallback(() => source.listMembers(family.id), [source, family.id]))

  return (
    <Screen title="MI FAMILIA" back>
      <p className="mt-2 text-center text-xl font-semibold">{family.name}</p>
      {members.state === 'loading' && <Loading what="tu familia" />}
      {members.state === 'error' && <LoadError what="tu familia" onRetry={members.retry} />}
      {members.state === 'ready' && (
        <>
          <ul className="mt-6 flex flex-col gap-3">
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
    </Screen>
  )
}
