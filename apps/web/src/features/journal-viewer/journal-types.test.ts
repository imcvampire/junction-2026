// @vitest-environment node
import { readFile } from "node:fs/promises"
import { expect, test } from "vitest"

import {
  generateJournalTypes,
  TYPES_PATH,
} from "../../../scripts/gen-journal-types"

test("journal.types.ts matches a fresh generation from the schema", async () => {
  const [checkedIn, fresh] = await Promise.all([
    readFile(TYPES_PATH, "utf8"),
    generateJournalTypes(),
  ])

  expect(
    checkedIn === fresh,
    "journal.types.ts is stale: run `pnpm gen:journal-types` in apps/web"
  ).toBe(true)
}, 20_000)
