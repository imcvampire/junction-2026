import { TriangleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

import {
  CalendarDate,
  EmptyNote,
  Field,
  JournalSection,
  Money,
  Num,
  Percent,
  ToneBadge,
  Unknown,
  YesNo,
} from "../format"
import type { Option, Order, ValioAimoJournal } from "../journal.types"
import {
  cancellationSentence,
  decisionSentence,
  orderStatusLabel,
  productName,
  productNames,
  quantityLabel,
  salesUnitsLabel,
  tagLabel,
} from "../plain-language"

type Quote = ValioAimoJournal["quotes"][number]

interface ReceiptLine {
  name: string
  quantity: string | null
  total: number | null
}

function receiptLines(order: Order, journal: ValioAimoJournal): ReceiptLine[] {
  const quote = journal.quotes.find((q) => q.quote_id === order.quote_id)
  const chosen = quote?.options.filter((option) => option.chosen) ?? []
  if (chosen.length > 0) {
    return chosen.map((option) => ({
      name: option.name,
      quantity: quantityLabel(option),
      total: option.line_total,
    }))
  }
  if (journal.orders.length !== 1 || !journal.decision) return []
  const names = productNames(journal)
  return journal.decision.chosen.map((line) => ({
    name: productName(names, line.product_id),
    quantity: salesUnitsLabel(line.quantity),
    total: null,
  }))
}

function OrderReceipt({
  order,
  journal,
  index,
}: {
  order: Order
  journal: ValioAimoJournal
  index: number
}) {
  const lines = receiptLines(order, journal)
  const { decision, cancellation } = order

  return (
    <div
      role="group"
      aria-label={`Order ${index + 1}`}
      className="flex min-w-0 flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-heading font-semibold">
          {journal.orders.length > 1 ? `Order ${index + 1}` : "Order"}
        </h4>
        <ToneBadge label={orderStatusLabel(order.status)} />
      </div>

      {lines.length === 0 ? (
        <EmptyNote>The journal does not list this order's products.</EmptyNote>
      ) : (
        <ul aria-label="Products ordered" className="flex flex-col gap-2">
          {lines.map((line, lineIndex) => (
            <li
              key={lineIndex}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-medium break-words">{line.name}</span>
                <span className="text-muted-foreground">
                  {line.quantity ?? <Unknown />}
                </span>
              </span>
              {line.total !== null ? (
                <Money value={line.total} currency={order.currency} />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Separator />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Field label="Total excl. VAT">
          <span className="text-base font-semibold">
            <Money value={order.total} currency={order.currency} />
          </span>
        </Field>
        <Field label="Delivery">
          <CalendarDate value={order.delivery_date} isoTitle={false} />
        </Field>
      </dl>

      <div className="flex flex-col gap-1 text-sm">
        <h5 className="font-medium">
          {order.approval_reasons.length === 0
            ? "No sign-off was needed"
            : "Why sign-off was needed"}
        </h5>
        {order.approval_reasons.length === 0 ? (
          <p className="text-muted-foreground">
            The order was within the agent's limits.
          </p>
        ) : (
          <ul className="list-disc pl-5">
            {order.approval_reasons.map((reason, reasonIndex) => (
              <li key={reasonIndex} className="break-words">
                {reason}
              </li>
            ))}
          </ul>
        )}
      </div>

      {decision ? (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 text-sm">
          <p className="font-medium">{decisionSentence(decision, journal)}.</p>
          <p className="break-words">
            <span className="text-muted-foreground">Reason given: </span>
            {decision.reason}
          </p>
        </div>
      ) : null}
      {cancellation ? (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 text-sm">
          <p className="font-medium">
            {cancellationSentence(cancellation, journal)}.
          </p>
          <p className="break-words">
            <span className="text-muted-foreground">Reason given: </span>
            {cancellation.reason}
          </p>
          {cancellation.replaced_by ? (
            <p>A replacement order was placed.</p>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Order reference <span className="break-all">{order.order_id}</span>
      </p>
    </div>
  )
}

function OptionItem({
  option,
  currency,
  showReliability,
  showCo2,
}: {
  option: Option
  currency: string
  showReliability: boolean
  showCo2: boolean
}) {
  const missing = option.missing_requirements ?? []
  return (
    <li
      data-chosen={option.chosen || undefined}
      className="flex flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/10 data-chosen:ring-2 data-chosen:ring-primary"
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium break-words">{option.name}</span>
        {option.chosen ? <Badge>Chosen</Badge> : null}
        {option.breaks_mandate ? (
          <Badge variant="destructive">Breaks the agent's rules</Badge>
        ) : null}
      </span>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Field label="Total excl. VAT">
          <Money value={option.line_total} currency={currency} />
        </Field>
        <Field label="Covers the amount">
          <YesNo value={option.covers_request} />
        </Field>
        <Field label="Meets requirements">
          <span className="flex flex-col gap-1">
            <YesNo value={option.meets_requirements} />
            {missing.length > 0 ? (
              <span className="flex flex-wrap gap-1">
                {missing.map((tag, index) => (
                  <Badge key={index} variant="outline">
                    Missing: {tagLabel(tag)}
                  </Badge>
                ))}
              </span>
            ) : null}
          </span>
        </Field>
        {showReliability ? (
          <Field label="Delivered on time">
            <Percent value={option.delivery_reliability} />
          </Field>
        ) : null}
        {showCo2 ? (
          <Field label="Carbon footprint">
            <Num value={option.co2_kg_total} suffix="kg CO₂-eq" />
          </Field>
        ) : null}
      </dl>
    </li>
  )
}

function OptionsCompared({ quote }: { quote: Quote }) {
  const options = [...quote.options].sort(
    (a, b) => Number(b.chosen) - Number(a.chosen) || a.rank - b.rank
  )
  const showReliability = options.some(
    (option) => option.delivery_reliability != null
  )
  const showCo2 = options.some((option) => option.co2_kg_total != null)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Prices for delivery on{" "}
        <CalendarDate value={quote.delivery_date} isoTitle={false} />
        {quote.purpose ? `, for ${quote.purpose}` : null}
      </p>
      {options.length === 0 ? (
        <EmptyNote>No options were offered.</EmptyNote>
      ) : (
        <ul aria-label="Options compared" className="flex flex-col gap-2">
          {options.map((option, index) => (
            <OptionItem
              key={index}
              option={option}
              currency={quote.currency}
              showReliability={showReliability}
              showCo2={showCo2}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

export function JournalOutput({ journal }: { journal: ValioAimoJournal }) {
  const { narrative, decision } = journal
  const reasons = [
    ...new Set([decision?.reason, narrative.why].filter(Boolean)),
  ] as string[]

  return (
    <JournalSection id="output" title="What came out">
      {journal.orders.length === 0 ? (
        <EmptyNote>No order was placed.</EmptyNote>
      ) : (
        <div className="flex flex-col gap-3">
          {journal.orders.map((order, index) => (
            <OrderReceipt
              key={index}
              order={order}
              journal={journal}
              index={index}
            />
          ))}
        </div>
      )}

      {reasons.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium">Why this option</h4>
          {reasons.map((reason, index) => (
            <p key={index} className="break-words whitespace-pre-line">
              {reason}
            </p>
          ))}
        </div>
      ) : null}

      {journal.quotes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">Options compared</h4>
          {journal.quotes.map((quote, index) => (
            <OptionsCompared key={index} quote={quote} />
          ))}
        </div>
      ) : null}

      {narrative.watch_out ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Watch out</AlertTitle>
          <AlertDescription className="whitespace-pre-line">
            {narrative.watch_out}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium">Next steps</h4>
        {journal.next_steps.length === 0 ? (
          <EmptyNote>Nothing left to do.</EmptyNote>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {journal.next_steps.map((step, index) => (
              <li key={index} className="break-words">
                {step}
              </li>
            ))}
          </ul>
        )}
      </div>
    </JournalSection>
  )
}
