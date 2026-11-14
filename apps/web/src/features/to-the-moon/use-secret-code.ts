import { useEffect, useRef } from "react"

const RESET_AFTER_MS = 2000

function isTextTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

export function useSecretCode(code: string, onMatch: () => void) {
  const onMatchRef = useRef(onMatch)
  useEffect(() => {
    onMatchRef.current = onMatch
  })

  useEffect(() => {
    const expected = code.toLowerCase()
    let buffer = ""
    let lastAt = 0

    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key.length !== 1 || isTextTarget(event.target)) return
      const now = Date.now()
      if (now - lastAt > RESET_AFTER_MS) buffer = ""
      lastAt = now
      buffer = (buffer + event.key.toLowerCase()).slice(-expected.length)
      if (buffer === expected) {
        buffer = ""
        onMatchRef.current()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [code])
}
