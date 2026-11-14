---
phase: 2
title: "Skill: write the journal when done"
status: completed
effort: 1h
depends_on: [1]
---

# Phase 2: Skill writes the journal when done

## Context

- Phase 1 output: `references/journal.md`, `journal.schema.json`, `journal-example.json`.
- `skills/valio-aimo-purchasing/SKILL.md` (262 lines), `README.md`, `references/worked-example.md`.

## Files

Modify:

- `skills/valio-aimo-purchasing/SKILL.md`
- `skills/valio-aimo-purchasing/README.md`
- `skills/valio-aimo-purchasing/references/worked-example.md`

## Steps

1. In SKILL.md, add step `### 8. Write the journal` after "7. Report back". Content, kept to about
   15 lines:
   - Write it once, after your final report, for every task this skill handled: a purchase, a
     decision on a pending order, a cancel or replace, and a task that ended with no order or with an
     error you could not fix.
   - Path: `valio-aimo-journal/YYYY-MM-DD-HHMM-<slug>.json` in the working directory, local time
     Europe/Helsinki, `<slug>` from the title in kebab case, `-2`, `-3` on a collision. Never
     overwrite another journal.
   - Follow `references/journal.schema.json`; `references/journal.md` says where each field comes
     from and `references/journal-example.json` shows a full one.
   - Copy figures, ids and statuses from tool results. Use `null` for anything you do not know.
     Never write secrets.
   - Record the buyer's dialog answers, every refused call with its code, and why the chosen option
     won.
   - The server's audit trail is the record of truth; the journal is your account of the task.
   - Tell the buyer the file path in one line. If the buyer asked not to keep a journal, skip it and
     say `Journal skipped at the buyer's request.` If the host cannot write files, say so in one line
     and do not print the JSON instead.
2. Add one line to "Deciding an order over the spend limit" and "Cancelling or replacing an order":
   these tasks end with step 8 too, with `kind` `decision`, `cancel` or `replace`.
3. Add the three new references to the "References" list in SKILL.md.
4. README: add the files to "Files" and a short "Journals" note: where they are written and that
   they validate against the shipped schema.
5. `worked-example.md`: add a section `## 7. Journal` that shows the file name and points to
   `journal-example.json`, without copying the JSON.
6. Check SKILL.md stays under 300 lines and the frontmatter `description` still fits (add "and
   writes a JSON journal of each task" only if it stays readable).

## Validation

- `wc -l skills/valio-aimo-purchasing/SKILL.md` under 300.
- Every path the skill names exists: `rg -o 'references/[a-z.-]+' skills/valio-aimo-purchasing/SKILL.md`
  and check each file.
- `mise run check` (the phase 1 test still passes).

## Risks

- The step adds output the buyer did not ask for. Mitigation: one line naming the path, no JSON in chat.
- Agents may skip the step after a long approval flow. Mitigation: the cross-reference lines in
  the decision and cancel sections; the phase 3 live check covers the approval path.

## Rollback

Revert the three files; phase 1 files stay valid on their own.
