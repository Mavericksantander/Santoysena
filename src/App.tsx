import { useCallback, useSyncExternalStore } from 'react'
import type { DataSource } from './data/source.ts'
import { useLoad } from './data/useLoad.ts'
import { CodeScreen } from './screens/CodeScreen.tsx'
import { FamilyScreen } from './screens/FamilyScreen.tsx'
import { InstructionsScreen } from './screens/InstructionsScreen.tsx'
import { DemoBanner, LoadError, Loading, Screen } from './ui/parts.tsx'

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}
const useRoute = () => useSyncExternalStore(subscribeToHash, () => window.location.hash)

export default function App({ source }: { source: DataSource }) {
  const route = useRoute()
  const families = useLoad(useCallback(() => source.listFamilies(), [source]))
  const family = families.state === 'ready' ? families.value[0] : undefined

  let screen
  if (route === '#/instrucciones') screen = <InstructionsScreen />
  else if (families.state === 'loading') screen = <Loading what="tu familia" />
  else if (families.state === 'error') screen = <LoadError what="tu familia" onRetry={families.retry} />
  else if (!family) {
    screen = (
      <Screen title="SANTO Y SEÑA">
        <p className="py-10 text-center text-xl">Todavía no perteneces a ninguna familia.</p>
      </Screen>
    )
  } else if (route === '#/familia') screen = <FamilyScreen source={source} family={family} />
  else screen = <CodeScreen source={source} family={family} />

  return (
    <div className="flex min-h-dvh flex-col bg-white text-neutral-950 dark:bg-neutral-950 dark:text-white">
      {source.isDemo && <DemoBanner />}
      {screen}
    </div>
  )
}
