import {
  comparisonProducts,
  comparablePriceGroups,
  unitPriceLabel,
  type ComparisonProduct,
} from "./comparison"
import { buyerDecisions, productSearchSummary } from "./customer-record"
import {
  approvalEvents,
  approvalRequired,
  businessText,
  NOT_AVAILABLE,
  productNames,
  purchaseFacts,
  quantityLabel,
  redactSecrets,
  statusLabel,
  orderDisplayStatus,
  purchaseDisplayStatus,
} from "./evidence"
import { formatMoney, formatNumber } from "./format"
import { purchasingJourney } from "./journey"
import type { ValioAimoJournal } from "./journal.types"
import { purchaseSafetyChecks } from "./safety-checks"

type TextBlock = { type: "text"; text: string; bold?: boolean }
type ReportProduct = {
  name: string
  selected: boolean
  suitable: boolean | null
  total: number | null
}
export type ReportSection = {
  title: string
  blocks: (
    | TextBlock
    | { type: "product"; product: ReportProduct; fields: string[] }
    | {
        type: "chart"
        title: string
        currency: string
        products: ReportProduct[]
      }
  )[]
}
const text = (value: string, bold = false): TextBlock => ({
  type: "text",
  text: value,
  bold,
})
const printable = (product: ComparisonProduct): ReportProduct => ({
  name: product.name,
  selected: product.selected,
  suitable: product.suitable,
  total: product.option?.line_total ?? null,
})
const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-FI", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(value))
    : NOT_AVAILABLE
const time = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-FI", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Helsinki",
      }).format(new Date(value))
    : NOT_AVAILABLE

/** Customer-readable content only; full audit data stays on the developer route. */
export function purchaseReportSections(
  input: ValioAimoJournal,
  generatedAt = new Date()
): ReportSection[] {
  const j = redactSecrets(input),
    f = purchaseFacts(j),
    names = productNames(j)
  const summary: ReportSection = {
    title: "Purchase Summary",
    blocks: [
      text(businessText(j.title, j), true),
      text(
        `Report generated: ${time(generatedAt.toISOString())} (Europe/Helsinki)`
      ),
      text(`Customer request: ${businessText(j.request.text, j)}`),
      text(
        `Quantity requested: ${j.request.amount ? `${formatNumber(j.request.amount.value)} ${j.request.amount.unit}` : j.request.quantity != null ? `${formatNumber(j.request.quantity)} packages` : NOT_AVAILABLE}`
      ),
      text(`Delivery requirement: ${date(j.request.delivery_date)}`),
      text(
        `Selected products: ${j.decision?.chosen.length ? j.decision.chosen.map((line) => `${names.get(line.product_id) ?? "Product name not recorded"} — ${quantityLabel(f.lines.find((p) => p.product_id === line.product_id)?.option, line.quantity)}`).join("; ") : NOT_AVAILABLE}`
      ),
      text(
        `Total excluding VAT: ${f.total !== null && f.currency ? formatMoney(f.total, f.currency) : NOT_AVAILABLE}`,
        true
      ),
      text(`Order status: ${statusLabel(purchaseDisplayStatus(j))}`),
      text(
        `Money saved: ${f.savings !== null && f.quote ? formatMoney(f.savings, f.quote.currency) : NOT_AVAILABLE}`
      ),
      text(
        `Why selected: ${j.decision ? businessText(j.decision.reason, j) : "No selection reason recorded"}`
      ),
      text(
        `Next steps: ${j.next_steps.length ? j.next_steps.map((s) => businessText(s, j)).join("; ") : j.orders.some((o) => o.status === "pending_approval") ? "Buyer approval is pending." : "No further action is recorded. Wholesaler confirmation is not verified."}`
      ),
    ],
  }
  const products = comparisonProducts(j)
  const search = productSearchSummary(j)
  const comparison: ReportSection = {
    title: "Product Comparison",
    blocks: [
      text(
        `How we found your products: ${search.searches.length ? search.searches.join(", ") : "Search description not recorded"}. Products considered: ${search.considered ?? NOT_AVAILABLE}. Confirmed suitable offers: ${search.suitable ?? "Not verified"}. Excluded from shortlist: ${search.excluded}.`
      ),
      ...search.reasons.map((reason) => text(reason)),
    ],
  }
  for (const product of products)
    comparison.blocks.push({
      type: "product",
      product: printable(product),
      fields: [
        product.selected ? "Selected Product" : "Alternative",
        `Total excluding VAT: ${product.option?.line_total != null && product.quote ? formatMoney(product.option.line_total, product.quote.currency) : NOT_AVAILABLE}. Price per comparable unit: ${unitPriceLabel(product)}`,
        `Requested: ${product.option?.requested ?? NOT_AVAILABLE}. Quantity offered: ${quantityLabel(product.option)}.`,
        `Quantity available: ${product.option?.covers_request === true ? "Full request covered in the offer" : product.option?.covers_request === false ? "Full request not covered" : NOT_AVAILABLE}. Exact stock count is not recorded.`,
        `Delivery: ${date(product.quote?.delivery_date)}. Best before: ${date(product.option?.best_before_date)}. Expiry: ${date(product.option?.expiry_date)}.`,
        `Product requirements: ${product.option?.meets_requirements === true ? "Met" : product.option?.meets_requirements === false ? "Not met" : "Cannot verify"}. Package size: ${product.option?.content_per_sales_unit ?? NOT_AVAILABLE}.`,
        `Suitability: ${businessText(product.rankingReason, j)}`,
      ],
    })
  for (const group of comparablePriceGroups(products))
    comparison.blocks.push({
      type: "chart",
      title: `Compare Prices at a Glance — ${group.request}; delivery ${date(group.delivery)}`,
      currency: group.currency,
      products: group.products.map(printable),
    })
  comparison.blocks.push(
    text(
      "Total-price scales compare only full-request offers under matching conditions. A price offer is not proof of current stock or delivery."
    )
  )
  const decisions: ReportSection = {
    title: "Your Purchasing Decisions",
    blocks: [],
  }
  for (const decision of buyerDecisions(j))
    decisions.blocks.push(
      text(decision.title, true),
      text(decision.question),
      ...decision.options.map((option) =>
        text(`${option.title}${option.selected ? " — Your choice" : ""}`)
      ),
      text(
        `Your response: ${decision.answer}${decision.buyerNote ? `; ${decision.buyerNote}` : ""}`
      ),
      ...decision.disclosures.map((risk) => text(`Disclosed risk: ${risk}`)),
      text(`Accepted risks: ${decision.riskAcceptance}`),
      text(decision.effect)
    )
  if (!decisions.blocks.length)
    decisions.blocks.push(
      text(
        "No buyer questions or responses were recorded. Purchase approval is described in Order Details."
      )
    )
  const journey: ReportSection = {
    title: "Purchasing Journey",
    blocks: purchasingJourney(j).map((step) =>
      text(
        `${step.title} — ${step.explanation}\nTime: ${step.time.value ? time(step.time.value) : step.time.note}. ${step.time.note}\n${step.facts.map(([label, value]) => `${label}: ${value}`).join(" | ")}`
      )
    ),
  }
  const safety: ReportSection = {
    title: "Purchase Safety Checks",
    blocks: [
      text(
        "These checks test consistency within this purchase record. They do not independently verify stock, human identity or supplier confirmation."
      ),
      ...purchaseSafetyChecks(j).map((check) =>
        text(`${check.label}: ${check.status}. ${check.detail}`)
      ),
    ],
  }
  const orders: ReportSection = { title: "Your Order Details", blocks: [] }
  for (const [i, order] of j.orders.entries()) {
    const required = approvalRequired(j, order),
      events = approvalEvents(j, order)
    orders.blocks.push(
      text(
        `Purchase ${i + 1}: ${statusLabel(orderDisplayStatus(order))}. Total excluding VAT: ${formatMoney(order.total, order.currency)}.`,
        true
      ),
      text(
        `Requested delivery: ${date(order.delivery_date)}. Automatic purchasing limit: ${j.authority.spend_limit_eur === null ? NOT_AVAILABLE : formatMoney(j.authority.spend_limit_eur, "EUR")}.`
      ),
      text(
        `Approval required: ${required === null ? "Cannot verify" : required ? "Yes" : "No"}. Buyer decision: ${order.decision?.decision ?? "Not recorded"}.`
      ),
      text(
        `Approval reason: ${order.decision ? businessText(order.decision.reason, j) || NOT_AVAILABLE : NOT_AVAILABLE}. Approval time: ${events.length === 1 ? time(events[0].at) : NOT_AVAILABLE}. Buyer’s identity: Not recorded.`
      ),
      text(
        `Delivery notes: ${j.narrative.watch_out ? businessText(j.narrative.watch_out, j) : "No delivery-risk note recorded"}. Wholesaler confirmation: Not verified.`
      )
    )
  }
  if (!j.orders.length) orders.blocks.push(text("No order is recorded."))
  orders.blocks.push(
    text(
      "Buyer approval, recording an order and wholesaler confirmation are separate stages. An order marked placed is not automatically confirmed or delivered."
    )
  )
  return [summary, comparison, decisions, journey, safety, orders]
}
