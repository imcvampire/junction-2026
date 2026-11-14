import { useState } from "react"
import {
  BanIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  FileTextIcon,
  GlobeIcon,
  MessageCircleQuestionIcon,
  MessageSquareReplyIcon,
  ReceiptTextIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  TriangleAlertIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

import {
  DateTime,
  EmptyNote,
  formatDuration,
  formatMoney,
  JournalSection,
  ToneBadge,
} from "../format"
import type { TimelineEntry, ValioAimoJournal } from "../journal.types"
import {
  cancellationSentence,
  decisionSentence,
  orderStatusLabel,
  toAuditSteps,
  type AuditStep,
  type StepDetail,
} from "../plain-language"

type Question = ValioAimoJournal["questions"][number]
type JournalError = ValioAimoJournal["errors"][number]

const GAP_MINUTES = 30

const TYPE_ICON: Record<TimelineEntry["type"], LucideIcon> = {
  authority: ShieldCheckIcon,
  search: SearchIcon,
  quote: ReceiptTextIcon,
  question: MessageCircleQuestionIcon,
  answer: MessageSquareReplyIcon,
  order: ShoppingCartIcon,
  approval: CircleCheckIcon,
  cancel: BanIcon,
  error: TriangleAlertIcon,
  research: GlobeIcon,
  report: FileTextIcon,
}

export function QuestionCard({ question }: { question: Question }) {
  const matchesOption = question.options.some(
    (option) => option.label === question.answer
  )
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{question.header}</span>
        <span className="font-medium break-words">{question.question}</span>
      </p>
      <ul aria-label="Options offered" className="flex flex-col gap-2">
        {question.options.map((option, index) => {
          const picked = question.answer === option.label
          return (
            <li
              key={`${option.label}-${index}`}
              className="flex flex-col gap-0.5"
            >
              <span className="flex flex-wrap items-center gap-1 font-medium">
                {option.label}
                {picked ? <Badge>Picked</Badge> : null}
                {option.recommended ? (
                  <Badge variant="secondary">Suggested by the agent</Badge>
                ) : null}
              </span>
              {option.description ? (
                <span className="text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
      <AnswerLines question={question} hidePicked={matchesOption} />
    </div>
  )
}

function AnswerLines({
  question,
  hidePicked = false,
}: {
  question: Question
  hidePicked?: boolean
}) {
  const answered = question.answer !== null && question.answer !== undefined
  return (
    <>
      {answered && !hidePicked ? (
        <p className="break-words">
          <span className="text-muted-foreground">The buyer chose: </span>
          {question.answer}
        </p>
      ) : null}
      {!answered ? (
        <p className="text-muted-foreground">
          The buyer closed the question without answering.
        </p>
      ) : null}
      {question.free_text ? (
        <p className="break-words">
          <span className="text-muted-foreground">The buyer wrote: </span>
          {question.free_text}
        </p>
      ) : null}
    </>
  )
}

export function ProblemCard({ error }: { error: JournalError }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="break-words">{error.message}</p>
      <p className="break-words">
        <span className="text-muted-foreground">What the agent did: </span>
        {error.handling}
      </p>
    </div>
  )
}

function Detail({
  detail,
  journal,
}: {
  detail: StepDetail
  journal: ValioAimoJournal
}) {
  switch (detail.kind) {
    case "question":
      return detail.asked ? (
        <QuestionCard question={detail.question} />
      ) : (
        <div className="flex flex-col gap-1 text-sm">
          <p className="break-words text-muted-foreground">
            {detail.question.question}
          </p>
          <AnswerLines question={detail.question} />
        </div>
      )
    case "decision":
      return (
        <div className="flex flex-col gap-1 text-sm">
          <p>{decisionSentence(detail.decision, journal)}.</p>
          <p className="break-words">
            <span className="text-muted-foreground">Reason given: </span>
            {detail.decision.reason}
          </p>
        </div>
      )
    case "cancellation":
      return (
        <div className="flex flex-col gap-1 text-sm">
          <p>{cancellationSentence(detail.cancellation, journal)}.</p>
          <p className="break-words">
            <span className="text-muted-foreground">Reason given: </span>
            {detail.cancellation.reason}
          </p>
          {detail.cancellation.replaced_by ? (
            <p>A replacement order was placed.</p>
          ) : null}
        </div>
      )
    case "order":
      return (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            Total{" "}
            <span className="tabular-nums">
              {formatMoney(detail.order.total, detail.order.currency)}
            </span>{" "}
            excl. VAT.
          </span>
          <span className="text-muted-foreground">Now:</span>
          <ToneBadge label={orderStatusLabel(detail.order.status)} />
        </p>
      )
    case "problem":
      return <ProblemCard error={detail.error} />
    case "none":
      return null
  }
}

function StepNode({ step }: { step: AuditStep }) {
  if (step.actor === "buyer") {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background">
        <UserIcon className="size-5" aria-hidden />
      </span>
    )
  }
  if (step.actor === "problem") {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-destructive bg-background text-destructive ring-4 ring-background">
        <TriangleAlertIcon className="size-4" aria-hidden />
      </span>
    )
  }
  const Icon = TYPE_ICON[step.type] ?? FileTextIcon
  return (
    <span className="flex size-9 shrink-0 items-center justify-center">
      <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground ring-4 ring-background">
        <Icon className="size-3.5" aria-hidden />
      </span>
    </span>
  )
}

function Step({
  step,
  journal,
  showGap,
}: {
  step: AuditStep
  journal: ValioAimoJournal
  showGap: boolean
}) {
  const hasDetail = step.detail.kind !== "none"
  const isBuyer = step.actor === "buyer"
  const isProblem = step.actor === "problem"
  const gap =
    showGap && (step.minutesSincePrevious ?? 0) > GAP_MINUTES
      ? formatDuration(step.minutesSincePrevious ?? 0)
      : null

  return (
    <li data-seq={step.seq} className="relative flex flex-col gap-2">
      {gap ? (
        <p className="ml-12 text-xs text-muted-foreground italic">
          {gap} later
        </p>
      ) : null}
      <div className="flex gap-3">
        <StepNode step={step} />
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-1.5",
            isBuyer &&
              "rounded-lg bg-primary/5 p-3 ring-1 ring-primary/30 dark:bg-primary/10",
            isProblem && "rounded-lg p-3 ring-1 ring-destructive/40"
          )}
        >
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-muted-foreground tabular-nums">
              Step {step.seq}
            </span>
            {isBuyer ? <Badge>Buyer decision</Badge> : null}
            {isProblem ? <Badge variant="destructive">Problem</Badge> : null}
            {step.involvesHuman && !isBuyer ? (
              <Badge variant="secondary">Needs the buyer</Badge>
            ) : null}
            <span className="font-medium">{step.label}</span>
          </p>
          <p
            className={cn(
              "text-sm break-words",
              isBuyer && "text-base font-medium"
            )}
          >
            {step.title}
          </p>
          {step.at ? (
            <p className="text-xs text-muted-foreground">
              <DateTime value={step.at} isoTitle={false} />
            </p>
          ) : null}
          {step.products.length > 0 ? (
            <ul aria-label="Products" className="flex flex-wrap gap-1">
              {step.products.map((name) => (
                <li key={name}>
                  <Badge
                    variant="outline"
                    className="h-auto max-w-full whitespace-normal text-muted-foreground"
                  >
                    {name}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
          {hasDetail ? (
            <Collapsible
              defaultOpen={step.involvesHuman || isProblem}
              className="flex flex-col gap-2"
            >
              <CollapsibleTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-fit px-0 text-xs text-muted-foreground hover:bg-transparent"
                  >
                    Details
                    <ChevronDownIcon
                      data-icon="inline-end"
                      className="transition-transform in-data-[panel-open]:rotate-180"
                    />
                  </Button>
                }
              />
              <CollapsibleContent>
                <Detail detail={step.detail} journal={journal} />
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      </div>
    </li>
  )
}

export function JournalTimeline({ journal }: { journal: ValioAimoJournal }) {
  const [onlyHuman, setOnlyHuman] = useState(false)
  const { steps, unlinked } = toAuditSteps(journal)
  const shown = onlyHuman ? steps.filter((step) => step.involvesHuman) : steps
  const hasUnlinked =
    unlinked.questions.length > 0 || unlinked.errors.length > 0

  return (
    <JournalSection id="timeline" title="What happened, step by step">
      {steps.length === 0 ? (
        <EmptyNote>No steps were recorded.</EmptyNote>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <Button
              variant={onlyHuman ? "default" : "outline"}
              size="sm"
              aria-pressed={onlyHuman}
              onClick={() => setOnlyHuman((value) => !value)}
            >
              <UserIcon data-icon="inline-start" />
              Only human decisions
            </Button>
            <span className="flex items-center gap-1.5">
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <UserIcon className="size-2.5" aria-hidden />
              </span>
              Buyer
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-muted ring-1 ring-border" />
              Agent
            </span>
            <span className="flex items-center gap-1.5">
              <TriangleAlertIcon
                className="size-3.5 text-destructive"
                aria-hidden
              />
              Problem
            </span>
          </div>
          {shown.length === 0 ? (
            <EmptyNote>No person was involved in this session.</EmptyNote>
          ) : (
            <ol
              aria-label="Steps"
              className="relative flex flex-col gap-5 before:absolute before:top-4 before:bottom-4 before:left-[17px] before:w-0.5 before:bg-border"
            >
              {shown.map((step, index) => (
                <Step
                  key={`${step.seq}-${index}`}
                  step={step}
                  journal={journal}
                  showGap={!onlyHuman}
                />
              ))}
            </ol>
          )}
        </>
      )}
      {hasUnlinked ? (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-medium">Also recorded</h4>
          <p className="text-xs text-muted-foreground">
            The agent recorded these but did not tie them to a step above.
          </p>
          <ul aria-label="Also recorded" className="flex flex-col gap-3">
            {unlinked.questions.map((question, index) => (
              <li
                key={`question-${index}`}
                className="rounded-lg p-3 ring-1 ring-foreground/10"
              >
                <QuestionCard question={question} />
              </li>
            ))}
            {unlinked.errors.map((error, index) => (
              <li
                key={`error-${index}`}
                className="flex flex-col gap-1 rounded-lg p-3 ring-1 ring-destructive/40"
              >
                <Badge variant="destructive">Problem</Badge>
                <ProblemCard error={error} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </JournalSection>
  )
}
