import { useId, useRef, useState, type DragEvent } from "react"
import { FileJsonIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { readJournalFile, type JournalLoadResult } from "../parse-journal"

export function JournalPicker({
  onLoad,
}: {
  onLoad: (result: JournalLoadResult, fileName: string) => void
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
        "flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        dragging && "border-ring bg-muted"
      )}
    >
      <FileJsonIcon className="size-8 text-muted-foreground" aria-hidden />
      <span className="flex flex-col gap-1">
        <span className="font-medium">Open a purchasing journal</span>
        <span className="text-sm text-muted-foreground">
          Drop a valio-aimo-journal JSON file here or choose one. It is read in
          this browser and never uploaded.
        </span>
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
      <span aria-hidden className={buttonVariants({ variant: "secondary" })}>
        Choose file
      </span>
    </label>
  )
}
