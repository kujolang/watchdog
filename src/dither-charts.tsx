import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { AreaChart } from "../components/dither-kit/area-chart"
import { Area } from "../components/dither-kit/area"
import { BarChart } from "../components/dither-kit/bar-chart"
import { Bar } from "../components/dither-kit/bar"
import type { ChartConfig } from "../components/dither-kit/chart-context"
import { Grid } from "../components/dither-kit/grid"
import { Legend } from "../components/dither-kit/legend"
import { PieChart } from "../components/dither-kit/pie-chart"
import { Pie } from "../components/dither-kit/pie"
import { Sparkline } from "../components/dither-kit/sparkline"
import { Tooltip } from "../components/dither-kit/tooltip"
import { XAxis } from "../components/dither-kit/x-axis"
import { YAxis } from "../components/dither-kit/y-axis"

type CartesianRow = { label: string; [key: string]: string | number }
type StatusRow = { name: string; value: number }

const statDithers = [
  { id: "statDitherRequests", metric: "requests", color: "blue", variant: "gradient" },
  { id: "statDitherCost", metric: "cost", color: "green", variant: "dotted" },
  { id: "statDitherLatency", metric: "latency", color: "orange", variant: "gradient" },
  { id: "statDitherErrors", metric: "errors", color: "red", variant: "dotted" },
  { id: "statDitherTokens", metric: "tokens", color: "purple", variant: "gradient" },
  { id: "statDitherSessions", metric: "sessions", color: "orange", variant: "dotted" },
  { id: "statDitherTools", metric: "tools", color: "purple", variant: "dotted" },
  { id: "statDitherTraces", metric: "traces", color: "blue", variant: "gradient" },
] as const

type StatMetric = typeof statDithers[number]["metric"]

export type WatchdogChartData = {
  requests: CartesianRow[]
  latency: CartesianRow[]
  statuses: StatusRow[]
  tools: CartesianRow[]
  statSparklines?: Partial<Record<StatMetric, number[]>>
}

const roots = new Map<string, Root>()

function mount(id: string, node: React.ReactNode) {
  const element = document.getElementById(id)
  if (!element) return
  let root = roots.get(id)
  if (!root) {
    root = createRoot(element)
    roots.set(id, root)
  }
  root.render(node)
}

const axisValue = (value: number) => Math.round(value).toLocaleString()

function renderStatDithers(series: Partial<Record<StatMetric, number[]>> = {}) {
  for (const dither of statDithers) {
    const data = series[dither.metric] || []
    mount(dither.id, (
      <Sparkline
        data={data.length ? data : [0]}
        color={dither.color}
        variant={dither.variant}
        bloom="low"
        className="watchdog-stat-sparkline"
      />
    ))
  }
}

function RequestsChart({ data }: { data: CartesianRow[] }) {
  const config: ChartConfig = {
    requests: { label: "Requests", color: "blue" },
    errors: { label: "Errors", color: "red" },
  }
  return (
    <AreaChart data={data} config={config} className="watchdog-dither-chart" bloom="low">
      <Grid />
      <Area dataKey="requests" variant="gradient" />
      <Area dataKey="errors" variant="dotted" />
      <XAxis dataKey="label" maxTicks={8} />
      <YAxis tickFormatter={axisValue} />
      <Legend />
      <Tooltip labelKey="label" />
    </AreaChart>
  )
}

function LatencyChart({ data }: { data: CartesianRow[] }) {
  const config: ChartConfig = { requests: { label: "Requests", color: "green" } }
  return (
    <BarChart data={data} config={config} className="watchdog-dither-chart" bloom="low">
      <Grid />
      <Bar dataKey="requests" variant="gradient" />
      <XAxis dataKey="label" maxTicks={3} />
      <YAxis tickFormatter={axisValue} />
      <Tooltip labelKey="label" />
    </BarChart>
  )
}

function StatusChart({ data }: { data: StatusRow[] }) {
  const config: ChartConfig = Object.fromEntries(
    data.map((row) => [row.name, {
      label: row.name,
      color: row.name.toLowerCase() === "success" ? "green" : "red",
    }])
  )
  return (
    <PieChart
      data={data}
      config={config}
      dataKey="value"
      nameKey="name"
      innerRadius={0.62}
      className="watchdog-dither-chart"
      bloom="low"
    >
      <Pie variant="gradient" />
      <Legend />
      <Tooltip />
    </PieChart>
  )
}

function ToolsChart({ data }: { data: CartesianRow[] }) {
  const config: ChartConfig = { calls: { label: "Calls", color: "purple" } }
  return (
    <BarChart data={data} config={config} className="watchdog-dither-chart" bloom="low">
      <Grid />
      <Bar dataKey="calls" variant="dotted" />
      <XAxis dataKey="label" maxTicks={3} />
      <YAxis tickFormatter={axisValue} />
      <Tooltip labelKey="label" valueFormatter={(value) => `${value.toLocaleString()} calls`} />
    </BarChart>
  )
}

export function renderCharts(data: WatchdogChartData) {
  renderStatDithers(data.statSparklines)
  mount("chartRequests", <RequestsChart data={data.requests} />)
  mount("chartLatency", <LatencyChart data={data.latency} />)
  mount("chartStatus", <StatusChart data={data.statuses} />)
  mount("chartTools", <ToolsChart data={data.tools} />)
}
