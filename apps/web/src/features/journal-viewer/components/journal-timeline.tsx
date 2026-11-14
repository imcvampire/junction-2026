import {
  BanIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  FileTextIcon,
  MessageCircleQuestionIcon,
  MessageSquareReplyIcon,
  ReceiptTextIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  type LucideIcon,
  ClockIcon,
} from "lucide-react"
import { CalendarDate, DateTime, Field, JournalSection } from "../format"
import type { TimelineEntry, ValioAimoJournal } from "../journal.types"
import { purchasingJourney, type JourneyTime } from "../journey"
import { Panel } from "./dashboard"

const ICONS: Record<TimelineEntry["type"], LucideIcon> = {
  authority: ShieldCheckIcon,
  search: SearchIcon,
  quote: ReceiptTextIcon,
  question: MessageCircleQuestionIcon,
  answer: MessageSquareReplyIcon,
  order: ShoppingCartIcon,
  approval: CircleCheckIcon,
  cancel: BanIcon,
  error: CircleAlertIcon,
  report: FileTextIcon,
}

function DisplayTime({ time }: { time: JourneyTime }) {
  return (
    <p
      className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
      title={time.note}
    >
      {time.value ? <DateTime value={time.value} /> : time.note}
      {time.value && time.source !== "recorded" && (
        <span className="rounded border bg-background px-1.5 py-0.5 text-[11px]">
          {time.source === "previous"
            ? "Estimated time"
            : "Based on purchase request"}
        </span>
      )}
    </p>
  )
}

export function JournalTimeline({
  journal,
  title = "Here's What Happened",
}: {
  journal: ValioAimoJournal
  title?: string
}) {
  const steps = purchasingJourney(journal)
  return (
    <JournalSection id="journey" title={title}>
      <Panel>
        <ol aria-label="Purchase journey" className="journey-list">
          {steps.map((step) => {
            const Icon =
              step.time.source === "pending" || step.time.source === "unknown"
                ? ClockIcon
                : ICONS[step.type]
            return (
              <li
                key={step.key}
                className="journey-step"
                aria-label={step.title}
              >
                <span
                  className={`journey-icon ${step.status === "complete" ? "journey-complete" : step.status === "attention" ? "journey-attention" : "journey-failed"}`}
                >
                  <Icon aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold">{step.title}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.explanation}
                  </p>
                  <DisplayTime time={step.time} />
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer font-medium text-primary">
                      View Details
                    </summary>
                    <dl className="mt-3 grid gap-4 rounded-xl border bg-background p-4 sm:grid-cols-2">
                      <Field label="Event time">
                        <DisplayTime time={step.time} />
                      </Field>
                      {step.facts.map(([label, value]) => (
                        <Field key={label} label={label}>
                          {/^\d{4}-\d{2}-\d{2}$/.test(value) ? (
                            <CalendarDate value={value} />
                          ) : /^\d{4}-\d{2}-\d{2}T/.test(value) ? (
                            <DateTime value={value} />
                          ) : (
                            value
                          )}
                        </Field>
                      ))}
                    </dl>
                  </details>
                </div>
              </li>
            )
          })}
        </ol>
        <p className="mt-5 border-t pt-4 text-sm leading-relaxed text-muted-foreground">
          Buyer approval and wholesaler confirmation are separate steps. Times
          marked “Estimated time” are display estimates; original recorded times
          remain unchanged.
        </p>
      </Panel>
    </JournalSection>
  )
}
