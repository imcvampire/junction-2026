import type { Option, ValioAimoJournal } from "./journal.types"
import { businessText, eligible, NOT_AVAILABLE, type Quote } from "./evidence"
import { formatMoney, formatNumber } from "./format"
import { physicalAmount } from "./quantities"

export type ComparisonProduct = {
  key: string
  productId: string
  name: string
  selected: boolean
  suitable: boolean | null
  option?: Option
  quote?: Quote
  candidate?: ValioAimoJournal["candidates"][number]
  rankingReason: string
}

export function normalizedUnitPrice(
  option: Option | undefined,
  currency?: string
) {
  const amount = physicalAmount(option?.content_per_sales_unit)
  if (
    !option ||
    !currency ||
    option.unit_price == null ||
    option.unit_price < 0
  )
    return null
  if (amount)
    return {
      value: option.unit_price / amount.value,
      unit: amount.unit,
      currency,
    }
  return null
}

export function unitPriceLabel(product: ComparisonProduct) {
  const normalized = normalizedUnitPrice(
    product.option,
    product.quote?.currency
  )
  if (normalized)
    return `${formatMoney(normalized.value, normalized.currency)} / ${normalized.unit}`
  return product.option?.unit_price != null && product.quote
    ? `${formatMoney(product.option.unit_price, product.quote.currency)} per ordering unit (package sizes may differ)`
    : NOT_AVAILABLE
}

export function comparisonProducts(
  journal: ValioAimoJournal
): ComparisonProduct[] {
  const quotedIds = new Set<string>()
  const associated = new Set(
    journal.orders.map((o) => o.quote_id).filter(Boolean)
  )
  const chosenIds = new Set(
    journal.decision?.chosen.map((l) => l.product_id) ?? []
  )
  const result: ComparisonProduct[] = journal.quotes.flatMap((quote, qi) =>
    quote.options.map((option, oi) => {
      quotedIds.add(option.product_id)
      const late =
        !!journal.request.delivery_date &&
        quote.delivery_date > journal.request.delivery_date
      const suitable =
        option.meets_requirements === false ||
        option.breaks_mandate === true ||
        option.covers_request === false ||
        late
          ? false
          : eligible(option)
            ? true
            : null
      const reasons = [
        option.meets_requirements === false
          ? "Does not meet customer requirements"
          : option.meets_requirements === true
            ? "Meets customer requirements"
            : "Requirement compliance not recorded",
        option.covers_request === true
          ? "covers the full request"
          : option.covers_request === false
            ? "does not cover the full request"
            : "quantity coverage not recorded",
        late
          ? "delivery is later than requested"
          : journal.request.delivery_date
            ? "quoted delivery meets the requested date"
            : "delivery requirement not recorded",
        option.breaks_mandate === true
          ? "breaks purchasing restrictions"
          : null,
      ].filter(Boolean)
      return {
        key: `quote-${qi}-${oi}`,
        productId: option.product_id,
        name: option.name,
        selected:
          option.chosen ||
          (chosenIds.has(option.product_id) &&
            (associated.has(quote.quote_id) ||
              (journal.orders.length === 0 && journal.quotes.length === 1))),
        suitable,
        option,
        quote,
        rankingReason: `${reasons.join("; ")}.`,
      }
    })
  )
  for (const [i, candidate] of journal.candidates.entries()) {
    if (
      quotedIds.has(candidate.product_id) ||
      result.some((p) => p.productId === candidate.product_id)
    )
      continue
    result.push({
      key: `candidate-${i}`,
      productId: candidate.product_id,
      name: candidate.name,
      selected: chosenIds.has(candidate.product_id),
      suitable: null,
      candidate,
      rankingReason: candidate.kept
        ? "Considered in the product search; no price or availability result is recorded."
        : `Not taken forward: ${businessText(candidate.drop_reason || "reason not recorded", journal)}. No price or availability result is recorded.`,
    })
  }
  const suitabilityRank = (p: ComparisonProduct) =>
    p.suitable === true ? 0 : p.suitable === null ? 1 : 2
  return result.sort(
    (a, b) =>
      Number(b.selected) - Number(a.selected) ||
      suitabilityRank(a) - suitabilityRank(b) ||
      (a.quote?.quote_id === b.quote?.quote_id &&
      a.quote?.currency === b.quote?.currency
        ? (a.option?.line_total ?? Infinity) -
          (b.option?.line_total ?? Infinity)
        : 0) ||
      (a.option?.rank ?? Infinity) - (b.option?.rank ?? Infinity)
  )
}

export type PriceGroup = {
  key: string
  currency: string
  request: string
  delivery: string
  products: ComparisonProduct[]
}
export function comparablePriceGroups(products: ComparisonProduct[]) {
  const groups = new Map<string, PriceGroup>()
  for (const product of products) {
    const { quote, option } = product
    if (
      !quote ||
      !option ||
      option.covers_request !== true ||
      option.line_total == null ||
      option.line_total < 0 ||
      option.quantity == null ||
      option.unit_price == null ||
      Math.round(option.quantity * option.unit_price * 100) !==
        Math.round(option.line_total * 100)
    )
      continue
    const amount = physicalAmount(option.requested)
    // Only compare exactly described requests, within the same quote and delivery conditions.
    const request = amount
      ? `${formatNumber(amount.value)} ${amount.unit}`
      : option.requested?.trim()
    if (!request) continue
    const key = JSON.stringify([
      quote.quote_id,
      quote.currency,
      quote.delivery_date,
      quote.purpose,
      amount ? [amount.value, amount.unit] : request,
      amount ? null : [option.sales_unit, option.content_per_sales_unit],
    ])
    const group = groups.get(key) ?? {
      key,
      currency: quote.currency,
      request,
      delivery: quote.delivery_date,
      products: [],
    }
    group.products.push(product)
    groups.set(key, group)
  }
  return [...groups.values()].map((group) => ({
    ...group,
    products: [...group.products].sort(
      (a, b) =>
        Number(b.selected) - Number(a.selected) ||
        Number(b.suitable === true) - Number(a.suitable === true) ||
        a.option!.line_total! - b.option!.line_total!
    ),
  }))
}
