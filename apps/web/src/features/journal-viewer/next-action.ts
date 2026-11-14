import { purchaseDisplayStatus, purchaseFacts } from "./evidence"
import { formatMoney } from "./format"
import type { ValioAimoJournal } from "./journal.types"

export function purchaseNextAction(journal: ValioAimoJournal) {
  const status = purchaseDisplayStatus(journal)
  const confirmation =
    "Confirmation from the wholesaler has not yet been verified."
  if (status === "pending_approval") {
    const facts = purchaseFacts(journal)
    const amount =
      facts.total !== null && facts.currency
        ? formatMoney(facts.total, facts.currency)
        : null
    const limit = journal.authority.spend_limit_eur
    const exceeds =
      facts.currency === "EUR" &&
      facts.total !== null &&
      limit !== null &&
      facts.total > limit
    return {
      tone: "pending",
      title: "Waiting for Buyer Approval",
      message: `${amount ? `This ${amount} purchase` : "This purchase"}${exceeds && limit !== null ? ` exceeds the automatic purchasing limit of ${formatMoney(limit, "EUR")}.` : " is awaiting buyer approval."} The buyer must approve or reject the order before the purchasing process can continue.`,
    }
  }
  if (status === "approved")
    return {
      tone: "approved",
      title: "Purchase Approved",
      message: `The buyer has approved this purchase. The order is now authorized to proceed. ${confirmation}`,
    }
  if (status === "rejected" || status === "approval_rejected")
    return {
      tone: "rejected",
      title: "Purchase Rejected",
      message:
        "The buyer rejected this purchase. No further purchasing action is authorized under this request.",
    }
  if (status === "placed")
    return {
      tone: "info",
      title: "Order Recorded",
      message: `Your purchase has been recorded in the purchasing system. ${confirmation}`,
    }
  if (status === "cancelled")
    return {
      tone: "info",
      title: "Purchase Cancelled",
      message: "Cancellation is recorded for this purchase.",
    }
  return {
    tone: "info",
    title:
      status === "approval_unknown"
        ? "Approval Outcome Unknown"
        : "Purchase Status",
    message: `The purchase is not verified as complete. Check the recorded purchase details before proceeding. ${confirmation}`,
  }
}
