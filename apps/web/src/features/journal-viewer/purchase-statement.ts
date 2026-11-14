import { buyerDecisions } from "./customer-record"
import {
  approvalRequired,
  businessText,
  NOT_AVAILABLE,
  productNames,
  quantityLabel,
  redactSecrets,
  selectedLines,
  statusLabel,
  orderDisplayStatus,
  purchaseDisplayStatus,
} from "./evidence"
import { formatMoney, formatNumber } from "./format"
import type { Order, ValioAimoJournal } from "./journal.types"

export const STATEMENT_DISCLAIMER =
  "Purchase record generated from an AI purchasing journal. This document is not a tax invoice."
export type StatementOrder = {
  reference: string
  status: string
  orderDate: string
  deliveryDate: string
  rows: string[][]
  totals: [string, string][]
  notes: string[]
}
export type PurchaseStatement = {
  generatedAt: string
  customer: string
  request: string
  references: string
  status: string
  requestedDelivery: string
  orders: StatementOrder[]
  summary: [string, string][]
  notes: string[]
}
const validTime = (value?: string | null): value is string =>
  !!value && Number.isFinite(Date.parse(value))
function recordedTime(value?: string | null) {
  return validTime(value)
    ? new Intl.DateTimeFormat("en-FI", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Helsinki",
      }).format(new Date(value))
    : NOT_AVAILABLE
}
function calendarDate(value?: string | null) {
  return validTime(value)
    ? new Intl.DateTimeFormat("en-FI", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(value))
    : NOT_AVAILABLE
}
/** Read explicit optional monetary fields only; never derive taxes from a rate. */
function taxes(order: Order): [string, string][] {
  const source = order as unknown as Record<string, unknown>
  const rows: [string, string][] = []
  if (
    typeof source.vat_amount === "number" &&
    Number.isFinite(source.vat_amount) &&
    source.vat_amount >= 0
  )
    rows.push([
      "VAT amount (recorded)",
      formatMoney(source.vat_amount, order.currency),
    ])
  if (
    typeof source.total_incl_vat === "number" &&
    Number.isFinite(source.total_incl_vat) &&
    source.total_incl_vat >= 0
  )
    rows.push([
      "Total including VAT (recorded)",
      formatMoney(source.total_incl_vat, order.currency),
    ])
  return rows
}

export function purchaseStatement(
  input: ValioAimoJournal,
  generatedAt = new Date()
): PurchaseStatement {
  const j = redactSecrets(input)
  const names = productNames(j)
  const orders = j.orders.map((order): StatementOrder => {
    const quote = j.quotes.find((q) => q.quote_id === order.quote_id)
    const lines = selectedLines(j, quote)
    const calculated = lines.reduce(
      (sum, line) =>
        sum +
        (line.option?.unit_price != null
          ? Math.round(line.quantity * line.option.unit_price * 100)
          : NaN),
      0
    )
    const pricesMatch =
      lines.length > 0 &&
      quote?.currency === order.currency &&
      Number.isFinite(calculated) &&
      calculated === Math.round(order.total * 100)
    const placement = j.timeline
      .filter(
        (e) =>
          e.type === "order" &&
          e.tool === "place_order" &&
          e.refs?.order_id === order.order_id &&
          validTime(e.at)
      )
      .sort((a, b) => a.seq - b.seq)[0]
    const rows = lines.map((line) => {
      const option = line.option
      const unit =
        option?.sales_unit === "KI"
          ? "case"
          : option?.sales_unit === "ST"
            ? "unit"
            : "ordering unit"
      return [
        names.get(line.product_id) ?? "Product name not recorded",
        `${formatNumber(line.quantity)} ${unit}${line.quantity === 1 ? "" : "s"}${option?.content_per_sales_unit ? ` (${quantityLabel(option, line.quantity)})` : ""}`,
        pricesMatch && option?.unit_price != null
          ? `${formatMoney(option.unit_price, order.currency)} / ${unit}`
          : NOT_AVAILABLE,
        pricesMatch && option?.unit_price != null
          ? formatMoney(
              Math.round(line.quantity * option.unit_price * 100) / 100,
              order.currency
            )
          : NOT_AVAILABLE,
      ]
    })
    return {
      reference: order.order_id,
      status: statusLabel(orderDisplayStatus(order)),
      orderDate: recordedTime(placement?.at),
      deliveryDate: calendarDate(order.delivery_date),
      rows: rows.length
        ? rows
        : [
            [
              "Product allocation for this order is not recorded",
              NOT_AVAILABLE,
              NOT_AVAILABLE,
              NOT_AVAILABLE,
            ],
          ],
      totals: [
        ["Total excluding VAT", formatMoney(order.total, order.currency)],
        ...taxes(order),
      ],
      notes: [
        !pricesMatch
          ? "Item prices cannot be fully reconciled to this order. The order total above is the recorded value."
          : "",
        `Approval required: ${approvalRequired(j, order) === null ? "Not verified" : approvalRequired(j, order) ? "Yes" : "No"}. Buyer approval: ${order.decision?.decision ?? "Not recorded"}.`,
        order.decision?.reason
          ? `Approval reason: ${businessText(order.decision.reason, j)}`
          : "",
      ].filter(Boolean),
    }
  })
  const acceptedRisks = buyerDecisions(j)
    .filter(
      (decision) =>
        decision.riskAcceptance !==
        "Risk acceptance is not explicitly recorded."
    )
    .map((decision) => decision.riskAcceptance)
  return {
    generatedAt: recordedTime(generatedAt.toISOString()),
    customer: j.agent.customer || NOT_AVAILABLE,
    request: businessText(j.request.text, j),
    references: orders.map((o) => o.reference).join("; ") || NOT_AVAILABLE,
    status: statusLabel(purchaseDisplayStatus(j)),
    requestedDelivery: calendarDate(j.request.delivery_date),
    orders,
    summary: [
      [
        "Product selected",
        j.decision?.chosen
          .map(
            (line) => names.get(line.product_id) ?? "Product name not recorded"
          )
          .join("; ") || NOT_AVAILABLE,
      ],
      [
        "Purchasing limit",
        j.authority.spend_limit_eur === null
          ? NOT_AVAILABLE
          : `${formatMoney(j.authority.spend_limit_eur, "EUR")} per order`,
      ],
      [
        "Accepted delivery risks",
        acceptedRisks.join("; ") || "Not explicitly recorded",
      ],
    ],
    notes: [
      j.narrative.watch_out
        ? businessText(j.narrative.watch_out, j)
        : "No delivery-risk note is recorded.",
      "Wholesaler confirmation: Not verified. Buyer approval and recording an order do not establish supplier acceptance or delivery.",
      ...(!orders.length
        ? [
            "No order is recorded. A selected product or price offer alone does not establish a purchase.",
          ]
        : []),
    ],
  }
}
