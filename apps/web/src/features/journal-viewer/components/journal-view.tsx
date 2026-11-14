import { Separator } from "@/components/ui/separator"

import type { ValioAimoJournal } from "../journal.types"
import { ErrorsList } from "./errors-list"
import { JournalHeader } from "./journal-header"
import { JournalNarrative } from "./journal-narrative"
import { JournalTimeline } from "./journal-timeline"
import { OrdersList } from "./orders-list"
import { QuestionsList } from "./questions-list"
import { QuoteTables } from "./quote-table"
import { RequestAuthority } from "./request-authority"

export function JournalView({ journal }: { journal: ValioAimoJournal }) {
  return (
    <article aria-label="Journal" className="flex min-w-0 flex-col gap-8">
      <JournalHeader journal={journal} />
      <JournalNarrative
        narrative={journal.narrative}
        nextSteps={journal.next_steps}
      />
      <Separator />
      <JournalTimeline timeline={journal.timeline} />
      <RequestAuthority journal={journal} />
      <QuoteTables journal={journal} />
      <QuestionsList questions={journal.questions} />
      <OrdersList orders={journal.orders} />
      <ErrorsList errors={journal.errors} />
    </article>
  )
}
