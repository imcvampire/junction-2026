import { useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { FileCheckIcon, FileClockIcon } from "lucide-react"

import { JournalPicker } from "@/features/journal-viewer/components/journal-picker"
import { JournalView } from "@/features/journal-viewer/components/journal-view"
import { LoadError } from "@/features/journal-viewer/components/load-error"
import type { ValioAimoJournal } from "@/features/journal-viewer/journal.types"
import type {
  JournalLoadError,
  JournalLoadResult,
} from "@/features/journal-viewer/parse-journal"

export const Route = createFileRoute("/journal-viewer")({
  component: JournalViewerPage,
})

type PageState =
  | { status: "idle" }
  | {
      status: "loaded"
      journal: ValioAimoJournal
      fileName: string
      loadId: number
    }
  | { status: "failed"; error: JournalLoadError; fileName: string }

function JournalViewerPage() {
  const [state, setState] = useState<PageState>({ status: "idle" })
  const loads = useRef(0)

  function onLoad(result: JournalLoadResult, fileName: string) {
    setState(
      result.ok
        ? {
            status: "loaded",
            journal: result.journal,
            fileName,
            loadId: ++loads.current,
          }
        : { status: "failed", error: result.error, fileName }
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex items-start gap-4 py-2">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-300">
          <FileClockIcon className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Purchase audit
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Follow every purchase from request to result. Review the agent's
            choices, buyer decisions and what needs to happen next.
          </p>
        </div>
      </div>
      <JournalPicker onLoad={onLoad} compact={state.status === "loaded"} />
      {state.status === "loaded" ? (
        <>
          <p
            role="status"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <FileCheckIcon
              className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
            Showing <span className="break-all">{state.fileName}</span>
          </p>
          <JournalView key={state.loadId} journal={state.journal} />
        </>
      ) : null}
      {state.status === "failed" ? (
        <LoadError error={state.error} fileName={state.fileName} />
      ) : null}
    </div>
  )
}
