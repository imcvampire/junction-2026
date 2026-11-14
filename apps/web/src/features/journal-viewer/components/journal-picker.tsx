import { useId, useRef, useState, type DragEvent } from "react"
import { FileJsonIcon } from "lucide-react"

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
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)

  async function load(file: File | undefined) {
    if (!file) return
    const read = ++latestRead.current
    setLoading(true)
    const result = await readJournalFile(file)
    if (read === latestRead.current) {
      setLoading(false)
      onLoad(result, file.name)
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    void load(event.dataTransfer.files[0])
  }

  const dragProps = {
    onDragOver: (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  }
  return (
    <div
      className={compact ? "flex flex-col items-start gap-2 sm:items-end" : ""}
    >
      <label
        htmlFor={inputId}
        role={compact ? "button" : undefined}
        tabIndex={compact ? 0 : undefined}
        aria-busy={loading}
        onKeyDown={(event) => {
          if (compact && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        {...dragProps}
        className={cn(
          compact
            ? "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            : "flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          dragging && "border-ring bg-muted"
        )}
      >
        <FileJsonIcon
          className={compact ? "size-4" : "size-8 text-muted-foreground"}
          aria-hidden
        />
        {compact ? (
          <span>
            {loading ? "Opening Purchase Record…" : "Open Purchase Record"}
          </span>
        ) : (
          <span className="flex flex-col gap-1">
            <span className="font-medium">Open a purchasing journal</span>
            <span className="text-sm text-muted-foreground">
              Drop a valio-aimo-journal JSON file here or choose one. It is read
              in this browser and never uploaded.
            </span>
          </span>
        )}
        <input
          id={inputId}
          ref={inputRef}
          tabIndex={compact ? -1 : undefined}
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
        {!compact && (
          <span
            aria-hidden
            className={buttonVariants({ variant: "secondary" })}
          >
            Choose file
          </span>
        )}
      </label>
      {compact && (
        <details className="max-w-xs text-xs text-white">
          <summary className="cursor-pointer">Or drag & drop a record</summary>
          <label
            htmlFor={inputId}
            {...dragProps}
            className={cn(
              "mt-2 block cursor-pointer rounded-lg border border-dashed border-white/70 p-4 text-center leading-relaxed",
              dragging && "bg-white/15"
            )}
          >
            Drop your purchase record file here. Read in this browser; never
            uploaded.
          </label>
        </details>
      )}
    </div>
  )
}
