import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { Auth, Session } from './auth/auth.ts'
import type { DataSource } from './data/source.ts'
import { useLoad } from './data/useLoad.ts'
import { captureInvitation, pendingInvitation } from './invitation.ts'
import { CodeScreen } from './screens/CodeScreen.tsx'
import { FamilyScreen } from './screens/FamilyScreen.tsx'
import { InstructionsScreen } from './screens/InstructionsScreen.tsx'
import { JoinScreen } from './screens/JoinScreen.tsx'
import { LoginScreen } from './screens/LoginScreen.tsx'
import { NoFamilyScreen } from './screens/NoFamilyScreen.tsx'
import { DemoBanner, LoadError, Loading } from './ui/parts.tsx'

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}
const useRoute = () => useSyncExternalStore(subscribeToHash, () => window.location.hash)

type SessionState = { known: false } | { known: true; session: Session | null }

function useSession(auth: Auth): SessionState {
  const [state, setState] = useState<SessionState>({ known: false })
  useEffect(() => {
    let cancelled = false
    const known = (session: Session | null) => {
      if (!cancelled) setState({ known: true, session })
    }
    auth.current().then(known, () => known(null))
    const unsubscribe = auth.subscribe(known)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [auth])
  return state
}

/** Captura invitaciones del enlace al abrir la aplicación y cada vez que cambia. */
function useInvitationCapture() {
  useEffect(() => {
    captureInvitation()
    window.addEventListener('hashchange', captureInvitation)
    return () => window.removeEventListener('hashchange', captureInvitation)
  }, [])
}

const SELECTED_FAMILY_KEY = 'santo-y-sena.familia'

function SignedIn({ auth, source, route }: { auth: Auth; source: DataSource; route: string }) {
  const invitation = useSyncExternalStore(pendingInvitation.subscribe, pendingInvitation.get)
  const families = useLoad(useCallback(() => source.listFamilies(), [source]))
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(SELECTED_FAMILY_KEY))

  if (invitation) {
    return (
      <JoinScreen
        source={source}
        token={invitation}
        onDone={() => {
          pendingInvitation.clear()
          families.retry()
        }}
      />
    )
  }
  if (route === '#/instrucciones') return <InstructionsScreen />
  if (families.state === 'loading') return <Loading what="tu familia" />
  if (families.state === 'error') return <LoadError what="tu familia" onRetry={families.retry} />

  const family = families.value.find((candidate) => candidate.id === selectedId) ?? families.value[0]
  if (!family) return <NoFamilyScreen source={source} onCreated={families.retry} />
  if (route === '#/familia') {
    return (
      <FamilyScreen
        source={source}
        family={family}
        others={families.value.filter((candidate) => candidate.id !== family.id)}
        onSelect={(id) => {
          localStorage.setItem(SELECTED_FAMILY_KEY, id)
          setSelectedId(id)
          window.location.hash = '#/'
        }}
        onSignOut={() => void auth.signOut()}
      />
    )
  }
  return <CodeScreen source={source} family={family} />
}

export default function App({ auth, source }: { auth: Auth; source: DataSource }) {
  const route = useRoute()
  const state = useSession(auth)
  useInvitationCapture()

  let screen
  if (!state.known) screen = <Loading what="tu sesión" />
  else if (!state.session) screen = <LoginScreen auth={auth} />
  else screen = <SignedIn auth={auth} source={source} route={route} />

  return (
    <div className="flex min-h-dvh flex-col bg-white text-neutral-950 dark:bg-neutral-950 dark:text-white">
      {source.isDemo && <DemoBanner />}
      {screen}
    </div>
  )
}
