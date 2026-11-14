import {
  approvalRequired,
  businessText,
  purchaseFacts,
  verifyPurchase,
} from "./evidence"
import type { ValioAimoJournal } from "./journal.types"

export type SafetyCheck = {
  id: string
  label: string
  status: "Passed" | "Needs attention" | "Cannot verify" | "Failed"
  detail: string
}

/** Business-facing results backed by the same deterministic validation as the audit. */
export function purchaseSafetyChecks(journal: ValioAimoJournal): SafetyCheck[] {
  const evidence = verifyPurchase(journal)
  const f = purchaseFacts(journal)
  const outcome = (test: boolean | null): SafetyCheck["status"] =>
    test === null ? "Cannot verify" : test ? "Passed" : "Failed"
  const totals = evidence.filter((r) => r.id.endsWith("-total"))
  const price = totals.some((r) => r.status === "Failed")
    ? false
    : totals.length > 0 && totals.every((r) => r.status === "Passed")
      ? true
      : null
  const delivery =
    f.quote && journal.request.delivery_date && f.coverage !== null
      ? f.quote.delivery_date <= journal.request.delivery_date &&
        f.coverage &&
        (!f.order || f.order.delivery_date <= journal.request.delivery_date)
      : null
  const requiredOrders = journal.orders.filter(
    (o) => approvalRequired(journal, o) === true
  )
  const approvalEvidence = requiredOrders.map((o) =>
    evidence.find((r) => r.id === `${o.order_id}-approval`)
  )
  const approval = !journal.orders.length
    ? null
    : requiredOrders.length === 0
      ? journal.orders.every((o) => approvalRequired(journal, o) === false)
        ? true
        : null
      : requiredOrders.some((o) => o.decision?.decision === "rejected") ||
          approvalEvidence.some((r) => r?.status === "Failed")
        ? false
        : requiredOrders.every((o) => o.decision?.decision === "approved") &&
            approvalEvidence.every((r) => r?.status === "Passed")
          ? true
          : null
  const policyKnown =
    journal.orders.length > 0 &&
    journal.orders.every((o) => approvalRequired(journal, o) !== null)
  const missingRequired = requiredOrders.some(
    (o) => !o.decision && ["approved", "placed", "shipped"].includes(o.status)
  )
  const policy = !policyKnown
    ? null
    : missingRequired
      ? false
      : requiredOrders.some(
            (o) => o.status === "pending_approval" || !o.decision
          )
        ? null
        : approval
  const requirements =
    !f.lines.length || f.lines.some((line) => !line.option)
      ? null
      : f.lines.some(
            (line) =>
              line.option?.meets_requirements === false ||
              line.option?.breaks_mandate === true
          )
        ? false
        : f.lines.every(
              (line) =>
                line.option?.meets_requirements === true &&
                line.option.breaks_mandate === false
            )
          ? true
          : null
  const timing = evidence.filter((result) =>
    /-(expiry|timing)$/.test(result.id)
  )
  const pending = journal.orders.some(
    (order) => order.status === "pending_approval"
  )
  const deliveryRisk =
    journal.narrative.watch_out &&
    /delivery|arrival|delay/i.test(journal.narrative.watch_out)
      ? businessText(journal.narrative.watch_out, journal)
      : null
  const results: SafetyCheck[] = [
    {
      id: "requirements",
      label: "Product requirements checked",
      status: outcome(requirements),
      detail:
        requirements === true
          ? "The selected products meet the recorded product requirements and purchasing restrictions."
          : requirements === false
            ? "A selected product does not meet all recorded requirements."
            : "There is not enough information to check every selected product’s requirements.",
    },
    {
      id: "price",
      label: "Prices checked",
      status: outcome(price),
      detail:
        price === true
          ? "The selected quantities and offered prices match the recorded order total."
          : price === false
            ? "The recorded prices or order total do not agree. Review the purchase before relying on it."
            : "There is not enough item-level price information to check the total.",
    },
    {
      id: "quantity",
      label: "Requested quantity checked",
      status: outcome(f.coverage),
      detail:
        f.coverage === true
          ? "The price offer records enough stock for the selected quantity. This is not a delivery confirmation."
          : f.coverage === false
            ? "The offer does not cover the full requested quantity."
            : "Stock coverage for the selected quantity cannot be checked from this record.",
    },
    {
      id: "delivery",
      label: "Delivery conditions checked",
      status:
        delivery !== false && deliveryRisk
          ? "Needs attention"
          : outcome(delivery),
      detail:
        deliveryRisk && delivery !== false
          ? `Recorded delivery note: ${deliveryRisk}`
          : delivery === true
            ? "The offered delivery date meets the requested date, with full quantity coverage recorded."
            : delivery === false
              ? "The offered date or quantity does not meet the request."
              : "A requested date, associated offer or quantity coverage is missing.",
    },
    {
      id: "limits",
      label: "Purchasing limit checked",
      status: pending ? "Needs attention" : outcome(policy),
      detail:
        policy === true
          ? "The purchase is within the recorded spending limit or has a recorded approval."
          : policy === false
            ? "The purchase is rejected or approval requirements are not satisfied."
            : "The spending policy or a required decision cannot yet be verified.",
    },
    {
      id: "approval",
      label: "Buyer approval checked",
      status: pending
        ? "Needs attention"
        : requiredOrders.some((o) => o.decision?.decision === "rejected")
          ? "Needs attention"
          : outcome(approval),
      detail:
        approval === true
          ? requiredOrders.length
            ? "An approval decision and linked confirmation activity are recorded. The buyer’s identity is not verified."
            : "Approval was not needed under the recorded spending limit."
          : approval === false
            ? "The purchase was declined or approval evidence conflicts with the order status."
            : "Approval is pending, missing or not sufficiently evidenced.",
    },
    {
      id: "confirmation",
      label: "Wholesaler confirmation status",
      status: "Cannot verify",
      detail:
        "This file has no explicit wholesaler confirmation. Buyer approval and a local order status are separate steps.",
    },
    {
      id: "timing",
      label: "Order timing checked",
      status: timing.some((r) => r.status === "Failed")
        ? "Failed"
        : timing.length > 0 && timing.every((r) => r.status === "Passed")
          ? "Passed"
          : "Cannot verify",
      detail: timing.some((r) => r.status === "Failed")
        ? "The recorded order timing is inconsistent. Please review this purchase."
        : timing.length > 0 && timing.every((r) => r.status === "Passed")
          ? "Recorded purchase and approval times are consistent with the price offer."
          : "Order timing could not be fully verified.",
    },
  ]
  return results.filter(
    (result) =>
      result.id !== "approval" || requiredOrders.length > 0 || !policyKnown
  )
}
