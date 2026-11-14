/**
 * Generated from skills/valio-aimo-purchasing/references/journal.schema.json.
 * Do not edit by hand. Regenerate with `pnpm gen:journal-types` in apps/web.
 */

export type Id = string

/**
 * The purchasing agent's own account of one task: what the buyer asked, what it searched and quoted, what the buyer chose, which orders exist and why. The server's audit trail stays the record of truth.
 */
export interface ValioAimoJournal {
  /**
   * Marks the document as a Valio Aimo journal; a viewer rejects anything else.
   */
  schema: "valio-aimo-journal"
  /**
   * Document format version. Additive fields keep 1; renames or removals bump it.
   */
  schema_version: 1
  /**
   * A new UUID per journal.
   */
  journal_id: string
  /**
   * List-view headline, e.g. '1,000 L lactose-free milk for Mon 16 Nov'.
   */
  title: string
  /**
   * One sentence stating the outcome.
   */
  summary: string
  /**
   * What the task was.
   */
  kind: "purchase" | "decision" | "cancel" | "replace" | "inquiry"
  /**
   * The final state the task left behind; matches order statuses where they overlap.
   */
  outcome: "placed" | "pending_approval" | "approved" | "rejected" | "cancelled" | "no_order" | "failed"
  /**
   * When the task started, ISO 8601 with offset.
   */
  started_at: string
  /**
   * When the task ended, ISO 8601 with offset.
   */
  finished_at: string
  /**
   * Who acted, from whoami.
   */
  agent: {
    /**
     * whoami agent_id.
     */
    agent_id: string
    /**
     * whoami customer.
     */
    customer: string
    /**
     * The agent host, e.g. 'Claude Code', when known.
     */
    host?: string | null
    /**
     * The model, when the host exposes it.
     */
    model?: string | null
  }
  /**
   * The agent's mandate, from whoami.
   */
  authority: {
    /**
     * Per-order total (excl. VAT) above which a human must approve.
     */
    spend_limit_eur: number | null
    /**
     * Tags every order line must meet.
     */
    required_tags: string[]
    /**
     * GS1 allergen codes no line may contain.
     */
    banned_allergens: string[]
  }
  /**
   * The buyer's words verbatim and how the agent read them.
   */
  request: {
    /**
     * The buyer's request, verbatim.
     */
    text: string
    /**
     * The resolved delivery date.
     */
    delivery_date?: string | null
    /**
     * The amount in the buyer's unit, e.g. 1000 L.
     */
    amount?: {
      /**
       * Amount value.
       */
      value: number
      /**
       * Buyer unit: L, dl, cl, ml, kg or g.
       */
      unit: string
    } | null
    /**
     * Quantity in sales units, when the buyer spoke in packs.
     */
    quantity?: number | null
    /**
     * Requirement tags derived from the request, e.g. LACTOSE_FREE.
     */
    requirements: string[]
    /**
     * What the product is for, e.g. 'coffee'.
     */
    purpose?: string | null
  }
  /**
   * One entry per search_products call.
   */
  searches: {
    /**
     * The search query.
     */
    query: string
    /**
     * required_tags passed.
     */
    required_tags: string[]
    /**
     * exclude_allergens passed.
     */
    exclude_allergens: string[]
    /**
     * The result's count.
     */
    result_count: number | null
  }[]
  /**
   * Products considered before quoting, and why each was kept or dropped.
   */
  candidates: {
    /**
     * Catalog product id.
     */
    product_id: string
    /**
     * Product name from the search result.
     */
    name: string
    /**
     * Where the candidate came from.
     */
    source: "search" | "substitute" | "buyer"
    /**
     * Whether it went on to the quote.
     */
    kept: boolean
    /**
     * Why it was dropped, when kept is false.
     */
    drop_reason?: string | null
  }[]
  /**
   * Every quote the task requested.
   */
  quotes: {
    /**
     * quote_id from the quote result.
     */
    quote_id: string
    /**
     * Server created_at.
     */
    created_at: string
    /**
     * Server expires_at.
     */
    expires_at: string
    /**
     * Quoted delivery date.
     */
    delivery_date: string
    /**
     * Currency of every price, e.g. EUR.
     */
    currency: string
    /**
     * Purpose frozen on the quote.
     */
    purpose?: string | null
    /**
     * The quote's ranked options.
     */
    options: Option[]
  }[]
  /**
   * Each dialog shown to the buyer, with the answer.
   */
  questions: {
    /**
     * Short dialog header, e.g. 'Substitute'.
     */
    header: string
    /**
     * The question text.
     */
    question: string
    /**
     * The options offered.
     */
    options: {
      /**
       * Option label.
       */
      label: string
      /**
       * Option description.
       */
      description: string
      /**
       * Whether the agent recommended it.
       */
      recommended: boolean
    }[]
    /**
     * The label the buyer picked, or null if they dismissed the dialog.
     */
    answer: string | null
    /**
     * What the buyer typed, if anything.
     */
    free_text?: string | null
  }[]
  /**
   * Which option the agent chose and why, or null when no choice was made.
   */
  decision: null | {
    /**
     * The rule that decided.
     */
    rule: "cheapest_covering" | "buyer_choice" | "split" | "no_order"
    /**
     * The chosen lines.
     */
    chosen: {
      /**
       * Chosen product id.
       */
      product_id: string
      /**
       * Quantity in sales units.
       */
      quantity: number
      /**
       * The product this line substitutes, if any.
       */
      substitute_for?: string | null
    }[]
    /**
     * The place_order reason.
     */
    reason: string
  }
  /**
   * The final known state of every order this task touched.
   */
  orders: Order[]
  /**
   * Every refused call and what the agent changed.
   */
  errors: {
    /**
     * When it happened.
     */
    at?: string | null
    /**
     * The tool that refused.
     */
    tool: string
    /**
     * The error code, e.g. quote_changed.
     */
    code: string
    /**
     * The error message.
     */
    message: string
    /**
     * What the agent did next.
     */
    handling: string
  }[]
  /**
   * Events in order; seq starts at 1 and increases by 1.
   */
  timeline: TimelineEntry[]
  /**
   * Header figures, computed only from figures already in this document.
   */
  metrics: {
    /**
     * Valio Aimo tool calls made.
     */
    tool_calls: number
    /**
     * Number of quotes.
     */
    quotes: number
    /**
     * Dialogs shown to the buyer.
     */
    buyer_questions: number
    /**
     * Sum of the task's non-cancelled orders, excl. VAT.
     */
    total_excl_vat?: number | null
    /**
     * CO2-eq kg of the chosen lines.
     */
    co2_kg_total?: number | null
    /**
     * Chosen total minus the next covering option's total, as a positive saving.
     */
    savings_vs_next_option_eur?: number | null
  }
  /**
   * Short plain text, no Markdown.
   */
  narrative: {
    /**
     * What the agent did.
     */
    what_happened: string
    /**
     * Why the chosen option won.
     */
    why: string
    /**
     * Anything the buyer should keep an eye on.
     */
    watch_out?: string | null
  }
  /**
   * What remains to do, e.g. 'Approve ord_… in the order console'.
   */
  next_steps: string[]
}
/**
 * One quote option, with the server's QuoteOption field names.
 */
export interface Option {
  /**
   * Server rank.
   */
  rank: number
  /**
   * Catalog product id.
   */
  product_id: string
  /**
   * Product name.
   */
  name: string
  /**
   * Brand.
   */
  brand?: string | null
  /**
   * Recorded product best-before date (YYYY-MM-DD), when supplied by product or batch data. Never use the quote expiration timestamp.
   */
  best_before_date?: string | null
  /**
   * Recorded product expiry/use-by date (YYYY-MM-DD), distinct from a best-before date and quote expiration.
   */
  expiry_date?: string | null
  /**
   * Sales unit code, e.g. KI or ST.
   */
  sales_unit?: string | null
  /**
   * What one sales unit holds.
   */
  content_per_sales_unit?: string | null
  /**
   * What was asked for, e.g. '1000 L'.
   */
  requested?: string | null
  /**
   * Quantity in sales units.
   */
  quantity: number | null
  /**
   * How the amount became sales units.
   */
  conversion?: string | null
  /**
   * Fixed price per sales unit, excl. VAT.
   */
  unit_price: number | null
  /**
   * Line total, excl. VAT.
   */
  line_total: number | null
  /**
   * Quantity available by the date.
   */
  covers_request: boolean | null
  /**
   * Meets every requirement.
   */
  meets_requirements?: boolean | null
  /**
   * Requirements the product misses.
   */
  missing_requirements?: string[]
  /**
   * Placing it would be refused.
   */
  breaks_mandate?: boolean | null
  /**
   * Historical on-time ratio 0-1.
   */
  delivery_reliability?: number | null
  /**
   * CO2-eq kg for the line.
   */
  co2_kg_total?: number | null
  /**
   * Server's cheapest covering option.
   */
  cheapest_covering_option?: boolean | null
  /**
   * Whether the agent ordered this option.
   */
  chosen: boolean
}
/**
 * An order's final known state.
 */
export interface Order {
  /**
   * Server order_id.
   */
  order_id: string
  /**
   * The agent's client_reference.
   */
  client_reference?: string | null
  /**
   * Optional dated products/batches actually allocated to this order. Do not include unselected stock batches or infer dates from shelf-life durations.
   */
  product_dates?: {
    product_id: Id
    /**
     * Allocated batch reference, when recorded.
     */
    batch_id?: string | null
    best_before_date?: string | null
    expiry_date?: string | null
  }[]
  /**
   * The quote it was placed from.
   */
  quote_id?: string | null
  /**
   * Last known order status.
   */
  status: "placed" | "pending_approval" | "approved" | "rejected" | "shipped" | "cancelled"
  /**
   * The order's total, excl. VAT, as the server returns it.
   */
  total: number
  /**
   * Currency, e.g. EUR.
   */
  currency: string
  /**
   * Delivery date.
   */
  delivery_date: string
  /**
   * Why a human had to approve; empty when placed autonomously.
   */
  approval_reasons: string[]
  /**
   * The human's decision, if any.
   */
  decision?: null | {
    /**
     * The outcome.
     */
    decision: "approved" | "rejected"
    /**
     * The human's reason.
     */
    reason: string
    /**
     * decision.decided_by.agent_id, or null when the system closed it.
     */
    decided_by?: string | null
    /**
     * How the human confirmed: mcp_elicitation or rest.
     */
    confirmed_via?: string | null
  }
  /**
   * The cancellation, if any.
   */
  cancellation?: null | {
    /**
     * Why it was cancelled.
     */
    reason: string
    /**
     * cancelled_by.agent_id.
     */
    cancelled_by: string | null
    /**
     * agent, rest, mcp_elicitation or replacement.
     */
    confirmed_via: string | null
    /**
     * The replacing order_id.
     */
    replaced_by?: string | null
  }
}
/**
 * One event.
 */
export interface TimelineEntry {
  /**
   * Position, from 1.
   */
  seq: number
  /**
   * When, if known.
   */
  at?: string | null
  /**
   * Event type.
   */
  type: "authority" | "search" | "quote" | "question" | "answer" | "order" | "approval" | "cancel" | "error" | "report"
  /**
   * One-line description.
   */
  title: string
  /**
   * The tool called, if any.
   */
  tool?: string | null
  /**
   * Ids this event touched; each must appear in quotes, orders or candidates.
   */
  refs?: {
    /**
     * A quote_id from quotes.
     */
    quote_id?: string | null
    /**
     * An order_id from orders.
     */
    order_id?: string | null
    /**
     * Product ids.
     */
    product_ids?: string[]
  } | null
}
