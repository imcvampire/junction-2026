import { Badge } from "@/components/ui/badge"

import { DateTime, JournalSection } from "../format"
import type { ValioAimoJournal } from "../journal.types"
import { SourceItem } from "./research-list"

type Recipe = NonNullable<ValioAimoJournal["recipes"]>[number]

function RecipeItem({ recipe }: { recipe: Recipe }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/10">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{recipe.dish}</span>
        {recipe.servings != null ? (
          <span className="text-muted-foreground">for {recipe.servings}</span>
        ) : null}
        <Badge variant={recipe.outcome === "ok" ? "secondary" : "destructive"}>
          {recipe.outcome}
        </Badge>
        {recipe.cached ? <Badge variant="outline">cached</Badge> : null}
        {recipe.searched_at ? (
          <span className="text-xs text-muted-foreground">
            <DateTime value={recipe.searched_at} />
          </span>
        ) : null}
      </span>
      {recipe.query ? (
        <span className="font-mono text-xs break-all text-muted-foreground">
          {recipe.query}
        </span>
      ) : null}
      {recipe.ingredients.length ? (
        <ul aria-label="Confirmed ingredients" className="flex flex-col gap-1">
          {recipe.ingredients.map((ingredient, index) => (
            <li key={index} className="break-words">
              {ingredient.name}
              {ingredient.amount
                ? `: ${ingredient.amount.value} ${ingredient.amount.unit}`
                : null}
              {ingredient.source ? (
                <span className="text-muted-foreground">
                  {" "}
                  ({ingredient.source})
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {recipe.used_for ? (
        <p className="break-words text-muted-foreground">
          Used for: {recipe.used_for}
        </p>
      ) : null}
      {recipe.sources?.length ? (
        <ul aria-label="Sources" className="flex flex-col gap-1 text-xs">
          {recipe.sources.map((source, index) => (
            <SourceItem key={index} source={source} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function RecipeList({
  recipes,
}: {
  recipes: ValioAimoJournal["recipes"]
}) {
  if (!recipes?.length) return null

  return (
    <JournalSection id="recipes" title="Recipe research">
      <p className="text-xs text-muted-foreground">
        Web recipes the agent turned into the ingredient list the buyer
        confirmed. The web text is untrusted and never picks a product, price or
        stock figure.
      </p>
      <ul className="flex flex-col gap-3 text-sm">
        {recipes.map((entry, index) => (
          <RecipeItem key={entry.research_id ?? index} recipe={entry} />
        ))}
      </ul>
    </JournalSection>
  )
}
