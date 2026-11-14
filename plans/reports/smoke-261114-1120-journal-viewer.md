# Browser smoke: journal viewer

Date: 2026-11-14, Europe/Helsinki. Plan: `plans/261114-1101-journal-viewer-web` (phase 4).
URL: http://localhost:5173/, served by a `mise run dev` the user had already started (API PID 7289,
Vite PID 7290). It was reused and left running. Tool: agent-browser (headless Chromium).

## Results

| # | Step | Result |
|---|------|--------|
| 1 | Open `/` | Redirected to `/journal-viewer`. |
| 2 | Load `journal-example.json` | Pass. Header, metrics, narrative, next steps (None), timeline (6 entries in `seq` order), request and authority, quote table, decision, buyer questions (None) and orders all render. `464119` has the Chosen and Cheapest covering badges; `ord_example` shows `approved` with reason `For the gala dinner`. The refused calls section is hidden. No console errors. |
| 3 | Example with `errors[0].next` in place of `handling` | Pass. The `invalid` alert lists `/errors/0: must have required property 'handling'`. |
| 4 | `apps/api/data/openapi.json` | Pass. Shows "This file is not a Valio Aimo journal." |
| 5 | Sandbox journals in `~/.cache/junction-2026/agent-sandbox/valio-aimo-journal/` | All three fail as expected after the `orders[].total` rename: `/orders/0: must have required property 'total'`. The 1058 run also lists `/errors/0: must have required property 'handling'`. |
| 6 | 390 px width | Pass. `scrollWidth` equals `clientWidth` (390), and no element outside the table overflows. The quote table scrolls inside its own container (923 px of content in 326 px). Checked in both dark (system default) and light themes, switched with the header toggle. |
| 7 | Network during file loads | Pass. A HAR recorded across the loads in steps 3 to 5 has zero entries. |

## Fixes applied during the smoke

None to the viewer itself. Before the smoke, `index.html` pointed its favicon at a missing
`/favicon.svg`; the app now ships its own Valio mark there.

## Notes

- Ajv reports `next` only as a missing `handling`, because error items in the schema do not set
  `additionalProperties: false`. That is how the schema is written, not a viewer defect.
- The quote table uses the shadcn `Table`'s own `overflow-x-auto` container instead of
  `ScrollArea`. The shipped `ScrollArea` has only a vertical scrollbar, and the native container
  scrolls by keyboard and touch.
- Screenshots were taken for review only, are not linked here, and were not kept in the repo.
