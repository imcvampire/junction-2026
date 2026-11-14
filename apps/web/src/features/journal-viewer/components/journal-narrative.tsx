import { TriangleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import { EmptyNote, Field, JournalSection } from "../format"
import type { ValioAimoJournal } from "../journal.types"

export function JournalNarrative({
  narrative,
  nextSteps,
}: {
  narrative: ValioAimoJournal["narrative"]
  nextSteps: string[]
}) {
  return (
    <JournalSection id="narrative" title="What happened">
      <dl className="flex flex-col gap-3">
        <Field label="What the agent did">
          <p className="whitespace-pre-line">{narrative.what_happened}</p>
        </Field>
        <Field label="Why this option">
          <p className="whitespace-pre-line">{narrative.why}</p>
        </Field>
      </dl>
      {narrative.watch_out ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Watch out</AlertTitle>
          <AlertDescription className="whitespace-pre-line">
            {narrative.watch_out}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium">Next steps</h4>
        {nextSteps.length === 0 ? (
          <EmptyNote>None</EmptyNote>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {nextSteps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ul>
        )}
      </div>
    </JournalSection>
  )
}
