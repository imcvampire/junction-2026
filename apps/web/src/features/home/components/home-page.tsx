import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  BotIcon,
  BookOpenIcon,
  FileClockIcon,
  PackageSearchIcon,
  PlugIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TruckIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CodeBlock } from "@/features/home/components/code-block"
import {
  AGENT_INSTALL_PROMPT,
  type InstallTab,
  LIVE_ORIGIN,
  MCP_TABS,
  MCP_URL,
  REFERENCE_REQUEST,
  SKILL_ARCHIVE_URL,
  SKILL_TABS,
} from "@/features/home/install"

const FLOW = [
  {
    icon: PackageSearchIcon,
    title: "Search",
    body: "search_products narrows 17,000+ catalog items by name, tag, allergen and category.",
  },
  {
    icon: ReceiptIcon,
    title: "Quote",
    body: "quote fetches live customer prices and stock for a short list and converts litres into sales units.",
  },
  {
    icon: TruckIcon,
    title: "Order",
    body: "place_order buys at the quoted, fixed prices. No negotiation, no price drift.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Approve",
    body: "Orders over the spend limit wait for a human, who decides in the server's own form.",
  },
]

const FEATURES = [
  {
    icon: BadgeCheckIcon,
    title: "Rules enforced by the server",
    body: "Fixed prices, quote expiry, the spend limit and the company mandate are checked server-side. The agent cannot talk past them.",
  },
  {
    icon: SparklesIcon,
    title: "Good, better, best",
    body: "Options are ranked by deliverability, fit to requirements, line total and delivery reliability, with substitutes researched first.",
  },
  {
    icon: FileClockIcon,
    title: "Readable audit trail",
    body: "Every order carries a human-readable audit of what the agent did and why. Journals open in the journal viewer.",
  },
]

function InstallTabs({ tabs, label }: { tabs: InstallTab[]; label: string }) {
  return (
    <Tabs defaultValue={tabs[0].value}>
      <TabsList aria-label={label} className="max-w-full flex-wrap">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent
          key={tab.value}
          value={tab.value}
          className="flex flex-col gap-3 pt-1"
        >
          <p className="text-muted-foreground">{tab.intro}</p>
          <CodeBlock code={tab.code} label={`${tab.label} snippet`} />
        </TabsContent>
      ))}
    </Tabs>
  )
}

function Step({
  n,
  icon,
  title,
  children,
}: {
  n: number
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={`step-${n}`}
      className="relative flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-[#0b3d91] text-white shadow-sm">
          {icon}
        </span>
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Step {n}
          </p>
          <h3 id={`step-${n}`} className="font-heading text-lg font-semibold">
            {title}
          </h3>
        </div>
      </div>
      {children}
    </section>
  )
}

export function HomePage() {
  return (
    <div className="flex flex-col gap-20 pb-12">
      <section className="relative grid items-center gap-10 overflow-hidden rounded-3xl border bg-gradient-to-br from-[#eef3ff] via-background to-background p-6 sm:p-10 lg:grid-cols-[1.05fr_1fr] dark:from-[#0b3d91]/25">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-[#1d5bd8]/15 blur-3xl"
        />
        <div className="relative flex flex-col gap-6">
          <Badge variant="outline" className="gap-1.5 bg-background/70">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live at {new URL(LIVE_ORIGIN).host}
          </Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Let your purchasing agent buy from{" "}
            <span className="bg-gradient-to-r from-[#1d5bd8] to-[#0b3d91] bg-clip-text text-transparent dark:from-[#7aa6f5] dark:to-[#b9cdf3]">
              Valio Aimo
            </span>
          </h1>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            An open MCP server and an Agent Skill that let an autonomous agent
            find products, get live prices and stock, and place orders at fixed
            prices, with a human in the loop when it goes over its limit.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="#install"
              className={buttonVariants({ size: "lg", className: "px-4" })}
            >
              Install in 2 minutes
              <ArrowRightIcon data-icon="inline-end" />
            </a>
            <Link
              to="/orders"
              className={buttonVariants({
                size: "lg",
                variant: "outline",
                className: "px-4",
              })}
            >
              Open the order console
            </Link>
          </div>
          <dl className="grid max-w-md grid-cols-3 gap-4 pt-2">
            {[
              ["17k+", "products"],
              ["13", "MCP tools"],
              ["0", "keys needed"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd className="font-heading text-2xl font-semibold">{value}</dd>
                <dd className="text-xs text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <img
          src="/home/hero.svg"
          alt="A purchasing agent ordering milk from the Valio Aimo warehouse over MCP"
          width={640}
          height={420}
          className="relative w-full drop-shadow-xl"
        />
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-8">
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 id="how" className="font-heading text-3xl font-semibold">
            From inquiry to order
          </h2>
          <p className="text-muted-foreground">
            The same four steps the agent takes for the reference request:
          </p>
          <blockquote className="mt-2 border-l-4 border-[#1d5bd8] pl-4 text-lg italic">
            “{REFERENCE_REQUEST}”
          </blockquote>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((step, i) => (
            <li
              key={step.title}
              className="group relative flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#eef3ff] text-[#0b3d91] dark:bg-[#0b3d91]/30 dark:text-[#b9cdf3]">
                  <step.icon className="size-5" />
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  0{i + 1}
                </span>
              </div>
              <h3 className="font-heading font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="install"
        aria-labelledby="install-heading"
        className="flex scroll-mt-6 flex-col gap-8"
      >
        <div className="flex max-w-2xl flex-col gap-2">
          <h2
            id="install-heading"
            className="font-heading text-3xl font-semibold"
          >
            Install
          </h2>
          <p className="text-muted-foreground">
            Paste one prompt into your agent, or connect the MCP server and add
            the skill by hand. The server needs no key: in this proof of concept
            every client acts as one shared agent of the same company.
          </p>
        </div>

        <section
          aria-labelledby="agent-install"
          className="relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-[#1d5bd8]/30 bg-gradient-to-br from-[#eef3ff] to-card p-5 shadow-sm sm:p-6 dark:from-[#0b3d91]/30"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#0b3d91] text-white shadow-sm">
              <BotIcon className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Fastest
              </p>
              <h3
                id="agent-install"
                className="font-heading text-lg font-semibold"
              >
                Let your agent install it
              </h3>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Copy this prompt into Claude Code or any agent that can run shell
            commands. It adds the MCP server, installs the skill and checks
            both. Restart the session when it is done.
          </p>
          <CodeBlock code={AGENT_INSTALL_PROMPT} label="install prompt" />
        </section>

        <p className="text-sm font-medium text-muted-foreground">
          Or set it up by hand:
        </p>

        <div className="grid gap-6 lg:grid-cols-2">
          <Step
            n={1}
            icon={<PlugIcon className="size-5" />}
            title="Connect the MCP server"
          >
            <p className="text-sm text-muted-foreground">
              Streamable HTTP at{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {MCP_URL}
              </code>
              . Use a host that supports MCP elicitation, such as Claude Code,
              so approvals open the server's confirmation form.
            </p>
            <InstallTabs tabs={MCP_TABS} label="MCP host" />
          </Step>

          <Step
            n={2}
            icon={<BookOpenIcon className="size-5" />}
            title="Add the purchasing skill"
          >
            <p className="text-sm text-muted-foreground">
              The{" "}
              <a
                href={SKILL_ARCHIVE_URL}
                className="font-medium text-foreground underline underline-offset-4"
              >
                valio-aimo-purchasing
              </a>{" "}
              skill teaches the agent the procedure, the error table and the
              journal format. The server still enforces every rule.
            </p>
            <InstallTabs tabs={SKILL_TABS} label="Skill location" />
          </Step>
        </div>

        <Step
          n={3}
          icon={<SparklesIcon className="size-5" />}
          title="Ask for something"
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem] md:items-center">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Start a new session and check that{" "}
                <code className="font-mono text-xs">valio-aimo</code> shows as
                connected. Then paste the reference request:
              </p>
              <CodeBlock code={REFERENCE_REQUEST} label="reference request" />
              <p className="text-sm text-muted-foreground">
                Expect <code className="font-mono text-xs">whoami</code>, a
                product search, a quote of a short list, and an order. Over the
                spend limit it comes back pending approval, and you decide in
                the server's form. Review it later in the{" "}
                <Link
                  to="/orders"
                  className="text-foreground underline underline-offset-4"
                >
                  order console
                </Link>{" "}
                or open the agent's journal in the{" "}
                <Link
                  to="/journal-viewer"
                  className="text-foreground underline underline-offset-4"
                >
                  journal viewer
                </Link>
                .
              </p>
            </div>
            <img
              src="/home/approval.svg"
              alt="An order over the spend limit waiting for a human to approve or reject it"
              width={320}
              height={220}
              loading="lazy"
              className="mx-auto w-full max-w-xs"
            />
          </div>
        </Step>
      </section>

      <section aria-labelledby="why" className="flex flex-col gap-8">
        <h2 id="why" className="font-heading text-3xl font-semibold">
          Safe and open by design
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex flex-col gap-3 rounded-2xl border bg-gradient-to-b from-card to-muted/40 p-6"
            >
              <feature.icon className="size-6 text-[#1d5bd8] dark:text-[#7aa6f5]" />
              <h3 className="font-heading font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Built for Junction 2026, Valio Aimo challenge. The catalog is mock
          data for the event and is not accurate product information.
        </p>
      </section>
    </div>
  )
}
