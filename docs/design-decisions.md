# Design decisions

Why the values in `tokens.css` and `theme.ts` are what they are.

This exists so the source files can carry one-line comments instead of essays,
and so nobody "corrects" a value back to something that fails. Several of these
look wrong until you know the measurement.

Every contrast figure here was computed, not judged. Chart palettes were run
through a validator. Where a figure is quoted, it is reproducible.

---

## Surfaces: "Warm Refined"

| token | value | |
|---|---|---|
| `--bg` | `#FAF9F6` | page ground, 29% saturation |
| `--bg2` | `#F4F2EC` | recessed: quiet pill fills, hover wells |
| `--surface` | `#FFFFFF` | cards, panels, tables |
| `--text` | `#1C1917` | 16.61:1 on `--bg` |
| `--muted` | `#57534E` | 7.25:1, near-neutral at 5% saturation |
| `--faint` | `#706963` | 5.13:1, clears 4.5 on all three grounds |

The first light build used the showcase's sand values directly: `#FBF5EC` at
**65% saturation** with `--muted` at `#5F5344`, a brown at 17%. Rendered, that
read as hospitality rather than finance. Warm cream surfaces and brown-grey body
text are the two clearest dated tells in a dashboard.

This keeps the warm cast DESIGN_SPEC 0.3 asks for and drops saturation to 29%,
with a near-neutral grey ramp. Cool-neutral and navy-forward alternatives were
rendered side by side and rejected in favour of keeping the brand's character.

The showcase's own neutral ramp was **not** adopted verbatim: its `--text-muted`
reached only 4.76:1 and its `--text-faint` failed outright at 2.82:1. Each tier
moved one step darker. Do not reinstate `#A2917C` from the showcase.

## The navigation rail is navy, and not `#000066`

`--rail: #0A1140`, the one dark surface in a light app.

A sand rail was tried first and read as washed out. The cause was the whole warm
family rather than the tone picked: every value in it sits within a few percent
luminance of every other, so a sand rail against the sand page separated at
**1.10:1**, and white would have been **1.084:1**. The family could not do it.

Navy separates at **17.1:1**, and DESIGN_SPEC 1.3 already lists navy for dark
surfaces, so this is sanctioned rather than invented. It also gives Sea Buckthorn
a dark ground to be an accent against, which is what it was designed for.

It is `#0A1140` rather than the brand's `#000066` because a fully saturated pure
blue-violet reads harsh across a full-height panel. `#000066` stays exact on the
logo mark, which is the split between a mark colour and a UI palette.

The **topbar stays light on purpose**. Dark left rail plus light top bar is the
familiar shape; darkening both walls the content in.

Rail text uses `--rail-*` tokens. Using `--muted` or `--text` inside the rail
renders dark on dark.

## Ink variants exist because the brand fills fail as text

| ink | value | replaces |
|---|---|---|
| `--money-ink` | `#15794F` | `--money` `#1F9D6B`, 3.45:1 on white |
| `--danger-ink` | `#A6362C` | `--danger` `#C8453A` |
| `--gold-ink` | `#8A5A0F` | Sea Buckthorn `#FBAC34`, **1.90:1 on white** |

The fills stay exactly as `design-system.html` defines them, because mobile uses
the same values and DESIGN_SPEC 0.4 requires one status language across both
apps. Only type uses the darkened pairs. `--indigo` (6.62:1) and `--pending`
(7.60:1) need no variant.

This is the single most common defect this palette had: a brand fill used as
small text on a tint of itself. It appeared eleven times across the two apps.

## Pending is violet, not amber

`--pending: #6B3F94`.

Sea Buckthorn is the action colour used for `Active`, and amber sat close enough
to it that the two statuses read as one signal. Violet clears the nearest other
status hue by **53 degrees**.

Slate and steel were tried and rejected: both landed within **10 degrees** of
`--indigo-600`, which would have made Pending indistinguishable from Review.

`--amber-500` survives for genuine warnings, which is most of its call sites
(banners, contract alerts, disputed timesheets). It is no longer a status colour.

## Chart colours are sequential, not categorical

`--chart-1: #B0700C` at 4.06:1, `--chart-2: #1F9D6B` for the two-series case.

Every visualisation in the admin is single series, so magnitude is carried by
length or angle and one hue keeps it legible. Colouring bars individually was a
second encoding carrying no information.

`--chart-1` is **not** the brand orange. Sea Buckthorn is 1.90:1 against a white
card and `--clay-deep` is 2.99:1, both under the 3:1 floor WCAG 1.4.11 sets for a
meaningful graphic.

There is deliberately **no `--chart-3`**. Everything left in the palette is a
reserved status colour, and a generated hue would be indistinguishable under
colour-vision deficiency. If a third series is ever needed, fold the tail into
"Other" or facet into small multiples.

What the validator caught that review had not:

- Dashboard's five bar "tones" included `clay` and `gold`, which resolve to the
  **same hex**. Two of five were the same colour.
- Violet against indigo is ΔE 3.5 under deuteranopia. They work as status pills,
  where an icon and a word carry the meaning, but not as adjacent chart series.
- bklit's registry defaults were an oklch ramp at chroma 0, i.e. pure greys.

`--chart-scale-01` through `05` are a sequential ramp off `--chart-1`, verified
monotonic light to dark.

## No dark mode

There is no dark mode and no theme switch. Supporting both doubles the QA surface
on every screen forever and no user has asked for it. `--navy` and `--navy-deep`
remain for the logo lockup and the splash, which does still sit on brand navy.

bklit writes a `.dark` token block on install. Remove it. The
`@custom-variant dark` declaration stays so its internal `dark:` utilities
compile; they simply never activate.

## Form control sizing

The adapters in `components/ui/` exist to hold the 44px minimum touch target from
DESIGN_SPEC 7 in one place rather than at 90 call sites.

Stock shadcn `Input` is `h-9` (36px) and `Switch` is 18x32px. Both are below the
floor, so adopting them directly would have dropped every control in the admin
under it.

Three things in that migration were not swaps:

- Radix rejects an empty-string item value. The job filter and the task picker
  both used `value=""` for "all" and "none selected". A runtime throw, not a
  build error.
- The Radix checkbox renders a button, and a `<label>` does not forward clicks to
  a button the way it does to a native input. Those need explicit `id`/`htmlFor`.
- `.input.cell` stopped matching once the class changed, which left Settings'
  compact inline table editors at full width.

## The logo lockup is composed, not an image

Mark as inline SVG plus live text, rather than one raster lockup.

`markTone="reversed"` swaps the continent to white for solid orange or navy
grounds, which a raster would need a second file for, and the navy rail and the
splash both need it. A fixed 2.3:1 lockup would also shrink the tagline to around
6px inside the 186px sidebar.

The wordmark is one colour, tone-switched, because `--text` and `--navy` are both
dark inks and a single value leaves it invisible on the rail.

**The cart coordinates are constrained, not chosen.** Every point of the cart has
to sit inside the continent polygon, or the navy shows against the page instead of
against the orange. The first placement put the left wheel 2.5 units outside the
coastline at y=90, where the continent has narrowed toward its southern tip.
Shifting the group +3x/-4y clears all 14 points by at least 3.2 units. Verify with
a scanline check against the polygon before moving any of it.

**Known limitation:** the Africa silhouette is hand-drawn straight-line geometry,
not traced from the source artwork, so its outline approximates the real mark. If
the source SVG becomes available, replace the path data and nothing else. Note
that doing so invalidates the cart placement above, since it is fitted to this
polygon.

## Things that are deliberate and look like bugs

- `--clay`, `--gold` and `--gold-bright` all resolve to `#FBAC34`. Kept as
  separate names for existing call sites. `--grad` therefore ramps to
  `--clay-deep`, because a two-stop gradient between two identical tokens renders
  as a flat fill. That was a real defect for a while.
- The rolling six-month report series carry `monthStart` as well as `month`.
  The label alone cannot order a window that crosses a year boundary, and it is
  built as a calendar string rather than with `toISOString()`, which in any zone
  ahead of UTC rolls the first of the month into the previous one.
- `.glass` is an opaque white card, not glass. The name has 53 call sites and
  still means "the standard raised surface".
- The `'—'` in a detail row means "no value set". It is a typographic convention,
  not an oversight.
