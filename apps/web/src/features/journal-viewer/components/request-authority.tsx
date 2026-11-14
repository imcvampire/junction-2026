import { ChevronDownIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

import {
  CalendarDate,
  EmptyNote,
  Field,
  formatNumber,
  JournalSection,
  Money,
  Num,
  Text,
} from "../format"
import type { ValioAimoJournal } from "../journal.types"

function Tags({ tags }: { tags: string[] | undefined }) {
  if (!tags || tags.length === 0) return <>None</>
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((tag, index) => (
        <Badge key={index} variant="secondary">
          {tag}
        </Badge>
      ))}
    </span>
  )
}

function SearchesAndCandidates({
  searches,
  candidates,
}: Pick<ValioAimoJournal, "searches" | "candidates">) {
  return (
    <Collapsible className="flex flex-col gap-2">
      <CollapsibleTrigger
        render={
          <Button variant="outline" size="sm" className="w-fit">
            Searches ({searches.length}) and candidates ({candidates.length})
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        }
      />
      <CollapsibleContent className="flex flex-col gap-3 text-sm">
        {searches.length === 0 ? (
          <EmptyNote>No searches.</EmptyNote>
        ) : (
          <ul aria-label="Searches" className="flex flex-col gap-1">
            {searches.map((search, index) => (
              <li key={index} className="break-words">
                <q>{search.query}</q>, tags{" "}
                {search.required_tags.join(", ") || "none"}, excluded allergens{" "}
                {search.exclude_allergens.join(", ") || "none"}:{" "}
                <Num value={search.result_count} suffix="results" />
              </li>
            ))}
          </ul>
        )}
        {candidates.length === 0 ? (
          <EmptyNote>No candidates.</EmptyNote>
        ) : (
          <ul aria-label="Candidates" className="flex flex-col gap-1">
            {candidates.map((candidate, index) => (
              <li key={index} className="break-words">
                <span className="font-mono text-xs">
                  {candidate.product_id}
                </span>{" "}
                {candidate.name} ({candidate.source}):{" "}
                {candidate.kept ? (
                  "kept"
                ) : (
                  <>
                    dropped, <Text value={candidate.drop_reason} />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function RequestAuthority({ journal }: { journal: ValioAimoJournal }) {
  const { request, authority } = journal

  return (
    <JournalSection id="request" title="Request and authority">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Buyer request</CardTitle>
            <CardDescription>
              Verbatim, with how the agent read it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <blockquote className="border-l-2 pl-3 break-words whitespace-pre-line italic">
              {request.text}
            </blockquote>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Delivery date">
                <CalendarDate value={request.delivery_date} />
              </Field>
              <Field label="Amount">
                {request.amount ? (
                  `${formatNumber(request.amount.value)} ${request.amount.unit}`
                ) : (
                  <Num value={request.quantity} suffix="sales units" />
                )}
              </Field>
              <Field label="Requirements">
                <Tags tags={request.requirements} />
              </Field>
              <Field label="Purpose">
                <Text value={request.purpose} />
              </Field>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Agent authority</CardTitle>
            <CardDescription>
              The mandate the agent acted under.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Spend limit per order">
                <Money value={authority.spend_limit_eur} currency="EUR" />
              </Field>
              <Field label="Required tags">
                <Tags tags={authority.required_tags} />
              </Field>
              <Field label="Banned allergens">
                <Tags tags={authority.banned_allergens} />
              </Field>
            </dl>
          </CardContent>
        </Card>
      </div>
      <SearchesAndCandidates
        searches={journal.searches}
        candidates={journal.candidates}
      />
    </JournalSection>
  )
}
