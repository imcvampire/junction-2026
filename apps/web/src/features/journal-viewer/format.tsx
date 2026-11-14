import type { ReactNode } from "react"

const LOCALE = "en-FI"
const TIME_ZONE = "Europe/Helsinki"

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
})
const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
})
const numberFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 })
const percentFormat = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  maximumFractionDigits: 1,
})

type Maybe<T> = T | null | undefined

export function isMissing<T>(value: Maybe<T>): value is null | undefined {
  return value === null || value === undefined
}

export function Unknown() {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">unknown</span>
    </>
  )
}

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
    }).format(value)
  } catch {
    return `${value} ${currency}`
  }
}

export function formatNumber(value: number): string {
  return numberFormat.format(value)
}

export function Money({
  value,
  currency,
}: {
  value: Maybe<number>
  currency: string
}) {
  if (isMissing(value)) return <Unknown />
  return <span className="tabular-nums">{formatMoney(value, currency)}</span>
}

export function Num({
  value,
  suffix,
}: {
  value: Maybe<number>
  suffix?: string
}) {
  if (isMissing(value)) return <Unknown />
  return (
    <span className="tabular-nums">
      {formatNumber(value)}
      {suffix ? ` ${suffix}` : null}
    </span>
  )
}

export function Percent({ value }: { value: Maybe<number> }) {
  if (isMissing(value)) return <Unknown />
  return <span className="tabular-nums">{percentFormat.format(value)}</span>
}

export function Text({ value }: { value: Maybe<string> }) {
  if (isMissing(value) || value === "") return <Unknown />
  return <>{value}</>
}

export function YesNo({ value }: { value: Maybe<boolean> }) {
  if (isMissing(value)) return <Unknown />
  return <>{value ? "Yes" : "No"}</>
}

function formatWith(format: Intl.DateTimeFormat, iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? iso : format.format(parsed)
}

export function DateTime({ value }: { value: Maybe<string> }) {
  if (isMissing(value)) return <Unknown />
  return (
    <time dateTime={value} title={value}>
      {formatWith(dateTimeFormat, value)}
    </time>
  )
}

export function CalendarDate({ value }: { value: Maybe<string> }) {
  if (isMissing(value)) return <Unknown />
  return (
    <time dateTime={value} title={value}>
      {formatWith(dateFormat, value)}
    </time>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

export function JournalSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  const headingId = `journal-section-${id}`
  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3"
    >
      <h3 id={headingId} className="font-heading text-lg font-semibold">
        {title}
      </h3>
      {children}
    </section>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}
