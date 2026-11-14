import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { ShoppingBagIcon } from "lucide-react"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            to="/journal-viewer"
            className="flex items-center gap-2 font-heading text-lg font-semibold text-primary"
          >
            <ShoppingBagIcon className="size-6" aria-hidden />
            Valio Aimo
          </Link>
          <nav aria-label="Main navigation">
            <Link
              to="/journal-viewer"
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-primary"
            >
              Purchase Overview
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  )
}
