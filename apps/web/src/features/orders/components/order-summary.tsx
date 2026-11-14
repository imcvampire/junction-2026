import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CalendarDate,
  DateTime,
  Field,
  Money,
  Num,
  Text,
} from "@/features/journal-viewer/format"
import { StatusBadge } from "@/features/orders/components/status-badge"
import type { OrderView } from "@/features/orders/types"

function Lines({ order }: { order: OrderView }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead className="text-right">Quantity</TableHead>
          <TableHead className="text-right">Unit price</TableHead>
          <TableHead className="text-right">Line total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {order.lines.map((line, index) => (
          <TableRow key={`${line.product_id}-${index}`}>
            <TableCell className="min-w-56 whitespace-normal">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{line.name}</span>
                <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span className="font-mono">{line.product_id}</span>
                  {line.substitute_for ? (
                    <span>· substitutes {line.substitute_for}</span>
                  ) : null}
                </span>
                <span className="flex flex-wrap gap-1">
                  {!line.covers_request ? (
                    <Badge variant="secondary">Partial cover</Badge>
                  ) : null}
                  {!line.within_preferences ? (
                    <Badge variant="destructive">Outside preferences</Badge>
                  ) : null}
                  {line.missing_requirements.map((req) => (
                    <Badge key={req} variant="destructive">
                      Missing {req}
                    </Badge>
                  ))}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right">
              <Num value={line.quantity} suffix={line.sales_unit} />
            </TableCell>
            <TableCell className="text-right">
              <Money value={line.unit_price} currency={order.currency} />
            </TableCell>
            <TableCell className="text-right">
              <Money value={line.line_total} currency={order.currency} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function OrderSummary({ order }: { order: OrderView }) {
  const { decision, cancellation } = order
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-2xl font-semibold">
          <span className="font-mono text-xl break-all">{order.order_id}</span>
        </h1>
        <StatusBadge status={order.status} />
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Total excl. VAT">
          <Money value={order.total} currency={order.currency} />
        </Field>
        <Field label="Delivery date">
          <CalendarDate value={order.delivery_date} />
        </Field>
        <Field label="Placed by">
          <Text value={order.agent_id} />
        </Field>
        <Field label="Created">
          <DateTime value={order.created_at} />
        </Field>
        <Field label="Purpose">
          <Text value={order.purpose} />
        </Field>
        <Field label="Requirements">
          {order.requirements.length === 0 ? (
            "None"
          ) : (
            <span className="flex flex-wrap gap-1">
              {order.requirements.map((r) => (
                <Badge key={r} variant="outline">
                  {r}
                </Badge>
              ))}
            </span>
          )}
        </Field>
      </dl>

      <Field label="Why approval was needed">
        {order.approval_reasons.length === 0 ? (
          "Placed within the agent's authority."
        ) : (
          <ul className="list-disc pl-5">
            {order.approval_reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        )}
      </Field>

      {decision ? (
        <>
          <Separator />
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Decision">
              <Badge variant={decision.approved ? "default" : "destructive"}>
                {decision.approved ? "Approved" : "Rejected"}
              </Badge>
            </Field>
            <Field label="Reason">
              <Text value={decision.reason} />
            </Field>
            <Field label="Decided by">
              <Text value={decision.decided_by?.name} />
            </Field>
            <Field label="At">
              <DateTime value={decision.at} />
            </Field>
          </dl>
        </>
      ) : null}

      {cancellation ? (
        <>
          <Separator />
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Cancellation reason">
              <Text value={cancellation.reason} />
            </Field>
            <Field label="Cancelled by">
              <Text value={cancellation.cancelled_by.name} />
            </Field>
            <Field label="Confirmed via">
              <Text value={cancellation.confirmed_via} />
            </Field>
            <Field label="Replaced by">
              <span className="font-mono text-xs break-all">
                <Text value={cancellation.replaced_by} />
              </span>
            </Field>
          </dl>
        </>
      ) : null}

      <Separator />
      <Lines order={order} />
    </section>
  )
}
