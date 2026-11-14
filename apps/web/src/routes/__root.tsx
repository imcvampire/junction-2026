import { createRootRoute, Link, Outlet } from "@tanstack/react-router"

import { AppShell } from "@/components/layout/app-shell"

function NotFound() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-heading text-xl font-semibold">Page not found</h1>
      <Link to="/" className="text-sm underline underline-offset-4">
        Back to the start
      </Link>
    </div>
  )
}

export const Route = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  notFoundComponent: NotFound,
})
