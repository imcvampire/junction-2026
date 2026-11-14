import Ajv2020, { type ErrorObject } from "ajv/dist/2020"
import addFormats from "ajv-formats"
import journalSchema from "@skill-references/journal.schema.json"

import type { ValioAimoJournal } from "./journal.types"

export const MAX_JOURNAL_BYTES = 5 * 1024 * 1024
export const JOURNAL_SCHEMA_MARKER = "valio-aimo-journal"
export const SUPPORTED_SCHEMA_VERSIONS = [1] as const
const MAX_REPORTED_ERRORS = 50

export type JournalValidationError = { path: string; message: string }

export type JournalLoadError =
  | { kind: "too_large"; bytes: number }
  | { kind: "unreadable"; message: string }
  | { kind: "not_json"; message: string }
  | { kind: "not_a_journal"; found: unknown }
  | {
      kind: "unsupported_version"
      found: unknown
      supported: readonly number[]
    }
  | { kind: "invalid"; errors: JournalValidationError[] }

export type JournalLoadResult =
  | { ok: true; journal: ValioAimoJournal }
  | { ok: false; error: JournalLoadError }

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
})
addFormats(ajv)
const validateJournal = ajv.compile<ValioAimoJournal>(journalSchema)

const fail = (error: JournalLoadError): JournalLoadResult => ({
  ok: false,
  error,
})

function describe(error: ErrorObject): JournalValidationError {
  const extra =
    error.keyword === "additionalProperties"
      ? `: ${String(error.params.additionalProperty)}`
      : ""
  return {
    path: error.instancePath || "/",
    message: `${error.message ?? error.keyword}${extra}`,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseJournal(text: string): JournalLoadResult {
  const bytes = new TextEncoder().encode(text).byteLength
  if (bytes > MAX_JOURNAL_BYTES) return fail({ kind: "too_large", bytes })

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    return fail({
      kind: "not_json",
      message: error instanceof Error ? error.message : String(error),
    })
  }

  if (!isRecord(data) || data.schema !== JOURNAL_SCHEMA_MARKER) {
    return fail({
      kind: "not_a_journal",
      found: isRecord(data) ? data.schema : data,
    })
  }

  const version = data.schema_version
  if (!(SUPPORTED_SCHEMA_VERSIONS as readonly unknown[]).includes(version)) {
    return fail({
      kind: "unsupported_version",
      found: version,
      supported: SUPPORTED_SCHEMA_VERSIONS,
    })
  }

  if (!validateJournal(data)) {
    const errors = (validateJournal.errors ?? [])
      .slice(0, MAX_REPORTED_ERRORS)
      .map(describe)
    return fail({ kind: "invalid", errors })
  }

  return { ok: true, journal: data }
}

export async function readJournalFile(file: File): Promise<JournalLoadResult> {
  if (file.size > MAX_JOURNAL_BYTES) {
    return fail({ kind: "too_large", bytes: file.size })
  }
  let text: string
  try {
    text = await file.text()
  } catch (error) {
    return fail({
      kind: "unreadable",
      message: error instanceof Error ? error.message : String(error),
    })
  }
  return parseJournal(text)
}
