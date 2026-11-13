import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NavItem = { id: string; label: string; icon: LucideIcon }

type AppShellProps = {
  title: string
  nav: NavItem[]
  active: string
  onNavigate: (id: string) => void
  children: ReactNode
}

export function AppShell({ title, nav, active, onNavigate, children }: AppShellProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background">
      <header className="pt-safe sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="px-safe flex h-14 items-center">
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
      </header>

      <main className="px-safe flex-1 py-4">{children}</main>

      <nav className="pb-safe sticky bottom-0 z-10 border-t bg-background/80 backdrop-blur">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
          {nav.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={active === id ? 'page' : undefined}
                className={cn(
                  'flex h-16 w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground transition-colors active:bg-muted',
                  active === id && 'text-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
