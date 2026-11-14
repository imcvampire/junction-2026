import type { ValioAimoJournal } from "../journal.types"
import { JournalHeader } from "./journal-header"
import { JournalOutput } from "./journal-output"
import { JournalTimeline } from "./journal-timeline"
import { RequestInput } from "./request-input"
import { SourcesList } from "./sources-list"

export function JournalView({ journal }: { journal: ValioAimoJournal }) {
  return (
    <article
      aria-label="Purchase audit"
      className="flex min-w-0 flex-col gap-10"
    >
      <JournalHeader journal={journal} />
      <RequestInput journal={journal} />
      <JournalTimeline journal={journal} />
      <JournalOutput journal={journal} />
      <SourcesList journal={journal} />
    </article>
  )
}
