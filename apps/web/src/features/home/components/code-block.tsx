import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

type CopyState = "idle" | "copied" | "failed"

export function CodeBlock({ code, label }: { code: string; label: string }) {
  const [state, setState] = useState<CopyState>("idle")

  useEffect(() => {
    if (state === "idle") return
    const timer = window.setTimeout(() => setState("idle"), 1800)
    return () => window.clearTimeout(timer)
  }, [state])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setState("copied")
    } catch {
      setState("failed")
    }
  }

  return (
    <div className="group relative overflow-hidden rounded-xl border bg-zinc-950 text-zinc-100 shadow-sm">
      <pre className="p-4 pr-12 font-mono text-[0.8rem] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={state === "copied" ? `${label} copied` : `Copy ${label}`}
        title={
          state === "failed"
            ? "Copy failed; select the text instead"
            : undefined
        }
        onClick={copy}
        className="absolute top-2 right-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {state === "copied" ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  )
}
