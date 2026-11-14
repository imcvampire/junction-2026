import { DateTime, JournalSection } from "../format"
import type { ValioAimoJournal } from "../journal.types"

export function ErrorsList({ errors }: { errors: ValioAimoJournal["errors"] }) {
  if (errors.length === 0) return null

  return (
    <JournalSection id="errors" title="Refused calls">
      <ul className="flex flex-col gap-3 text-sm">
        {errors.map((error, index) => (
          <li
            key={index}
            className="flex flex-col gap-1 rounded-lg p-3 ring-1 ring-foreground/10"
          >
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <code className="font-mono">{error.tool}</code>
              <code className="font-mono text-destructive">{error.code}</code>
              {error.at ? (
                <span className="text-xs text-muted-foreground">
                  <DateTime value={error.at} />
                </span>
              ) : null}
            </span>
            <span className="break-words">{error.message}</span>
            <span className="break-words text-muted-foreground">
              Handling: {error.handling}
            </span>
          </li>
        ))}
      </ul>
    </JournalSection>
  )
}
