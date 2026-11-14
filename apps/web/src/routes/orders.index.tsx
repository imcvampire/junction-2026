import { createFileRoute } from "@tanstack/react-router"

import { listOrders } from "@/features/orders/api"
import { OrdersTable } from "@/features/orders/components/orders-table"

export const Route = createFileRoute("/orders/")({
  loader: ({ abortController }) =>
    listOrders("company", abortController.signal),
  component: OrdersPage,
  pendingComponent: () => (
    <p className="text-sm text-muted-foreground">Loading orders…</p>
  ),
  errorComponent: ({ error }) => (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-medium">Could not load orders.</p>
      <p className="mt-1 text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </p>
    </div>
  ),
})

function OrdersPage() {
  const { orders } = Route.useLoaderData()
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Orders the purchasing agent has placed for this company. Open one to
          plan how to store it.
        </p>
      </div>
      <OrdersTable orders={orders} />
    </div>
  )
}
