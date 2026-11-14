import { formatNumber } from "./format"
import type {
  Option,
  Order,
  TimelineEntry,
  ValioAimoJournal,
} from "./journal.types"

export type Tone = "positive" | "waiting" | "negative" | "neutral"

export interface Label {
  text: string
  tone: Tone
}

type Outcome = ValioAimoJournal["outcome"]
type Question = ValioAimoJournal["questions"][number]
type JournalError = ValioAimoJournal["errors"][number]
type Decision = NonNullable<Order["decision"]>
type Cancellation = NonNullable<Order["cancellation"]>
type StepType = TimelineEntry["type"]

export const OUTCOME_LABEL: Record<Outcome, Label> = {
  placed: { text: "Order placed", tone: "positive" },
  approved: { text: "Order approved", tone: "positive" },
  pending_approval: { text: "Waiting for sign-off", tone: "waiting" },
  rejected: { text: "Order rejected", tone: "negative" },
  cancelled: { text: "Order cancelled", tone: "negative" },
  no_order: { text: "No order placed", tone: "neutral" },
  failed: { text: "Could not be completed", tone: "negative" },
}

export const ORDER_STATUS_LABEL: Record<Order["status"], Label> = {
  placed: { text: "Placed", tone: "positive" },
  approved: { text: "Approved", tone: "positive" },
  shipped: { text: "Shipped", tone: "positive" },
  pending_approval: { text: "Waiting for sign-off", tone: "waiting" },
  rejected: { text: "Rejected", tone: "negative" },
  cancelled: { text: "Cancelled", tone: "negative" },
}

export const STEP_LABEL: Record<StepType, string> = {
  authority: "Checked spending limit",
  search: "Searched the catalogue",
  quote: "Got prices",
  question: "Asked the buyer",
  answer: "Buyer answered",
  order: "Placed order",
  approval: "Buyer approved",
  cancel: "Order cancelled",
  error: "Problem",
  research: "Looked up sources",
  report: "Reported back",
}

const UNKNOWN_LABEL: Label = { text: "Unknown", tone: "neutral" }

export function outcomeLabel(outcome: string): Label {
  return OUTCOME_LABEL[outcome as Outcome] ?? UNKNOWN_LABEL
}

export function orderStatusLabel(status: string): Label {
  return ORDER_STATUS_LABEL[status as Order["status"]] ?? UNKNOWN_LABEL
}

export const ALLERGEN_NAME: Record<string, string> = {
  AM: "milk",
  AW: "gluten cereals",
  UW: "wheat",
  AE: "eggs",
  AY: "soy",
  AF: "fish",
  AN: "tree nuts",
  AP: "peanuts",
  AS: "sesame",
  AU: "sulphites",
  BC: "celery",
  BM: "mustard",
  AC: "crustaceans",
  UM: "molluscs",
  NL: "lupin",
}

const TAG_LABEL: Record<string, string> = {
  LACTOSE_FREE: "Lactose-free",
  VEGAN: "Vegan",
  FREE_FROM_GLUTEN: "Gluten-free",
  EU_ORGANIC_FARMING: "EU organic",
  COOLTEMPERATURE: "Stored chilled",
  FREEZETEMPERATURE: "Stored frozen",
  WARMTEMPERATURE: "Stored at room temperature",
}

export function allergenName(code: string): string {
  return ALLERGEN_NAME[code.toUpperCase()] ?? code
}

function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

export function tagLabel(tag: string): string {
  const separator = tag.indexOf(":")
  if (separator > 0) {
    const prefix = tag.slice(0, separator).toLowerCase()
    const value = tag.slice(separator + 1)
    if (prefix === "free_from")
      return `Declared free from ${allergenName(value)}`
    if (prefix === "no") return `No ${allergenName(value)} listed`
    if (prefix === "brand") return `Brand: ${value}`
  }
  return TAG_LABEL[tag.toUpperCase()] ?? titleCase(tag)
}

export function productNames(journal: ValioAimoJournal): Map<string, string> {
  const names = new Map<string, string>()
  const add = (id: string, name: string | null | undefined) => {
    if (name && !names.has(id)) names.set(id, name)
  }
  for (const quote of journal.quotes) {
    for (const option of quote.options) add(option.product_id, option.name)
  }
  for (const candidate of journal.candidates) {
    add(candidate.product_id, candidate.name)
  }
  return names
}

export const UNNAMED_PRODUCT = "an unnamed product"

export function productName(names: Map<string, string>, id: string): string {
  return names.get(id) ?? UNNAMED_PRODUCT
}

function formatAmount(value: string): string {
  const match = /^(\d+(?:\.\d+)?)\s*(\S+)$/.exec(value.trim())
  return match ? `${formatNumber(Number(match[1]))} ${match[2]}` : value
}

export function salesUnitsLabel(quantity: number): string {
  return `${formatNumber(quantity)} ${quantity === 1 ? "sales unit" : "sales units"}`
}

export function quantityLabel(
  option: Pick<Option, "quantity" | "requested" | "content_per_sales_unit">
): string | null {
  const { quantity, requested, content_per_sales_unit: content } = option
  if (quantity === null || quantity === undefined) return null
  if (!content) return salesUnitsLabel(quantity)
  const packs = `${formatNumber(quantity)} × ${formatAmount(content)}`
  return requested ? `${formatAmount(requested)} (${packs})` : packs
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Replaces "<quantity> <sales unit code>" in agent-written text with the
 * real-world amount, but only for exact pairs taken from the journal's own
 * quote options, so unit codes are never guessed at.
 */
export function withPlainQuantities(
  text: string,
  journal: ValioAimoJournal
): string {
  let result = text
  for (const quote of journal.quotes) {
    for (const option of quote.options) {
      const label = quantityLabel(option)
      if (!option.sales_unit || option.quantity == null || !label) continue
      if (!option.content_per_sales_unit) continue
      const pattern = new RegExp(
        `(?<![\\w.,])${escapeRegExp(String(option.quantity))} ${escapeRegExp(option.sales_unit)}\\b`,
        "g"
      )
      result = result.replace(pattern, label)
    }
  }
  return result
}

const CONFIRMED_VIA: Record<string, string> = {
  mcp_elicitation: "in the approval form the agent showed",
  rest: "in the order console",
  agent: "through the purchasing agent",
  replacement: "by placing a replacement order",
}

export function confirmedViaLabel(value: string | null | undefined) {
  return value ? (CONFIRMED_VIA[value] ?? null) : null
}

/**
 * decided_by and cancelled_by hold the agent id of the connection the human
 * used; the journal's own agent means the buyer of this session.
 */
export function actorLabel(
  agentId: string | null | undefined,
  journal: ValioAimoJournal
): string {
  if (!agentId) return "the system"
  return agentId === journal.agent.agent_id ? "the buyer" : "another user"
}

export function decisionSentence(
  decision: Decision,
  journal: ValioAimoJournal
): string {
  const verb = decision.decision === "approved" ? "Approved" : "Rejected"
  const via = confirmedViaLabel(decision.confirmed_via)
  return [verb, "by", actorLabel(decision.decided_by, journal), via]
    .filter(Boolean)
    .join(" ")
}

export function cancellationSentence(
  cancellation: Cancellation,
  journal: ValioAimoJournal
): string {
  const via = confirmedViaLabel(cancellation.confirmed_via)
  return ["Cancelled by", actorLabel(cancellation.cancelled_by, journal), via]
    .filter(Boolean)
    .join(" ")
}

export type Actor = "agent" | "buyer" | "problem"

export type StepDetail =
  | { kind: "question"; question: Question; asked: boolean }
  | { kind: "decision"; order: Order; decision: Decision }
  | { kind: "cancellation"; order: Order; cancellation: Cancellation }
  | { kind: "order"; order: Order }
  | { kind: "problem"; error: JournalError }
  | { kind: "none" }

export interface AuditStep {
  seq: number
  type: StepType
  actor: Actor
  involvesHuman: boolean
  label: string
  title: string
  at: string | null
  minutesSincePrevious: number | null
  products: string[]
  detail: StepDetail
}

export interface AuditTrail {
  steps: AuditStep[]
  unlinked: { questions: Question[]; errors: JournalError[] }
}

const ACTOR: Partial<Record<StepType, Actor>> = {
  answer: "buyer",
  approval: "buyer",
  cancel: "buyer",
  error: "problem",
}

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  return Number.isNaN(time) ? null : time
}

export function toAuditSteps(journal: ValioAimoJournal): AuditTrail {
  const names = productNames(journal)
  const ordersById = new Map(journal.orders.map((o) => [o.order_id, o]))
  const claimedQuestions = new Set<number>()
  const claimedErrors = new Set<number>()
  let questionSteps = 0
  let answerSteps = 0
  let errorSteps = 0
  let lastTime: number | null = null

  const entries = [...journal.timeline].sort((a, b) => a.seq - b.seq)
  const steps = entries.map((entry): AuditStep => {
    const order = entry.refs?.order_id
      ? ordersById.get(entry.refs.order_id)
      : undefined
    let detail: StepDetail = { kind: "none" }
    let label = STEP_LABEL[entry.type] ?? "Step"

    if (entry.type === "question" || entry.type === "answer") {
      const index = entry.type === "question" ? questionSteps++ : answerSteps++
      const question = journal.questions[index]
      if (question) {
        claimedQuestions.add(index)
        detail = {
          kind: "question",
          question,
          asked: entry.type === "question",
        }
      }
    } else if (entry.type === "error") {
      const index = errorSteps++
      const error = journal.errors[index]
      if (error) {
        claimedErrors.add(index)
        detail = { kind: "problem", error }
      }
    } else if (entry.type === "approval" && order?.decision) {
      detail = { kind: "decision", order, decision: order.decision }
      if (order.decision.decision === "rejected") label = "Buyer rejected"
    } else if (entry.type === "cancel" && order?.cancellation) {
      detail = { kind: "cancellation", order, cancellation: order.cancellation }
    } else if (entry.type === "order" && order) {
      detail = { kind: "order", order }
    }

    const time = timeOf(entry.at)
    const minutesSincePrevious =
      time !== null && lastTime !== null
        ? Math.round((time - lastTime) / 60_000)
        : null
    if (time !== null) lastTime = time

    const actor = ACTOR[entry.type] ?? "agent"
    return {
      seq: entry.seq,
      type: entry.type,
      actor,
      involvesHuman: actor === "buyer" || entry.type === "question",
      label,
      title: withPlainQuantities(entry.title, journal),
      at: entry.at ?? null,
      minutesSincePrevious,
      products: [
        ...new Set(
          (entry.refs?.product_ids ?? []).map((id) => productName(names, id))
        ),
      ],
      detail,
    }
  })

  return {
    steps,
    unlinked: {
      questions: journal.questions.filter((_, i) => !claimedQuestions.has(i)),
      errors: journal.errors.filter((_, i) => !claimedErrors.has(i)),
    },
  }
}
