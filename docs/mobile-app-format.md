# Afrizone Part Time — Mobile App Format (Draft)

**Status:** Draft, for review. Written 2026-09-11 and reconciled against the code on 2026-10-08, after the 2026-09-22 restyle retired twelve components this document had described as the shared kit. Written directly from the current code in `app/mobile` (theme.ts and the screens themselves), not from `DESIGN_SPEC.md` — that document predates several palette and screen changes and says so in its own header. Where this draft and the code disagree later, trust the code and update this file.

This describes what the worker-facing mobile app *is*: how someone moves through it, what every screen is built out of, and the visual language that ties it together. It's written in prose on purpose, as a shared reference for anyone picking the app up who doesn't want to read fourteen files to understand its shape.

---

## 1. What the app is

Afrizone Part Time's mobile app is the worker side of a gig platform: the app a student, dispatcher, remote freelancer, promo hand, tradesperson, or delivery courier uses to find work, get verified, do the work, and get paid. It's built with Expo/React Native and runs on iOS, Android, and (for development and review) the web, from one codebase.

There are three account types, and the app changes shape around them:

- **Individual** workers are the default case — they sign up with a phone number and an OTP, and the whole app described below (tabs, wallet, tasks) is built for them.
- **Store** accounts get a different dashboard (`app/store/index.tsx`) instead of the task marketplace — a store isn't looking for gig work, it's managing whether it's approved to take orders and, once approved, its own operation.
- **Courier** accounts see everything an Individual sees, plus a Deliveries screen and a Courier Setup screen (vehicle, licence, insurance) that nobody else's profile shows.

Which flavor of the app someone gets is decided once, at sign-up, and after that by the account type stored on the server — never by anything remembered locally.

---

## 2. How someone moves through it

The app has three layers of navigation, one inside the other.

**The auth stack** is what an unauthenticated person sees: a welcome screen, then a fork by account type, then either phone+OTP or email+password, with forgot/reset password, two-factor challenge, KYC, and the Terms/Privacy pages hanging off it. It's a plain stack — one screen slides in front of the last — because a first-time sign-up is a straight line, not something you jump around in.

**The tab bar** is home base once someone's signed in: five tabs, each its own stack —

- **Home** — the task marketplace. A worker searches and filters open tasks, sorted into "ready to apply," "you can unlock these" (blocked by something the worker can fix themselves, like a missing document), and "other tiers" (blocked by something only an admin can grant). A banner above the list nudges an incomplete or rejected KYC.
- **My Tasks** — the tasks this worker has actually applied to or is doing, as opposed to the open marketplace.
- **Wallet** — the money screen: available/pending/withdrawn balances, a withdraw flow, a plain-language breakdown of how pay is calculated (gross → WHT → net), and a transaction history grouped by day.
- **Jobs** — a separate board of full-time and part-time openings, distinct from the short-gig "Tasks" above.
- **Profile** — identity, verification status, documents, skills, security, contracts, bank/tax details, notification preferences, and (for couriers) deliveries and courier setup. It's the hub everything else about "who this worker is" hangs off.

**Stacked detail screens** sit outside the tabs and are reached by tapping into something: a task or job's detail page, an active task in progress, a signed contract, a single payment, a delivery list, a document list, the skills picker, ratings, timesheets, disputes, notifications, and help/support. Each opens with a back chevron rather than living in the tab bar, because they're destinations you arrive at from somewhere, not places you'd navigate to directly.

Screen chrome comes from two components, not one, and which one a screen uses follows from whether it has a single next action. The seventeen screens of the auth stack are built on **`ObScreen`**, which owns the whole frame: a back chevron, an optional eyebrow, a title and subtitle, the scrollable body, and the screen's primary action pinned at the bottom with its own loading and disabled states — a sign-up step never lays out its own footer. The sixteen stacked in-app destinations use **`AppBackHeader`** instead, which is the header alone, because arriving at a contract or a payment detail doesn't imply one obvious thing to do next. The five tab screens build their own tops out of kit parts, since each wants something different there — a search bar on Home, the balance hero on Wallet.

---

## 3. The visual language

The brand is Afrizonemart.com's own: **deep navy** for trust and stability, paired with **Sea Buckthorn orange** for energy and action, on warm-neutral off-white surfaces rather than clinical gray. The feeling the app is going for is warm, capable, and unmistakably African rather than generic fintech.

**Color**, as it actually exists in the code today (not the older numbers in `DESIGN_SPEC.md`):

- Navy (`#000066`) and its deeper pressed-state twin (`#00004D`) anchor dark surfaces like the wallet balance card.
- The orange — clay/gold, both names for the same `#FBAC34` — is the one accent color: every primary button, the active tab indicator, badges, the logo mark's continent fill. It never competes with a second bright color.
- A six-word status language (below) covers everything the app needs to say about the state of something.
- Neutrals are warm rather than pure gray: an off-white page background, a slightly recessed sand tone for quiet wells, white cards, and three text tones (full-strength, muted, faint) all tuned to clear accessibility contrast against the surfaces they actually sit on.

Those hex values are `src/theme.ts`, which as of 2026-10-08 is the only palette in the app. It was not, for three weeks: the restyle brought a second one — `obColors` in `src/onboarding/onboardingTheme.ts`, taken from the interactive prototype — and because both new kits read it while the shared components inside their screens still read `theme.ts`, the app rendered two reds, two indigos, two muted greys and two different grounds at once. The prototype's values won, since they are what shipped and what was signed off screen by screen, and `obColors` is now an alias map onto `theme.ts` so each hex exists once. Four live values were not adopted, because they failed the role they were being used in: `textFaint` (`#A6A5BD`, 2.23:1 on the page ground) was carrying 22 placeholders, the inactive tab tint and a dozen 11px timestamps, and is gone from light grounds — those moved to `textMuted`, while the two uses that sit on navy, where it measures 7.33:1, moved to `onNavyMuted`; `money` (`#1E9E5A`, 3.45:1) is a fill and an icon, so the four screens writing words in it now use `moneyInk`; ink on gold follows the live button and is navy; and the backdrop `scrim` ten screens had inlined is now a token. The cost is real and worth stating: mobile no longer matches web-admin and web-portal. That agreement broke in September when the restyle shipped — only `theme.ts`'s header still claimed otherwise — and putting the three back together is a decision about which palette the other two should follow, not a reason to re-fork this one.

**Status** is said the same way everywhere, in six words, never by color alone: *Awaiting approval* (violet), *In progress* (orange ink), *Under review* (indigo), *Ready to withdraw* (money green), *Paid out* (forest), *Needs attention* (red). Every one of those pairs a color, an icon, and a fixed word — a raw API enum like `APPROVED` or `RELEASED` gets mapped into one of these six before it's ever shown, so a worker never has to decode a status code.

**Typography** leans on Raleway at extrabold weight for anything brand-critical — screen titles, the logo, button labels — and the system font elsewhere, on the theory that applying a custom weight to every line of body text isn't worth what it costs on a cheap Android phone.

**Shape** has a signature the app calls the "Sunrise Cut": every card, button, and sheet is rounded everywhere except one sharply-cut corner (the top-right, generally), giving every surface in the app the same asymmetric, angular silhouette instead of the uniform rounded-rectangle look most fintech apps default to. It echoes the angular geometry of the logo's Africa+cart mark and shows up as a thin low-opacity chevron motif on brand moments.

Cards lift off the page with a soft, warm-tinted shadow rather than a hard border or a blur effect — blur was considered and rejected because it's GPU-heavy on the low-end phones this app is built for. That "cheap phone, patchy network" constraint runs through the whole design: big tap targets (44pt minimum), low data weight, and interaction that tolerates a bad connection rather than assuming a good one.

---

## 4. What screens are built out of

A handful of components repeat across nearly every screen, so learning them once explains most of the app. They live in three places, and where one comes from tells you what it is for.

**`src/appui/AppUI.tsx` — the signed-in app's kit.** Eighteen components, imported by twenty-two files, and the vocabulary of everything behind the login:

- **AppListCard / AppListRow** — a card that holds rows, and the row itself: an icon in a small rounded well, a title, an optional subtitle, and something on the right (a chevron, a pill, a switch). This is the pattern for almost every settings-style list in Profile.
- **AppStatusPill** — the six-status language below, as a small pill.
- **AppPrimaryButton** — the gold-to-deep-gold gradient, the app's one call to action.
- **AppKpiCard** — a small stat tile (icon, label, number), used in pairs for dashboard numbers.
- **AppBalanceHero** — Wallet's navy balance card, the one deliberately dark surface in the app.
- **AppSearchBar**, **AppChipRow** and **AppChip** — Home's search and its row of removable filter chips.
- **AppSegmented** — a segmented control for switching a list's slice in place.
- **AppEmptyState**, **AppErrorState** and **AppLoadingCards** — the three things a list can be other than full. The loading case renders skeleton cards shaped like the real ones rather than a spinner, so the page doesn't change height when data lands.
- **AppBanner**, **AppBackHeader**, **AppSectionTitle**, **AppMetaItem** and **AppIconButton** — the small structural pieces: an inline nudge, the stacked-screen header, a section heading, a labelled scrap of metadata, and a tappable icon.

**`src/onboarding/ObUI.tsx` — the auth and onboarding kit.** Ten components with their own tokens in `onboardingTheme.ts`: `ObScreen` and `ObBackButton` for the frame, `ObButton`, `ObField` and `ObPasswordField` for input, `ObRoleCard` for the account-type fork, then `ObChip`, `ObCheckCircle`, `ObPill` and `ObSuccessModal`. It is a separate kit rather than a variant of the one above because signing up is a straight line with one action per step, while the in-app kit is built for screens that are destinations.

**`src/components/` — what both kits share.** Fourteen live files, led by `Icon` (28 importers) and `Feedback` (21). `Feedback` is why the names `LoadingState`, `ErrorState`, `EmptyState` and `Banner` are still in the codebase alongside their `App*` equivalents — it predates them and still serves the screens that never needed a card-shaped skeleton. The rest are single-purpose: `KycUpload`, `TierBadge`, `StarRating`, `MoneyText`, `GoogleButton`, `CodeInput`, `VerifiedBadge`, `Splash`, `RequirementsCard`, `Logo`, `CourierDeliveryBanner`, `ClockInButton`.

Two files in that folder, **`Card.tsx` and `Button.tsx`, have no importers left** and are dead. They survived the cleanup that retired twelve of their neighbours; `AppListCard`, `AppPrimaryButton` and `ObButton` replaced them everywhere. Metro never bundles them, so they cost nothing at runtime, but a grep for "the Button component" finds them first and misleads.

**Bottom sheets** are a pattern rather than a component, still used as this draft first described: a modal panel slides up for anything quick and contained — edit profile, withdraw funds, select a bank, pick a tax year — rather than pushing a destination onto the stack.

**What this section used to say.** It described `Screen`, `ListRow`, `StatusPill` and `KpiCard` as the shared kit. All four were deleted on 2026-09-22, along with `TaskCard`, `Segmented`, `NotificationBell`, `UnderlineInput`, `Glass`, `PasswordField`, `ProgressRail` and `WalletBalanceCard`. Each had a replacement every caller had already moved to.

---

## 5. Recent changes to this format

The most recent pass borrowed a few structural (not visual) patterns from a banking-app reference, applied to Afrizone's own palette and components rather than replacing them:

- **Profile**'s identity block is now a centered avatar with an edit badge overlapping its corner, name and rating below it, and a separate "Personal info" card (label-over-value rows, one "Edit" link) instead of the old side-by-side row with an inline pencil button.
- **Wallet**'s transaction list is now grouped by day, each group headed by its date and that day's net total, with a This week / This month / All time filter above it.
- **Deliveries**' "Finished" section now shows a running total of what those completed deliveries paid, next to the section title.
- Notification rows in Profile gained leading icons, matching the icon-led row pattern used everywhere else.

These are documented in the components/screens themselves (`app/(tabs)/profile.tsx`, `app/(tabs)/wallet.tsx`, `app/deliveries.tsx`) with comments explaining what was borrowed and why.

After that pass, on 2026-09-22, the app was restyled end to end onto one navy-and-gold palette — splash to disputes, the tab bar included, where a gold bar now marks the active tab against navy. That is the work that moved every screen onto the two kits in §4 and left the twelve retired components with no callers. It also settled the ink pairs: `dangerInk` and `amberInk` exist because red and amber are legible as fills but not as small text. The restyle is committed but has not reached a device — `app/mobile` only ships through an EAS build.

---

## 6. What this draft doesn't cover yet

This is a first pass at describing the *shape* of the app. It doesn't go screen-by-screen into every field and validation rule (that lives closest to the code, and in `API_CONTRACT.md` for what the server expects), and it doesn't cover the web-admin dashboard or the store/courier portal, which are separate apps with their own — mostly matching — design system. If this is useful, the natural next step is either a screen-by-screen appendix or folding the accurate parts of this back into `DESIGN_SPEC.md`, whose mobile section is the part most out of date.
