import { Badge } from "@/components/ui/badge"

import {
  CalendarDate,
  Field,
  formatMoney,
  formatNumber,
  JournalSection,
  Unknown,
} from "../format"
import type { ValioAimoJournal } from "../journal.types"
import { allergenName, salesUnitsLabel, tagLabel } from "../plain-language"

function joinWords(words: string[], last: string): string {
  if (words.length <= 1) return words.join("")
  return `${words.slice(0, -1).join(", ")} ${last} ${words.at(-1)}`
}

export function mandateSentences(
  authority: ValioAimoJournal["authority"]
): string[] {
  const sentences = [
    authority.spend_limit_eur === null
      ? "The journal does not record a spending limit for the agent."
      : `The agent may place orders up to ${formatMoney(authority.spend_limit_eur, "EUR")} without sign-off. Anything above that needs a person's approval.`,
  ]
  if (authority.required_tags.length > 0) {
    sentences.push(
      `Every product it orders must be: ${authority.required_tags.map(tagLabel).join(", ")}.`
    )
  }
  if (authority.banned_allergens.length > 0) {
    sentences.push(
      `It must never buy products containing ${joinWords(authority.banned_allergens.map(allergenName), "or")}.`
    )
  }
  if (sentences.length === 1) sentences.push("No other buying rules were set.")
  return sentences
}

function Amount({ request }: { request: ValioAimoJournal["request"] }) {
  if (request.amount) {
    return <>{`${formatNumber(request.amount.value)} ${request.amount.unit}`}</>
  }
  if (request.quantity !== null && request.quantity !== undefined) {
    return <>{salesUnitsLabel(request.quantity)}</>
  }
  return <Unknown />
}

export function RequestInput({ journal }: { journal: ValioAimoJournal }) {
  const { request, authority } = journal

  return (
    <JournalSection id="input" title="What was asked">
      <div className="flex flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/10">
        <blockquote className="border-l-2 pl-3 text-base break-words whitespace-pre-line italic">
          {request.text}
        </blockquote>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Field label="Delivery by">
            <CalendarDate value={request.delivery_date} isoTitle={false} />
          </Field>
          <Field label="Amount">
            <Amount request={request} />
          </Field>
          <Field label="Requirements">
            {request.requirements.length === 0 ? (
              "None stated"
            ) : (
              <span className="flex flex-wrap gap-1">
                {request.requirements.map((tag, index) => (
                  <Badge key={index} variant="secondary">
                    {tagLabel(tag)}
                  </Badge>
                ))}
              </span>
            )}
          </Field>
          {request.purpose ? (
            <Field label="For">{request.purpose}</Field>
          ) : null}
        </dl>
        <div className="flex flex-col gap-1 text-sm">
          <h4 className="font-medium">The agent's limits</h4>
          {mandateSentences(authority).map((sentence, index) => (
            <p key={index} className="text-muted-foreground">
              {sentence}
            </p>
          ))}
        </div>
      </div>
    </JournalSection>
  )
}
