import type { Option, Order, ValioAimoJournal } from "./journal.types"
import { parseJournal } from "./parse-journal"
import { physicalAmount, sameRequestedAmount } from "./quantities"

export type Quote = ValioAimoJournal["quotes"][number]
export const NOT_AVAILABLE = "Not available"

export function productNames(journal: ValioAimoJournal) {
  return new Map([
    ...journal.candidates.map((p) => [p.product_id, p.name] as const),
    ...journal.quotes.flatMap((q) =>
      q.options.map((p) => [p.product_id, p.name] as const)
    ),
  ])
}

/** Prefer dates on the actual ordered batches; never borrow an alternative's dates. */
export function selectedProductDates(journal: ValioAimoJournal) {
  const names = productNames(journal)
  const selectedIds = new Set(
    journal.decision?.chosen.map((line) => line.product_id) ?? []
  )
  const allocated = journal.orders.flatMap((order) =>
    (order.product_dates ?? [])
      .filter((product) => selectedIds.has(product.product_id))
      .map((product) => ({
        productId: product.product_id,
        name: names.get(product.product_id) ?? "Selected product",
        batch: product.batch_id,
        bestBefore: product.best_before_date,
        expiry: product.expiry_date,
      }))
  )
  const allocatedIds = new Set(allocated.map((product) => product.productId))
  const { lines } = purchaseFacts(journal)
  const quoted = lines
    .filter((line) => !allocatedIds.has(line.product_id))
    .map((line) => ({
      productId: line.product_id,
      name: names.get(line.product_id) ?? "Selected product",
      batch: undefined,
      bestBefore: line.option?.best_before_date,
      expiry: line.option?.expiry_date,
    }))
  return [...allocated, ...quoted]
}

export function readableText(text: string, journal: ValioAimoJournal) {
  const names = productNames(journal)
  return text.replace(/[\p{L}\p{N}_-]+/gu, (token) => names.get(token) ?? token)
}

export function businessText(text: string, journal: ValioAimoJournal) {
  let result = readableText(text, journal)
  const replacements: [string, string][] = [
    [journal.agent.agent_id, "the purchasing assistant"],
    [journal.agent.customer, "the customer"],
    ...journal.orders.map(
      (o) => [o.order_id, "this purchase"] as [string, string]
    ),
    ...journal.quotes.map(
      (q) => [q.quote_id, "the price offer"] as [string, string]
    ),
    ["mcp_elicitation", "buyer confirmation"],
    ["cheapest_covering", "lowest-priced suitable option"],
  ]
  for (const [id, name] of replacements)
    if (id.trim()) result = result.split(id).join(name)
  return result
}

export function friendlyTag(tag: string) {
  return tag.toLowerCase().replaceAll("_", " ")
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    approved: "Purchase Approved",
    pending_approval: "Awaiting Approval",
    rejected: "Purchase Rejected",
    placed: "Order Recorded",
    shipped: "Marked as Shipped",
    cancelled: "Purchase Cancelled",
    no_order: "No Order Recorded",
    failed: "Purchase Failed",
    approval_unknown: "Approval Outcome Unknown",
    approval_rejected: "Approval Rejected",
  }
  return labels[status] ?? "Not available"
}

/** Display states require a recorded decision; the source order status is never rewritten. */
export function orderDisplayStatus(order: Order) {
  if (order.decision?.decision === "approved") return "approved"
  if (order.decision?.decision === "rejected") return "approval_rejected"
  if (order.status === "approved")
    return "approval_unknown"
  return order.status
}

export function purchaseDisplayStatus(journal: ValioAimoJournal) {
  if (journal.orders.length === 1) return orderDisplayStatus(journal.orders[0])
  if (
    journal.outcome === "approved" &&
    (!journal.orders.length ||
      journal.orders.some((order) => order.decision?.decision !== "approved"))
  )
    return "approval_unknown"
  return journal.outcome
}

export function quantityLabel(
  option: Option | undefined,
  quantity?: number | null
) {
  const count = quantity ?? option?.quantity
  if (count == null) return NOT_AVAILABLE
  const content = option?.content_per_sales_unit?.match(
    /^\s*(\d+(?:[.,]\d+)?)\s*(L|l|dl|cl|ml|kg|g)\s*$/
  )
  const format = (n: number) =>
    new Intl.NumberFormat("en-FI", { maximumFractionDigits: 3 }).format(n)
  if (content)
    return `${format(Number(content[1].replace(",", ".")) * count)} ${content[2]}`
  return `${format(count)} ${option?.sales_unit === "KI" ? "cases" : option?.sales_unit === "ST" ? "units" : "sales units"}`
}

/** No allocation of a task-level decision across multiple orders is inferred. */
export function selectedLines(journal: ValioAimoJournal, quote?: Quote) {
  if (!quote || journal.orders.length > 1) return []
  return (journal.decision?.chosen ?? []).map((line) => ({
    ...line,
    option: quote.options.find((p) => p.product_id === line.product_id),
  }))
}

export function approvalRequired(
  journal: ValioAimoJournal,
  order: Order
): boolean | null {
  if (order.approval_reasons.length > 0 || order.status === "pending_approval")
    return true
  if (journal.authority.spend_limit_eur === null || order.currency !== "EUR")
    return null
  return order.total > journal.authority.spend_limit_eur
}

export function approvalEvents(journal: ValioAimoJournal, order: Order) {
  return journal.timeline.filter(
    (e) => e.type === "approval" && e.refs?.order_id === order.order_id
  )
}

export function purchaseFacts(journal: ValioAimoJournal) {
  const order = journal.orders.length === 1 ? journal.orders[0] : undefined
  const quote = order
    ? journal.quotes.find((q) => q.quote_id === order.quote_id)
    : journal.orders.length === 0 && journal.quotes.length === 1
      ? journal.quotes[0]
      : undefined
  const lines = selectedLines(journal, quote)
  const chosen = lines.length === 1 ? lines[0] : undefined
  const selected = chosen?.option
  const consistentPrice = (p: Option) =>
    p.quantity !== null &&
    p.unit_price !== null &&
    p.line_total !== null &&
    Math.round(p.quantity * p.unit_price * 100) ===
      Math.round(p.line_total * 100)
  // Compare alternatives within the same quote, currency and requested amount only.
  const alternatives =
    quote?.options.filter(
      (p) =>
        p.product_id !== selected?.product_id &&
        p.meets_requirements === true &&
        p.covers_request === true &&
        p.breaks_mandate === false &&
        p.line_total !== null &&
        !!p.requested &&
        sameRequestedAmount(p.requested, selected?.requested) &&
        (physicalAmount(p.requested) ||
          (p.sales_unit === selected?.sales_unit &&
            p.content_per_sales_unit === selected?.content_per_sales_unit)) &&
        consistentPrice(p)
    ) ?? []
  const next = alternatives.sort((a, b) => a.line_total! - b.line_total!)[0]
  const savings =
    selected &&
    chosen &&
    selected.quantity === chosen.quantity &&
    (!journal.request.delivery_date ||
      (quote && quote.delivery_date <= journal.request.delivery_date)) &&
    selected.meets_requirements === true &&
    selected.covers_request === true &&
    selected.breaks_mandate === false &&
    selected.line_total !== null &&
    consistentPrice(selected) &&
    next &&
    (!order ||
      (order.currency === quote?.currency &&
        Math.abs(order.total - selected.line_total) < 0.005)) &&
    next.line_total! >= selected.line_total
      ? Math.round((next.line_total! - selected.line_total) * 100) / 100
      : null
  const currencies = new Set(
    journal.orders
      .filter((o) => o.status !== "cancelled")
      .map((o) => o.currency)
  )
  const total =
    currencies.size === 1
      ? journal.orders
          .filter((o) => o.status !== "cancelled")
          .reduce((sum, o) => sum + o.total, 0)
      : null
  const duration =
    (Date.parse(journal.finished_at) - Date.parse(journal.started_at)) / 1000
  const coverage =
    lines.length > 0 &&
    lines.every((l) => l.option && l.quantity === l.option.quantity)
      ? lines.every((l) => l.option?.covers_request === true)
        ? true
        : lines.some((l) => l.option?.covers_request === false)
          ? false
          : null
      : null
  return {
    order,
    quote,
    lines,
    selected,
    next,
    savings,
    total,
    currency: currencies.size === 1 ? [...currencies][0] : quote?.currency,
    duration: Number.isFinite(duration) && duration >= 0 ? duration : null,
    coverage,
    considered:
      new Set([
        ...journal.candidates.map((p) => p.product_id),
        ...journal.quotes.flatMap((q) => q.options.map((p) => p.product_id)),
      ]).size || null,
  }
}

export function eligible(option: Option) {
  return (
    option.meets_requirements === true &&
    option.covers_request === true &&
    option.breaks_mandate === false
  )
}

export type VerificationResult = {
  id: string
  label: string
  status: "Passed" | "Failed" | "Cannot verify"
  detail: string
}

/** Local consistency checks, never authenticity or wholesaler verification. */
export function verifyPurchase(input: unknown): VerificationResult[] {
  let text: string
  try {
    text = JSON.stringify(input) ?? ""
  } catch {
    text = ""
  }
  const parsed = parseJournal(text)
  const results: VerificationResult[] = [
    {
      id: "structure",
      label: "Journal structure",
      status: parsed.ok ? "Passed" : "Failed",
      detail: parsed.ok
        ? "Validated against the journal JSON schema, version 1."
        : "The document does not pass the journal schema.",
    },
  ]
  if (!parsed.ok) return results
  const j = parsed.journal
  const identifiers = [
    j.journal_id,
    j.agent.agent_id,
    j.agent.customer,
    ...j.orders.map((o) => o.order_id),
    ...j.quotes.map((q) => q.quote_id),
  ]
  const unique = (values: string[]) => new Set(values).size === values.length
  const idsOK =
    identifiers.every((id) => id.trim().length > 0) &&
    unique(j.orders.map((o) => o.order_id)) &&
    unique(j.quotes.map((q) => q.quote_id))
  results.push({
    id: "identifiers",
    label: "Required identifiers",
    status: idsOK ? "Passed" : "Failed",
    detail:
      "Journal, agent, customer and existing order/quote IDs must be nonempty; order and quote IDs must be unique.",
  })
  if (!j.orders.length) {
    results.push({
      id: "orders",
      label: "Order evidence",
      status: "Cannot verify",
      detail:
        "No order recorded; totals, association, approval timing and quote validity cannot be verified.",
    })
  }
  for (const o of j.orders) {
    const add = (
      id: string,
      label: string,
      status: VerificationResult["status"],
      detail: string
    ) =>
      results.push({
        id: `${o.order_id}-${id}`,
        label: `${label} · ${o.order_id}`,
        status,
        detail,
      })
    const q = j.quotes.find((v) => v.quote_id === o.quote_id)
    add(
      "quote",
      "Quote association",
      !o.quote_id ? "Cannot verify" : q ? "Passed" : "Failed",
      q
        ? `Order references recorded quote ${q.quote_id}.`
        : "A matching quote reference is missing."
    )
    const lines = selectedLines(j, q)
    const selectionOK =
      lines.length > 0 &&
      lines.every((l) => l.option && l.quantity > 0) &&
      new Set(lines.map((l) => l.product_id)).size === lines.length
    add(
      "selection",
      "Selected products",
      j.orders.length > 1 || !j.decision?.chosen.length || !q
        ? "Cannot verify"
        : selectionOK
          ? "Passed"
          : "Failed",
      selectionOK
        ? "Every selected product appears in the associated quote with a positive, non-duplicated sales-unit quantity."
        : "The selected products cannot all be matched to this order’s quote with valid quantities."
    )
    const complete =
      lines.length > 0 &&
      lines.every(
        (l) =>
          l.option?.unit_price != null &&
          l.option.line_total != null &&
          l.option.quantity != null
      )
    if (!complete || q?.currency !== o.currency) {
      add(
        "total",
        "Item totals",
        "Cannot verify",
        "Requires an unambiguous single-order selection, matching quote currency, quantities and unit prices."
      )
    } else {
      const calculated = lines.reduce(
        (sum, l) => sum + Math.round(l.quantity * l.option!.unit_price! * 100),
        0
      )
      const quoteMath = lines.every(
        (l) =>
          Math.round(l.option!.quantity! * l.option!.unit_price! * 100) ===
          Math.round(l.option!.line_total! * 100)
      )
      const match = quoteMath && calculated === Math.round(o.total * 100)
      add(
        "total",
        "Item totals",
        match ? "Passed" : "Failed",
        `Selected sales-unit quantities × unit prices = ${(calculated / 100).toFixed(2)} ${o.currency}; recorded total ${o.total.toFixed(2)} ${o.currency}. Package contents are not multiplied into the price again.`
      )
    }
    const required = approvalRequired(j, o)
    add(
      "policy",
      "Approval requirement",
      required === null ? "Cannot verify" : "Passed",
      required === null
        ? "Missing spend limit or non-EUR currency; no currency conversion assumed."
        : required
          ? "Approval required by the recorded limit, pending state or approval reasons."
          : "Order is within the recorded EUR per-order spend limit."
    )
    const events = approvalEvents(j, o)
    const mechanism = o.decision?.confirmed_via
    const humanEvidence =
      o.decision && ["mcp_elicitation", "rest"].includes(mechanism ?? "")
    const successful = ["approved", "placed", "shipped"].includes(o.status)
    const conflict =
      (o.status === "approved" && o.decision?.decision === "rejected") ||
      (o.status === "rejected" && o.decision?.decision === "approved")
    add(
      "approval",
      "Approval evidence",
      conflict
        ? "Failed"
        : required === false
          ? "Passed"
          : required === null
            ? "Cannot verify"
            : !o.decision
              ? successful
                ? "Failed"
                : "Cannot verify"
              : !humanEvidence || !events.length
                ? "Cannot verify"
                : o.decision.decision === "rejected" && successful
                  ? "Failed"
                  : "Passed",
      conflict
        ? "Order status contradicts the recorded approval decision."
        : required === false
          ? "Human approval is not required by the recorded spending policy."
          : o.decision
            ? `Recorded decision: ${o.decision.decision}; mechanism: ${mechanism ?? "not recorded"}; ${events.length} linked approval event(s). REST records a caller assertion, not proof of a human identity.`
            : "No approval decision recorded. Pending orders may still be awaiting a decision."
    )
    // place_order creates a local pending order. It is not final authorization or upstream submission.
    const authorization = j.timeline.find(
      (e) =>
        e.refs?.order_id === o.order_id &&
        e.type === "approval" &&
        e.tool === "approve_order"
    )
    const decisionEvent = events.find((e) => e.at)
    const afterFinish =
      decisionEvent?.at &&
      Date.parse(decisionEvent.at) > Date.parse(j.finished_at)
    add(
      "timing",
      "Approval timing",
      required === false
        ? "Passed"
        : afterFinish
          ? "Failed"
          : required &&
              authorization?.at &&
              decisionEvent?.at &&
              o.decision?.decision === "approved"
            ? Date.parse(decisionEvent.at) <= Date.parse(authorization.at)
              ? "Passed"
              : "Failed"
            : "Cannot verify",
      required === false
        ? "Approval timing is not required under the recorded spend policy."
        : afterFinish
          ? "Approval event occurs after journal completion."
          : authorization?.at &&
              decisionEvent?.at &&
              o.decision?.decision === "approved"
            ? "Decision timestamp is consistent with the recorded approve_order authorization event; a separate human decision timestamp is not available."
            : "No comparable timestamped approval and authorization evidence. Local place_order is not wholesaler submission."
    )
    const placement = j.timeline.find(
      (e) =>
        e.type === "order" &&
        e.tool === "place_order" &&
        e.refs?.order_id === o.order_id
    )
    const validAt =
      placement?.at && q
        ? Date.parse(placement.at) >= Date.parse(q.created_at) &&
          Date.parse(placement.at) < Date.parse(q.expires_at)
        : null
    add(
      "expiry",
      "Quote validity at order creation",
      validAt === null ? "Cannot verify" : validAt ? "Passed" : "Failed",
      validAt === null
        ? "Missing timestamped place_order or quote validity window. Wholesaler submission is not recorded by this schema."
        : `Compared place_order ${placement!.at} with quote creation and expiration; this verifies local order creation only.`
    )
  }
  return results
}

/** Redact common credential formats in free text as well as structured secret fields. */
export function redactText(text: string): string {
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(
      /((?:[\w-]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)[\w-]*)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;&}]+)/gi,
      "$1[REDACTED]"
    )
}

export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as T
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        /api[_-]?key|token|authorization|password|secret/i.test(key)
          ? "[REDACTED]"
          : redactSecrets(v),
      ])
    ) as T
  return value
}
