import { useLayoutEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import {
  CalendarDate,
  Field,
  formatMoney,
  formatNumber,
  JournalSection,
} from "../format"
import { NOT_AVAILABLE, purchaseFacts, quantityLabel } from "../evidence"
import {
  comparablePriceGroups,
  comparisonProducts,
  unitPriceLabel,
  type ComparisonProduct,
} from "../comparison"
import type { ValioAimoJournal } from "../journal.types"
import { Panel } from "./dashboard"
import { ProductSearchSummary } from "./customer-details"

export function PriceComparison({ journal }: { journal: ValioAimoJournal }) {
  const products = comparisonProducts(journal)
  const groups = comparablePriceGroups(products)
  const comparedKeys = new Set(
    groups.flatMap((g) => g.products.map((p) => p.key))
  )
  const excluded = products.filter((p) => !comparedKeys.has(p.key))
  const facts = purchaseFacts(journal)
  return (
    <Panel>
      <h4 className="text-lg font-semibold text-primary">
        Compare Prices at a Glance
      </h4>
      <p className="mt-2 text-sm text-muted-foreground">
        Total prices exclude VAT. Each scale compares the same requested amount
        within one price offer and delivery date.
      </p>
      {!groups.length && (
        <p className="mt-4 rounded-lg bg-accent p-4 text-sm">
          There is not enough information to compare total prices: a
          full-quantity offer, requested amount and consistent price calculation
          are needed.
        </p>
      )}
      {groups.map((group, index) => {
        const max = Math.max(
          ...group.products.map((p) => p.option!.line_total!),
          1
        )
        return (
          <figure
            key={group.key}
            className="mt-5 rounded-xl border p-4"
            aria-label={`Price comparison ${index + 1}: ${group.request}, ${group.currency}`}
          >
            <figcaption className="mb-4 text-sm font-medium">
              {group.request} · Delivery <CalendarDate value={group.delivery} />
              {groups.length > 1 ? ` · Offer group ${index + 1}` : ""}
            </figcaption>
            <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
              {group.products.map((p) => (
                <div
                  key={p.key}
                  className="grid min-w-0 gap-2 sm:grid-cols-[minmax(10rem,1fr)_2fr_7rem] sm:items-center"
                >
                  <span className="text-sm leading-snug break-words">
                    {p.name}
                    {p.selected && (
                      <span className="block text-xs font-semibold text-primary">
                        Selected Product
                      </span>
                    )}
                    {p.suitable === false && (
                      <span className="block text-xs text-muted-foreground">
                        Does not meet all requirements
                      </span>
                    )}
                  </span>
                  <div className="h-6 rounded bg-background" aria-hidden>
                    <div
                      className={`h-full rounded ${p.selected ? "bg-primary" : p.suitable === true ? "bg-[#99BEE5]" : "bg-[#AAB3BF]"}`}
                      style={{
                        width: `${Math.max(0, (p.option!.line_total! / max) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold tabular-nums sm:text-right">
                    {formatMoney(p.option!.line_total!, group.currency)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t pt-2 text-xs text-muted-foreground">
              <span>{formatMoney(0, group.currency)}</span>
              <span>Total price ({group.currency}), excluding VAT</span>
              <span>{formatMoney(max, group.currency)}</span>
            </div>
            {group.products.length === 1 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Only one full-quantity price is comparable in this offer group.
              </p>
            )}
          </figure>
        )
      })}
      {facts.savings !== null && facts.quote && (
        <p className="mt-4 text-sm font-semibold text-primary">
          You save {formatMoney(facts.savings, facts.quote.currency)} compared
          with the next suitable option.
        </p>
      )}
      {excluded.length > 0 && (
        <div className="mt-5 rounded-lg bg-background p-4">
          <p className="text-sm font-medium">
            Not included in the total-price scale
          </p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {excluded.map((p) => (
              <li key={p.key}>
                <span className="font-medium text-foreground">{p.name}</span> —{" "}
                {p.option?.covers_request === false
                  ? "Does not fulfill the full request"
                  : "Comparable total price or quantity information is missing"}
                . Unit price: {unitPriceLabel(p)}.
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

function ProductCard({ product: p }: { product: ComparisonProduct }) {
  const option = p.option
  const quote = p.quote
  return (
    <div
      role="group"
      aria-label={`${p.name}${p.selected ? ", selected" : ", alternative"}`}
      className={`flex min-w-0 flex-col gap-4 rounded-xl border p-5 ${p.selected ? "border-primary bg-accent ring-1 ring-primary/10" : "bg-card"}`}
    >
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge
            className={`h-auto max-w-full whitespace-normal ${p.selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {p.selected ? "Selected Product" : "Alternative"}
          </Badge>
          {option?.cheapest_covering_option === true && p.suitable === true && (
            <Badge
              variant="outline"
              className="h-auto max-w-full border-primary/30 whitespace-normal text-primary"
            >
              Lowest-priced suitable option
            </Badge>
          )}
          {option?.meets_requirements === false && (
            <Badge
              variant="outline"
              className="h-auto max-w-full whitespace-normal"
            >
              Does Not Meet Requirements
            </Badge>
          )}
          {p.rankingReason.includes("delivery is later than requested") && (
            <Badge variant="outline">Delivery Too Late</Badge>
          )}
          {option?.covers_request === false && (
            <Badge
              variant="outline"
              className="h-auto max-w-full whitespace-normal"
            >
              Full Quantity Unavailable
            </Badge>
          )}
        </div>
        <h4
          className={`leading-snug font-semibold text-primary ${p.selected ? "text-xl" : "text-lg"}`}
        >
          {p.name}
        </h4>
      </div>
      <div>
        <p
          className={`font-semibold tracking-tight text-primary tabular-nums ${p.selected ? "text-3xl" : "text-2xl"}`}
        >
          {option?.line_total != null && quote
            ? formatMoney(option.line_total, quote.currency)
            : NOT_AVAILABLE}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Total price excluding VAT
        </p>
        <p className="mt-2 text-sm font-medium">{unitPriceLabel(p)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <Field label="Quantity offered">{quantityLabel(option)}</Field>
        <Field label="Available quantity">
          {option?.covers_request === true
            ? "Enough for the requested quantity"
            : option?.covers_request === false
              ? "Full quantity unavailable; exact stock count not recorded"
              : NOT_AVAILABLE}
        </Field>
        <Field label="Requested quantity">
          {option?.requested ?? NOT_AVAILABLE}
        </Field>
        <Field label="Requested quantity covered">
          {option?.covers_request === true
            ? "Yes"
            : option?.covers_request === false
              ? "No"
              : NOT_AVAILABLE}
        </Field>
        <Field label="Delivery date">
          {quote ? <CalendarDate value={quote.delivery_date} /> : NOT_AVAILABLE}
        </Field>
        <Field
          label={
            option?.expiry_date && !option.best_before_date
              ? "Expiry date"
              : "Best before date"
          }
        >
          {option?.best_before_date || option?.expiry_date ? (
            <CalendarDate
              value={option.best_before_date ?? option.expiry_date}
            />
          ) : (
            NOT_AVAILABLE
          )}
          {option?.best_before_date && option.expiry_date && (
            <p>
              Expiry: <CalendarDate value={option.expiry_date} />
            </p>
          )}
        </Field>
        <Field label="Your requirements">
          {option?.meets_requirements === true
            ? "Meets requirements"
            : option?.meets_requirements === false
              ? "Does not meet requirements"
              : NOT_AVAILABLE}
        </Field>
        <Field label="Suitability">
          {p.suitable === true
            ? "Suitable alternative"
            : p.suitable === false
              ? "Does not meet all requirements"
              : "Not verified"}
        </Field>
      </dl>
      <p className="rounded-lg bg-background/70 p-3 text-sm leading-relaxed">
        <strong>Why it appears here: </strong>
        {p.rankingReason}
      </p>
      <details className="mt-auto rounded-lg border bg-card/70 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-primary">
          View Product Details
        </summary>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <Field label="Package size">
            {option?.content_per_sales_unit ?? NOT_AVAILABLE}
          </Field>
          <Field label="Number of packages">
            {option?.quantity == null
              ? NOT_AVAILABLE
              : `${formatNumber(option.quantity)} ${option.sales_unit === "KI" ? "cases" : option.sales_unit === "ST" ? "units" : "packages"}`}
          </Field>
          <Field label="Price per package">
            {option?.unit_price == null || !quote
              ? NOT_AVAILABLE
              : `${formatMoney(option.unit_price, quote.currency)} per package`}
          </Field>
          <Field label="Stock count">Not recorded</Field>
          {option?.co2_kg_total != null && (
            <Field label="Estimated Carbon Footprint">
              {formatNumber(option.co2_kg_total)} kg
            </Field>
          )}
        </dl>
        {!!option?.missing_requirements?.length && (
          <p className="mt-3 text-sm text-[var(--error)]">
            Missing requirements: {option.missing_requirements.join(", ")}
          </p>
        )}
      </details>
    </div>
  )
}

function AlternativeProducts({ products }: { products: ComparisonProduct[] }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const grid = gridRef.current
    if (!viewport || !grid) return
    let active = true
    let width = viewport.clientWidth
    function measure() {
      if (!active || !viewport || !grid || grid.querySelector("details[open]"))
        return
      grid.style.gridAutoRows = "auto"
      const height = Math.ceil(
        Math.max(
          ...Array.from(
            grid.children,
            (card) => card.getBoundingClientRect().height
          )
        )
      )
      if (height > 0) {
        viewport.style.height = `${height}px`
        grid.style.gridAutoRows = `minmax(${height}px, auto)`
      }
    }
    measure()
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            if (viewport.clientWidth !== width) {
              width = viewport.clientWidth
              measure()
            }
          })
    observer?.observe(viewport)
    window.addEventListener("resize", measure)
    void document.fonts?.ready.then(measure)
    grid.addEventListener("toggle", measure, true)
    return () => {
      active = false
      observer?.disconnect()
      window.removeEventListener("resize", measure)
      grid.removeEventListener("toggle", measure, true)
    }
  }, [products])
  return (
    <div
      ref={viewportRef}
      role="region"
      aria-label="Scrollable alternative products"
      tabIndex={0}
      className="alternatives-viewport overflow-x-hidden overflow-y-auto rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <div
        ref={gridRef}
        className="grid items-stretch gap-4 pr-2 lg:grid-cols-2"
      >
        {products.map((product) => (
          <ProductCard key={product.key} product={product} />
        ))}
      </div>
    </div>
  )
}

export function QuoteTables({ journal }: { journal: ValioAimoJournal }) {
  const products = comparisonProducts(journal)
  const selected = products.filter((p) => p.selected)
  const alternatives = products.filter((p) => !p.selected)
  return (
    <JournalSection id="comparison" title="Product Comparison">
      <ProductSearchSummary journal={journal} />
      <PriceComparison journal={journal} />
      {!journal.quotes.length && (
        <Panel>
          <p className="text-sm text-muted-foreground">
            No price offers recorded.
          </p>
        </Panel>
      )}
      {selected.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {selected.map((p) => (
            <ProductCard key={p.key} product={p} />
          ))}
        </div>
      )}
      {alternatives.length > 0 && (
        <Panel>
          <h4 className="text-lg font-semibold text-primary">
            Other Products Considered ({alternatives.length})
          </h4>
          <p className="mt-2 mb-5 text-sm text-muted-foreground">
            Suitable products first, then options with incomplete information or
            unmet requirements. Prices are ranked within the same offer;
            different currencies and delivery conditions are kept separate.
            Search-only products have no inferred prices.
          </p>
          <AlternativeProducts products={alternatives} />
        </Panel>
      )}
      {!products.length && (
        <p className="text-sm text-muted-foreground">
          No products were recorded.
        </p>
      )}
    </JournalSection>
  )
}
