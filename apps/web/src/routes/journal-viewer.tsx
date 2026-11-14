import { useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import example from "@skill-references/journal-example.json"
import { ShieldCheckIcon, LockKeyholeIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { parseJournal } from "@/features/journal-viewer/parse-journal"
import { redactText } from "@/features/journal-viewer/evidence"

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
      <div className="flex flex-col justify-between gap-5 rounded-2xl bg-primary p-5 text-white sm:flex-row sm:items-start sm:p-7">
        <div className="min-w-0 space-y-3">
          <h1 className="max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Valio Aimo | Purchase Overview
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-white/95">
            See what your AI purchasing assistant ordered, why it chose the
            products, and who approved the purchase.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-white/90">
            <LockKeyholeIcon className="size-3" />
            Your purchase record stays in your browser
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <JournalPicker compact onLoad={onLoad} />
        </div>
      </div>
      {state.status === "idle" && (
        <div className="rounded-2xl border bg-card p-8 sm:p-12">
          <div className="mx-auto max-w-xl space-y-4 text-center">
            <ShieldCheckIcon className="mx-auto size-10 text-primary" />
            <h2 className="text-xl font-semibold text-primary">
              Your purchases, made clear.
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Open a purchase record to see the products, costs and buyer
              approval in one place. You can also explore the example purchase
              to see how it works.
            </p>
            <Button
              onClick={() =>
                onLoad(
                  parseJournal(JSON.stringify(example)),
                  "journal-example.json"
                )
              }
            >
              Explore Example Purchase
            </Button>
          </div>
        </div>
      )}
      {state.status === "loaded" ? (
        <>
          <p role="status" className="text-xs text-muted-foreground">
            Showing{" "}
            <span className="break-all">{redactText(state.fileName)}</span>
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
