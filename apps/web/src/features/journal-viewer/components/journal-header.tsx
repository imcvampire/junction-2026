import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

import { DateTime, Field, Money, Num, Text } from "../format"
import type { ValioAimoJournal } from "../journal.types"

type Outcome = ValioAimoJournal["outcome"]

const OUTCOME_VARIANT: Record<
  Outcome,
  "default" | "secondary" | "destructive" | "outline"
> = {
  placed: "default",
  approved: "default",
  pending_approval: "secondary",
  no_order: "outline",
  rejected: "destructive",
  cancelled: "destructive",
  failed: "destructive",
}

export function journalCurrency(journal: ValioAimoJournal): string {
  return journal.orders[0]?.currency ?? journal.quotes[0]?.currency ?? "EUR"
}

export function JournalHeader({ journal }: { journal: ValioAimoJournal }) {
  const { metrics, agent } = journal
  const currency = journalCurrency(journal)

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Kind: {journal.kind}</Badge>
          <Badge variant={OUTCOME_VARIANT[journal.outcome] ?? "outline"}>
            Outcome: {journal.outcome}
          </Badge>
        </div>
        <h2 className="font-heading text-2xl font-semibold break-words">
          {journal.title}
        </h2>
        <p className="text-muted-foreground">{journal.summary}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <Field label="Started">
          <DateTime value={journal.started_at} />
        </Field>
        <Field label="Finished">
          <DateTime value={journal.finished_at} />
        </Field>
        <Field label="Agent">
          <span className="font-mono text-xs break-all">{agent.agent_id}</span>
        </Field>
        <Field label="Customer">
          <span className="font-mono text-xs break-all">{agent.customer}</span>
        </Field>
        <Field label="Host">
          <Text value={agent.host} />
        </Field>
        <Field label="Model">
          <Text value={agent.model} />
        </Field>
      </dl>

      <Card size="sm">
        <CardContent>
          <dl
            aria-label="Metrics"
            className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6"
          >
            <Field label="Tool calls">
              <Num value={metrics.tool_calls} />
            </Field>
            <Field label="Quotes">
              <Num value={metrics.quotes} />
            </Field>
            <Field label="Buyer questions">
              <Num value={metrics.buyer_questions} />
            </Field>
            <Field label="Total excl. VAT">
              <Money value={metrics.total_excl_vat} currency={currency} />
            </Field>
            <Field label="CO₂-eq">
              <Num value={metrics.co2_kg_total} suffix="kg" />
            </Field>
            <Field label="Saving vs next option">
              <Money
                value={metrics.savings_vs_next_option_eur}
                currency="EUR"
              />
            </Field>
          </dl>
        </CardContent>
      </Card>
    </header>
  )
}
