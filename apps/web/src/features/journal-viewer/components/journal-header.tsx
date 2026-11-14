import {
  DateTime,
  Duration,
  Field,
  isMissing,
  Money,
  Num,
  ToneBadge,
} from "../format"
import type { ValioAimoJournal } from "../journal.types"
import { outcomeLabel } from "../plain-language"

export function journalCurrency(journal: ValioAimoJournal): string {
  return journal.orders[0]?.currency ?? journal.quotes[0]?.currency ?? "EUR"
}

export function JournalHeader({ journal }: { journal: ValioAimoJournal }) {
  const { metrics } = journal
  const currency = journalCurrency(journal)
  const figures = [
    isMissing(metrics.total_excl_vat) ? null : (
      <Field key="total" label="Total excl. VAT">
        <Money value={metrics.total_excl_vat} currency={currency} />
      </Field>
    ),
    isMissing(metrics.co2_kg_total) ? null : (
      <Field key="co2" label="Carbon footprint">
        <Num value={metrics.co2_kg_total} suffix="kg CO₂-eq" />
      </Field>
    ),
    isMissing(metrics.savings_vs_next_option_eur) ? null : (
      <Field key="saving" label="Saved versus the next option">
        <Money value={metrics.savings_vs_next_option_eur} currency="EUR" />
      </Field>
    ),
  ].filter(Boolean)

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <ToneBadge label={outcomeLabel(journal.outcome)} />
          <span>
            <DateTime value={journal.started_at} isoTitle={false} />
            {" · took "}
            <Duration
              started={journal.started_at}
              finished={journal.finished_at}
            />
          </span>
        </div>
        <h2 className="font-heading text-2xl font-semibold break-words">
          {journal.title}
        </h2>
        <p className="text-lg break-words">{journal.summary}</p>
      </div>
      {figures.length > 0 ? (
        <dl
          aria-label="Key figures"
          className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl p-4 text-sm ring-1 ring-foreground/10 sm:grid-cols-3"
        >
          {figures}
        </dl>
      ) : null}
    </header>
  )
}
