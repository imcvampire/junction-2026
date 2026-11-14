import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"

import { Separator } from "@/components/ui/separator"
import { getOrder, loadPacks } from "@/features/orders/api"
import { OrderSummary } from "@/features/orders/components/order-summary"
import { StoragePlanner } from "@/features/orders/components/storage-planner"

export const Route = createFileRoute("/orders/$orderId")({
  loader: async ({ params, abortController }) => {
    const order = await getOrder(params.orderId, abortController.signal)
    const packByProduct = await loadPacks(
      order.lines.map((l) => l.product_id),
      abortController.signal
    )
    return { order, packByProduct }
  },
  component: OrderDetailPage,
  pendingComponent: () => (
    <p className="text-sm text-muted-foreground">Loading order…</p>
  ),
  errorComponent: ({ error }) => (
    <div className="flex flex-col gap-4">
      <BackLink />
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium">Could not load this order.</p>
        <p className="mt-1 text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    </div>
  ),
})

function BackLink() {
  return (
    <Link
      to="/orders"
      className="flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <ArrowLeftIcon className="size-4" aria-hidden /> All orders
    </Link>
  )
}

function OrderDetailPage() {
  const { order, packByProduct } = Route.useLoaderData()
  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <OrderSummary order={order} />
      <Separator />
      <StoragePlanner lines={order.lines} packByProduct={packByProduct} />
    </div>
  )
}
