import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { EmptyNote, JournalSection } from "../format"
import type { ValioAimoJournal } from "../journal.types"

type Question = ValioAimoJournal["questions"][number]

function QuestionCard({ question }: { question: Question }) {
  const answered = question.answer !== null && question.answer !== undefined
  const matchesOption = question.options.some(
    (option) => option.label === question.answer
  )
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{question.header}</CardDescription>
        <CardTitle className="break-words">{question.question}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <ul aria-label="Options" className="flex flex-col gap-2">
          {question.options.map((option, index) => {
            const picked = question.answer === option.label
            return (
              <li
                key={`${option.label}-${index}`}
                aria-label={picked ? `${option.label}, picked` : undefined}
                className="flex flex-col gap-0.5"
              >
                <span className="flex flex-wrap items-center gap-1 font-medium">
                  {option.label}
                  {picked ? <Badge>Picked</Badge> : null}
                  {option.recommended ? (
                    <Badge variant="secondary">Recommended</Badge>
                  ) : null}
                </span>
                <span className="text-muted-foreground">
                  {option.description}
                </span>
              </li>
            )
          })}
        </ul>
        {answered && !matchesOption ? (
          <p className="break-words">
            <span className="text-muted-foreground">Answer: </span>
            {question.answer}
          </p>
        ) : null}
        {!answered ? (
          <p className="text-muted-foreground">
            The buyer dismissed the dialog.
          </p>
        ) : null}
        {question.free_text ? (
          <p className="break-words">
            <span className="text-muted-foreground">The buyer wrote: </span>
            <Badge variant="outline">Free text</Badge> {question.free_text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function QuestionsList({ questions }: { questions: Question[] }) {
  return (
    <JournalSection id="questions" title="Buyer questions">
      {questions.length === 0 ? (
        <EmptyNote>None</EmptyNote>
      ) : (
        <div className="flex flex-col gap-3">
          {questions.map((question, index) => (
            <QuestionCard key={index} question={question} />
          ))}
        </div>
      )}
    </JournalSection>
  )
}
