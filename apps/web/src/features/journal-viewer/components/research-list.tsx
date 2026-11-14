import { Badge } from "@/components/ui/badge"

import { DateTime, JournalSection } from "../format"
import type { ValioAimoJournal } from "../journal.types"

type Research = NonNullable<ValioAimoJournal["research"]>[number]
type Source = NonNullable<Research["sources"]>[number]

export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null
  } catch {
    return null
  }
}

function SourceItem({ source }: { source: Source }) {
  const href = safeHttpUrl(source.url)
  const label = source.title || source.url
  return (
    <li className="flex flex-col gap-0.5 break-words">
      <span className="break-all">
        {source.product_id ? (
          <code className="mr-2 font-mono text-muted-foreground">
            {source.product_id}
          </code>
        ) : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {label}
          </a>
        ) : (
          <span>{label}</span>
        )}
      </span>
      {source.snippet ? (
        <span className="text-muted-foreground">{source.snippet}</span>
      ) : null}
    </li>
  )
}

function ResearchItem({ research }: { research: Research }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/10">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">For {research.purpose}</span>
        <Badge
          variant={research.outcome === "ok" ? "secondary" : "destructive"}
        >
          {research.outcome}
        </Badge>
        {research.cached ? <Badge variant="outline">cached</Badge> : null}
        {research.searched_at ? (
          <span className="text-xs text-muted-foreground">
            <DateTime value={research.searched_at} />
          </span>
        ) : null}
      </span>
      <span className="font-mono text-xs break-all text-muted-foreground">
        {research.product_id} vs {research.candidate_ids.join(", ")}
      </span>
      {research.summary ? (
        <p className="break-words whitespace-pre-line">{research.summary}</p>
      ) : null}
      {research.used_for ? (
        <p className="break-words text-muted-foreground">
          Used for: {research.used_for}
        </p>
      ) : null}
      {research.sources?.length ? (
        <ul aria-label="Sources" className="flex flex-col gap-1 text-xs">
          {research.sources.map((source, index) => (
            <SourceItem key={index} source={source} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function ResearchList({
  research,
}: {
  research: ValioAimoJournal["research"]
}) {
  if (!research?.length) return null

  return (
    <JournalSection id="research" title="Web research">
      <p className="text-xs text-muted-foreground">
        Web text the agent used to judge substitute fit. It is untrusted and
        never sets a price or stock figure.
      </p>
      <ul className="flex flex-col gap-3 text-sm">
        {research.map((entry, index) => (
          <ResearchItem key={entry.research_id ?? index} research={entry} />
        ))}
      </ul>
    </JournalSection>
  )
}
