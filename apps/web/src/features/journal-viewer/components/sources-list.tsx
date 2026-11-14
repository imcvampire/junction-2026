import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"

import { formatNumber, JournalSection } from "../format"
import type { ValioAimoJournal } from "../journal.types"
import { productName, productNames } from "../plain-language"

type Research = NonNullable<ValioAimoJournal["research"]>[number]
type Recipe = NonNullable<ValioAimoJournal["recipes"]>[number]
type Source = { title?: string | null; url: string }

const OUTCOME: Record<Research["outcome"], { text: string; ok: boolean }> = {
  ok: { text: "Found", ok: true },
  not_configured: { text: "Web lookups are not set up", ok: false },
  unavailable: { text: "Web lookups were unavailable", ok: false },
  rate_limited: { text: "Skipped: too many lookups", ok: false },
}

export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null
  } catch {
    return null
  }
}

function siteName(source: Source): string {
  if (source.title) return source.title
  try {
    return new URL(source.url).hostname || source.url
  } catch {
    return source.url
  }
}

function Sites({ sources }: { sources: Source[] | undefined }) {
  if (!sources?.length) return null
  return (
    <ul aria-label="Sites" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {sources.map((source, index) => {
        const href = safeHttpUrl(source.url)
        const label = siteName(source)
        return (
          <li key={index} className="break-all">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {label}
              </a>
            ) : (
              <span>{label}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function SourceEntry({
  heading,
  outcome,
  usedFor,
  sources,
  children,
}: {
  heading: string
  outcome: Research["outcome"]
  usedFor: string | null | undefined
  sources: Source[] | undefined
  children?: ReactNode
}) {
  const label = OUTCOME[outcome] ?? { text: "Unknown", ok: false }
  return (
    <li className="flex flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/10">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium break-words">{heading}</span>
        <Badge variant={label.ok ? "secondary" : "outline"}>{label.text}</Badge>
      </span>
      {usedFor ? <p className="break-words">{usedFor}</p> : null}
      {children}
      <Sites sources={sources} />
    </li>
  )
}

function ingredientLine(ingredient: Recipe["ingredients"][number]): string {
  return ingredient.amount
    ? `${ingredient.name}: ${formatNumber(ingredient.amount.value)} ${ingredient.amount.unit}`
    : ingredient.name
}

export function SourcesList({ journal }: { journal: ValioAimoJournal }) {
  const research = journal.research ?? []
  const recipes = journal.recipes ?? []
  if (research.length === 0 && recipes.length === 0) return null
  const names = productNames(journal)

  return (
    <JournalSection id="sources" title="Sources the agent consulted">
      <p className="text-xs text-muted-foreground">
        Web pages can inform which product fits, but never set a price or what
        is in stock.
      </p>
      <ul className="flex flex-col gap-3 text-sm">
        {recipes.map((recipe, index) => (
          <SourceEntry
            key={`recipe-${index}`}
            heading={`Recipe for ${recipe.dish}${recipe.servings != null ? `, ${formatNumber(recipe.servings)} servings` : ""}`}
            outcome={recipe.outcome}
            usedFor={recipe.used_for ?? recipe.summary}
            sources={recipe.sources}
          >
            {recipe.ingredients.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  Ingredients the buyer confirmed
                </span>
                <ul className="list-disc pl-5">
                  {recipe.ingredients.map((ingredient, ingredientIndex) => (
                    <li key={ingredientIndex} className="break-words">
                      {ingredientLine(ingredient)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SourceEntry>
        ))}
        {research.map((entry, index) => (
          <SourceEntry
            key={`research-${index}`}
            heading={`Alternatives to ${productName(names, entry.product_id)}, for ${entry.purpose}`}
            outcome={entry.outcome}
            usedFor={entry.used_for ?? entry.summary}
            sources={entry.sources}
          />
        ))}
      </ul>
    </JournalSection>
  )
}
