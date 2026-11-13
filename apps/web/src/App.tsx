import { useCallback, useEffect, useState } from 'react'
import { HomeIcon, SettingsIcon, UserIcon } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell, type NavItem } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Health } from '@/lib/api'

const NAV: NavItem[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

type HealthState = { kind: 'loading' } | { kind: 'ok'; data: Health } | { kind: 'error' }

function useHealth() {
  const [state, setState] = useState<HealthState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    api<Health>('/health', { signal: ctrl.signal }).then(
      (data) => setState({ kind: 'ok', data }),
      (err: unknown) => {
        if (ctrl.signal.aborted) return
        console.error('health check failed', err)
        setState({ kind: 'error' })
        toast.error('Backend unreachable')
      },
    )
    return () => ctrl.abort()
  }, [attempt])

  const refresh = useCallback(() => {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return { state, refresh }
}

export default function App() {
  const [tab, setTab] = useState('home')
  const { state, refresh } = useHealth()

  return (
    <AppShell title="Junction 2026" nav={NAV} active={tab} onNavigate={setTab}>
      <Card>
        <CardHeader>
          <CardTitle>Backend</CardTitle>
          <CardDescription>FastAPI health check via /api proxy</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          {state.kind === 'loading' && <Skeleton className="h-5 w-32" />}
          {state.kind === 'ok' && <span className="text-sm">OK · v{state.data.version}</span>}
          {state.kind === 'error' && <span className="text-sm text-destructive">Unreachable</span>}
          <Button size="lg" variant="outline" onClick={refresh}>
            Retry
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  )
}
