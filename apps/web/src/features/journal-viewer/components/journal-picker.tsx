import { useId, useRef, useState, type DragEvent } from "react"
import { FileJsonIcon, UploadIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { readJournalFile, type JournalLoadResult } from "../parse-journal"

export function JournalPicker({
  onLoad,
  compact = false,
}: {
  onLoad: (result: JournalLoadResult, fileName: string) => void
  compact?: boolean
}) {
  const inputId = useId()
  const latestRead = useRef(0)
  const [dragging, setDragging] = useState(false)

  async function load(file: File | undefined) {
    if (!file) return
    const read = ++latestRead.current
    const result = await readJournalFile(file)
    if (read === latestRead.current) onLoad(result, file.name)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    void load(event.dataTransfer.files[0])
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "group flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-sky-500/30 bg-sky-500/5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 hover:border-sky-500/60 hover:bg-sky-500/10",
        compact ? "flex-wrap p-4" : "flex-col px-6 py-10 text-center",
        dragging && "border-sky-500 bg-sky-500/15"
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-2xl border border-sky-500/20 bg-background text-sky-700 shadow-sm dark:text-sky-300",
          compact ? "size-10" : "size-14"
        )}
      >
        <FileJsonIcon className={compact ? "size-5" : "size-7"} aria-hidden />
      </span>
      <span className={cn("flex min-w-0 flex-col gap-1", compact && "flex-1")}>
        <span className="font-medium">
          {compact ? "Open another journal" : "Open a purchasing journal"}
        </span>
        <span className="text-sm text-muted-foreground">
          {compact
            ? "Drop a JSON file here or choose one."
            : "Drop your journal JSON here to explore the request, decisions and results."}
        </span>
        {!compact ? (
          <span className="mt-1 text-xs text-muted-foreground">
            Your file stays in your browser. Nothing is uploaded.
          </span>
        ) : null}
      </span>
      <input
        id={inputId}
        type="file"
        accept=".json,application/json"
        aria-label="Journal file"
        className="sr-only"
        onChange={(event) => {
          const input = event.currentTarget
          void load(input.files?.[0]).finally(() => {
            input.value = ""
          })
        }}
      />
      <span
        aria-hidden
        className={buttonVariants({
          variant: "outline",
          className: "shrink-0 gap-2 bg-background",
        })}
      >
        <UploadIcon className="size-4" />
        Choose file
      </span>
    </label>
  )
}
