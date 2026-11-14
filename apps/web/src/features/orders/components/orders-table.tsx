import { Link } from "@tanstack/react-router"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CalendarDate, Money } from "@/features/journal-viewer/format"
import { StatusBadge } from "@/features/orders/components/status-badge"
import type { OrderView } from "@/features/orders/types"

export function OrdersTable({ orders }: { orders: OrderView[] }) {
  if (orders.length === 0) {
    return (
      <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
        No orders yet. Place one through the agent API or the{" "}
        <code className="font-mono">valio-aimo-purchasing</code> skill, then it
        will appear here.
      </p>
    )
  }
  const sorted = [...orders].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Total excl. VAT</TableHead>
          <TableHead>Delivery</TableHead>
          <TableHead className="text-right">Lines</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((order) => (
          <TableRow key={order.order_id}>
            <TableCell>
              <Link
                to="/orders/$orderId"
                params={{ orderId: order.order_id }}
                className="font-mono text-sm underline-offset-4 hover:underline"
              >
                {order.order_id}
              </Link>
            </TableCell>
            <TableCell>
              <StatusBadge status={order.status} />
            </TableCell>
            <TableCell className="text-right">
              <Money value={order.total} currency={order.currency} />
            </TableCell>
            <TableCell>
              <CalendarDate value={order.delivery_date} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {order.lines.length}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
