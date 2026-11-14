import { CircleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import { MAX_JOURNAL_BYTES, type JournalLoadError } from "../parse-journal"

function describeFound(found: unknown): string {
  if (found === undefined) return "nothing"
  const text = JSON.stringify(found)
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function ErrorBody({ error }: { error: JournalLoadError }) {
  switch (error.kind) {
    case "too_large":
      return (
        <>
          <AlertTitle>This file is too large to be a journal.</AlertTitle>
          <AlertDescription>
            It is {megabytes(error.bytes)}; the viewer opens files up to{" "}
            {megabytes(MAX_JOURNAL_BYTES)}.
          </AlertDescription>
        </>
      )
    case "unreadable":
      return (
        <>
          <AlertTitle>This file could not be read.</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </>
      )
    case "not_json":
      return (
        <>
          <AlertTitle>This file is not valid JSON.</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </>
      )
    case "not_a_journal":
      return (
        <>
          <AlertTitle>This file is not a Valio Aimo journal.</AlertTitle>
          <AlertDescription>
            A journal has <code>"schema": "valio-aimo-journal"</code>; this file
            has {describeFound(error.found)}.
          </AlertDescription>
        </>
      )
    case "unsupported_version":
      return (
        <>
          <AlertTitle>This journal version is not supported.</AlertTitle>
          <AlertDescription>
            The file has schema_version {describeFound(error.found)}; this
            viewer reads version {error.supported.join(", ")}.
          </AlertDescription>
        </>
      )
    case "invalid":
      return (
        <>
          <AlertTitle>
            This journal does not match the journal schema.
          </AlertTitle>
          <AlertDescription>
            <ul aria-label="Schema errors" className="flex flex-col gap-1">
              {error.errors.map((item, index) => (
                <li key={`${item.path}-${index}`} className="break-words">
                  <code className="font-mono text-xs">{item.path}</code>:{" "}
                  {item.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </>
      )
  }
}

export function LoadError({
  error,
  fileName,
}: {
  error: JournalLoadError
  fileName: string
}) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <ErrorBody error={error} />
      <AlertDescription className="text-xs">File: {fileName}</AlertDescription>
    </Alert>
  )
}
