import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  compile,
  type JSONSchema,
  type Options,
} from "json-schema-to-typescript"

const webRoot = resolve(import.meta.dirname, "..")

export const SCHEMA_PATH = resolve(
  webRoot,
  "../../skills/valio-aimo-purchasing/references/journal.schema.json"
)
export const TYPES_PATH = resolve(
  webRoot,
  "src/features/journal-viewer/journal.types.ts"
)

const BANNER = `/**
 * Generated from skills/valio-aimo-purchasing/references/journal.schema.json.
 * Do not edit by hand. Regenerate with \`pnpm gen:journal-types\` in apps/web.
 */`

const OPTIONS: Partial<Options> = {
  bannerComment: BANNER,
  additionalProperties: false,
  format: true,
  strictIndexSignatures: true,
  style: { semi: false, singleQuote: false, trailingComma: "es5" },
  unreachableDefinitions: false,
}

export async function generateJournalTypes(): Promise<string> {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8")) as JSONSchema
  // The root title or $id would otherwise name the root type; the viewer's contract calls it ValioAimoJournal.
  const root: JSONSchema = { ...schema }
  delete root.title
  delete root.$id
  return compile(root, "ValioAimoJournal", { ...OPTIONS, cwd: webRoot })
}

if (import.meta.main) {
  await writeFile(TYPES_PATH, await generateJournalTypes())
  console.log(`wrote ${TYPES_PATH}`)
}
