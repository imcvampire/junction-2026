import type { ReactNode } from "react"
import { Link, type LinkProps, useRouterState } from "@tanstack/react-router"
import { MoonIcon, SunIcon } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { useSecretCode } from "@/features/to-the-moon/use-secret-code"

const NAV_ITEMS: { to: LinkProps["to"]; label: string }[] = [
  { to: "/orders", label: "Orders" },
  { to: "/journal-viewer", label: "Journal viewer" },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}

const MOON_PATH = "/to-the-moon"

function useMoonTrigger() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  useSecretCode("tothemoon", () => {
    if (pathname === MOON_PATH) return
    const tab = window.open(MOON_PATH, "_blank")
    if (tab) tab.opener = null
    else window.location.assign(MOON_PATH)
  })
}

export function AppShell({ children }: { children: ReactNode }) {
  useMoonTrigger()
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 font-heading font-semibold"
          >
            <img src="/favicon.svg" alt="" className="size-6" />
            Valio
          </Link>
          <nav aria-label="Features" className="flex min-w-0 flex-1 gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  )
}
