---
phase: 3
title: Secret trigger
status: completed
effort: 0.5h
---

# Phase 3: Secret trigger

## Hook (`use-secret-code.ts`)

`useSecretCode(code: string, onMatch: () => void)`:

- One `keydown` listener on `window`, removed on unmount.
- Ignore the event when `ctrlKey`, `metaKey` or `altKey` is held, when `key.length !== 1`, or when
  the target is an `input`, `textarea`, `select` or `isContentEditable` element.
- Keep a rolling buffer of the last `code.length` lowercase characters; reset it when more than
  2 s pass between keys. Call `onMatch` and clear the buffer when the buffer equals `code`.
- Keep `onMatch` in a ref so the listener is not re-bound on every render.

## Mount

In `AppShell` only, so it is active on every page except the game itself (the game renders over
the shell but the shell stays mounted; guard with the current pathname so typing on the game page
does nothing):

```ts
useSecretCode("tothemoon", () => {
  const tab = window.open("/to-the-moon", "_blank", "noopener")
  if (!tab) window.location.assign("/to-the-moon")
})
```

Note: with `noopener`, some browsers return `null` even when the tab opened. Use
`window.open(url, "_blank")` and then set `tab.opener = null` instead, so the null check means
"blocked".

Do not add a nav item, tooltip, or hint anywhere.

## Tests (`use-secret-code.test.tsx`)

- Typing the code with `userEvent.keyboard` on `document.body` calls `onMatch` once.
- The same keys typed into an `<input>` do not.
- A wrong character in the middle, or a 2 s gap (fake timers), does not match.
- Holding Meta does not match.

Run: `pnpm test src/features/to-the-moon/use-secret-code.test.tsx`.

Also extend `-app.test.tsx`: the Features nav contains exactly the Orders and Journal viewer links
and nothing pointing to `/to-the-moon`.
