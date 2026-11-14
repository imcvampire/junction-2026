import type { ReactNode } from "react"
import journalSchema from "@skill-references/journal.schema.json"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import {
  CalendarDate,
  DateTime,
  EmptyNote,
  Field,
  JournalSection,
  Money,
  Num,
  Percent,
  Text,
  YesNo,
} from "../format"
import type { Option, ValioAimoJournal } from "../journal.types"

type Quote = ValioAimoJournal["quotes"][number]
type OptionField = keyof typeof journalSchema.$defs.option.properties

function HeaderCell({
  field,
  children,
}: {
  field: OptionField
  children: ReactNode
}) {
  const description = journalSchema.$defs.option.properties[field].description
  return (
    <TableHead>
      <Tooltip>
        <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-4">
          {children}
        </TooltipTrigger>
        <TooltipContent>{description}</TooltipContent>
      </Tooltip>
    </TableHead>
  )
}

function Requirements({ option }: { option: Option }) {
  const missing = option.missing_requirements ?? []
  return (
    <span className="flex flex-col gap-0.5">
      <YesNo value={option.meets_requirements} />
      {missing.length > 0 ? (
        <span className="text-xs text-muted-foreground">
          Missing {missing.join(", ")}
        </span>
      ) : null}
    </span>
  )
}

function OptionRow({ option, currency }: { option: Option; currency: string }) {
  return (
    <TableRow
      data-chosen={option.chosen || undefined}
      aria-label={`${option.name} (${option.product_id})${option.chosen ? ", chosen" : ""}`}
      className={cn(option.chosen && "bg-muted/50")}
    >
      <TableCell className="min-w-56 whitespace-normal">
        <div className="flex flex-col gap-1">
          <span className="font-medium">{option.name}</span>
          <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span className="font-mono">{option.product_id}</span>
            {option.brand ? <span>· {option.brand}</span> : null}
          </span>
          <span className="flex flex-wrap gap-1">
            {option.chosen ? <Badge>Chosen</Badge> : null}
            {option.cheapest_covering_option ? (
              <Badge variant="secondary">Cheapest covering</Badge>
            ) : null}
            {option.breaks_mandate ? (
              <Badge variant="destructive">Breaks mandate</Badge>
            ) : null}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Money value={option.line_total} currency={currency} />
      </TableCell>
      <TableCell>
        <YesNo value={option.covers_request} />
      </TableCell>
      <TableCell className="tabular-nums">{option.rank}</TableCell>
      <TableCell className="min-w-44 whitespace-normal">
        <span className="flex flex-col gap-0.5">
          <span>
            <Num value={option.quantity} /> {option.sales_unit ?? ""}
            {option.content_per_sales_unit
              ? ` × ${option.content_per_sales_unit}`
              : ""}
          </span>
          {option.conversion ? (
            <span className="font-mono text-xs text-muted-foreground">
              {option.conversion}
            </span>
          ) : null}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <Money value={option.unit_price} currency={currency} />
      </TableCell>
      <TableCell>
        <Requirements option={option} />
      </TableCell>
      <TableCell>
        <Percent value={option.delivery_reliability} />
      </TableCell>
      <TableCell>
        <Num value={option.co2_kg_total} suffix="kg" />
      </TableCell>
    </TableRow>
  )
}

function QuoteCard({ quote }: { quote: Quote }) {
  const options = [...quote.options].sort((a, b) => a.rank - b.rank)
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Field label="Quote">
          <span className="font-mono text-xs break-all">{quote.quote_id}</span>
        </Field>
        <Field label="Delivery date">
          <CalendarDate value={quote.delivery_date} />
        </Field>
        <Field label="Created">
          <DateTime value={quote.created_at} />
        </Field>
        <Field label="Expires">
          <DateTime value={quote.expires_at} />
        </Field>
        <Field label="Purpose">
          <Text value={quote.purpose} />
        </Field>
      </dl>
      {options.length === 0 ? (
        <EmptyNote>The quote has no options.</EmptyNote>
      ) : (
        <Table>
          <TableCaption>
            Options for quote {quote.quote_id}, prices in {quote.currency} excl.
            VAT.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <HeaderCell field="name">Product</HeaderCell>
              <HeaderCell field="line_total">Line total</HeaderCell>
              <HeaderCell field="covers_request">Covers</HeaderCell>
              <HeaderCell field="rank">Rank</HeaderCell>
              <HeaderCell field="quantity">Quantity</HeaderCell>
              <HeaderCell field="unit_price">Unit price</HeaderCell>
              <HeaderCell field="meets_requirements">Requirements</HeaderCell>
              <HeaderCell field="delivery_reliability">Reliability</HeaderCell>
              <HeaderCell field="co2_kg_total">CO₂-eq</HeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {options.map((option, index) => (
              <OptionRow
                key={index}
                option={option}
                currency={quote.currency}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function Decision({ decision }: { decision: ValioAimoJournal["decision"] }) {
  if (!decision) return <EmptyNote>No option was chosen.</EmptyNote>
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-[auto_1fr]">
      <Field label="Rule">
        <Badge variant="outline">{decision.rule}</Badge>
      </Field>
      <Field label="Reason">{decision.reason}</Field>
      <Field label="Chosen lines">
        {decision.chosen.length === 0 ? (
          "None"
        ) : (
          <ul className="flex flex-col gap-0.5">
            {decision.chosen.map((line, index) => (
              <li key={`${line.product_id}-${index}`}>
                <span className="font-mono text-xs">{line.product_id}</span> ×{" "}
                <Num value={line.quantity} />
                {line.substitute_for
                  ? `, substitutes ${line.substitute_for}`
                  : null}
              </li>
            ))}
          </ul>
        )}
      </Field>
    </dl>
  )
}

export function QuoteTables({ journal }: { journal: ValioAimoJournal }) {
  return (
    <JournalSection id="quotes" title="Quotes and decision">
      {journal.quotes.length === 0 ? (
        <EmptyNote>None</EmptyNote>
      ) : (
        journal.quotes.map((quote, index) => (
          <QuoteCard key={index} quote={quote} />
        ))
      )}
      <Decision decision={journal.decision} />
    </JournalSection>
  )
}
