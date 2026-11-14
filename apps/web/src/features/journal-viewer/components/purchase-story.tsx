import { buyerDecisions, productSearchSummary } from "../customer-record"
import {
  approvalRequired,
  businessText,
  productNames,
  statusLabel,
  orderDisplayStatus,
  purchaseDisplayStatus,
} from "../evidence"
import { Field } from "../format"
import type { ValioAimoJournal } from "../journal.types"
import { Panel, SelectionExplanation } from "./dashboard"

/** A brief overview alongside the purchase facts, distinct from the full journey. */
export function PurchaseStory({ journal }: { journal: ValioAimoJournal }) {
  const search = productSearchSummary(journal)
  const names = productNames(journal)
  const responses = buyerDecisions(journal)
  return (
    <aside aria-labelledby="purchase-story-title" className="min-w-0">
      <Panel className="min-w-0 border-t-4 border-t-primary">
        <h3
          id="purchase-story-title"
          className="text-lg font-semibold text-primary"
        >
          Here's What Happened
        </h3>
        <dl className="mt-5 space-y-4 text-sm leading-relaxed">
          <Field label="Your request">
            {businessText(journal.request.text, journal)}
          </Field>
          <Field label="What the assistant found">
            {search.found !== null
              ? `${search.found} search results recorded. `
              : ""}
            {search.considered !== null
              ? `${search.considered} products considered. `
              : "The number of products considered is not available. "}
            {search.suitable !== null
              ? `${search.suitable} suitable offers recorded.`
              : "Suitability could not be fully verified."}
          </Field>
          <Field label="Product selected">
            {journal.decision?.chosen.length
              ? journal.decision.chosen
                  .map(
                    (line) =>
                      names.get(line.product_id) ?? "Product name not recorded"
                  )
                  .join("; ")
              : "No product selection recorded."}
          </Field>
          <Field label="Your changes & choices">
            {responses.length
              ? responses.map((response, index) => (
                  <p key={index}>
                    {response.title}: {response.answer}
                    {response.buyerNote ? ` — ${response.buyerNote}` : ""}
                  </p>
                ))
              : "No buyer responses are recorded."}
          </Field>
          <Field label="Approval & current status">
            {journal.orders.length
              ? journal.orders.map((order, index) => (
                  <p key={index}>
                    {journal.orders.length > 1 ? `Purchase ${index + 1}: ` : ""}
                    {approvalRequired(journal, order) === true
                      ? "Buyer approval required. "
                      : approvalRequired(journal, order) === false
                        ? "Within the automatic spending limit. "
                        : "Approval requirement is not verified. "}
                    {order.decision
                      ? `Buyer decision: ${order.decision.decision}. `
                      : "No buyer approval decision recorded. "}
                    {statusLabel(orderDisplayStatus(order))}.
                  </p>
                ))
              : `${statusLabel(purchaseDisplayStatus(journal))}. No order is recorded.`}
          </Field>
        </dl>
        <div className="mt-5">
          <SelectionExplanation journal={journal} />
        </div>
      </Panel>
    </aside>
  )
}
