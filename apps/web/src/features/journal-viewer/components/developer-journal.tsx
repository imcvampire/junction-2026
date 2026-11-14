import { useState } from "react"
import type { ValioAimoJournal } from "../journal.types"
import { redactSecrets, verifyPurchase } from "../evidence"
import {
  AuthorityApproval,
  DashboardMetrics,
  Panel,
  TechnicalAudit,
} from "./dashboard"
import { JournalPicker } from "./journal-picker"
import { LoadError } from "./load-error"
import type { JournalLoadResult } from "../parse-journal"

export function DeveloperJournal({
  initialJournal,
}: {
  initialJournal?: ValioAimoJournal
}) {
  const [result, setResult] = useState<JournalLoadResult | null>(
    initialJournal ? { ok: true, journal: initialJournal } : null
  )
  const [fileName, setFileName] = useState("")
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-primary">
        Developer Purchase Audit
      </h1>
      <p className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
        For development and administrative review. This separate route has no
        authentication or access control and is not a security boundary. Open a
        local purchase record to inspect its technical evidence.
      </p>
      <JournalPicker
        onLoad={(next, name) => {
          setResult(next)
          setFileName(name)
        }}
      />
      {result && !result.ok && (
        <LoadError error={result.error} fileName={fileName} technical />
      )}
      {result?.ok && (
        <>
          <DashboardMetrics journal={redactSecrets(result.journal)} />
          <AuthorityApproval journal={redactSecrets(result.journal)} />
          <Panel>
            <h2 className="font-semibold text-primary">
              Technical Validation Results
            </h2>
            <ul className="mt-4 space-y-3">
              {verifyPurchase(redactSecrets(result.journal)).map((check) => (
                <li key={check.id} className="text-sm">
                  <strong>
                    {check.label}: {check.status}
                  </strong>
                  <p className="mt-1 text-muted-foreground">{check.detail}</p>
                </li>
              ))}
            </ul>
          </Panel>
          <TechnicalAudit journal={redactSecrets(result.journal)} />
        </>
      )}
    </div>
  )
}
