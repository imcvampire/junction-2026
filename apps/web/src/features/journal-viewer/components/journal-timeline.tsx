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
} from "lucide-react"

import { DateTime, EmptyNote, JournalSection } from "../format"
import type { TimelineEntry } from "../journal.types"

const TYPE_ICON: Record<TimelineEntry["type"], LucideIcon> = {
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

function Refs({ refs }: { refs: TimelineEntry["refs"] }) {
  if (!refs) return null
  const parts = [
    refs.quote_id ? `quote ${refs.quote_id}` : null,
    refs.order_id ? `order ${refs.order_id}` : null,
    refs.product_ids?.length ? `products ${refs.product_ids.join(", ")}` : null,
  ].filter((part) => part !== null)
  if (parts.length === 0) return null
  return (
    <span className="font-mono text-xs break-all text-muted-foreground">
      {parts.join(" · ")}
    </span>
  )
}

export function JournalTimeline({ timeline }: { timeline: TimelineEntry[] }) {
  const entries = [...timeline].sort((a, b) => a.seq - b.seq)

  return (
    <JournalSection id="timeline" title="Timeline">
      {entries.length === 0 ? (
        <EmptyNote>None</EmptyNote>
      ) : (
        <ol aria-label="Timeline" className="flex flex-col gap-3">
          {entries.map((entry, index) => {
            const Icon = TYPE_ICON[entry.type] ?? FileTextIcon
            return (
              <li key={`${entry.seq}-${index}`} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                  <span className="break-words">
                    <span className="text-muted-foreground tabular-nums">
                      {entry.seq}.
                    </span>{" "}
                    {entry.title}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>{entry.type}</span>
                    {entry.tool ? (
                      <code className="font-mono">{entry.tool}</code>
                    ) : null}
                    {entry.at ? <DateTime value={entry.at} /> : null}
                  </span>
                  <Refs refs={entry.refs} />
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </JournalSection>
  )
}
