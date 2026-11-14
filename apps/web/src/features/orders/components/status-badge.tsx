import { Badge } from "@/components/ui/badge"
import type { OrderStatus } from "@/features/orders/types"

const VARIANT: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  agreed: "outline",
  placed: "default",
  approved: "default",
  shipped: "default",
  pending_approval: "secondary",
  rejected: "destructive",
  cancelled: "destructive",
}

const LABEL: Record<OrderStatus, string> = {
  draft: "Draft",
  agreed: "Agreed",
  placed: "Placed",
  approved: "Approved",
  shipped: "Shipped",
  pending_approval: "Pending approval",
  rejected: "Rejected",
  cancelled: "Cancelled",
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant={VARIANT[status] ?? "outline"}>
      {LABEL[status] ?? status}
    </Badge>
  )
}
