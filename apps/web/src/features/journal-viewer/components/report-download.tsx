import { useState } from "react"
import { DownloadIcon, LoaderCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ValioAimoJournal } from "../journal.types"

export function ReportDownload({ journal }: { journal: ValioAimoJournal }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  return (
    <div className="max-w-xs">
      <Button
        disabled={busy}
        className="h-auto min-h-11 w-full px-4 py-2 text-left whitespace-normal"
        onClick={async () => {
          setBusy(true)
          setError("")
          try {
            const { downloadPurchaseReport } =
              await import("../purchase-report")
            await downloadPurchaseReport(journal)
          } catch {
            setError(
              "The PDF could not be created. Please try again in a browser that supports image downloads."
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <DownloadIcon />
        )}
        {busy ? "Preparing PDF…" : "Download Complete Purchase Report (PDF)"}
      </Button>
      {busy && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          Preparing your report locally…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-white p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  )
}
