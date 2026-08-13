import { AreaChart, Area } from '@/components/charts/area-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { Bar } from '@/components/charts/bar'
import { Grid } from '@/components/charts/grid'
import { XAxis } from '@/components/charts/x-axis'
import { BarXAxis } from '@/components/charts/bar-x-axis'
import { BarYAxis } from '@/components/charts/bar-y-axis'
import { ChartTooltip } from '@/components/charts/tooltip'
import { RingChart } from '@/components/charts/ring-chart'
import { Ring } from '@/components/charts/ring'
import { RingCenter } from '@/components/charts/ring-center'
import type { ReportsSummary } from '../api/types'

/**
 * Every chart composition in the admin, built on the bklit primitives vendored
 * into `components/charts/`.
 *
 * This module is the lazy-loading boundary: bklit pulls in visx and Motion, so
 * the pages import these through React.lazy and the shell paints without
 * waiting on a charting library. DESIGN_SPEC 0.2 commits to low data weight on
 * a cheap phone on bad network.
 *
 * Named `chart-views` rather than `charts` on purpose: `components/charts/` is
 * bklit's vendored primitives, and two modules resolving from the same specifier
 * would be a trap for the next person.
 *
 * Colours come from `--chart-line-primary`, which tailwind.css points at
 * `--chart-1`. That is not the brand orange: Sea Buckthorn is 1.90:1 against a
 * white card, below the 3:1 floor WCAG 1.4.11 sets for a meaningful graphic.
 * See tokens.css.
 *
 * All four are single series, so each carries one hue and no legend; the card
 * heading names the measure.
 */

const PRIMARY = 'var(--chart-line-primary)'

/**
 * bklit defaults every chart to `margin: 40` on all four sides, which is far too
 * much inside a card that already has 22px of padding: on a 693px card at 5/2 it
 * left a ~197px plot inside a 277px box, with 80px of width gone as well.
 *
 * The values below come from how bklit lays the axes out rather than from taste.
 * Both XAxis and BarXAxis position their labels at `bottom: 12` of the whole
 * container, so `margin.bottom` is what stops the plot colliding with them.
 * BarYAxis renders its category labels in a column whose width *is*
 * `margin.left`, so that one has to be wide enough for real category names.
 */
const PLOT_MARGIN = { top: 12, right: 12, bottom: 32, left: 12 }
const HORIZONTAL_MARGIN = { top: 8, right: 16, bottom: 12, left: 112 }

/**
 * bklit types every chart's `data` as `Record<string, unknown>[]`, and a TS
 * interface has no index signature, so our precise row types are not assignable
 * to it even though the shapes are compatible. This is the one cast, kept at the
 * boundary so the call sites stay typed.
 */
const rows = (d: readonly object[]) => d as unknown as Record<string, unknown>[]

/* ── Time series ───────────────────────────────────────────────────────────────
   Keyed on `monthStart`, not the `month` label. bklit's time-series shell builds
   a visx scaleTime and coerces the x value with `new Date(value)`, so it needs a
   real date. The label alone could not order a rolling six-month window that
   crosses a year boundary. See the monthKey helper in server/routes/reports.ts. */

export function SpendChart({ data }: { data: ReportsSummary['spendByMonth'] }) {
  return (
    <AreaChart
      data={rows(data)}
      xDataKey="monthStart"
      className="chart-h-240"
      margin={PLOT_MARGIN}
    >
      <Grid horizontal />
      <Area dataKey="spend" fill={PRIMARY} />
      <XAxis />
      <ChartTooltip />
    </AreaChart>
  )
}

/**
 * Fill-rate trend. The server has computed this all along and nothing rendered
 * it, so it never reached a screen. It is a truer time series than monthly
 * spend: a rate per monthly task-creation cohort.
 */
export function FillRateTrendChart({ data }: { data: ReportsSummary['fillRateTrend'] }) {
  return (
    <AreaChart
      data={rows(data)}
      xDataKey="monthStart"
      className="chart-h-240"
      margin={PLOT_MARGIN}
    >
      <Grid horizontal />
      <Area dataKey="rate" fill={PRIMARY} />
      <XAxis />
      <ChartTooltip />
    </AreaChart>
  )
}

/* ── Categorical magnitude ─────────────────────────────────────────────────── */

/** Horizontal, because the category names are long enough to collide on an x-axis. */
export function CategoryChart({ data }: { data: ReportsSummary['spendByCategory'] }) {
  return (
    <BarChart
      data={rows(data)}
      xDataKey="label"
      orientation="horizontal"
      className="chart-h-240"
      margin={HORIZONTAL_MARGIN}
    >
      <Grid vertical />
      <Bar dataKey="amount" fill={PRIMARY} lineCap="round" />
      <BarYAxis />
      <ChartTooltip />
    </BarChart>
  )
}

/**
 * Dashboard's version of the same measure, vertical because it sits in a
 * narrower card beside the fill-rate ring.
 *
 * One hue, not one per bar. These rows carry a `tone` field that the old CSS
 * version used to colour each category differently. That was a second encoding
 * carrying no information, since height already encodes magnitude, and it did
 * not survive validation: two of its five tones resolved to the same hex and a
 * third sat below the 3:1 graphic floor.
 */
export function CategoryBars({ data }: { data: { label: string; value: number }[] }) {
  return (
    <BarChart
      data={rows(data)}
      xDataKey="label"
      className="chart-h-200"
      margin={PLOT_MARGIN}
    >
      <Grid horizontal />
      <Bar dataKey="value" fill={PRIMARY} lineCap="round" />
      <BarXAxis />
      <ChartTooltip />
    </BarChart>
  )
}

/* ── Fill rate ─────────────────────────────────────────────────────────────── */

/**
 * A ring, and deliberately a meter rather than a two-slice pie. Fill rate is a
 * single ratio against a limit, so the ring itself carries the whole value; the
 * old "Filled / Open" swatch legend invited the reader to compare two
 * categories that are really one value and its remainder.
 *
 * `value`/`maxValue` are the percentage against 100 rather than the raw counts,
 * so the ring sweep and the centred figure are the same number. The counts stay
 * as plain text underneath.
 *
 * bklit renders no meter semantics of its own, so the wrapper carries them.
 */
export function FillRateMeter({
  pct,
  filled,
  open,
}: {
  pct: number
  filled: number
  open: number
}) {
  return (
    <div className="donut-wrap">
      <div
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Task fill rate: ${pct} percent`}
      >
        <RingChart
          data={[{ label: 'filled', value: pct, maxValue: 100, color: PRIMARY }]}
          size={150}
          strokeWidth={14}
          baseInnerRadius={48}
        >
          <Ring index={0} lineCap="round" />
          <RingCenter defaultLabel="filled" suffix="%" />
        </RingChart>
      </div>
      <p className="meter-note">
        <b className="tnum">{filled}</b> filled of <b className="tnum">{filled + open}</b> slots
      </p>
    </div>
  )
}
