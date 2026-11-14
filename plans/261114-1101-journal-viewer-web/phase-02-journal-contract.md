---
phase: 2
title: "Journal contract in the browser"
status: completed
effort: 1.5h
depends_on: [1]
---

# Phase 2: Journal contract in the browser

## Context

- Contract: `skills/valio-aimo-purchasing/references/journal.schema.json` (2020-12,
  `schema: "valio-aimo-journal"`, `schema_version: 1`) and `journal.md` "For viewers".
- Fixture: `skills/valio-aimo-purchasing/references/journal-example.json`.
- The API already tests the schema itself (`apps/api/tests/test_skill_journal.py`). This phase
  tests only what the web app owns: loading, version branching, and error reporting.

## Files

Create in `apps/web/`:

- `scripts/gen-journal-types.ts`: reads the schema, writes `src/features/journal-viewer/journal.types.ts`
  with `json-schema-to-typescript` (banner comment says it is generated and how to regenerate).
- `src/features/journal-viewer/journal.types.ts` (generated, checked in).
- `src/features/journal-viewer/parse-journal.ts`
- `src/features/journal-viewer/parse-journal.test.ts`
- `src/features/journal-viewer/journal-types.test.ts`
- `src/features/journal-viewer/fixtures/` only for broken variants that are built in tests; reuse
  the skill's example directly instead of copying it.

Modify: `apps/web/package.json` (script `gen:journal-types`, dependencies `ajv`, `ajv-formats`,
dev dependency `json-schema-to-typescript`), `apps/web/vite.config.ts` (`server.fs.allow` for
`../../skills/valio-aimo-purchasing/references`), and `apps/web/tsconfig*.json` if needed for the
JSON import (`resolveJsonModule`).

## Contract

```ts
export const MAX_JOURNAL_BYTES = 5 * 1024 * 1024

export type JournalLoadError =
  | { kind: "too_large"; bytes: number }
  | { kind: "not_json"; message: string }
  | { kind: "not_a_journal"; found: unknown }
  | { kind: "unsupported_version"; found: unknown; supported: readonly number[] }
  | { kind: "invalid"; errors: { path: string; message: string }[] }

export type JournalLoadResult =
  | { ok: true; journal: ValioAimoJournal }
  | { ok: false; error: JournalLoadError }

export function parseJournal(text: string): JournalLoadResult
export async function readJournalFile(file: File): Promise<JournalLoadResult>
```

Order of checks: size (UTF-8 bytes), `JSON.parse`, the `schema` marker, `schema_version` (only 1
is supported), then Ajv. Each step returns before the next, so a non-journal file never shows a
wall of schema errors. `readJournalFile` checks `file.size` before reading, then calls
`parseJournal`. Errors list at most 50 entries, each `{ path: instancePath || "/", message }`.

Ajv: `new Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true })` plus `addFormats`,
compiled once at module load from the imported schema.

## Steps

1. Add the dependencies and the `gen:journal-types` script; generate `journal.types.ts`. The root
   type is named `ValioAimoJournal`.
2. Write `parse-journal.ts` to the contract above.
3. `parse-journal.test.ts`, in the Node environment, without any `File`:
   - The example parses `ok` and keeps its `journal_id`.
   - `"{"` returns `not_json`.
   - `{"schema": "other"}` returns `not_a_journal`.
   - The example with `schema_version: 2` returns `unsupported_version`.
   - The example with `errors: [{tool, code, message, next}]` returns `invalid` with a path
     `/errors/0` (the defect from the 261114 live check).
   - A string over 5 MB returns `too_large` without calling `JSON.parse` (spy).
   - `readJournalFile` with a jsdom `File` that is over the cap returns `too_large` without reading it.
4. `journal-types.test.ts`: generate the types in memory with the same options as the script and
   compare with the checked-in file. On mismatch, the message tells you to run `pnpm gen:journal-types`.

## Validation

- `cd apps/web && pnpm test src/features/journal-viewer`
- `pnpm typecheck`, `pnpm build`, and a dev-server request that loads the viewer route without a
  `fs.allow` error.

## Risks

- `json-schema-to-typescript` output for `oneOf: [null, object]` may be awkward. Accept the
  generated shape; do not hand-edit the generated file.
- Ajv `strict: true` may flag `format` plus `pattern` on `journal_id`. If it does, fix it in the
  web config (`strictSchema: "log"` for that keyword only), and record it. Never relax
  the shipped schema to please the viewer.

## Rollback

Delete the new files and revert the `package.json` and `vite.config.ts` changes.
