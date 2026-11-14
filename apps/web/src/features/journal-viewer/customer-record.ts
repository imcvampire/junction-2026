import {
  businessText,
  productNames,
  purchaseFacts,
  quantityLabel,
} from "./evidence"
import type { ValioAimoJournal } from "./journal.types"

export function buyerDecisions(journal: ValioAimoJournal) {
  const facts = purchaseFacts(journal)
  const names = productNames(journal)
  const finalSelection = journal.decision?.chosen
    .map(
      (line) =>
        `${names.get(line.product_id) ?? "Product name not recorded"} — ${quantityLabel(facts.lines.find((p) => p.product_id === line.product_id)?.option, line.quantity)}`
    )
    .join("; ")
  return journal.questions.map((question, index) => {
    const picked = question.options.find(
      (option) => option.label === question.answer
    )
    const statements = [question.answer, question.free_text].filter(
      (value): value is string => !!value
    )
    // Only an explicit buyer statement establishes risk acceptance; choosing an option alone does not.
    const riskAcceptance =
      statements.find(
        (value) =>
          /\b(?:accept|agree|acknowledge|proceed)\b.{0,100}\b(?:risk|late delivery|delivery delay)\b/i.test(
            value
          ) && !/\b(?:not|never|reject|decline)\b|don['’]t/i.test(value)
      ) ??
      (/\b(?:accept|agree|acknowledge)\b.{0,100}\brisk\b/i.test(
        question.question
      ) && !/\bnot\b|don['’]t/i.test(question.question)
        ? statements.find((value) =>
            /^(?:yes|accept|i accept|agree|i agree)$/i.test(value.trim())
          )
        : undefined)
    const disclosures = [
      question.question,
      ...question.options.map((o) => o.description),
    ].filter((value) => /\brisk\b|late delivery|delivery delay/i.test(value))
    return {
      title: `Decision ${index + 1} — ${businessText(question.header || "Buyer response", journal)}`,
      question: businessText(question.question, journal),
      options: question.options.map((option) => ({
        title: businessText(
          /^[A-Z0-9]$/.test(option.label)
            ? option.description || "Option description not recorded"
            : option.label,
          journal
        ),
        description: businessText(option.description, journal),
        reference: /^[A-Z0-9]$/.test(option.label)
          ? `Option ${option.label}`
          : undefined,
        selected: question.answer === option.label,
        recommended: option.recommended,
      })),
      answer:
        question.answer === null
          ? "No buyer response recorded"
          : businessText(
              picked ? picked.description || picked.label : question.answer,
              journal
            ),
      buyerNote: question.free_text
        ? businessText(question.free_text, journal)
        : undefined,
      riskAcceptance: riskAcceptance
        ? businessText(riskAcceptance, journal)
        : "Risk acceptance is not explicitly recorded.",
      disclosures: disclosures.map((value) => businessText(value, journal)),
      effect: finalSelection
        ? `Final recorded purchase: ${finalSelection}. This record does not separately link each response to an order change.`
        : "The effect of this response on a final order is not recorded.",
    }
  })
}

export function productSearchSummary(journal: ValioAimoJournal) {
  const suitable = new Set(
    journal.quotes.flatMap((quote) =>
      quote.options
        .filter(
          (p) =>
            p.meets_requirements === true &&
            p.covers_request === true &&
            p.breaks_mandate === false &&
            (!journal.request.delivery_date ||
              quote.delivery_date <= journal.request.delivery_date)
        )
        .map((p) => p.product_id)
    )
  )
  const excluded = journal.candidates.filter((p) => !p.kept)
  return {
    searches: journal.searches.map((s) => businessText(s.query, journal)),
    found:
      journal.searches.length === 1 ? journal.searches[0].result_count : null,
    considered: purchaseFacts(journal).considered,
    suitable: suitable.size || null,
    excluded: excluded.length,
    reasons: excluded.map(
      (p) =>
        `${p.name}: ${businessText(p.drop_reason || "Reason not recorded", journal)}`
    ),
  }
}
