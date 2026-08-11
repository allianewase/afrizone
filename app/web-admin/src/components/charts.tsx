import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/shadcn/chart'
import { formatNaira } from '../lib/format'

/**
 * Every chart in the admin lives in this one module so Recharts lands in a
 * single lazily-loaded chunk.
 *
 * That is not tidiness. Recharts is roughly 370kB, and DESIGN_SPEC 0.2 commits
 * to low data weight on a cheap phone on bad network. Importing it from the
 * pages directly put all of it in the initial bundle, ahead of the KPIs and
 * queues an admin actually opens the dashboard to read. The pages import these
 * through React.lazy instead, so the shell paints first and the charts stream in.
 *
 * All three are single series, so each uses one hue and carries no legend: the
 * card heading names the measure. --chart-1 is not the brand orange, because
 * Sea Buckthorn is 1.90:1 against a white card, under the 3:1 floor WCAG 1.4.11
 * sets for a meaningful graphic. See tokens.css.
 */

const CHART_AXIS_TICK = { fill: 'var(--muted)', fontSize: 11 } as const

/* ── Monthly spend: a trend over time, so an area chart ────────────────────── */

const SPEND_CONFIG = {
  spend: { label: 'Spend', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function SpendChart({ data }: { data: { month: string; spend: number }[] }) {
  return (
    <ChartContainer config={SPEND_CONFIG} className="h-[220px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <defs>
          <linearGradient id="spend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-spend)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-spend)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tick={CHART_AXIS_TICK}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatNaira(Number(v))} />} />
        <Area
          dataKey="spend"
          type="monotone"
          stroke="var(--color-spend)"
          strokeWidth={2}
          fill="url(#spend-fill)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ChartContainer>
  )
}

/* ── Spend by category, Reports: horizontal, because the names are long ────── */

const CATEGORY_CONFIG = {
  amount: { label: 'Spend', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function CategoryChart({
  data,
}: {
  data: { label: string; amount: number; pct: number }[]
}) {
  return (
    <ChartContainer config={CATEGORY_CONFIG} className="h-[240px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 44 }}>
        <CartesianGrid horizontal={false} stroke="var(--line)" />
        <YAxis
          dataKey="label"
          type="category"
          tickLine={false}
          axisLine={false}
          width={96}
          tick={CHART_AXIS_TICK}
        />
        <XAxis dataKey="amount" type="number" hide />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatNaira(Number(v))} />} />
        {/* The percentage is the one direct label; the naira amount is in the
            tooltip, so there is not a number on every mark. Radius on the data
            end only, so the bar stays anchored to its baseline. */}
        <Bar dataKey="amount" fill="var(--color-amount)" radius={[0, 4, 4, 0]} barSize={14}>
          <LabelList
            dataKey="pct"
            position="right"
            offset={8}
            fontSize={11}
            fill="var(--muted)"
            formatter={(v) => `${v}%`}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/* ── Spend by category, Dashboard: vertical columns ────────────────────────── */

const SPEND_BARS_CONFIG = {
  value: { label: 'Spend', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function CategoryBars({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ChartContainer config={SPEND_BARS_CONFIG} className="h-[200px] w-full">
      <BarChart data={data} margin={{ top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tick={CHART_AXIS_TICK}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatNaira(Number(v))} />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} maxBarSize={38} />
      </BarChart>
    </ChartContainer>
  )
}
