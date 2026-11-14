import { useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Purchase audit</h1>
        <p className="text-sm text-muted-foreground">
          Open a journal file to see what the purchasing agent was asked, what
          it did, and what it ordered.
        </p>
      </div>
      <JournalPicker onLoad={onLoad} />
      {state.status === "loaded" ? (
        <>
          <p role="status" className="text-xs text-muted-foreground">
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
