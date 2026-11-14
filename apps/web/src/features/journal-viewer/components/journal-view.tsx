import type { ValioAimoJournal } from "../journal.types"
import { redactSecrets } from "../evidence"
import { PurchaseOutcome, TrustVerification } from "./dashboard"
import { JournalTimeline } from "./journal-timeline"
import { QuoteTables } from "./quote-table"
import { CustomerOrders, PurchasingDecisions } from "./customer-details"
import { ReportDownload } from "./report-download"
import { JournalSection } from "../format"
import { PurchaseStory } from "./purchase-story"

export function JournalView({ journal }: { journal: ValioAimoJournal }) {
  const safe = redactSecrets(journal)
  return (
    <article aria-label="Journal" className="flex min-w-0 flex-col gap-8">
      <div
        aria-label="Purchase overview and explanation"
        className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]"
      >
        <PurchaseOutcome journal={safe} />
        <PurchaseStory journal={safe} />
      </div>
      <JournalTimeline journal={safe} title="Purchasing Journey" />
      <QuoteTables journal={safe} />
      <PurchasingDecisions journal={safe} />
      <TrustVerification journal={safe} />
      <CustomerOrders journal={safe} />
      <JournalSection id="report" title="Download Purchase Report">
        <ReportDownload journal={safe} />
      </JournalSection>
    </article>
  )
}
