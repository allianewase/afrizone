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

**Amber is a fill, never type and never an icon.** It is 2.55:1 on the page and
2.40:1 on its own tint, so warning text and warning icons use `goldInk` instead,
at 5.62:1 and 5.30:1. The warning still reads as a warning because the pale
amber fill, the alert icon and the wording carry it, which is the same argument
that lets violet and indigo coexist as pills.

There is deliberately **no `amberInk`**. Amber and gold are adjacent hues, so any
amber dark enough to clear 4.5:1 lands within a couple of units of `goldInk`
(`#8A5A0F`). A second token with almost the same value is how `--clay` and
`--gold` ended up identical and silently collapsed three gradients.

In mobile this left `colors.amber` with no call sites. It stays defined, because
`amberSoft` is still the warning fill and a full-strength amber is the right
thing to reach for if a warning ever needs a solid ground.

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

## The logo mark is the real artwork, not a drawing of it

`logo-mark.png`, 107x113, transparent ground. Cropped to its ink bounds from
`https://afrizonemart.com/images/logo.png`.

Three hand-drawn SVG silhouettes preceded this and none of them matched. The
last was 35 points with a cart fitted to it by scanline search, and it was still
an approximation: a redrawn coastline is a guess no matter how many points it
has. Do not redraw it a fourth time. The artwork is published; use it.

What the source pixels settled, all measured by decoding the PNG:

- The brand navy is **`#000066` exactly**, matching `--navy`. The orange is in
  the `#FBAC34` family, sampling `rgb(251,175,55)` in the flat interior.
- The ground is **fully transparent**, all four corners at alpha 0, so one file
  works on white, sand and navy.
- The wordmark is **single-colour navy**, so the tone-switched live text matches
  the source rather than merely resembling it.
- The source **does** carry the tagline, as five word-shaped components at
  `y 76..83`.

### The wordmark overlaps the mark, and had to be removed

This is the part that is easy to get wrong, and the first cut of this asset got
it wrong. **The lockup is tight enough that the wordmark starts at x=104 and
sits on top of the continent.** Cropping the mark at the last orange column,
x=149, therefore kept `A f r i` whole and half of the `Z` baked into the mark.
They were visible in the sidebar as navy marks on the orange.

Separating them cannot be done with a column cut, because there is no column
where the mark ends and the text begins. It is done by connected component:
navy components starting at x >= 104 are letters, everything left of that is the
cart. The cart survives as one component spanning x 43..115, because its handle
rises to y32 on the right, which is why a naive x-threshold misclassifies it.

Removing the letters leaves two problems that a plain delete does not fix:

- **Ghosts.** The letters' antialiased edges sit at alpha 1 to 40, below any
  sensible "is this navy" threshold, so they survive component detection. They
  have to be cleared by proximity to a removed component, not by colour.
- **A contaminated coastline.** Where a letter crossed the continent's edge, the
  edge pixels are blends like `rgb(181,127,68)`, a muddy brown that is neither
  orange nor navy. The band `y 51..71` is therefore rebuilt as flat
  `rgb(251,175,55)` out to the coast, with a one-pixel feather.
- **An occluded coast.** The letters covered the real edge, so it is not
  recoverable. It is reconstructed by interpolating across the occluded rows from
  the unoccluded ones above and below, which restores a monotonic taper from 148
  down to 131. Rows are flagged occluded when a removed pixel sits within three
  columns of the surviving orange edge.

The Gulf of Aden notch at `y 42..43` and the Horn tip at `x 147..149` are real
and are outside the rebuilt band. Do not "fix" them.

### Why the lockup is still composed

The mark is an image now, but the lockup is not. The source has no tagline, and
a fixed 2.4:1 lockup would shrink the wordmark inside the 186px sidebar.
Composing keeps the wordmark as live text in Raleway, tone-switched because
`--text` and `--navy` are both dark inks and one value leaves it invisible on
the rail.

### The reversed variant swaps orange, not navy

`markTone="reversed"` selects `logo-mark-reversed.png`, whose continent is white.
Generated from the same pixels by lerping orange to white and leaving navy
untouched, so the antialiased edges survive.

It is used in exactly one place, mobile's welcome hero, which is a solid gold
panel where an orange continent would vanish. **It is not for dark grounds.**
The cart sits inside the continent, so it is navy-on-orange regardless of what
is behind the mark, and the default variant is correct on the navy rail and the
navy splash. An earlier version of this document had that backwards.

### Known limitation: resolution

The published artwork is 360x120 and that is the ceiling. `/images/logo.svg`,
`logo@2x.png`, `favicon.ico` and `apple-touch-icon.png` were all checked and all
404, and the homepage is a JS app with no static image references.

At 107x113 the mark downscales cleanly at every web call site, including 46px on
a 2x screen. The one upscale is **mobile's welcome hero at 56 logical px, which
on a 3x screen asks for 168 device px from 113**, about 1.5x. Flat-colour art
tolerates that better than photography, but it will read slightly soft.

A vector original would fix it. Ask for the source file before trying anything
cleverer; upscaling cannot invent detail that was never published.

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
- A bare em dash in a detail row means "no value set". It is a typographic
  convention, and the 23 of them left in the codebase are deliberate.
- `--clay-deep` (`#C98518`) measures 3.06:1 on white, which clears the 3:1 floor
  for a non-text graphic but only just. It is used for input focus borders, the
  spinner arc and the KYC thumbnail hover border. In each case a second, stronger
  indicator is present (the 3px gold focus ring, motion on the spinner), so the
  thin margin is not load-bearing. Do not reuse it for anything that carries
  meaning alone; use `--gold-ink` (5.92:1) instead.
