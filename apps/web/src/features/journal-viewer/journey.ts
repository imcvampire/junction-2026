import {
  approvalRequired,
  businessText,
  eligible,
  friendlyTag,
  NOT_AVAILABLE,
  productNames,
  statusLabel,
  orderDisplayStatus,
  purchaseDisplayStatus,
} from "./evidence"
import { formatMoney, formatNumber } from "./format"
import type { TimelineEntry, ValioAimoJournal } from "./journal.types"

export const API_OPERATIONS: Record<string, string> = {
  whoami: "GET /api/agent/v1/me",
  search_products: "GET /api/agent/v1/products",
  get_product: "GET /api/agent/v1/products/{id}",
  quote: "POST /api/agent/v1/quotes",
  place_order: "POST /api/agent/v1/orders",
  get_order: "GET /api/agent/v1/orders/{id}",
  approve_order: "POST /api/agent/v1/orders/{id}/approve",
  reject_order: "POST /api/agent/v1/orders/{id}/reject",
  cancel_order: "POST /api/agent/v1/orders/{id}/cancel",
}

export type JourneyTime = {
  value?: string
  source:
    "recorded" | "request" | "previous" | "missing" | "pending" | "unknown"
  note: string
}
const validTime = (value?: string | null): value is string =>
  !!value && Number.isFinite(Date.parse(value))

/** Presentation only. seq is used for chronology, never as an event's semantic identity. */
export function journeyEventTime(
  event: TimelineEntry,
  journal: ValioAimoJournal
): JourneyTime {
  if (event.type === "approval") {
    const order = journal.orders.find(
      (candidate) => candidate.order_id === event.refs?.order_id
    )
    if (!order?.decision)
      return order?.status === "pending_approval"
        ? { source: "pending", note: "Pending" }
        : { source: "unknown", note: "Pending / Outcome Unknown" }
  }
  if (validTime(event.at))
    return { value: event.at, source: "recorded", note: "Recorded event time" }
  const previous = [...journal.timeline]
    .filter((candidate) => candidate.seq < event.seq && validTime(candidate.at))
    .sort((a, b) => b.seq - a.seq)[0]?.at
  return inheritedTime(previous ?? journal.started_at)
}

function inheritedTime(value?: string | null): JourneyTime {
  return validTime(value)
    ? {
        value,
        source: "previous",
        note: "Time estimated from the previous recorded event",
      }
    : { source: "missing", note: "Time not available" }
}

export type JourneyStep = {
  key: string
  type: TimelineEntry["type"]
  title: string
  explanation: string
  status: "complete" | "attention" | "failed"
  time: JourneyTime
  facts: [string, string][]
}

export function purchasingJourney(journal: ValioAimoJournal): JourneyStep[] {
  const names = productNames(journal)
  const amount = journal.request.amount
    ? `${formatNumber(journal.request.amount.value)} ${journal.request.amount.unit}`
    : journal.request.quantity != null
      ? `${formatNumber(journal.request.quantity)} sales units`
      : NOT_AVAILABLE
  const limit =
    journal.authority.spend_limit_eur === null
      ? NOT_AVAILABLE
      : formatMoney(journal.authority.spend_limit_eur, "EUR")
  const restrictions =
    [
      journal.authority.required_tags.map(friendlyTag).join(", "),
      journal.authority.banned_allergens.length
        ? `Excluded allergens: ${journal.authority.banned_allergens.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("; ") || "None recorded"
  const requestTime: JourneyTime = validTime(journal.started_at)
    ? {
        value: journal.started_at,
        source: "request",
        note: "Purchase request display time is based on the recorded task start.",
      }
    : { source: "missing", note: "Time not available" }
  const steps: JourneyStep[] = [
    {
      key: "purchase-request",
      type: "question",
      title: "Purchase Requested",
      explanation: businessText(journal.request.text, journal),
      status: "complete",
      time: requestTime,
      facts: [
        ["Requested quantity", amount],
        ["Requested delivery", journal.request.delivery_date ?? NOT_AVAILABLE],
        [
          "Product requirements",
          journal.request.requirements.map(friendlyTag).join(", ") ||
            "None recorded",
        ],
      ],
    },
  ]
  for (const event of [...journal.timeline].sort((a, b) => a.seq - b.seq)) {
    const order = journal.orders.find(
      (o) => o.order_id === event.refs?.order_id
    )
    const quote = journal.quotes.find(
      (q) => q.quote_id === event.refs?.quote_id
    )
    const decision = event.type === "approval" ? order?.decision : undefined
    const escalation =
      event.type === "order" &&
      order?.status === "pending_approval" &&
      !order.decision
    let title: string, explanation: string, facts: [string, string][]
    let status: JourneyStep["status"] = "complete"
    switch (event.type) {
      case "authority":
        title = "Purchasing Permissions Checked"
        explanation =
          "The assistant checked its spending limit and purchasing restrictions."
        facts = [
          ["Automatic purchasing limit", limit],
          ["Purchasing restrictions", restrictions],
          ["Result", "Purchasing permissions checked"],
        ]
        break
      case "search": {
        const count =
          event.refs?.product_ids?.length ??
          (journal.timeline.filter((e) => e.type === "search").length === 1
            ? journal.candidates.length || null
            : null)
        title = "Products Found"
        explanation =
          count !== null
            ? `${count} products were considered for your request.`
            : "The assistant searched for products that match your request."
        facts = [
          [
            "Products considered",
            count === null ? NOT_AVAILABLE : String(count),
          ],
          ["Requested quantity", amount],
          [
            "Product requirements",
            journal.request.requirements.map(friendlyTag).join(", ") ||
              "None recorded",
          ],
        ]
        break
      }
      case "quote": {
        const options = quote?.options ?? []
        const prices = options
          .filter(
            (p) =>
              eligible(p) &&
              p.line_total !== null &&
              (!journal.request.delivery_date ||
                quote!.delivery_date <= journal.request.delivery_date)
          )
          .map((p) => p.line_total!)
        title = "Price and Availability Checked"
        explanation = quote
          ? `${options.length} products were priced; ${options.filter((p) => p.covers_request === true).length} are recorded as covering the full request.`
          : "The assistant requested product prices and availability."
        facts = [
          [
            "Requested delivery",
            journal.request.delivery_date ?? NOT_AVAILABLE,
          ],
          ["Products priced", quote ? String(options.length) : NOT_AVAILABLE],
          [
            "Options covering full quantity",
            quote
              ? String(options.filter((p) => p.covers_request === true).length)
              : NOT_AVAILABLE,
          ],
          [
            "Lowest suitable price",
            prices.length &&
            quote &&
            new Set(
              options
                .filter((p) => prices.includes(p.line_total ?? NaN))
                .map((p) => p.requested)
            ).size === 1
              ? formatMoney(Math.min(...prices), quote.currency)
              : NOT_AVAILABLE,
          ],
        ]
        break
      }
      case "order": {
        title = escalation ? "Approval Requested" : "Purchase Recorded"
        explanation = escalation
          ? "The purchase was referred to the buyer for approval."
          : "A purchase was recorded in the purchasing system; wholesaler confirmation is not verified."
        if (escalation) status = "attention"
        const difference =
          order?.currency === "EUR" &&
          journal.authority.spend_limit_eur !== null
            ? Math.max(0, order.total - journal.authority.spend_limit_eur)
            : null
        facts = [
          [
            "Order amount",
            order ? formatMoney(order.total, order.currency) : NOT_AVAILABLE,
          ],
          ["Automatic purchasing limit", limit],
          [
            "Approval required",
            order
              ? approvalRequired(journal, order) === null
                ? "Not verified"
                : approvalRequired(journal, order)
                  ? "Yes"
                  : "No"
              : "Not verified",
          ],
          [
            "Reason",
            difference !== null && difference > 0
              ? `Order exceeds the automatic limit by ${formatMoney(difference, "EUR")}.`
              : escalation
                ? "The purchase was referred for buyer approval; no further reason is available here."
                : "Purchase recorded",
          ],
        ]
        break
      }
      case "approval":
        title = decision
          ? decision.decision === "approved"
            ? "Purchase Approved"
            : "Purchase Rejected"
          : order?.status === "pending_approval"
            ? "Awaiting Approval"
            : "Approval Decision Not Recorded"
        explanation = decision
          ? decision.decision === "approved"
            ? "The recorded buyer decision approved this purchase."
            : "The recorded decision declined this purchase."
          : order?.status === "pending_approval"
            ? "The buyer has not yet approved or rejected this purchase."
            : "An approval activity was recorded, but its outcome is not available."
        status =
          decision?.decision === "rejected"
            ? "failed"
            : decision
              ? "complete"
              : "attention"
        facts = [
          [
            "Decision",
            decision
              ? decision.decision === "approved"
                ? "Approved"
                : "Rejected"
              : "Not recorded",
          ],
          [
            "Approval reason",
            decision
              ? businessText(decision.reason, journal) || NOT_AVAILABLE
              : NOT_AVAILABLE,
          ],
          ["Who approved", "Buyer’s identity not recorded"],
        ]
        break
      case "research":
        title = "Product Research Recorded"
        explanation = "The assistant recorded research to inform the purchase."
        facts = [["Research", "See the recorded recipe and web research below"]]
        break
      case "report":
        title = "Purchase Update Shared"
        explanation = "The assistant shared a purchase update with the buyer."
        facts = [
          ["Update", "Purchase outcome shared with the buyer"],
          [
            "Purchase status",
            order
              ? statusLabel(orderDisplayStatus(order))
              : statusLabel(purchaseDisplayStatus(journal)),
          ],
          ["Order confirmation", "Not verified"],
        ]
        break
      case "question":
        title = "Buyer Input Requested"
        explanation = "The assistant asked the buyer for additional guidance."
        status = "attention"
        facts = [["Buyer questions recorded", String(journal.questions.length)]]
        break
      case "answer":
        title = "Buyer Responded"
        explanation = "A buyer response was recorded for the purchase."
        facts = [
          [
            "Result",
            "Buyer response recorded; this alone does not establish offer acceptance",
          ],
        ]
        break
      case "cancel":
        title = "Purchase Cancelled"
        explanation = "A cancellation activity was recorded for this purchase."
        facts = [
          [
            "Cancellation reason",
            order?.cancellation
              ? businessText(order.cancellation.reason, journal)
              : NOT_AVAILABLE,
          ],
        ]
        break
      case "error":
        title = "An Activity Needs Attention"
        explanation =
          "A purchasing activity could not be completed as expected."
        status = "failed"
        facts = [
          [
            "Next action",
            "Review the purchase status and contact your purchasing team if needed. Technical records are available below.",
          ],
        ]
        break
    }
    steps.push({
      key: `activity-${event.seq}-${event.type}`,
      type: event.type,
      title,
      explanation,
      status,
      time: journeyEventTime(event, journal),
      facts,
    })
  }
  // A pending order is evidence of an outstanding decision, not a completed approval event.
  journal.orders.forEach((order, index) => {
    if (
      order.status !== "pending_approval" ||
      order.decision ||
      journal.timeline.some(
        (event) =>
          event.type === "approval" && event.refs?.order_id === order.order_id
      )
    )
      return
    const request = journal.timeline
      .filter(
        (event) =>
          event.type === "order" && event.refs?.order_id === order.order_id
      )
      .sort((a, b) => b.seq - a.seq)[0]
    const requestIndex = request
      ? steps.findIndex(
          (step) => step.key === `activity-${request.seq}-${request.type}`
        )
      : -1
    const awaiting: JourneyStep = {
      key: `awaiting-approval-${index}`,
      type: "approval",
      title: "Awaiting Approval",
      explanation: "The buyer has not yet approved or rejected this purchase.",
      status: "attention",
      time: { source: "pending", note: "Pending" },
      facts: [
        ["Buyer decision", "Awaiting approval"],
        ["Purchase status", "Awaiting Approval"],
      ],
    }
    steps.splice(
      requestIndex >= 0 ? requestIndex + 1 : steps.length,
      0,
      awaiting
    )
  })
  // Selection is factual decision evidence, not a timestamped technical event.
  if (journal.decision?.chosen.length) {
    const selection: JourneyStep = {
      key: "product-decision",
      type: "quote",
      title: "Product Selected",
      explanation:
        "The assistant recorded its product selection and the reason for choosing it.",
      status: "complete",
      time: { source: "missing", note: "Selection time not recorded" },
      facts: [
        [
          "Selected product",
          journal.decision.chosen
            .map((l) => names.get(l.product_id) ?? "Product name not recorded")
            .join("; "),
        ],
        ["Why selected", businessText(journal.decision.reason, journal)],
      ],
    }
    const lastQuote = steps.findLastIndex(
      (s) => s.key.startsWith("activity-") && s.type === "quote"
    )
    steps.splice(lastQuote >= 0 ? lastQuote + 1 : 1, 0, selection)
  }
  if (validTime(journal.finished_at))
    steps.push({
      key: "record-completed",
      type: "report",
      title: "Purchase Record Completed",
      explanation: "The assistant finished recording this purchasing task.",
      status: "complete",
      time: {
        value: journal.finished_at,
        source: "recorded",
        note: "Recorded purchase record completion time",
      },
      facts: [["Wholesaler confirmation", "Not verified"]],
    })
  // Apply the same rule to derived steps (selection/completion) without changing source data.
  let previous: string | undefined
  const pending = purchaseDisplayStatus(journal) === "pending_approval"
  const visible = pending
    ? steps.filter(
        (step) =>
          step.type !== "report" &&
          !(step.type === "approval" && step.time.source === "pending")
      )
    : steps
  if (pending)
    visible.push({
      key: "awaiting-approval-final",
      type: "approval",
      title: "Awaiting Approval",
      explanation:
        "The buyer must approve or reject the order before the purchasing process can continue.",
      status: "attention",
      time: { source: "pending", note: "Pending" },
      facts: [["Buyer decision", "Awaiting approval"]],
    })
  return visible.map((step) => {
    const unresolved =
      step.time.source === "pending" || step.time.source === "unknown"
    const time =
      step.time.value || unresolved ? step.time : inheritedTime(previous)
    if (time.value) previous = time.value
    return { ...step, time }
  })
}
