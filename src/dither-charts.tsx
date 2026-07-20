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
  { id: "statDitherRequests", data: [18, 36, 28, 58, 46, 75, 62, 91], color: "blue", variant: "gradient" },
  { id: "statDitherCost", data: [12, 22, 19, 43, 35, 61, 56, 82], color: "green", variant: "dotted" },
  { id: "statDitherLatency", data: [70, 46, 62, 35, 55, 27, 42, 18], color: "orange", variant: "gradient" },
  { id: "statDitherErrors", data: [16, 44, 22, 65, 30, 52, 25, 38], color: "red", variant: "dotted" },
  { id: "statDitherTokens", data: [14, 27, 45, 38, 64, 57, 78, 88], color: "purple", variant: "gradient" },
  { id: "statDitherSessions", data: [24, 48, 31, 55, 42, 68, 53, 76], color: "orange", variant: "dotted" },
  { id: "statDitherTools", data: [20, 35, 30, 71, 48, 85, 59, 79], color: "purple", variant: "dotted" },
  { id: "statDitherTraces", data: [10, 29, 24, 47, 40, 66, 60, 84], color: "blue", variant: "gradient" },
] as const

export type WatchdogChartData = {
  requests: CartesianRow[]
  latency: CartesianRow[]
  statuses: StatusRow[]
  tools: CartesianRow[]
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

function renderStatDithers() {
  for (const dither of statDithers) {
    mount(dither.id, (
      <Sparkline
        data={[...dither.data]}
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
  renderStatDithers()
  mount("chartRequests", <RequestsChart data={data.requests} />)
  mount("chartLatency", <LatencyChart data={data.latency} />)
  mount("chartStatus", <StatusChart data={data.statuses} />)
  mount("chartTools", <ToolsChart data={data.tools} />)
}
