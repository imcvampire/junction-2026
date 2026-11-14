// @vitest-environment node
import example from "@skill-references/journal-example.json"
import { afterEach, describe, expect, test, vi } from "vitest"

import {
  MAX_JOURNAL_BYTES,
  parseJournal,
  readJournalFile,
} from "./parse-journal"

const exampleText = () => JSON.stringify(example)
const withChanges = (change: (journal: Record<string, unknown>) => void) => {
  const journal = structuredClone(example) as Record<string, unknown>
  change(journal)
  return JSON.stringify(journal)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("parseJournal", () => {
  test("accepts the skill's example journal", () => {
    const result = parseJournal(exampleText())

    expect(result).toMatchObject({
      ok: true,
      journal: { journal_id: example.journal_id },
    })
  })

  test("accepts a journal with web research and one without", () => {
    const withResearch = {
      ...example,
      research: [
        {
          research_id: "r1",
          product_id: "464073",
          candidate_ids: ["469363"],
          purpose: "coffee",
          outcome: "ok",
          summary: "469363 foams like the original.",
          sources: [{ title: "arla.fi", url: "https://www.arla.fi/" }],
        },
      ],
    }
    expect(parseJournal(JSON.stringify(example)).ok).toBe(true)
    expect(parseJournal(JSON.stringify(withResearch)).ok).toBe(true)
    const badOutcome = {
      ...withResearch,
      research: [{ ...withResearch.research[0], outcome: "maybe" }],
    }
    expect(parseJournal(JSON.stringify(badOutcome)).ok).toBe(false)
  })

  test("reports text that is not JSON", () => {
    const result = parseJournal("{")

    expect(result).toMatchObject({ ok: false, error: { kind: "not_json" } })
  })

  test("reports JSON that is not a journal", () => {
    const result = parseJournal(JSON.stringify({ schema: "other" }))

    expect(result).toEqual({
      ok: false,
      error: { kind: "not_a_journal", found: "other" },
    })
  })

  test("reports JSON that is not an object as not a journal", () => {
    expect(parseJournal("[1, 2]")).toMatchObject({
      ok: false,
      error: { kind: "not_a_journal" },
    })
  })

  test("rejects a schema_version it does not support", () => {
    const result = parseJournal(
      withChanges((journal) => {
        journal.schema_version = 2
      })
    )

    expect(result).toEqual({
      ok: false,
      error: { kind: "unsupported_version", found: 2, supported: [1] },
    })
  })

  test("lists schema violations with their instance paths", () => {
    const result = parseJournal(
      withChanges((journal) => {
        journal.errors = [
          {
            tool: "place_order",
            code: "quote_changed",
            message: "The quote changed",
            next: "Requoted",
          },
        ]
      })
    )

    expect(result.ok).toBe(false)
    if (result.ok || result.error.kind !== "invalid") {
      throw new Error("expected an invalid result")
    }
    const paths = result.error.errors.map((error) => error.path)
    expect(paths).toContain("/errors/0")
    expect(result.error.errors).toContainEqual({
      path: "/errors/0",
      message: "must have required property 'handling'",
    })
  })

  test("caps the reported schema errors at 50", () => {
    const result = parseJournal(
      withChanges((journal) => {
        journal.next_steps = Array.from({ length: 80 }, () => 1)
      })
    )

    if (result.ok || result.error.kind !== "invalid") {
      throw new Error("expected an invalid result")
    }
    expect(result.error.errors).toHaveLength(50)
  })

  test("rejects input over 5 MB before parsing it", () => {
    const parse = vi.spyOn(JSON, "parse")
    const result = parseJournal("x".repeat(MAX_JOURNAL_BYTES + 1))

    expect(result).toEqual({
      ok: false,
      error: { kind: "too_large", bytes: MAX_JOURNAL_BYTES + 1 },
    })
    expect(parse).not.toHaveBeenCalled()
  })

  test("counts the size in UTF-8 bytes", () => {
    const result = parseJournal("é".repeat(MAX_JOURNAL_BYTES / 2 + 1))

    expect(result).toMatchObject({ ok: false, error: { kind: "too_large" } })
  })
})

describe("readJournalFile", () => {
  test("rejects a file over the cap without reading it", async () => {
    const file = new File(["{}"], "big.json", { type: "application/json" })
    Object.defineProperty(file, "size", { value: MAX_JOURNAL_BYTES + 1 })
    const text = vi.spyOn(file, "text")

    const result = await readJournalFile(file)

    expect(result).toEqual({
      ok: false,
      error: { kind: "too_large", bytes: MAX_JOURNAL_BYTES + 1 },
    })
    expect(text).not.toHaveBeenCalled()
  })

  test("parses a file within the cap", async () => {
    const file = new File([exampleText()], "journal.json")

    expect(await readJournalFile(file)).toMatchObject({ ok: true })
  })
})
