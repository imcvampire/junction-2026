import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

import {
  CalendarDate,
  EmptyNote,
  Field,
  JournalSection,
  Money,
  Text,
} from "../format"
import type { Order } from "../journal.types"

const STATUS_VARIANT: Record<
  Order["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  placed: "default",
  approved: "default",
  shipped: "default",
  pending_approval: "secondary",
  rejected: "destructive",
  cancelled: "destructive",
}

function OrderCard({ order }: { order: Order }) {
  const { decision, cancellation } = order
  return (
    <Card role="group" aria-label={`Order ${order.order_id}`}>
      <CardHeader>
        <CardTitle className="font-mono text-sm break-all">
          {order.order_id}
        </CardTitle>
        <CardAction>
          <Badge variant={STATUS_VARIANT[order.status] ?? "outline"}>
            {order.status}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Total excl. VAT">
            <Money value={order.total} currency={order.currency} />
          </Field>
          <Field label="Delivery date">
            <CalendarDate value={order.delivery_date} />
          </Field>
          <Field label="Quote">
            <span className="font-mono text-xs break-all">
              <Text value={order.quote_id} />
            </span>
          </Field>
          <Field label="Client reference">
            <span className="font-mono text-xs break-all">
              <Text value={order.client_reference} />
            </span>
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
                <Badge
                  variant={
                    decision.decision === "approved" ? "default" : "destructive"
                  }
                >
                  {decision.decision}
                </Badge>
              </Field>
              <Field label="Reason">{decision.reason}</Field>
              <Field label="Decided by">
                <Text value={decision.decided_by} />
              </Field>
              <Field label="Confirmed via">
                <Text value={decision.confirmed_via} />
              </Field>
            </dl>
          </>
        ) : null}
        {cancellation ? (
          <>
            <Separator />
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Cancellation reason">{cancellation.reason}</Field>
              <Field label="Cancelled by">
                <Text value={cancellation.cancelled_by} />
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
      </CardContent>
    </Card>
  )
}

export function OrdersList({ orders }: { orders: Order[] }) {
  return (
    <JournalSection id="orders" title="Orders">
      {orders.length === 0 ? (
        <EmptyNote>None</EmptyNote>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order, index) => (
            <OrderCard key={index} order={order} />
          ))}
        </div>
      )}
    </JournalSection>
  )
}
