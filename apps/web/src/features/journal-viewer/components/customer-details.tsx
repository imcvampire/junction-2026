import { MessageSquareReplyIcon, ShoppingBagIcon } from "lucide-react"
import { buyerDecisions, productSearchSummary } from "../customer-record"
import {
  approvalRequired,
  businessText,
  friendlyTag,
  NOT_AVAILABLE,
  productNames,
  purchaseFacts,
  quantityLabel,
  statusLabel,
  orderDisplayStatus,
} from "../evidence"
import { CalendarDate, Field, formatMoney, JournalSection } from "../format"
import type { ValioAimoJournal } from "../journal.types"
import { Panel, Status } from "./dashboard"

export function ProductSearchSummary({
  journal,
}: {
  journal: ValioAimoJournal
}) {
  const summary = productSearchSummary(journal)
  return (
    <Panel>
      <h4 className="font-semibold text-primary">How We Found Your Products</h4>
      <p className="mt-2 text-sm leading-relaxed">
        {summary.searches.length ? (
          <>
            The assistant searched for{" "}
            {summary.searches.map((query) => `“${query}”`).join(", ")}.
          </>
        ) : (
          "No product search description is recorded."
        )}{" "}
        {summary.found !== null
          ? `${summary.found} search results were recorded. `
          : ""}
        {summary.considered !== null
          ? `${summary.considered} products were considered.`
          : ""}
      </p>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <Field label="Confirmed suitable offers">
          {summary.suitable ?? "Not verified"}
        </Field>
        <Field label="Products excluded from the shortlist">
          {summary.excluded}
        </Field>
        <Field label="Your product requirements">
          {journal.request.requirements.map(friendlyTag).join(", ") ||
            "None recorded"}
        </Field>
      </dl>
      {summary.reasons.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-primary">
            Why products were excluded
          </summary>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {summary.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  )
}

export function PurchasingDecisions({
  journal,
}: {
  journal: ValioAimoJournal
}) {
  const decisions = buyerDecisions(journal)
  return (
    <JournalSection id="decisions" title="Your Purchasing Decisions">
      {!decisions.length && (
        <Panel>
          <p className="text-sm text-muted-foreground">
            No buyer questions or responses were recorded. Any purchase approval
            is shown in Your Order Details.
          </p>
        </Panel>
      )}
      {decisions.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Shown in the order recorded. Individual decision times are not
          available.
        </p>
      )}
      {decisions.map((decision, i) => (
        <Panel key={i}>
          <h4 className="flex items-center gap-2 font-semibold text-primary">
            <MessageSquareReplyIcon className="size-5 shrink-0" aria-hidden />
            {decision.title}
          </h4>
          <p className="mt-3 text-sm leading-relaxed">{decision.question}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            The assistant asked for your guidance on this choice. The question
            and options below are the recorded context.
          </p>
          <ul
            aria-label="Options offered"
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            {decision.options.map((option, oi) => (
              <li
                key={oi}
                className={`rounded-xl border p-4 text-sm ${option.selected ? "border-primary bg-accent" : ""}`}
              >
                <p className="font-medium">{option.title}</p>
                {option.title !== option.description && (
                  <p className="mt-1 text-muted-foreground">
                    {option.description}
                  </p>
                )}
                {option.reference && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {option.reference}
                  </p>
                )}
                {option.selected && (
                  <p className="mt-2 font-semibold text-primary">Your choice</p>
                )}
                {option.recommended && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Assistant recommendation
                  </p>
                )}
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-4 text-sm">
            <Field label="Your response">{decision.answer}</Field>
            {decision.buyerNote && (
              <Field label="Your note">{decision.buyerNote}</Field>
            )}
            {decision.disclosures.length > 0 && (
              <Field label="Disclosed risks">
                {decision.disclosures.join(" ")}
              </Field>
            )}
            <Field label="Accepted risks">{decision.riskAcceptance}</Field>
            <Field label="Effect on the purchase">{decision.effect}</Field>
          </dl>
        </Panel>
      ))}
    </JournalSection>
  )
}

export function CustomerOrders({ journal }: { journal: ValioAimoJournal }) {
  const facts = purchaseFacts(journal)
  const names = productNames(journal)
  return (
    <JournalSection id="order-details" title="Your Order Details">
      {!journal.orders.length && (
        <Panel>
          <p className="text-sm text-muted-foreground">No order is recorded.</p>
        </Panel>
      )}
      {journal.orders.map((order, i) => (
        <Panel key={i}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h4 className="flex items-center gap-2 font-medium text-primary">
              <ShoppingBagIcon className="size-5" aria-hidden />
              {journal.orders.length > 1
                ? `Purchase ${i + 1}`
                : "Your purchase"}
            </h4>
            <Status value={orderDisplayStatus(order)} />
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Products & ordered quantity">
              {journal.orders.length === 1 && journal.decision?.chosen.length
                ? journal.decision.chosen.map((line, li) => (
                    <p key={li}>
                      {names.get(line.product_id) ??
                        "Product name not recorded"}{" "}
                      —{" "}
                      {quantityLabel(
                        facts.lines.find(
                          (p) => p.product_id === line.product_id
                        )?.option,
                        line.quantity
                      )}
                    </p>
                  ))
                : "Product quantities for each order are not separately recorded."}
            </Field>
            <Field label="Total excluding VAT">
              {formatMoney(order.total, order.currency)}
            </Field>
            <Field label="Requested delivery date">
              <CalendarDate value={order.delivery_date} />
            </Field>
            <Field label="Approval required">
              {approvalRequired(journal, order) === null
                ? "Cannot verify"
                : approvalRequired(journal, order)
                  ? "Yes"
                  : "No"}
            </Field>
            <Field label="Buyer approval">
              {order.decision
                ? order.decision.decision === "approved"
                  ? "Approved"
                  : "Rejected"
                : approvalRequired(journal, order) === null
                  ? "Cannot verify whether approval was required"
                  : approvalRequired(journal, order)
                    ? "No decision recorded"
                    : "Not required under the recorded spending limit"}
            </Field>
            <Field label="Wholesaler confirmation">Not verified</Field>
          </dl>
          <details className="mt-5 rounded-xl border p-4 text-sm">
            <summary className="cursor-pointer font-medium text-primary">
              Approval & delivery information
            </summary>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Automatic purchasing limit">
                {journal.authority.spend_limit_eur === null
                  ? NOT_AVAILABLE
                  : formatMoney(journal.authority.spend_limit_eur, "EUR")}
              </Field>
              <Field label="Approval reason">
                {order.decision
                  ? businessText(order.decision.reason, journal) ||
                    NOT_AVAILABLE
                  : NOT_AVAILABLE}
              </Field>
              <Field label="Who approved?">
                {order.decision?.decision === "approved"
                  ? "Buyer’s name not recorded"
                  : "No approver recorded"}
              </Field>
              <Field label="Delivery notes">
                {journal.narrative.watch_out
                  ? businessText(journal.narrative.watch_out, journal)
                  : "No delivery-risk note recorded. Delivery is not confirmed."}
              </Field>
              <Field label="Purchasing restrictions">
                {journal.authority.required_tags.map(friendlyTag).join(", ") ||
                  "None recorded"}
              </Field>
              {order.cancellation && (
                <Field label="Cancellation reason">
                  {businessText(order.cancellation.reason, journal)}
                </Field>
              )}
            </dl>
          </details>
          <p className="mt-3 text-xs text-muted-foreground">
            {statusLabel(orderDisplayStatus(order))} describes this purchase
            record. It does not independently confirm wholesaler acceptance or
            delivery.
          </p>
        </Panel>
      ))}
    </JournalSection>
  )
}
