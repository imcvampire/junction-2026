import { useState, type ReactNode } from "react"
import {
  ArrowDownToLineIcon,
  CheckIcon,
  CopyIcon,
  ShieldCheckIcon,
  TrendingDownIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  CircleCheckIcon,
  CoinsIcon,
  InfoIcon,
  PackageIcon,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  approvalEvents,
  approvalRequired,
  businessText,
  friendlyTag,
  NOT_AVAILABLE,
  productNames,
  purchaseFacts,
  quantityLabel,
  redactSecrets,
  statusLabel,
  purchaseDisplayStatus,
} from "../evidence"
import { purchaseSafetyChecks } from "../safety-checks"
import {
  CalendarDate,
  DateTime,
  Field,
  formatMoney,
  formatNumber,
  JournalSection,
} from "../format"
import type { ValioAimoJournal } from "../journal.types"
import { ErrorsList } from "./errors-list"
import { OrdersList } from "./orders-list"
import { QuestionsList } from "./questions-list"
import { API_OPERATIONS } from "../journey"

export function Panel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-sm sm:p-6",
        className
      )}
    >
      {children}
    </div>
  )
}

export function Status({
  value,
  children,
  prominent = false,
}: {
  value?: string
  children?: ReactNode
  prominent?: boolean
}) {
  const good = ["approved", "shipped", "Passed"].includes(value ?? "")
  const bad = ["rejected", "approval_rejected", "failed", "Failed"].includes(
    value ?? ""
  )
  const pending = [
    "pending_approval",
    "approval_unknown",
    "Not Verified",
    "Needs Attention",
    "Needs attention",
  ].includes(value ?? "")
  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs leading-relaxed font-semibold whitespace-normal",
        good
          ? "status-success"
          : bad
            ? "status-error"
            : pending
              ? "status-warning"
              : value === "Cannot verify"
                ? "border-border bg-background text-muted-foreground"
                : "border-border bg-accent text-primary",
        prominent && "gap-2 px-4 py-2 text-sm font-medium"
      )}
    >
      {prominent && good ? (
        <CircleCheckIcon className="size-5 shrink-0" aria-hidden />
      ) : (
        <span
          className="size-1.5 shrink-0 rounded-full bg-current"
          aria-hidden
        />
      )}
      {children ??
        (value &&
        [
          "Passed",
          "Failed",
          "Cannot verify",
          "Needs Attention",
          "Not Verified",
          "Needs attention",
          "Cannot verify",
        ].includes(value)
          ? value
          : statusLabel(value ?? ""))}
    </span>
  )
}

export function CopyId({ value }: { value: string }) {
  const [state, setState] = useState("")
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1">
      <code className="text-xs break-all">{value}</code>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={`Copy ${value}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setState("Copied")
          } catch {
            setState("Copy unavailable")
          }
        }}
      >
        {state === "Copied" ? <CheckIcon /> : <CopyIcon />}
      </Button>
      <span role="status" className="text-xs text-muted-foreground">
        {state}
      </span>
    </span>
  )
}

function NextAction({ journal }: { journal: ValioAimoJournal }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-accent p-5 text-sm leading-relaxed">
      <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-primary">
        <ArrowRightIcon className="size-5 shrink-0" aria-hidden />
        What happens next?
      </h3>
      {journal.next_steps.length ? (
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {journal.next_steps.map((s, i) => (
            <li key={i}>{businessText(s, journal)}</li>
          ))}
        </ul>
      ) : journal.orders.some((o) => o.status === "pending_approval") ? (
        "The buyer still needs to approve or decline this purchase."
      ) : journal.orders.some((o) => o.status === "rejected") ? (
        "The purchase was rejected. No further action is recorded."
      ) : (
        "No further action is recorded. Confirmation from the wholesaler has not been verified."
      )}
    </div>
  )
}

function SummaryFact({
  label,
  icon: Icon,
  children,
  emphasized = false,
  className,
}: {
  label: string
  icon: LucideIcon
  children: ReactNode
  emphasized?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border p-4 sm:p-5",
        emphasized ? "border-primary/20 bg-accent/60" : "bg-background/60",
        className
      )}
    >
      <dt className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="size-4 shrink-0 text-primary" aria-hidden />
        {label}
      </dt>
      <dd className="space-y-1 text-base leading-snug font-semibold break-words">
        {children}
      </dd>
    </div>
  )
}

export function PurchaseOutcome({ journal }: { journal: ValioAimoJournal }) {
  const f = purchaseFacts(journal)
  const names = productNames(journal)
  const required = f.order ? approvalRequired(journal, f.order) : null
  return (
    <Panel className="border-t-4 border-t-primary">
      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
            Your purchase at a glance
          </p>
          <h2 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">
            {businessText(journal.title, journal)}
          </h2>
        </div>
        <div className="shrink-0">
          <Status prominent value={purchaseDisplayStatus(journal)} />
        </div>
      </div>
      <dl
        aria-label="Key purchase facts"
        className="my-6 grid gap-3 sm:grid-cols-2"
      >
        <SummaryFact
          label="Product selected"
          icon={PackageIcon}
          className="sm:col-span-2"
        >
          {journal.decision?.chosen.length
            ? journal.decision.chosen.map((l, i) => (
                <p key={i} className="font-medium">
                  {names.get(l.product_id) ?? "Product name not recorded"}
                </p>
              ))
            : "No product selected"}
        </SummaryFact>
        <SummaryFact label="Quantity" icon={PackageIcon}>
          {f.lines.length
            ? f.lines.map((l, i) => (
                <p key={i} className="font-medium">
                  {quantityLabel(l.option, l.quantity)}
                </p>
              ))
            : journal.decision?.chosen.length
              ? journal.decision.chosen.map((l, i) => (
                  <p key={i}>{quantityLabel(undefined, l.quantity)}</p>
                ))
              : NOT_AVAILABLE}
        </SummaryFact>
        <SummaryFact
          label="Expected delivery date"
          icon={CalendarDaysIcon}
          emphasized
        >
          {f.order?.delivery_date || journal.request.delivery_date ? (
            <CalendarDate
              value={f.order?.delivery_date ?? journal.request.delivery_date}
            />
          ) : (
            NOT_AVAILABLE
          )}
        </SummaryFact>
        <SummaryFact
          label="Total cost excluding VAT"
          icon={CoinsIcon}
          emphasized
        >
          <span className="text-3xl font-bold tracking-tight text-primary tabular-nums sm:text-4xl">
            {f.total !== null && f.currency
              ? formatMoney(f.total, f.currency)
              : NOT_AVAILABLE}
          </span>
        </SummaryFact>
        <SummaryFact
          label="Human approval needed"
          icon={ShieldCheckIcon}
          emphasized
        >
          <span
            className={cn(
              "inline-flex rounded-lg border px-3 py-1.5 text-base font-semibold",
              required === true ? "status-warning" : "border-border bg-card"
            )}
          >
            {required === null
              ? journal.orders.length > 1
                ? "See each purchase below"
                : NOT_AVAILABLE
              : required
                ? "Yes"
                : "No"}
          </span>
        </SummaryFact>
      </dl>
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-muted-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>Requested / quoted date; delivery not confirmed</p>
      </div>
      <p className="mb-4 text-sm leading-relaxed">
        {businessText(journal.summary, journal)}
      </p>
      <NextAction journal={journal} />
      <p className="mt-4 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
        Buyer approval authorizes the purchase. It does not confirm acceptance
        or delivery by the wholesaler.
      </p>
    </Panel>
  )
}

export function DashboardMetrics({ journal }: { journal: ValioAimoJournal }) {
  const f = purchaseFacts(journal)
  const metrics: [string, ReactNode, string][] = [
    [
      "Total Cost",
      f.total !== null && f.currency
        ? formatMoney(f.total, f.currency)
        : NOT_AVAILABLE,
      "Excluding VAT",
    ],
    [
      "Money Saved",
      f.savings !== null && f.quote
        ? formatMoney(f.savings, f.quote.currency)
        : NOT_AVAILABLE,
      "Compared with the next suitable product",
    ],
    [
      "Products Compared",
      f.considered === null ? NOT_AVAILABLE : String(f.considered),
      "Products considered by your assistant",
    ],
    [
      "Order Status",
      <Status key="status" value={f.order?.status ?? journal.outcome} />,
      "Latest status in this purchase record",
    ],
  ]
  return (
    <dl
      aria-label="Purchase summary cards"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {metrics.map(([label, value, hint]) => (
        <div
          key={label}
          className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5"
        >
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd
            className={cn(
              "text-2xl font-semibold tracking-tight text-primary tabular-nums",
              value === NOT_AVAILABLE &&
                "text-sm font-normal text-muted-foreground"
            )}
          >
            {value}
          </dd>
          <dd className="text-xs leading-relaxed text-muted-foreground">
            {hint}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function AuthorityApproval({ journal }: { journal: ValioAimoJournal }) {
  const { authority } = journal
  return (
    <JournalSection id="approval" title="Purchase Approval">
      <Panel>
        <p className="text-sm leading-relaxed">
          {authority.spend_limit_eur === null ? (
            "The automatic purchasing limit is not recorded."
          ) : (
            <>
              Your purchasing assistant can automatically spend up to{" "}
              <strong>{formatMoney(authority.spend_limit_eur, "EUR")}</strong>{" "}
              per order.
            </>
          )}
        </p>
        {!journal.orders.length && (
          <p className="mt-4 text-sm text-muted-foreground">
            No purchase or approval decision recorded.
          </p>
        )}
        {journal.orders.map((o, index) => {
          const required = approvalRequired(journal, o)
          const difference =
            authority.spend_limit_eur !== null && o.currency === "EUR"
              ? Math.max(0, o.total - authority.spend_limit_eur)
              : null
          const events = approvalEvents(journal, o)
          const at = events.length === 1 ? events[0].at : undefined
          return (
            <div key={o.order_id} className="mt-5 rounded-xl border p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {journal.orders.length > 1
                    ? `Purchase ${index + 1}`
                    : "Buyer decision"}
                </p>
                <Status
                  value={
                    o.decision?.decision ??
                    (required ? "pending_approval" : "no_order")
                  }
                >
                  {o.decision
                    ? o.decision.decision === "approved"
                      ? "Approved"
                      : "Rejected"
                    : required
                      ? "Awaiting a recorded decision"
                      : "No approval decision recorded"}
                </Status>
              </div>
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Automatic purchasing limit">
                  {authority.spend_limit_eur === null
                    ? NOT_AVAILABLE
                    : formatMoney(authority.spend_limit_eur, "EUR")}
                </Field>
                <Field label="Total purchase value">
                  {formatMoney(o.total, o.currency)}
                </Field>
                <Field label="Approval needed">
                  {required === null ? "Not verified" : required ? "Yes" : "No"}
                </Field>
                <Field label="Who approved?">
                  {o.decision?.decision === "approved"
                    ? "Buyer’s name not recorded"
                    : "No approver recorded"}
                </Field>
                <Field label="Approval reason">
                  {o.decision?.reason || NOT_AVAILABLE}
                </Field>
                <Field label="Approval time">
                  {at ? <DateTime value={at} /> : NOT_AVAILABLE}
                </Field>
              </dl>
              {difference !== null && difference > 0 && (
                <p className="mt-4 text-sm">
                  This purchase exceeds the automatic limit by{" "}
                  <strong>{formatMoney(difference, "EUR")}</strong>.
                </p>
              )}
              {o.decision?.confirmed_via === "mcp_elicitation" && (
                <p className="mt-3 text-sm text-muted-foreground">
                  The decision was recorded through buyer confirmation. The
                  buyer’s identity is not included in this record.
                </p>
              )}
              {o.decision?.confirmed_via === "rest" && (
                <p className="mt-3 text-sm text-muted-foreground">
                  The decision was recorded by the purchasing system. It does
                  not identify who gave the confirmation.
                </p>
              )}
            </div>
          )
        })}
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-medium text-primary">
            Purchasing Permissions & Restrictions
          </summary>
          <dl className="mt-4 grid gap-4 rounded-lg bg-accent p-4 sm:grid-cols-3">
            <Field label="Required product features">
              {authority.required_tags.map(friendlyTag).join(", ") ||
                "None recorded"}
            </Field>
            <Field label="Buyer requirements">
              {journal.request.requirements.map(friendlyTag).join(", ") ||
                "None recorded"}
            </Field>
            <Field label="Allergen restrictions">
              {authority.banned_allergens.join(", ") || "None recorded"}
            </Field>
          </dl>
        </details>
      </Panel>
    </JournalSection>
  )
}

export function TrustVerification({ journal }: { journal: ValioAimoJournal }) {
  const [checked, setChecked] = useState(false)
  const results = checked ? purchaseSafetyChecks(journal) : null
  return (
    <JournalSection id="safety" title="Purchase Safety Checks">
      <Panel>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="max-w-xl">
            <p className="flex items-center gap-2 font-medium text-primary">
              <ShieldCheckIcon className="size-5" />A clearer view of your
              purchase
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Check prices, quantities and approvals against the information in
              this file. These checks cannot confirm what happened outside the
              record.
            </p>
          </div>
          <Button onClick={() => setChecked(true)}>
            <ShieldCheckIcon />
            Check Purchase Record
          </Button>
        </div>
        {!results && (
          <p className="mt-5 text-sm text-muted-foreground">
            Checks have not been run yet.
          </p>
        )}
        {results && (
          <div
            role="status"
            aria-label="Purchase safety results"
            className="mt-6 grid gap-3 sm:grid-cols-2"
          >
            {results.map((r) => (
              <div key={r.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-medium">{r.label}</h4>
                  <Status value={r.status} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {r.detail}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </JournalSection>
  )
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function TechnicalAudit({ journal }: { journal: ValioAimoJournal }) {
  const safe = redactSecrets(journal)
  const f = purchaseFacts(safe)
  const [exportError, setExportError] = useState("")
  function exportFile(summary: boolean) {
    try {
      const text = summary
        ? [
            businessText(safe.title, safe),
            businessText(safe.summary, safe),
            businessText(safe.narrative.what_happened, safe),
            businessText(safe.narrative.why, safe),
            ...safe.orders.map(
              (o) =>
                `${statusLabel(o.status)}; ${formatMoney(o.total, o.currency)} excluding VAT; buyer decision: ${o.decision?.decision ?? "not recorded"}; reason: ${o.decision?.reason || "not recorded"}`
            ),
            "Wholesaler confirmation and human identity are not recorded.",
            ...purchaseSafetyChecks(safe).map(
              (r) => `${r.label}: ${r.status}. ${r.detail}`
            ),
            "Next steps:",
            ...safe.next_steps.map((s) => businessText(s, safe)),
          ].join("\n\n")
        : JSON.stringify(safe, null, 2)
      download(
        summary ? "purchase-summary.txt" : "purchasing-journal.json",
        text,
        summary ? "text/plain" : "application/json"
      )
      setExportError("")
    } catch {
      setExportError("Export is unavailable in this browser.")
    }
  }
  return (
    <JournalSection id="advanced" title="Advanced Technical Details">
      <details className="rounded-2xl border bg-card p-5 sm:p-6">
        <summary className="cursor-pointer font-medium text-primary">
          Open Advanced Technical Details
        </summary>
        <div className="mt-5 flex min-w-0 flex-col gap-6">
          <p className="text-sm text-muted-foreground">
            Developer references and the original recorded data. Common
            credential patterns are redacted. Full call arguments, results,
            human identity and wholesaler acknowledgements are not included in
            this journal format.
          </p>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Agent ID">
              <CopyId value={safe.agent.agent_id} />
            </Field>
            <Field label="Customer ID">
              <CopyId value={safe.agent.customer} />
            </Field>
            <Field label="System Activities">{safe.metrics.tool_calls}</Field>
            <Field label="Activity duration">
              {f.duration === null
                ? NOT_AVAILABLE
                : `${Math.floor(f.duration / 60)}m ${Math.round(f.duration % 60)}s`}
            </Field>
            <Field label="Started">
              <DateTime value={safe.started_at} />
            </Field>
            <Field label="Completed">
              <DateTime value={safe.finished_at} />
            </Field>
            <Field label="Estimated Carbon Footprint">
              {safe.metrics.co2_kg_total == null
                ? NOT_AVAILABLE
                : `${formatNumber(safe.metrics.co2_kg_total)} kg`}
            </Field>
            <Field label="Human approval requests">
              {safe.orders.filter(
                (o) =>
                  o.approval_reasons.length || o.status === "pending_approval"
              ).length || NOT_AVAILABLE}
            </Field>
          </dl>
          <div className="grid gap-4 md:grid-cols-2">
            {safe.quotes.map((q, i) => (
              <dl key={i} className="space-y-3 rounded-xl border p-4 text-sm">
                <Field label="Quote ID">
                  <CopyId value={q.quote_id} />
                </Field>
                <Field label="Created">
                  <DateTime value={q.created_at} />
                </Field>
                <Field label="Expires">
                  <DateTime value={q.expires_at} />
                </Field>
              </dl>
            ))}
            {safe.orders.map((o, i) => (
              <dl key={i} className="space-y-3 rounded-xl border p-4 text-sm">
                <Field label="Order ID">
                  <CopyId value={o.order_id} />
                </Field>
                <Field label="Associated quote">
                  {o.quote_id ?? NOT_AVAILABLE}
                </Field>
                <Field label="Recorded deciding agent">
                  {o.decision?.decided_by ?? NOT_AVAILABLE}
                </Field>
                <Field label="Confirmation mechanism">
                  {o.decision?.confirmed_via ?? NOT_AVAILABLE}
                </Field>
              </dl>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => exportFile(false)}>
              <ArrowDownToLineIcon />
              Export purchase record
            </Button>
            <Button variant="outline" onClick={() => exportFile(true)}>
              <ArrowDownToLineIcon />
              Export summary
            </Button>
          </div>
          {exportError && <p role="alert">{exportError}</p>}
          <h4 className="font-medium text-primary">
            Detailed Activity History
          </h4>
          <ol aria-label="Raw event sequence" className="space-y-3">
            {[...safe.timeline]
              .sort((a, b) => a.seq - b.seq)
              .map((e, i) => (
                <li key={i} className="min-w-0 rounded-lg border p-4 text-sm">
                  <p className="font-medium">
                    {e.seq}. {e.title}
                  </p>
                  <p className="mt-2 text-xs break-all text-muted-foreground">
                    Corresponding API operation (reference):{" "}
                    {e.tool
                      ? (API_OPERATIONS[e.tool] ?? "Not recorded")
                      : "Not recorded"}
                  </p>
                  <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-background p-3 text-xs break-all whitespace-pre-wrap">
                    {JSON.stringify(e, null, 2)}
                  </pre>
                </li>
              ))}
          </ol>
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Searches and candidates
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto text-xs break-all whitespace-pre-wrap">
              {JSON.stringify(
                { searches: safe.searches, candidates: safe.candidates },
                null,
                2
              )}
            </pre>
          </details>
          <QuestionsList questions={safe.questions} />
          <OrdersList orders={safe.orders} />
          <ErrorsList errors={safe.errors} />
          <details className="min-w-0 rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Raw JSON viewer (credential patterns redacted)
            </summary>
            <pre className="mt-4 max-h-[36rem] overflow-auto text-xs leading-relaxed break-all whitespace-pre-wrap">
              {JSON.stringify(safe, null, 2)}
            </pre>
          </details>
        </div>
      </details>
    </JournalSection>
  )
}

export function SelectionExplanation({
  journal,
}: {
  journal: ValioAimoJournal
}) {
  const rules = {
    cheapest_covering: "Lowest-priced suitable option",
    buyer_choice: "Buyer’s choice",
    split: "Selected across multiple products",
    no_order: "No purchase selected",
  }
  return (
    <div className="rounded-xl border bg-accent p-5">
      <h4 className="flex items-center gap-2 font-semibold text-primary">
        <TrendingDownIcon className="size-5" />
        Why This Product Was Chosen
      </h4>
      <p className="mt-3 text-sm leading-relaxed">
        {journal.decision
          ? businessText(journal.decision.reason, journal)
          : "No product selection or reason recorded."}
      </p>
      {journal.decision && (
        <p className="mt-2 text-sm font-medium text-primary">
          {rules[journal.decision.rule]}
        </p>
      )}
    </div>
  )
}
