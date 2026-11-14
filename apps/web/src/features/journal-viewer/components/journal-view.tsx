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
      className="flex min-w-0 flex-col gap-6"
    >
      <nav
        aria-label="Journal sections"
        className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2 text-sm"
      >
        <span className="px-2 text-xs font-medium text-muted-foreground">
          Jump to
        </span>
        {[
          ["input", "Request"],
          ["timeline", "Timeline"],
          ["output", "Results & next steps"],
          ...(journal.research?.length || journal.recipes?.length
            ? [["sources", "Sources"]]
            : []),
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#journal-section-${id}`}
            className="rounded-lg px-3 py-2 font-medium transition-colors hover:bg-background hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:hover:text-sky-300"
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex min-w-0 flex-col gap-6">
          <JournalHeader journal={journal} />
          <RequestInput journal={journal} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <JournalTimeline journal={journal} />
          <JournalOutput journal={journal} />
          <SourcesList journal={journal} />
        </div>
      </div>
    </article>
  )
}
