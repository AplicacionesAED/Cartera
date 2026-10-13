---
name: HRMS aed
description: Internal HR management system for aed — precise, brand-restrained, employee-profile-centric
colors:
  primary: "#232BED"
  primary-ink-on: "#FFFFFF"
  brand-deep: "#0B2D4D"
  accent-vibrant: "#23FF55"
  accent-deep: "#014145"
  gradient-mid: "#20A7A1"
  gradient-end: "#22E76A"
  offwhite: "#F0ECE6"
  bg: "#F4F4FE"
  surface: "#F8F9FE"
  surface-sunken: "#EDEEFE"
  surface-hover: "#E2E3FD"
  surface-hover-strong: "#DADBFC"
  border: "#E7E8FD"
  border-strong: "#D3D5FB"
  ink: "#10151F"
  ink-secondary: "#162F49"
  ink-muted: "#2A425C"
  success-ink: "#014145"
  success-surface: "#DFF3EA"
  warning-ink: "#8A5A00"
  warning-surface: "#FFF3D6"
  danger-ink: "#9F2B25"
  danger-surface: "#FBE9E7"
  info-ink: "#232BED"
  info-surface: "#E8E9FD"
typography:
  display:
    fontFamily: "\"Inter Variable\", Inter, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "clamp(1.375rem, 1.1rem + 0.8vw, 1.75rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "\"Inter Variable\", Inter, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.012em"
  title:
    fontFamily: "\"Inter Variable\", Inter, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "\"Inter Variable\", Inter, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "-0.006em"
  data:
    fontFamily: "\"Inter Variable\", Inter, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.006em"
  label:
    fontFamily: "\"Inter Variable\", Inter, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.03em"
  mono:
    fontFamily: "ui-monospace, \"SF Mono\", \"Cascadia Mono\", Consolas, \"Liberation Mono\", monospace"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
motion:
  duration-fast: "120ms"
  duration-standard: "200ms"
  ease-standard: "cubic-bezier(0.22, 1, 0.36, 1)"
  scroll-easing-library: "lenis"
zIndex:
  dropdown: 100
  sticky: 200
  modal-backdrop: 300
  modal: 310
  toast: 400
  tooltip: 500
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink-on}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "#1B21C4"
  button-secondary:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 20px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-hover}"
  input:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 14px"
  badge-success:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "3px 10px"
  badge-warning:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "3px 10px"
  badge-danger:
    backgroundColor: "{colors.danger-surface}"
    textColor: "{colors.danger-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "3px 10px"
  info-tooltip-trigger:
    textColor: "{colors.ink-muted}"
    size: "14px"
  info-tooltip-trigger-hover:
    textColor: "{colors.primary}"
  info-tooltip-bubble:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.data}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    maxWidth: "220px"
---

# Design System: HRMS aed

## 1. Overview

**Creative North Star: "The Precise Ledger"**

HRMS aed is where a construction company keeps the truth about its people — contracts,
salaries, seguridad social, medical restrictions, disciplinary history. The system behaves
like a well-kept ledger, not a marketing surface: every screen is built to be scanned fast,
trusted completely, and never ambiguous. aed's own brand identity is bold, dynamic, and
vibrant (a signature green→blue gradient, electric blue, bright green) — this product wears
that identity as a **precise accent**, not as a wash across dense data screens. Color earns
its place; most of the interface is calm, cool-tinted neutral so that the two moments of real
color — a primary action, a status badge, the login/empty-state gradient — read as
deliberate, not decorative.

The product rejects two failure modes equally: the **outdated enterprise look** (dense gray
forms, unlabeled tables, generic icon sets — the SAP/Oracle-2000s trap) and the **generic
AI-SaaS look** (identical icon+text cards, gradient hero metrics, uppercase eyebrows on every
section, side-stripe accent borders). It is also not a consumer app — RR.HH. staff spend all
day here, and every employee will occasionally self-serve their own profile, so the interface
must flex between power-user density and lighter guided moments without changing its visual
language.

**Key Characteristics:**
- **Redesigned 2026-10-03 (whole product):** one typeface (Inter), white cards on the tinted
  canvas, a brand-gradient hero on every detail view, tables that read like a list of people
  rather than a spreadsheet — see "Redesign Patterns (2026-10-03)" at the end of §5
- Cool, blue-tinted neutral canvas — never the warm cream/sand "AI default"
- aed's Azul Vibrante and Verde Vibrante appear only as precise accents, never as large fills
- Employee profile is the hub: sections, not scattered top-level CRUD screens, are the primary
  navigational metaphor — horizontal underline tabs for short sets, a sticky vertical nav once
  a detail view grows past what a tab row can hold (see "Section Navigation" in §5 Components)
- Flat-by-default surfaces with tonal layering for hierarchy; shadows reserved for floating
  elements only
- Responsive motion (clear feedback on hover/focus/load) without choreography — confidence
  through clarity, not spectacle
- Every independently-scrolling pane eases its scroll delta (Lenis) so long pages read as one
  continuous surface instead of snapping section by section — see the Fluid Scroll Rule in
  §4 Elevation
- Record-editing views (the employee profile) open read-only; a single global Editar control
  gates the whole page into edit mode at once — see View/Edit Mode in §5 Components

## 2. Colors

A cool, brand-tinted neutral system carries almost the entire interface; aed's vibrant palette
is rationed to actions, status, and identity moments.

### Primary
- **Azul Vibrante** (#232BED): aed's signature action/emphasis color. Primary buttons, links,
  focus rings, the active tab indicator — **and, as of 2026-10-01, a single-series chart's
  data-ink** (`DATA_INK` in `palette.js`, previously a deliberately dimmed `#1B21A6` to protect
  the old 10% budget — now the real token, since the budget itself was raised, see the Rationed
  Brand Rule below). It's no longer reserved to literal click targets alone, but it still never
  becomes a flat background fill/wash behind an icon or a tile — color draws the eye to a chart
  bar/slice or an accent line, it never becomes a tile's base surface (that's still the generic
  "icon+heading+text card grid" AI-SaaS tell, see §6 Don't). **A KPI tile's big number and its
  icon are NOT part of this list** — tried as Azul Vibrante the same day, reverted hours later
  (explicit user feedback, "no me gusta el tema de los números azules") after the `ui-ux-pro-max`
  skill's own research on serious finance/payroll dashboards came back showing their primary
  figures in near-black/deep-navy ink, never a vibrant accent blue, with the hierarchy carried by
  size/weight — not by color (`ui-ux-pro-max`'s own `visual-hierarchy` rule: "Establish hierarchy
  via size, spacing, contrast — not color alone"). `.statValue`/`.statIcon` are back to
  `--color-ink`/`--color-ink-muted`, same as before this whole color-raising request started.

### Secondary
- **Verde Vibrante** (#23FF55): reserved for small, high-signal moments only — a status dot,
  never body text (fails contrast) and never a large fill. This is the one place a badge is
  allowed to use the raw vibrant token directly instead of its desaturated `-ink`/`-surface`
  pair: the 6px status dot inside an "Activo"/"Vigente" badge (see Status Dot in §5 Components)
  is small enough that it reads as an accent, not a fill, so it stays exempt from the Rationed
  Brand Rule's "no raw accent as fill" spirit while still counting toward the ~20% budget.
- **Azul Profundo** (#0B2D4D): the "signature" deep blue from the brand manual. Used for the
  active/selected state of primary navigation — a small, fixed surface, not a full sidebar
  wash. The sidebar brand header itself (logo + `.brandName`) stays on the sidebar's own Surface
  background, not an Azul Profundo lockup block — the aed logo asset used everywhere in this
  product family is the green→blue gradient mark meant for a light background; there's no
  white/mono variant to put on a dark block, so the logo presentation stays as-is across every
  project (same file, same neutral background) rather than half-implementing a lockup that would
  hurt contrast. (It gets a thin `--gradient-aed` hairline under it instead — see "Gradación aed"
  below — never a solid fill behind the logo pixels themselves.)
- **Gradación aed** (`--gradient-aed`, `linear-gradient(135deg, #232BED 0%, #20A7A1 50%,
  #22E76A 100%)`): the manual's signature 3-stop degradé — Azul Vibrante → a teal midpoint
  (#20A7A1, its own manual value, not a mix) → a manual-defined green endpoint (#22E76A, close to
  but distinct from Verde Vibrante #23FF55). Until 2026-09-17 this only existed "baked into" the
  `aed-logo.png` asset; it's now a real, usable token — explicit user request that the actual
  degradé have presence in the product, not just live inside the logo file. Same Rationed Brand
  Rule as the other vibrant colors: a precise accent in named, bounded spots, never a large
  working-screen fill. See "The Gradación aed Rule" below for the exact 3 sanctioned locations.

### Tertiary
- **Verde Profundo** (#014145): doubles as the accessible ink color for success states
  (approved, active, completed) — dark enough to pass text contrast, and it's an official aed
  color, so "success" reads as on-brand rather than borrowed from a generic green.
- **Off-white aed** (`--color-offwhite`, #F0ECE6): a warm neutral from the brand manual, print-
  oriented (see "The No-Cream Rule" below for why it stays out of the app's working canvas).
  Briefly tried as the login screen's `.formPanel` background (2026-09-17) — reverted the same
  day, explicit user feedback that it read as "yellowish," not premium. The token stays defined
  (it's real brand manual color, may find a genuine print/document use later) but has no
  sanctioned UI location right now — don't reach for it without asking first.

### Neutral
- **Bg** (`color-mix(in srgb, var(--color-primary) 5%, white)`, ≈ #F4F4FE): the app canvas —
  a near-white with a faint cool tint toward aed's own blue hue, one step lighter than Surface.
  Deliberately not warm.
- **Surface** (`color-mix(in srgb, var(--color-primary) 3%, white)`, ≈ #F8F9FE): modals, the
  Pagination footer, the login inputs and legacy panels. Lighter than Bg on purpose — a card "pops" above the tinted canvas — but no longer
  a pure, isolated `#FFFFFF`: an earlier pass left Bg/Surface flat white while Sunken/Hover
  carried a strong tint, and the jump from "pure white card" straight to "clearly blue input"
  read as a hard edge rather than a gradient (see Named Rules below).
- **Card White** (`#FFFFFF`, added 2026-10-03): the fill of every card, table container, side
  nav card and floating panel in the redesigned screens. The canvas stays tinted (Bg) so a white
  card still "pops"; Surface (above) remains the fill for controls and legacy panels.
- **Surface Sunken** (`color-mix(in srgb, var(--color-primary) 8%, white)`, ≈ #EDEEFE): the
  *resting* structural fill — form-input backgrounds (`Field.module.css` `.control`), stat
  chips, sunken info boxes, table row hover. (Table headers and zebra striping used it until
  2026-10-03; tables are now white with a quiet header — see Tables, §5.)
- **Surface Hover** (`color-mix(in srgb, var(--color-primary) 13%, white)`, ≈ #E2E3FD): the
  *interactive-feedback* fill — nav item hover/active, ghost/secondary button hover, dropdown
  item hover. Noticeably more saturated than Surface Sunken on purpose, so a
  hover state reads as "this responds to you," distinct from a merely-structural sunken area.
  Never used for a resting/static background.
- **Surface Hover Strong** (`color-mix(in srgb, var(--color-primary) 17%, white)`, ≈ #DADBFC):
  one step past Surface Hover. It existed for the hover of zebra-striped table rows; tables no
  longer use zebra striping (2026-10-03), so the token is kept defined but currently unused —
  don't reintroduce it for table rows.
- **Border** (`color-mix(in srgb, var(--color-primary) 11%, white)`, ≈ #E7E8FD) / **Border
  Strong** (`color-mix(in srgb, var(--color-primary) 20%, white)`, ≈ #D3D5FB): hairlines and
  dividers; Border Strong only for inputs and elements that need to read as
  interactive/editable.
- **Ink** (#10151F): primary text. **Ink Secondary** (`color-mix(in srgb, var(--color-brand-deep)
  65%, #2B3341)`, ≈ #162F49): de-emphasized but still-dense text (secondary table columns,
  table header labels, nav item text) — derived from Azul Profundo rather than a flat gray.
  **Ink Muted** (`color-mix(in srgb, var(--color-brand-deep) 58%, #545E70)`, ≈ #2A425C):
  captions, helper text, timestamps — darker than the neutral it replaced, so contrast only
  improved, still verified at ≥4.5:1 on both Bg and Surface; never a lighter "for elegance"
  gray.

### Named Rules
**The No-Cream Rule.** Off-white aed (#F0ECE6) is a warm print neutral from the brand manual —
right for business cards and letterhead, wrong for a dense working screen. It never appears as
the app's structural canvas (Bg/Surface/Surface Sunken stay cool-tinted toward Azul Vibrante's
own hue, per the Brand-Tinted Neutral Rule below). Tried once as the login screen's `.formPanel`
background (2026-09-17), reverted the same day — explicit user feedback that it read as
"yellowish" against the rest of the interface's cool palette, not premium. `.formPanel` is back
to Blanco aed (#FFFFFF, see Neutral below). No location in the product uses Off-white aed today;
don't reach for it without asking first.

**The Gradación aed Rule** (2026-09-17, explicit user request — the manual's full palette,
gradient included, "no omitas ninguno"). `--gradient-aed`/`--gradient-aed-vertical` are real and
usable, not just baked into the logo PNG. Sanctioned locations, in the order they were settled:
1. **Login screen** (`LoginPage.module.css`) — two parts: the `.splitWrap::before` 6px bar across
   the full top of both columns (a solid `::after`/`::before` bar — `border-image` was tried
   first for a similar sidebar treatment and rejected, see below, it slices a diagonal gradient
   oddly), and the `.brandPanel` photo scrim, which briefly (same day) tried tinting its upper,
   more-transparent stops with the gradient's teal/green hues directly over the photo — reverted
   within the hour, real user feedback ("se ve muy mal"): tinting a photo with light teal/green
   reads as a dirty wash, not a brand accent. The scrim is back to flat Azul Profundo at every
   stop; the real gradient moment on this screen is the top bar only.
2. **Empty states** (`.emptyHint`, defined per-module in `WizardForm.module.css` and 7 feature
   `.module.css` files that historically copy-pasted the same rule) — an 8px gradient dot before
   the message text, `display: inline-block` (never `flex`/`gap` on `.emptyHint` itself — several
   of these apply the class directly to a `<td>`, and `display: flex` there breaks the table
   cell's layout).
3. **Dashboard KPI/chart cards** (`Dashboard.module.css` `.statTile::before`/`.chartCard::before`,
   2026-10-01) — a 3px bar across the top edge of every KPI tile and chart card, same solid-bar
   technique as the login's `.splitWrap::before` (not `border-image` — see the login entry above
   for why that renders diagonal gradients oddly). Added as part of the same request that raised
   the Rationed Brand Rule to 20% — this is the "card border" half of "números, bordes de
   tarjeta, barras/líneas de los gráficos" that the user asked for, and the part of that request
   that survived: the other half (`.statValue`/icon in Azul Vibrante) was tried the same day and
   reverted hours later, see §2 Colors "Primary" above. Scoped to the Dashboard specifically, not
   every `.card` in the product — a detail page or a list's table card stays plain Surface/
   Border, this accent marks "this is a measured metric/chart," not "this is any card."
4. **Topbar bottom edge** (`AppShell.module.css` `.topbar::after`) — a solid 3px bar across the
   full width of the bar's bottom edge, `background: var(--gradient-aed)`. This is the settled
   version of a same-day back-and-forth: a first attempt made the topbar's entire background the
   gradient (with a right-to-left Azul Profundo scrim so the right-aligned bell/gear/`UserMenu`
   stayed legible in white text), which the user liked well enough to ask for a follow-up (remove
   its rounding/margin, try the same idea on the sidebar) — but then asked to drop it entirely
   ("no me gusta como se ve"), landing on a plain white/transparent topbar with just this
   bottom-edge line as a separator instead. `NotificationBell.module.css`/`UserMenu.module.css`/
   `.topbarIconLink` are back to their normal ink colors (no white-text variant needed once the
   background isn't colored).

**Tried and reverted the same day, twice each**: the sidebar. First as a solid 4px top-edge bar
(`.sidebar::before`, via `border-image` on `.brand` initially — rendered as a barely-visible gray
line, a diagonal gradient sliced through `border-image` doesn't render cleanly; fixed with a
plain `::before` block instead) — kept for a while as the sidebar's one gradient accent, then
removed entirely on a later, separate explicit request ("quitale el gradiente de arriba del
sidebar"), with no replacement. Second, mid-way through that arc, as the sidebar's **entire**
background (same scrim technique as the topbar, `--gradient-aed-vertical`, plus a white chip
behind `.brand` since the logo can't sit directly on the gradient) — reverted the same day, real
user feedback ("no me gusta mucho como se ve"). **Net result: the sidebar carries no gradient at
all** — plain `--color-surface` background, normal ink-colored nav text, no exception. If a
gradient treatment for the sidebar is requested again, that's a third attempt at this specific
surface — don't reach for either previous technique (full background, or a top-edge line) without
proposing something genuinely different first.

**Status after the 2026-10-02/03 redesign (read this before relying on the list above).** The aed
gradient exists today in: (1) the login's 5px top bar, (2) the empty-state dot, (4) the topbar's 2px
bottom edge (`.topbar::after`). Location (3), the Dashboard cards' top bar, **no longer exists** —
the redesigned Dashboard cards are plain white. The sidebar paragraph above was **superseded**: the
sidebar is now a dark Azul Profundo surface (see Primary Navigation) — not the aed gradient, so the
rule isn't broken, but "no gradient at all" is no longer literally true: it carries a very subtle
vertical shade from Azul Profundo to a darker navy. Two brand-colored gradients live outside this
rule: the **Detail Hero** (Azul Profundo → `#14308F` → Azul Vibrante, 120°) and the UserMenu avatar
(Azul Profundo → Azul Vibrante, 135°). Neither is `--gradient-aed`; both are bounded identity moments
(one hero per page).

Same Rationed Brand Rule ceiling as Azul/Verde Vibrante applies — the sanctioned spots above plus
the hero and avatar are the allowed ones; adding another (a section header, a data table, a form, etc.) is a real design
decision to bring back for confirmation, not something to extend ad hoc file by file.

**The Brand-Tinted Neutral Rule** (2026-09-10, explicit user request — "muy gris," an audit
found 5 gray-family tokens repeated across ~30 CSS Modules). Every structural neutral
(Surface Sunken/Hover, Border/Border Strong, Ink Secondary/Muted) is a `color-mix()` of a real
brand color (Azul Vibrante for fills/borders, Azul Profundo for text) rather than a flat gray
hex — same "cool, blue-tinted neutral" principle the system already had, just executed at a
tint strength that actually reads as brand-tinted instead of plain gray. **Went through four
calibrations on 2026-09-10 alone.** First attempt used 8–22% mixes — visually indistinguishable
from the flat gray it replaced, "only the hover states looked different." Second attempt jumped
to 18–38% on Sunken/Hover/Border but left **Bg and Surface untouched at pure white** — now the
opposite problem: inputs/tables read as sharply blue against a page/card that was still stark
white, "un contraste muy fuerte." Third pass gave Bg/Surface a light tint too (4%/2%) and
brought Sunken/Hover/Border down slightly (12–30%) — but 4%/2% turned out to be the same
"too-subtle-to-register" mistake as the very first attempt, just applied to a different pair of
tokens ("no noto ningún cambio" in the page background). Fourth pass landed on Bg/Surface at
8%/5%, Sunken/Hover/Hover Strong/Border/Border Strong at 12/20/26/18/30% — enough to actually
read as tinted, not just technically non-zero.

**Fifth pass (2026-09-17, explicit user request — "el fondo es todo azul... practicamente todo
es azul").** The fourth pass overshot in the opposite direction: tinting Bg, Surface, and Surface
Sunken (the three largest, most constantly-visible fills — page canvas, cards, every input) with
the *same* hue at the *same time*, with no genuinely neutral area anywhere to rest the eye on,
reads as "everything is blue" even though no single percentage was individually extreme — the
problem was cumulative, not a bad number in isolation. Rather than repeat an already-rejected
value (the very-subtle 4%/2% from the third pass), the whole scale was scaled down to roughly
60% of the fourth pass's intensity, keeping the same relative order and the same single-gradient
concept (Surface → Bg → Sunken → Border → Hover → Hover Strong → Border Strong, each a little
more saturated than the last): Surface 3%, Bg 5%, Sunken 8%, Border 11%, Hover 13%, Hover Strong
17%, Border Strong 20%. Ink Secondary/Muted were left untouched — the complaint was specifically
about large fills (background, inputs), not text color, and their contrast was already verified
separately. This does **not** relax the No-Cream Rule (still no warm Off-white as canvas) or the
Rationed Brand Rule (these are desaturated tints of a neutral surface, not the raw vibrant token
used as a large solid fill — the rule's own concern — so they don't count against the ≤20%
budget) — no rule needed to be removed, both the third pass's undershoot and the fourth pass's
overshoot were calibration misses, not evidence the rule itself is wrong. Two deliberate
exceptions stay flat gray, not brand-tinted: **Badge neutral variant** (a neutral badge exists
specifically to say "no special status" — tinting it blue would read as the existing Info badge)
and **disabled controls/icons** (`:disabled` text/backgrounds must read as "inert," not as a
brand moment).

**The Rationed Brand Rule.** Azul Vibrante and Verde Vibrante combined should cover roughly 20%
of any given screen's surface area — raised from the original 10% on 2026-10-01, explicit user
request to bring more color into the Dashboard's KPI tiles and chart cards. The extra budget is
spent on the new sanctioned uses above (KPI numbers/icons, chart data-ink, the 4th Gradación aed
location below), not on raising the ceiling for everything at once — a form, a table, a detail
page still read as calm/neutral as before; it's specifically the Dashboard's data-emphasis
surfaces that got louder. Still a budget, not a free-for-all: no colored fill behind an icon, no
colored tile background, no gradient text — color draws the eye to a number or a line, it never
becomes a surface.

## 3. Typography

**Typeface (all roles): Inter** — variable font (weight axis 100–900), self-hosted through
`@fontsource-variable/inter` and imported once in `main.jsx` (no Google Fonts request, works
offline). Chosen 2026-10-03 for dense, number-heavy screens: legible at 12–14px, a neutral
professional voice, and true tabular figures. It replaces the earlier pair (TT Firs Neue for
titles + Raleway for body): TT Firs Neue's font files were never obtained — titles had been
falling back to the system font — and Raleway's old-style numerals made dates, salaries and
counters bob above and below the baseline. `--font-display` and `--font-body` both resolve to
`'Inter Variable'`; hierarchy comes from weight and size, not from a second family.
**Monospace (exception):** `--font-mono` (system monospace stack) only for one-time values a
person must copy exactly — temporary passwords, codes.

**Character:** a calm, precise grotesque used at 400/500/600/700. Titles are 600 with slightly
tightened tracking; body is 400; micro-labels are 600 uppercase with open tracking.

### Hierarchy
- **Display** (600, clamp(1.375rem, 1.1rem + 0.8vw, 1.75rem), 1.2): large standalone numbers only
  (`StatTile.jsx`'s `.statValue`, the KPI figure itself) and the login screen's marketing-scale
  brand headline (`.brandHeadline`, its own clamp, only reuses the weight token). Not page
  titles (see Headline, below) — this is a tool, not a landing page.
- **Headline** (600, 1.125rem, 1.3): page-level titles ("Perfil de Juan Pérez", "Empleados") AND
  section/tab-panel headers within a page (e.g. "Información Laboral") — the same scale for
  both since 2026-09-04 (matches Contratación/ex-Solicitudes-Indirectos, adopted after the user
  preferred its smaller, more consistent page titles over the previous Display-scale ones;
  `margin: 0` on the `.title` class, no explicit `letter-spacing`/`color` — those come from the
  inherited body color and this scale's own line-height, not overridden per page).
- **Title** (500, 1rem, 1.4): card headers, modal titles, table section headers.
- **Body** (400, 0.9375rem, 1.55): form field values, paragraph text, modal/dialog copy. Never
  smaller — WCAG floor for primary reading text. Max 75ch on any prose block (help text,
  descriptions).
- **Data** (400, 0.8125rem, 1.4): dense table cells only — the "secondary UI, metadata" rung,
  distinct from Body. Never used for form inputs or anything the user reads at length.
- **Label** (600, 0.75rem, letter-spacing 0.03em): table column headers (uppercase) and the small
  captions under a name or value (document number, email, timestamps; sentence case). Form-field and
  filter labels use the same size/weight in sentence case. A functional micro-label, not a decorative
  section eyebrow. The only other uppercase micro-text is the 0.6875rem/700/0.1em group titles of the
  Grouped Tab Bar, the Accesos menu and the notification panel.

### Named Rules
**The Tabular Numerals Rule.** Any column of numbers (salarios, días, cédulas, valores) uses
`font-variant-numeric: tabular-nums` so digits align vertically. Non-negotiable for a payroll-
adjacent tool. Since 2026-10-03 `body` sets it globally (Inter's tabular figures are neutral in
running text), so this is the default, not something to remember per column.

**The One Family Rule.** The product uses a single typeface. Never add a second family for
"personality" (a display face for titles, a serif for quotes); vary weight and size instead. The
only other family is `--font-mono`, restricted to copy-exactly values.

**The Tracking Rule.** Inter is tracked by size: `-0.006em` on body/data text (set on `body`),
`-0.012em` on h1–h4 (`index.css`), `+0.03em` only on uppercase Label text. Don't add per-page
`letter-spacing`.

## 4. Elevation

Flat by default. Hierarchy between Bg → Surface → Surface Sunken is conveyed through the
neutral tonal ramp, not shadows — this keeps dense table/form screens calm. Shadows are used
sparingly and only for elements that are genuinely floating above the page flow.

### Shadow Vocabulary
- **Floating** (`box-shadow: 0 8px 24px rgba(16, 21, 31, 0.12)`): dropdowns, popovers,
  date pickers.
- **Modal** (`box-shadow: 0 16px 48px rgba(16, 21, 31, 0.18)`): dialogs, the multi-step
  employee creation wizard.
- **Toast** (`box-shadow: 0 6px 20px rgba(16, 21, 31, 0.15)`): transient notifications.

### Named Rules
**The Floating-Only Rule.** If it doesn't detach from the page's normal flow (a card, a table
row, a form section), it doesn't get a shadow. Depth is earned by z-index, not applied by
default.

### Motion & Scroll

Two speeds cover the whole product: `duration-fast` (120ms) for hover/focus/active-state
feedback on small elements (buttons, nav items, inputs), `duration-standard` (200ms) for
larger surface changes (modals, tab-panel swaps). Both always pair with `ease-standard`
(`cubic-bezier(0.22, 1, 0.36, 1)`, an ease-out-quart) — decisive on the way in, no bounce, no
elastic. Every transition declares both properties explicitly (`transition: background-color
120ms ease-standard, color 120ms ease-standard`); never a bare `transition: all`.

**The Fluid Scroll Rule.** Every independently-scrolling content pane (the main content area,
never the sidebar nav) is wrapped in Lenis (`lenis/react`'s `<ReactLenis root={false}>`) so
wheel/touch input eases into a continuous glide instead of the browser's default step-per-tick
feel — the thing that reads as a page scrolling "by section" rather than smoothly. `root={false}`
scopes Lenis to that one container: it still uses native `scrollTop`/`overflow-y: auto`
under the hood (not a transform-based virtual scroll), so `position: sticky` children — like
the profile's vertical section nav — keep working exactly as they would unsmoothed. Lenis
respects `prefers-reduced-motion` by default; never override that. The sidebar nav and any
`position: fixed` chrome are left outside the Lenis wrapper and keep native instant scroll.

## 5. Components

### Buttons
- **Shape:** `radius-md` (10px), `min-height: 42px`, `padding: 0 20px`, Inter 600 at body size —
  firm and comfortable to hit. (The earlier 6px radius / 10px 20px padding spec was retired in the
  2026-10 redesign.)
- **Primary:** Azul Vibrante fill, white text. One primary action per view.
- **Hover / Focus:** primary darkens to `--color-primary-hover` (#1B21C4); focus-visible gets a 2px
  Azul Vibrante ring offset 2px, never a color-only change (keyboard users need the ring).
- **Secondary:** white fill, Ink text, Border Strong 1px outline (hover: Surface Hover).
  **Danger:** for destructive actions ("Eliminar rol", "Inactivar"), danger-colored — never the
  primary action of a page. **Ghost:** no fill/border, Ink Secondary text, low emphasis.
- **Compact variants** (`padding: 6px 10px`) exist for inline actions; per-row actions are still icon
  buttons (see Row Icon Actions).

### Badges / Status Pills
- **Style:** full pill radius, semantic surface + ink pair (success/warning/danger/info from
  the token set), label typography. Used for `estado` (Activo/Inactivo/Vacaciones/...),
  contract status, incapacidad/permiso approval state.
- **Rule:** background is always the desaturated `-surface` token, never the `-ink` token as a
  fill with white text — keeps status color reserved for meaning, not decoration.
- **Status Dot:** for the one or two states that mean "this is the live, positive one" (an
  employee's `estado = ACTIVO`, a contract's `estado = Vigente`), the badge gets an optional
  leading 6px `border-radius: 50%` dot filled with the raw `accent-vibrant` (Verde Vibrante)
  token — not `success-ink`. It's the single spot in the product where the literal brand green
  shows up as a fill; keep it capped at that 6px dot, never grow it into a stripe or a larger
  chip.

### Tables
Redesigned 2026-10-03 (reference implementation: the Empleados list; Usuarios, Roles, Datos
history and the Reportes tables follow it). Tables read like a list of people, not a
spreadsheet.
- **Container:** a white card (Card White, `radius-lg`, Border 1px, `overflow-x: auto`). No
  vertical column rules, **no zebra striping**.
- **Header row:** Label typography in Ink Muted on white with a plain 1px Border bottom. (The
  Surface Sunken header and the 2px Azul Vibrante underline were retired in this pass — the
  table no longer needs its own color accent.)
- **Cells:** Data typography (0.875rem), `12px 12px` padding, 1px Border between rows. Row
  hover is Surface Sunken; a selected row is Info Surface.
- **Person cell:** every table that lists people starts with one "Empleado/Usuario" column — a
  36px circular avatar (initials, Info Surface fill, Azul Vibrante text, 0.75rem/600), the name
  in Ink 600, and the document/email under it in Label size Ink Muted (`min-width` ≈ 190–220px so
  names wrap to two lines instead of squeezing the other columns).
- **Values:** status is always a Badge; an empty value is an em dash "—" in Ink Muted; dates and
  numbers are tabular and `nowrap`; long free text stays on one line with an ellipsis and the full
  text in `title`; roles/tags are small Badges.
- **Row action:** a row that opens a record is clickable (pointer cursor). **Exception:** the
  Reportes tables are read-only on purpose (explicit product decision) — no row click.
- **Sticky actions column:** editable lists keep their icon actions in a right-pinned column with
  a soft left edge. The table must fit at 1440px **without** that column covering the previous
  one — measure `scrollWidth` vs `clientWidth` after any column or font change (Inter's width
  pushed Empleados over by 23px until cell padding went from 16px to 12px).
- **Overflow containment:** a table inside a flex layout needs `min-width: 0` on its flex parent
  (`AccesosLayout`'s content pane has it); otherwise one wide table pushes the whole page past the
  viewport.
- **Pagination:** mandatory (see Pagination below); server-side for large sets, client-side
  (25/page) for report tables already loaded in full.
- **Density:** compact by default (row height ~40px, up to ~90px when a person cell wraps);
  never nested cards inside a table cell.
- **Width:** list/table views always use the full content width of the page — the data is the
  point, so it gets the space; constrain width only for genuinely narrow content (a login
  form, a confirmation dialog), never for a data table.

### Row Icon Actions (mandatory on every table/list row — never text buttons)
Every row's Editar and Activar/Inactivar actions render as **icon buttons**
(`EditIconButton`/`ToggleActivoIconButton`, `components/ui/RowIconButtons.jsx`), never as text
buttons reading "Editar"/"Inactivar"/"Activar" — a pencil icon for Editar, a circle-with-line
(inactivar, turns danger-red on hover) or circle-with-cross (activar, turns Verde Profundo on
hover — added 2026-09-17, mirrors the danger hover so both toggle directions get a state color,
not just the destructive one) for the toggle, both 32×32px in a right-aligned flex `.actionsCell`.
Editar is always the same action (no "two directions" like the toggle), so it's Azul Vibrante at
rest, not just on hover (`.iconButtonPrimary`, same 2026-09-17 request — "más color en iconos y
estados") — the toggle stays neutral at rest, only revealing its color (danger or success) as a
hover preview of what the click will do. One shared component, not copy-pasted SVG per
table — before this rule (2026-09-04), Empresas/Usuarios/Empleados each hand-duplicated the same
markup while `CatalogCrudTab.jsx` (the generic table behind Gerencias/Procesos/Cargos/Centros de
Costo/Área Contable/Proyectos/Etapas/Frentes — 8 tables from one file) and two inline lists
(`CargoDetailPage.jsx` funciones, `EmpresaEditPage.jsx` jornadas) still had literal
"Editar"/"Inactivar" text buttons. A **page-level** edit-mode toggle (the big "Editar"/
"Guardar"/"Cancelar" button pair at the top of a detail page — `EmpresaEditPage.jsx`,
`CargoDetailPage.jsx`, the employee profile's `WizardLayout.jsx`) is a different pattern (see
View/Edit Mode below) and stays text — this rule is only for per-row actions inside a table or
list, never the page's own edit toggle.

```jsx
<div className={styles.actionsCell}>
  <EditIconButton label={`Editar ${item.nombre}`} onClick={() => startEdit(item)} />
  <ToggleActivoIconButton
    activo={item.activo}
    labelActivar={`Activar ${item.nombre}`}
    labelInactivar={`Inactivar ${item.nombre}`}
    onClick={() => toggleActivo(item)}
  />
</div>
```

### Pagination (mandatory on every server-paginated list)

**Rule:** every server-paginated table uses `Pagination.jsx` (`components/ui/`) — same footer bar,
same two buttons, same wording in every project. Never a hand-rolled pager, never numbered page
buttons with ellipsis truncation (tried once in a sibling aed project; the simpler
"‹ Anterior / Siguiente ›" pair reading a "Página X de Y" indicator is what independently proved
out correct in two different aed projects built separately). The component self-hides when there's
nothing to paginate (`total === 0` or a single page) — callers never need to remember that guard.

```jsx
<Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPageChange={setPage} />
```

| Element | Property | Value |
|---|---|---|
| Footer bar | layout | `justify-content: space-between`, `1px solid --color-border` top border, `--color-surface` background |
| Footer bar | padding | `8px` (`--space-sm`) top/bottom, `16px` (`--space-md`) left/right |
| Count text (`Mostrando X–Y de Z`) | type | `--text-data-size`, `--color-ink-muted` |
| Buttons | style | `Button variant="secondary"`, labels `‹ Anterior` / `Siguiente ›` — never bare glyphs alone, never "Prev/Next" |
| Page indicator (`Página X de Y`) | type | same as count text, sits between the two buttons |

### Fluid Width Rule (every view adapts to the viewport — no fixed widths)

**Rule:** no page, card, or section gets a hardcoded `max-width` that caps it below the available
viewport — a view must adapt to however wide the screen actually is, never assume a fixed width
and let content wrap/cut off around that assumption. This applies everywhere, not just the Tables
width guidance above: a real bug found and fixed on this exact principle, twice — `Usuarios`'s
form card at a flat `max-width: 720px` (made its field rows wrap into a vertical stack that fit
fine at full width) and `MiPerfilPage`'s outer `.page` at `max-width: 900px` (a self-service
page, still no reason to cap it — "lighter/more guided" per the Two Densities principle means
fewer fields and simpler choices, not a narrower viewport).

The only legitimate `max-width` values are on content that's narrow **by nature**, not by
assumption about screen size: a search box, a filter dropdown, a tooltip bubble, the login
split-screen's text column, a single prose paragraph capped at 75ch for readability. If a
`max-width` is being added to a `.page`, `.card`, or any container that wraps a table or a `.row`
of form fields, that's the tell this rule is about to be violated — don't.

Content that's genuinely wider than any viewport (a table with many columns) scrolls
horizontally **inside its own container** (`overflow-x: auto` on the table wrapper, same as every
`.tableWrap` in this product already does) — it never gets silently clipped, and it never forces
the whole page to scroll sideways.

### Inputs / Fields
- **Style:** white fill, 1px **Border Strong**, `radius-md`, `min-height: 44px`, `padding: 0 14px`,
  body typography. (Surface Sunken is used by the filter-grid controls on the list screens — see
  Redesign Patterns — so a *filter* reads differently from a *form field* at a glance.)
- **Focus:** border shifts to Azul Vibrante + a 3px ring at 16% Azul Vibrante, no glow/blur.
- **Error:** border and helper text switch to `danger-ink`; the error message replaces the
  helper text, it never stacks below it.
- **Disabled:** Ink Muted text, `not-allowed` cursor, same white fill and border.
- **Selects:** custom arrow with real right padding so the arrow never touches the edge; same 44px
  height as text inputs.

### Selección de uno a muchos (mandatory whenever a field assigns many items)

**Rule:** any field that assigns multiple items — a role's permission matrix, a multi-role
picker, users assigned to a record, approvers for a workflow step — uses one of two components,
never a bare `<select multiple>` (the native listbox's "Ctrl/Cmd+click to pick several" is not
discoverable, has no search, and gives no compact view of what's currently selected) and never a
long run-on paragraph of unstyled checkboxes wrapping by screen width (illegible past 4–5
options, no visual hierarchy).

- **`CheckboxGroup.jsx`** (`components/ui/`, pairs with `Checkbox.jsx`) — for a **short, fixed**
  set of independent boolean choices known ahead of time (a role's ~9 permission flags, a
  multi-role selector with a handful of roles). Renders as a `Surface Sunken` grid
  (`grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`, never a single wrapping row),
  optionally with a `selectAllLabel` toggle for longer fixed lists. No search — search is
  friction a 5–15 item fixed list doesn't need.
- **`CheckboxListSelect.jsx`** (`components/ui/`) — for a **long and/or growing** list where
  search matters (assigning employees/users to a record, picking approvers from the whole
  company) and/or the options need grouping (Procesos grouped by Gerencia, Frentes grouped by
  Proyecto — Etapa, in production today — `WizardLaboralStep.jsx`'s Gerencias/Procesos/Frentes
  fields). Selected items render as removable pill chips above a bordered panel containing a
  search input, a live count, and a "Limpiar" action. **The checkbox list itself starts
  collapsed** (2026-09-03, matches Contratación/ex-Indirectos where this pattern originates) —
  never expanded by default under the search box, regardless of how short the option list is. It
  opens on focus/click of the search input (`role="combobox"`, `aria-expanded`) and closes on an
  outside click or Escape. When open it scrolls internally (`max-height: 280px`, `overflow-y:
  auto`, `overscroll-behavior: contain` so reaching the top/bottom doesn't hand scroll off to the
  page behind it) and carries `data-lenis-prevent` so Lenis's smooth-scroll doesn't hijack the
  wheel over it (same attribute as any other internally-scrolling panel inside `<ReactLenis>` —
  see `IncapacidadesTab.jsx`'s combobox results).

**Deciding which one:** if the option count is small and won't grow (a fixed enum of roles or
permissions), `CheckboxGroup`. If it's "pick from a list that could have dozens of rows and keeps
growing" (people, records), `CheckboxListSelect`. Never reach for a bare `<select multiple>` for
either case — this was a real gap found in a sibling aed project (role/permission grids as raw
unstyled checkboxes, "assign users to a record" as a native multi-select listbox) that this rule
exists to close everywhere, not just here.

Live in this app since 2026-09-05 (port of Contratación's roles/permisos system, see
`CLAUDE.md`'s auth paragraph): `UsuarioFormPage.jsx`'s "Roles" field (`CheckboxGroup`, options
fetched live from `GET /roles` plus a synthetic `EMPLEADO` entry) and
`RolFormPage.jsx`/`RolDetallePage.jsx`'s "Módulos" field (`PermisosPorModulo.jsx`,
`features/configuracion/`, wraps `CheckboxGroup` over `utils/permisos.js#PERMISOS_DISPONIBLES` —
one checkbox per protectable module, not per nav item, since several `NAV_GROUPS` items can share
one module-level `permiso` slug here).

### Forms
- **Full-Width Rule:** forms take the full content width, not a narrow constrained centered
  column. Fields are organized into horizontal rows (`fieldSm`/`fieldMd`/`fieldLg` width
  classes inside a wrapping flex `.row`) so related fields sit side by side — a form is read
  left-to-right within a row, then top-to-bottom across rows, not as one long vertical stack.
- **Sectioned Rule:** related fields are grouped under a named section — a heading (Title
  typography) plus an optional one-line hint (Ink-muted, Data typography) — instead of one
  undifferentiated field list. Every multi-field form in the product (employee creation
  wizard, profile edit panels) uses this grouping so long forms stay scannable. The section header block (`.sectionHeader`, `WizardForm.module.css`) is the Title + a one-line hint
  over a 1px Border underline. (The 3px Azul Vibrante left border added 2026-09-17 was retired in the
  2026-10 redesign.) Detail/edit pages outside the employee profile use **Section Cards** instead
  (Redesign Patterns).
- **View/Edit Mode:** record-editing views (the employee profile) render fields read-only by
  default. A single global **Editar** button — top-right of the page header, in line with the
  page title, outside the content card — switches the whole page into edit mode at once
  (swapping to **Cancelar** / **Guardar**). It is never repeated per section: implemented by
  wrapping each section's fields in a `<fieldset disabled>` driven by one shared boolean owned
  by the page layout, not by each section independently. Guardar submits via the native
  `form="…"` attribute pointing at whichever section's `<form>` is currently visible, so the
  header button never needs to reach into child state directly. Cancelar restores the last
  saved values. This mode only applies to editing an existing record; the linear creation
  wizard has no read-only state — fields are always editable there, since there's nothing
  saved yet to protect against accidental edits.

### Section Navigation (signature component — the employee profile hub)
Two variants of the same idea — "which slice of this record am I looking at" — chosen by how
many sections there are, not by developer preference:
- **Underline tabs (≤~8 sections):** horizontal row, Ink-secondary text at rest, Ink + 2px Azul
  Vibrante underline when active. Scrollable horizontally with a fade edge if it ever
  overflows; never wrapped to a second row.
- **Vertical section nav (>~8 sections):** a fixed-width (272px) sticky white card to the left of
  the content pane (`WizardLayout.module.css` `.nav`, max-height tied to the viewport, own scroll),
  one item per line; the active item is Info Surface + Azul Vibrante 600. This is the pattern for
  the employee profile itself (21 sections). At that
  count even a flat single list stops being scannable, so the profile groups its 21 sections
  into 7 named, collapsible themes (Identidad, Situación laboral, Compensación, Tiempo y
  salud, Desarrollo, Recursos y archivos, Sistema — see `PROFILE_TAB_GROUPS` in
  `wizardSteps.js`) — an accordion, not 7 independent disclosures: only the group containing
  the active section is open, opening a different group's header closes whichever was open
  (never more than one expanded at once, and switching sections within the same group leaves
  it open rather than re-collapsing). The group header is a full-width Surface Sunken
  button (Inter 600) with a trailing chevron that rotates 90° open, `duration-standard` +
  `ease-standard`, guarded under `prefers-reduced-motion`. A single scannable vertical list,
  sticky so it stays put while the content pane scrolls (compatible with the Fluid Scroll Rule
  in §4 — Lenis wraps the content pane only, never the nav), reads as one coherent index
  instead of 21 flat rows. Below ~900px the accordion groups stack in a plain column (no
  sticky, no horizontal scroll — an accordion has nowhere to unfold sideways in a narrow
  layout, same reasoning as the primary nav's flyout-to-inline fallback below).

### Info Tooltip
- **What it's for:** a KPI, chart, or any other compact/abstracted piece of data whose meaning
  isn't self-evident from its label alone (how it's calculated, what's included/excluded,
  what a bucket like "Sin asignar" means) — explained on demand instead of via permanent
  helper text that would clutter a dense dashboard. First used on the Módulo 1 Dashboard's
  widgets and charts; reusable anywhere the same need shows up (a new report, a data-dense
  card elsewhere in the product).
- **Trigger:** a 14px circular "i" glyph (Ink Muted at rest, Azul Vibrante on hover/focus),
  placed immediately after the KPI/chart title, same line, `{spacing.xs}` gap. Never placed on
  its own row or floated away from the title it explains.
- **Behavior:** reveals on **both** hover and keyboard focus (`tabindex="0"` +
  `:focus-visible`) — a hover-only tooltip is invisible to keyboard users, which fails the
  product's WCAG AA commitment. The bubble is Ink background / Surface text, Data typography,
  `{rounded.sm}`, the Floating shadow (§4 Shadow Vocabulary — tooltips join dropdowns/popovers/
  date pickers in that list), `duration-fast` + `ease-standard` fade-and-rise-4px. Sits at
  `{zIndex.tooltip}` (500, the top of the z-index scale — a tooltip must never be occluded by
  a modal, toast, or sticky nav that happens to be open at the same time).
- **Accessibility wiring:** the trigger carries `aria-describedby` pointing at the bubble's
  `id`; the bubble carries `role="tooltip"`. Never implement this as a bare `title="…"`
  attribute (no styling control, inconsistent OS-level delay/appearance) or as `role="img"` on
  a wrapper around real content (hides the content from assistive tech — see the Dashboard
  chart accessibility fix this pattern grew out of).
- **Content:** one to two short sentences, plain language, states what's counted/excluded and
  the time window if one applies (e.g. "últimos 30 días", "mes actual"). Not a repeat of the
  title — it earns its place by adding the thing the title can't say in four words.

### Named Rules
**The Explain-on-Demand Rule.** A dense dashboard's KPIs and charts get their explanation via
Info Tooltip (§5), not via permanent caption text under every tile — permanent captions on
every single tile is the "identical card grids" AI-SaaS tell (§6 Don't) wearing a data-viz
costume. Reach for a permanent `chartHint`-style caption only when the context is genuinely
load-bearing for reading the chart correctly at a glance (e.g. Distribución salarial's "Empleados
activos por rango de salario base" hint) — the deeper "how is this computed" explanation still
goes in the tooltip either way.

### Primary Navigation (dark rail + flyout)
Redesigned 2026-10-02 ("cambio drástico, más profesional"). Two panels: a dark rail and a floating
flyout.
- **Rail (`.sidebar`):** a fixed 276px column on Azul Profundo with a very subtle vertical shade
  (down to ~82% Azul Profundo over black); white text. **No `overflow` on the sidebar** — the flyout
  escapes its width with `position: absolute` and any overflow would clip it. Top: the brand header,
  68px tall (aligned with the topbar), the aed logo as a **white silhouette**
  (`filter: brightness(0) invert(1)`, 26px — the logo asset is the colored gradient mark, so on a dark
  surface it is always rendered as a silhouette), a 1px divider and the product name ("RR.HH.") in Label
  type, uppercase, 0.08em, 70% white. Below: a micro-title ("Menú" for staff, "Mi espacio" for
  employee self-service accounts), then the rows.
- **Rows:** `Inicio` is a direct link (no flyout); the other modules are buttons that open a flyout.
  Each row: an 18px `lucide-react` icon (`currentColor`, stroke 1.75), the label in Inter 500 at body
  size, 72% white at rest, an 8% white fill on hover, and — when it holds the current route — a 13%
  white fill, weight 600 and a **4px Verde Vibrante bar** on its left edge (the one place the vivid
  green is a nav accent). A 10px chevron on rows with a flyout nudges 2px on hover. Focus ring: 2px
  Verde Vibrante.
- **Modules today:** Inicio · Administración (Empleados, Aprobaciones, Organización) · Inteligencia
  (Reportes). Modules not in use were removed from the menu, not commented; a new module is added as
  a group in `NAV_GROUPS` (`AppShell.jsx`) with its icon and per-item permission. A group with no
  item the account may see is hidden. Aprobaciones carries a red pending-count badge.
- **Employee self-service accounts** get a flat list under "Mi espacio": Mi perfil, Mis solicitudes
  and, only when they have direct reports, Mi equipo.
- **Flyout (`.flyout`):** a white floating panel (`radius-lg`, Border, `--shadow-floating`, 6px
  padding, min-width 240px) at `left: calc(100% + 10px)` of its own row, so it never pushes content.
  Opens on hover **and** keyboard focus; mouse close is debounced 300ms and cancelled when the pointer
  re-enters the nav; a navigation click or focus leaving the nav closes it immediately. Items: Ink
  Secondary text, Surface Sunken hover, active = Info Surface + Azul Vibrante 600. 200ms fade + 4px
  slide, disabled under reduced motion.
- **Mobile (<768px):** single column; the sidebar stacks above the content (max-height 60vh, own
  scroll) and the flyout renders in flow under its row.

**Exact spec**

| Element | Property | Value |
|---|---|---|
| Shell | grid columns / height | `276px 1fr` (fixed rail) / `100dvh` |
| Sidebar | background | `linear-gradient(180deg, --color-brand-deep, color-mix(--color-brand-deep 82%, black))` |
| Sidebar | padding / gap (brand → nav) | `0` / `24px` (`--space-lg`) |
| Brand header (`.brand`) | height / padding / gap | `68px` / `0 24px` / `12px` |
| Brand header | bottom border | `1px solid rgba(255,255,255,.10)` |
| Logo (`.brandLogo`) | size / filter | `26px` tall / `brightness(0) invert(1)` |
| Divider | size / color | `1px × 18px` / `rgba(255,255,255,.28)` |
| Brand name | type | Inter 600, `0.75rem`, `0.08em`, uppercase, `rgba(255,255,255,.70)` |
| Nav (`.nav`) | padding / gap | `0 14px 24px` / `4px` |
| Micro-title (`.navSection`) | type | `0.6875rem`, 700, `0.12em`, uppercase, `rgba(255,255,255,.42)`; padding `0 12px`, margin-bottom `6px` |
| Row (`.navGroupButton`) | padding / radius / type | `11px 12px` / `10px` (`--radius-md`) / Inter 500, `1rem` |
| Row | colors | rest `rgba(255,255,255,.72)`; hover bg `rgba(255,255,255,.08)` + white text; active bg `rgba(255,255,255,.13)` + white + 600 |
| Row | icon / gap | `18px` / `12px` |
| Active bar | geometry | `4px` wide, `left: -14px`, `top/bottom: 8px`, radius `0 4px 4px 0`, `--color-accent-vibrant` |
| Chevron | size / color | `10px` / `rgba(255,255,255,.45)`, `translateX(2px)` on row hover |
| Flyout | offset / min-width | `left: calc(100% + 10px)`, `top: 0` / `240px` |
| Flyout | surface | `#fff`, `1px solid --color-border`, `--radius-lg`, `--shadow-floating`, padding `6px`, item gap `2px`, `z-index: 100` |
| Flyout item | padding / radius / type | `10px 14px` / `10px` / Inter 500, `1rem`, Ink Secondary |
| Pending badge (rail) | style | pill, `--color-accent-vibrant` fill, Azul Profundo text, 700 `0.75rem`; inside a flyout item: `--color-danger-ink` fill, white text |
| Main content (`.scrollArea`) | padding | `32px 48px` (`--space-xl` `--space-2xl`); `overflow-y: auto`, `overflow-x: hidden` |
| Mobile (≤768px) | rail | single column, `max-height: 60vh`, own scroll; flyout `position: static`; content padding `24px 16px` |

### Topbar & UserMenu (session menu)

Redesigned 2026-10-02. **Rule:** the row above the scroll area (`.topbar`, inside `<main>`, before
`<ReactLenis>`) is where location and session/utility triggers live — never inside the sidebar. It is
a white 68px bar (the same height as the sidebar's brand header, so the two read as one line), with a
1px Border and, as the brand signature, a 2px `--gradient-aed` line on its bottom edge
(`.topbar::after`). **Left:** for staff, a breadcrumb "Group › Current screen" derived from
`NAV_GROUPS` (group in Data size Ink Muted, current screen in Title size 600 Ink; `Inicio` alone on the
home); for employee self-service accounts, the company/position block (`EmpresaEmpleado`).
**Right:** notification bell → Accesos gear → a 1×28px divider → `UserMenu`. A topbar dropdown
(`NotificationBell`, `UserMenu`) closes with the same pattern: a `containerRef` + `onBlurCapture` that
closes the panel when focus leaves the whole trigger+panel subtree.

| Element | Property | Value |
|---|---|---|
| Topbar | height / padding / gap | `68px` / `0 48px` (`--space-2xl`) / `8px` (`--space-sm`) |
| Topbar | surface | `#fff`, `1px solid --color-border` bottom, `::after` 2px `--gradient-aed` at `bottom: -1px` |
| Breadcrumb | type | group: Data size, Ink Muted; chevron `14px` in Border Strong; current: `--text-title-size`, 600, Ink |
| Icon triggers (bell, gear) | size / radius | `40px × 40px` / full circle; Ink Secondary; hover Surface Hover; focus `2px solid --color-primary`, offset `2px` |
| Gear | visibility / target | accounts with `ver_usuarios`, `ver_roles` or ADMIN; links to `/usuarios` (or `/roles` if that is the only permission) — a plain navigation link, never a stateful trigger |
| Bell badge | style | `16px` pill, `--color-danger-ink`, white `10px` 700 count (`9+` cap) |
| Divider | size | `1px × 28px`, `--color-border-strong`, `8px` horizontal margin |
| UserMenu trigger | shape | `44px` tall pill (full radius), white, `1px solid --color-border-strong`, padding `0 12px 0 5px`, gap `10px`; hover Surface Sunken |
| UserMenu avatar | size / fill | `34px` circle, `linear-gradient(135deg, --color-brand-deep, --color-primary)`, white initials (max 2), Display `0.8125rem` 600 |
| UserMenu name | type | Data size 600 Ink, `max-width: 220px`, ellipsis; Ink Muted caret |
| UserMenu panel | geometry | `260px`, right-anchored, `top: calc(100% + 8px)`, white, `1px solid --color-border`, `--radius-lg`, `--shadow-floating`, padding `4px`, `z-index: 100`, 200ms fade + 4px slide (off under reduced motion) |
| UserMenu panel header | content | name (600) / email (Label size, Ink Muted) over a 1px Border; items: `Mi perfil` (only for roles with a real profile) and `Cerrar sesión`, `10px 16px` padding, Surface Hover on hover |
| Notification panel | see | Redesign Patterns → Notification Panel |
| Mobile (<640px) | topbar | wraps (`height: auto`, `min-height: 68px`), breadcrumb hidden |

### Accesos (mandatory home for account/access administration)

**Rule:** system/access configuration — who has an account, what role they have, and (later)
permissions/parameters/importers — is a **normal route** with a side menu, like the employee
profile (§5 Section Navigation, vertical variant), **never** a floating panel/drawer/modal. An
earlier version of this pattern opened as a slide-out overlay behind a topbar gear icon; it was
rejected (explicit product decision) precisely because it *didn't* feel like a normal part of the
app the way the employee profile does — being a real, bookmarkable, back-button-friendly route is
the point, not an implementation detail to trade away for a flashier entrance animation.

**Updated 2026-10-03.** The Accesos menu is now its own white card (248px, sticky, scrolls on its
own) instead of reusing the profile nav classes: a "Configuración" heading, then grouped sections
— **Accesos** (Usuarios, Roles) and **Sistema** (Datos) — each row an icon chip (32px, Surface
Sunken) + label (600) + one-line hint in Ink Muted; the active row is Info Surface with Azul
Vibrante text. A group with no section the account may see is hidden entirely. The content pane
carries `min-width: 0` so wide tables cannot push the page past the viewport. Everything below
still holds, except where it names the old `.nav`/`.navItem` classes or "En desarrollo" rows
(Parámetros/Importadores stay commented out, not shown).

`AccesosLayout.jsx` (`features/configuracion/`) is the shared wrapper: the grouped menu card
(above) beside a content pane. Sections today (`ACCESOS_GRUPOS`): **Usuarios** (`ver_usuarios`),
**Roles** (`ver_roles`) and **Datos** (`ver_organizacion`); Parámetros/Importadores stay commented
out. Every real page under Accesos (`UsuariosListPage`, `UsuarioFormPage`, `RolesPage`,
`RolDetallePage`, `RolFormPage`, `DatosPage`) wraps its own content in `<AccesosLayout>`
individually — there is no single shared container page, exactly like no single page wraps every
employee profile tab; each route independently renders the same layout so the menu stays visible
(and highlights the active section) across every step, including the create/edit forms reached from
a list.

The topbar gear (40px circle, see Topbar & UserMenu) is a **plain navigation link** to the first
Accesos route the account may open, not a stateful trigger. **When a new item is only a placeholder
today but will need its own screen, decide up front whether it belongs in the primary sidebar (daily
operational work, `NAV_GROUPS`) or Accesos (`ACCESOS_GRUPOS`, occasional system configuration) —
don't default everything into one bucket.**

**Content spacing inside `.content` is the page's own job, not `AccesosLayout`'s.**
`WizardLayout.module.css`'s `.content` (shared with the employee profile) is a bare `flex: 1`
block with no `gap` — that's correct there, since it only ever wraps one `.card`. An Accesos page
puts multiple direct siblings inside `<AccesosLayout>` (a toolbar, an error banner, the table/
card), so `AccesosLayout.jsx` wraps `children` in its own local `.contentInner` (`display: flex;
flex-direction: column; gap: var(--space-lg)` — `AccesosLayout.module.css`) rather than adding a
`gap` to the shared `WizardLayout.module.css` file, which would be a cross-cutting change to the
employee profile for a need that's specific to Accesos. This was a real bug: the first version had
zero space between the search toolbar and the table, because nothing above it was providing any.

**No `max-width` cap on an Accesos card/form.** The Full-Width Rule (§5 Forms) applies here same
as everywhere else — a capped width (e.g. `max-width: 720px` on `.card`) is exactly what makes a
`.row` of side-by-side fields (Nombre + Email) run out of room and wrap into a vertical stack
instead of staying horizontal. This was the second real bug found in `UsuarioFormPage.jsx`: the
nav column plus a narrow `.card` left too little width for two `fieldLg` fields side by
side. Never re-introduce a width cap on a form card inside Accesos (or anywhere else per the
Full-Width Rule) to make it feel more "centered" — that reads as broken on this surface, not
intentional.

**`.row` never sets `align-items` — stretch (the default) is what keeps a row's inputs aligned.**
A bare `<Field>` is `flex-direction: column` (label → control → optional helper/error); with the
default `align-items: stretch`, every Field in a `.row` grows to the row's tallest sibling, but
because none of Field's own children are flex-grown, that extra height lands *after* the shorter
field's content (below its helper text) — so every input in the row still starts at the same Y
regardless of which sibling has helper/error text and which doesn't. This is the same convention
`WizardForm.module.css` already uses (no `align-items` on `.row`) — the third real bug here was
adding `align-items: flex-end` to Usuarios' own `.row`, which ties every control's position to
the bottom of the row's *tallest* item (including trailing helper text), so a control with no
helper text (the `Generar contraseña aleatoria` button, a bare `<Button>` with no `<Field>` around
it) drifted down to chase whatever the neighboring `Contraseña` field's helper line height was
that render. A bare non-`<Field>` control next to a `<Field>` in the same row still needs its own
match for the label's height, or it starts at the row's very top instead of level with the input
— `.actionRow`/`.actionRowSpacer` (`Usuarios.module.css`) is that fix: a `visibility: hidden`
label-sized spacer (`--text-label-size`, `line-height: 1.3` — the same metrics as `Field`'s own
`.label`) above the button, so it starts exactly where the neighboring input starts.

**The page title/header block renders *inside* `<AccesosLayout>`, as its first child — never
above/outside it.** Explicit correction from the user (2026-09-05, after seeing the Usuarios list
and Roles list both put their `<h1>`+action-button header *before* `<AccesosLayout>`): a header
placed outside `<AccesosLayout>` spans the *entire* page width, sitting above both the secondary
nav column and the content column — visually implying the title belongs to the whole Accesos
section rather than to the specific screen (list/table or form) it actually titles. Every Accesos
page's `return` must look like:
```jsx
return (
  <div className={styles.page}>
    <AccesosLayout>
      <div className={styles.header}>...<h1>...</h1>...</div>
      {/* search input, table, or form card */}
    </AccesosLayout>
  </div>
);
```
never a header sibling preceding `<AccesosLayout>`. This also means any full-width element meant
to line up with the table below it (a search input, say) needs to actually BE full-width, not
capped with a `max-width` sized for a narrower context — the search input on the Usuarios list
had a stray `max-width: 360px` (leftover from an early Contratación-clone pass) that no longer
matched the table's width once the header moved inside the same column; removed.

### Back Link (mandatory on every drill-down route)

**Rule:** any route reached by drilling into one specific record — a dynamic segment like
`:id` that isn't a sibling tab selector (contrast `:section` on `/organizacion/:section`,
`/nomina/:section`, etc., which stays inside the same list/tab-strip and needs no back link) —
must render a `<BackLink>` in its page header pointing to the list or parent it came from. The
sidebar rail is never an acceptable substitute: getting back that way means opening the
category flyout and re-clicking the item, which is two extra clicks and, worse, forces the
user to re-navigate the tree they just left instead of retracing one step. This was a real gap
found in the product family (not this codebase specifically) — a route with no way out except
the sidebar — so it's now a hard requirement here, not a nice-to-have.

Component: `components/ui/BackLink.jsx` — a single `<Link>` with a 14px hand-drawn
chevron-left (`currentColor`, 1.4px stroke, same convention as the Info Tooltip icon) and a
label, `color-ink-muted` at rest darkening to `color-ink` on hover, `text-data-size` (14px),
weight 500. One component, reused everywhere a back link is needed — never re-inline the SVG
per page (this used to be duplicated between `WizardLayout.jsx` and `EmpresaEditPage.jsx`
before it was extracted). Reference usage: `WizardLayout.jsx` (`/empleados/:id/perfil/*` and
the creation wizard both render `<BackLink to="/empleados">`) and `EmpresaEditPage.jsx`
(`<BackLink to="/organizacion/empresas">`).

### Favicon

**Rule:** the browser tab icon is the same square aed isotype (`frontend/public/favicon.png`,
256×256, distinct from the wider horizontal logo used in the sidebar brand header) in every
aed product, this one included — not a per-project branding choice. Wired via
`<link rel="icon" type="image/png" href="/favicon.png" />` in `index.html`.

### Filtros persistentes (mandatory on every filterable list)

**Rule:** a list view's search box, filter `<select>`s, and current page are part of that
screen's state, and leaving the screen (via `<BackLink>`, the sidebar, or browser back) and
coming straight back must not reset them. React unmounts the list component on the way out and
remounts it fresh on the way back, so plain `useState` silently loses everything — this was a
real bug reported against this product: pick filters, open a record, come back, filters gone.
Any list page with a search input or filter `<select>` must keep that state in
`usePersistentState` (`hooks/usePersistentState.js`), not `useState` — same call signature as
`useState`, so it's a drop-in swap.

`usePersistentState(key, defaultValue)` persists to `sessionStorage` under `key` (not
`localStorage` — this is per-tab/per-session state, not something that should follow the user
across days or bleed into a different tab open on the same list with different filters).
Namespace `key` per page (`'empleados-list:filters'`, `'empresas-list:busqueda'`) so two
different lists never collide. Reference usage: `EmpleadosListPage.jsx` (`filters`, `page`) and
`EmpresasTab.jsx` (`busqueda`, `filtroEstado`).

### Sortable columns (mandatory on every data table)

**Rule:** every column of a data table that holds a comparable value (text, number, date) must
be clickable to sort the table by that column — no table ships with a fixed, unsortable row
order once it has more than a handful of rows. Click cycles the same column through 3 states:
unsorted → ascending → descending → unsorted again; clicking a different column always starts
that new column at ascending and drops whatever column was previously sorted (only one column
sorts at a time). This is already the pattern in 8 of this product's tables (Empleados,
Contratación, Nómina, Tiempo, Talento Humano, Documentos, Reportes, Organización) — it is now a
hard requirement for every table added after this point too, not a per-page choice.

Two-piece implementation, always used together, never reimplemented per page:

- `hooks/useSortableTable.js` — `useSortableTable(rows, valueGetters)` owns the `{ key,
  direction }` state and returns `{ sortedRows, sort, toggleSort }`. `valueGetters` is a
  `{ columnKey: (row) => comparableValue }` map defined once per table, right where its columns
  are defined — this is what lets a column rendering a `<Link>`/`<Badge>`/formatted string
  expose the real underlying value to compare (e.g. the plain full name, not the JSX). Sorting
  is locale-aware (`localeCompare(..., 'es', { numeric: true, sensitivity: 'base' })` for
  strings, numeric subtraction for numbers) and always pushes empty/null values to the bottom
  regardless of direction.
- `components/ui/SortHeader.jsx` — goes *inside* an existing `<th>` (never replaces it, so it
  inherits that table's own padding/typography) and renders the column label plus the sort
  arrow as one clickable, focusable button: `▲` ascending, `▼` descending, `⇅` at rest — the
  same three glyphs, same 0.65em size, in every table. The arrow sits at 35% opacity when that
  column isn't the active sort key, full opacity + `color-primary` when it is — never a
  different icon set or a two-state (asc/desc only, no neutral) arrow.

```jsx
const valueGetters = useMemo(() => ({
  nombre: (e) => `${e.primer_nombre} ${e.apellidos}`,
  salario_base: (e) => Number(e.salario_base ?? 0),
}), []);
const { sortedRows, sort, toggleSort } = useSortableTable(empleados, valueGetters);
// ...
<th aria-sort={ariaSort(sort, 'nombre')}>
  <SortHeader label="Nombre" sortKey="nombre" sort={sort} onSort={toggleSort} />
</th>
```

`ariaSort(sort, key)` (exported from the same hook file) maps the current sort state to the
`aria-sort` value (`'ascending' | 'descending' | 'none'`) for that `<th>` — set it on every
sortable header, it's how a screen reader announces the current order. Reference usage:
`EmpleadosListPage.jsx` is the fullest example (13 sortable columns).

### Dashboard KPIs & Charts (mandatory on every dashboard)

**The Rationed KPI Rule:** a dashboard shows **5 KPI tiles at most**, in one flat
`.statsGrid` — never grouped into multiple labeled sub-sections the way an early version of
this dashboard did (10 tiles across 4 groups: Plantilla/Ausencias y vencimientos/Movimiento del
mes/Costos). More tiles reads as "we tracked everything we could query," not "we picked what
matters." Before adding a KPI, it has to clear two bars:

- **Not derivable from another KPI already on screen.** The original dashboard showed `Total
  empleados`, `Empleados activos`, *and* `Empleados retirados` as three separate tiles — the
  third is arithmetic on the other two. Kept only `Empleados activos` (the number RR.HH.
  actually watches day to day).
- **Not the same underlying query framed twice.** `Contratos por vencer` and `Próximos retiros`
  were, per the code's own comment, *the same backend query* rendered as two different tiles —
  one metric, one tile. If two KPIs would ever move in exact lockstep, merge them (`Personas en
  vacaciones` + `Personas incapacitadas` → one `Ausentes hoy` tile: what a manager actually
  wants to know is how many people aren't at work today, not which of two reasons).

**Current layout (2026-10-02).** The Dashboard now reads top to bottom as: a greeting header (date
chip at the right); one `.statsGrid` of **four** KPI tiles (`auto-fit`, `minmax(230px, 1fr)`); a
**"Nómina base"** row of three salary tiles (`SalarioFiltroTile`), each with a Select to slice the
figure by empresa / gerencia / proceso; **"Composición del equipo"** (`.chartsGrid`, `auto-fit`
`minmax(340px, 1fr)`: a category bar plus two donuts); and **"Requiere seguimiento"** (the Alerts
panel). Section titles use `.sectionTitle` (Headline-scale). The five-tile ceiling and the two bars
above still apply to the KPI grid; the salary row is a different widget (a filterable figure), not an
extra KPI.

A KPI that's really a *reminder/list* (who's having a birthday this month) is an **Alert**, not
a KPI tile — the neutral-severity group in the Alerts panel (below). Don't stretch the KPI grid
to hold something that's a list of people disguised as a number.

**Charting library: ApexCharts (`react-apexcharts`), never Recharts, never any other charting
library.** Charts still follow every existing rule unchanged — `ChartCard` wrapper (title +
`InfoTooltip` description + a visually-hidden `.srOnly` text summary as an accessible sibling,
never `role="img"` swallowing the chart's own interactive tooltip), and `usePrefersReducedMotion()`
wired to `chart.animations.enabled` so motion-sensitive users get static charts. **Pick the
chart shape from what the data actually asks, not from habit** — the first ApexCharts pass just
mechanically re-skinned every chart as a bar, which produced six same-ish boxes in a row (the
"identical cards" tell, just wearing bars instead of icons). The real dashboard needs four
distinct shapes:

- **Category bar** (`CategoryBarChart.jsx`, horizontal, one series, single `DATA_INK` color) —
  for a count-by-category comparison where the category list can grow long (Departamento can
  have many rows) — a bar scales to N categories and stays comparable by length; a donut with
  8+ thin slices doesn't. `plotOptions.bar.horizontal: true`, `colors: [DATA_INK]`,
  `dataLabels.enabled: true`. `DATA_INK` is the real Azul Vibrante (`#232BED`) as of 2026-10-01 —
  previously a deliberately dimmed `#1B21A6` to protect the old 10% Rationed Brand Rule budget
  (see §2 Colors); now that the budget was raised to 20%, the dimmed tone's whole reason for
  existing went away, so the bar uses the literal brand token directly, same as the donut's
  `CATEGORICAL_RAMP` already did.
- **Donut** (`DonutChart.jsx`, new) — for a **composition** question with few (2–6) nominal
  categories where "what share of the total is this" is the actual thing being asked (Género,
  Tipo de contrato) — a shape a bar chart can't answer as directly as an angle/area can. Colors
  come from `CATEGORICAL_RAMP` (`palette.js`), assigned in first-seen order (not alphabetical,
  so a color doesn't jump between refreshes just because the backend returned rows in a
  different order) — **except** a "Sin especificar"/"Sin asignar" slice (a missing value, not a
  real category), which always renders in `NEUTRAL_SLICE` (`--color-border-strong`), never a
  ramp color — `esSinDato(label)` in `palette.js` is the check. The donut's center shows the
  total count (`plotOptions.pie.donut.labels.total`), so the whole doesn't need to be summed by
  eye. Legend sits to the right (`legend.position: 'right'`), never a separate caption below —
  it *is* the category labels, a redundant list underneath would just repeat it.
- **Ordinal bar** (`OrdinalBarChart.jsx`, vertical, one color per bar from `ORDINAL_RAMP`) — for
  **ordered** buckets where the sequence itself is the point (Antigüedad, Distribución
  salarial) — stays a bar on purpose: a donut's clock-position ordering is far weaker than a
  bar's left-to-right reading for "this bucket is more than that one." `plotOptions.
  bar.distributed: true` is the ApexCharts equivalent of Recharts' per-bar `<Cell fill=.../>`;
  `colors: data.map((_, i) => ramp[i % ramp.length])`.
- **Trend line** (single series over time, `stroke.curve: 'smooth'`, `markers` sized for a
  visible dot per point, no area fill — a filled area implies a magnitude that isn't there for a
  monthly headcount-change line) — not currently in use on the dashboard (its one instance,
  `RotacionChart.jsx`/"Rotación mensual", was removed 2026-09-04 at the user's explicit request),
  but the pattern stays documented here for the next time a time-series question comes up.

Grid lines, axis label color, and tooltip border all reference the same design tokens as
before (`CHART_GRID`/`CHART_AXIS_TEXT` = `var(--color-border)`/`var(--color-ink-muted)`).

### Alerts panel (mandatory on every dashboard)

**One panel, grouped by urgency — never a grid of same-size cards, one per data source.** The
first pass at this dashboard had six identical `AlertCard` boxes (Documentos vencidos,
Documentos faltantes, Contratos por vencer, Licencias vencidas, Certificaciones vencidas,
Cumpleaños) in a flat grid — the exact "same-size cards of icon/heading/text as the page
structure" default a dashboard reaches for when nobody decided otherwise. Two real problems hid
inside that grid, not just its look: "Licencias vencidas" and "Certificaciones vencidas"
queried overlapping data (a vencida licencia is a `tipo='Licencia'` certificación row, so it
showed up in *both* boxes), and nothing on screen answered "what do I need to look at first" —
six boxes of equal visual weight is the same as no priority at all.

The fix is `AlertGroup.jsx` — **one Surface panel** (`.alertsPanel`), containing 2–3 severity
groups stacked vertically, hairline-divided (`.alertGroup + .alertGroup { border-top }` — never
a colored side border on a group or a row):

- **Requiere atención** (danger) — everything already past its date: documentos vencidos +
  certificaciones/capacitaciones/licencias vencidas as *one* merged, deduplicated list (each row
  tagged with its real `tipo`: Documento/Certificación/Capacitación/Licencia — a single backend
  query, `certificacionesVencidas()` with no type filter, already returns all three
  certificación types together; there is no separate "licencias" query anymore).
- **Por vencer** (warning) — not yet due, but needs action soon: contratos por vencer + documentos
  obligatorios faltantes.
- **Cumpleaños del mes** (neutral) — kept as its own group, not merged into either of the above:
  it's not a risk or a deadline, mixing it into "pendientes" would misrepresent it.

Within a group, rows sort by urgency, most pressing first — `Requiere atención` and `Por vencer`
sort by days-until/-since (ascending: most overdue, or soonest-due, at the top); a row with no
natural date (documentos faltantes) sorts last. Each row (`.alertRow`, a `<Link>`, never a
nested card — hairline `border-bottom`, no border/background at rest, `--color-surface-hover`
on hover only) is one horizontal line: a short label tag (`.alertRowTag`, Label typography,
fixed `min-width` so tags line up down the column like a table), title + meta
(`.alertRowInfo`), and a right-aligned, `tabular-nums` days indicator (`.alertRowDias` —
`"Venció hace N días"` / `"En N días"` / `"Hoy"`; `--color-danger-ink` + weight 600 only inside
`Requiere atención`, `--color-ink-muted` everywhere else — severity already reads from which
group a row sits in, so the individual row doesn't need its own loud color to repeat it). An
empty group still renders its header (with a `0` count badge) plus a one-line "Sin pendientes"
style message — a group silently disappearing reads as "nothing to check," an explicit empty
state reads as "checked, nothing there," which is what a payroll-adjacent tool should say.

### Login Split Screen (mandatory on the login screen only)

Redesigned 2026-10 (the earlier boxless form + 64px logo spec is superseded). **Rule:**
`LoginPage.jsx` (`features/auth/`) is a two-column split screen — a brand panel on the left (a real
photo under an Azul Profundo scrim, the logo as a white silhouette, a headline and short benefit
chips) and a form side on the right (the Bg canvas with one centered white card). A 5px
`--gradient-aed` bar runs across the top of both columns (`.splitWrap::before`).
`CambiarPasswordPage.jsx` does **not** get this treatment (it shares `.wrap`/`.card`, no photo, no
brand panel) — it is reached right after login, the "this is aed" moment already happened once.

- **Brand panel (`.brandPanel`):** `1.05fr` of the width, padding `44px 56px`, a flex column with
  `justify-content: space-between`: the white-silhouette logo (`34px`, `brightness(0) invert(1)`) at
  the top, the text block at the bottom. The photo (`/login-hero.jpg`, `cover`) and the scrim are two
  layers set inline in `LoginPage.jsx` (the scrim is Azul Profundo, bottom-heavy so the copy always
  passes contrast whatever the photo shows). Headline: `font-display`, `clamp(2rem, 1.3rem + 2.4vw,
  3.25rem)`, weight 600, line-height 1.12, tracking `-0.02em`, white, text block `max-width: 520px`.
  Subtext: `--text-title-size`, white at 82%. **Benefit chips** (`.benefits`): pills with `8px 14px`
  padding, a 1px `rgba(255,255,255,.28)` border, a 10% white fill, Data size 500. The whole panel is
  `aria-hidden` (decorative) and `display: none` below 900px.
- **Form side:** `.formPanel` is the Bg canvas with `32px` padding; `.formCard` is a white card,
  `max-width: 440px`, padding `40px 36px 32px`, 1px Border, **`radius: 20px`**, and a brand-tinted
  shadow (`0 20px 50px` at 12% Azul Profundo). This is the single deliberate exception to the
  Floating-Only Rule's spirit — the login card is the one object on an otherwise empty canvas, so it
  floats. Contents, centered: the **colored** aed logo (`44px`), the title ("Te damos la bienvenida",
  1.5rem/600) and a Data-size Ink Muted subtitle; then the fields — label (Label size) above a `48px`
  input on a Surface fill with a leading 18px `lucide-react` icon (Mail / Lock) and, on the password
  field, a 36px show/hide toggle; a danger-surface alert for errors; a full-width `50px` Azul Vibrante
  submit button (hover `--color-primary-hover`); and a Label-size footnote ("¿Problemas para
  ingresar? Escribe a Recursos Humanos.").
- **Copy and photo are content, not mechanic** — the headline/subtext/chips and `/login-hero.jpg` are
  HRMS-specific; a new project writes its own and picks its own real, domain-relevant photo (never a
  generic stock cliché), keeping the same structure.
- **Mobile (`max-width: 900px`):** one column, the brand panel is hidden; below 480px the card loses
  its side padding.

**Assets:** `/aed-logo.png` is the standing brand asset (the colored mark; the brand panel and the
sidebar render it as a white silhouette, the form card shows it in color); `/login-hero.jpg` is a real
photo from Unsplash (free license, no attribution required) — swap it only for another real,
specific photo.

### Redesign Patterns (2026-10-03)

The patterns below came out of the full-product redesign (Empleados, Aprobaciones, Organización,
Reportes, Configuración, notifications, typography). They are the reference for any new screen.

**Cards & surfaces.** Page canvas = Bg. Cards, table containers, the Accesos nav and floating
panels = Card White (`#FFF`) with a 1px Border and `radius-lg`; section cards use 22–32px padding.
Form fields = white, Border Strong, `radius-md`, 44px (see Inputs / Fields). The **filter-grid
controls** on Usuarios/Reportes = Surface Sunken, 1px Border, `radius-md`, 44px. **Modals** = Surface
fill, `radius-lg`, up to 560px wide, `--shadow-modal`, a 45% ink scrim. Floating panels (notification
bell, menus, flyout) add `--shadow-floating`; nothing else gets a shadow (the login card is the one
documented exception).

**Detail Hero.** Every detail view (employee profile, Empresa, Cargo, Gerencia, Usuario, Rol)
opens with the brand hero from `WizardLayout.module.css` (`.hero`): the Azul Profundo → Azul →
Azul Vibrante gradient, a 72px circular avatar with a 3px white border (initials or a
`lucide-react` icon), the name (1.5rem/600), one subtitle line (role, email, "Rol del sistema"), a
muted meta line, and status Badges stacked at the right. This is a sanctioned use of the brand
gradient (an addition to the Gradación aed Rule's locations) — one hero per page, never repeated
inside tabs. It is followed by either a KPI row or the section cards.

**Section Cards (detail & edit forms).** Instead of one big card, a detail/edit form is a vertical
stack of cards, each a named section: a Title (600) + a one-line hint (Data, Ink Muted), then its
fields (rows that wrap, `fieldMd`/`fieldLg`). The action bar sits below the stack — Cancelar on
the left, the primary action on the right, and a destructive action ("Eliminar rol") as a `danger`
button next to the primary, shown only when it is allowed. System items (ADMIN/EMPLEADO roles)
show an Info banner instead of controls that would do nothing.

**KPI Row.** `display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:
var(--space-md)` of white cards: a 1.75–2rem/600 tabular figure, a Data label in Ink Muted, and (on
detail pages) an optional 36px icon chip on Info Surface. Four cards per row at most. A card that
navigates is an `<a>` with a Border Strong hover. Used for list summaries (Usuarios, Reportes),
detail summaries (Empresa, Cargo, Gerencia) and report summaries.

**Filter Grid.** Filters are a grid (`repeat(auto-fill, minmax(170–190px, 1fr))`, `align-items:
end`), each a **visible label** (Label size, 600, Ink Muted, sentence case) above its control;
the search field spans two columns; a primary criterion (Empresa) is outlined in Azul Vibrante. A
dashed **"Limpiar filtros"** button appears only while some filter is active. Never filters with
placeholder-only labels.

**Grouped Tab Bar.** When a module has more than ~6 sections (Organización, Reportes), the
sections sit in one white card as labeled groups (micro-title: 0.6875rem/700, 0.1em tracking,
uppercase, Ink Muted) of pill tabs — icon (16px) + label (600), `radius-md`; the active tab is Info
Surface with Azul Vibrante text. The bar wraps instead of scrolling horizontally. Groups follow the
business's own mental model (Estructura / Proyectos de obra / Vista general; Personal /
Contratación y pago / Tiempo / Desarrollo y archivo).

**Bulk Actions Bar.** Lists that support mass actions (Usuarios) show checkboxes in a leading
column; when at least one row is selected a strip appears above the table (Info Surface, Border,
`radius-md`): the count in Azul Vibrante 700, the actions as secondary buttons, a "Quitar
selección" link at the far right. Every bulk action confirms in a Modal; a result the user must
copy once (temporary passwords) opens in a Modal with a CSV download. Backend caps a batch (50) and
never applies an action to the acting user's own account.

**Aligned Cards Rule.** Cards in a grid whose inner parts must line up across cards (the Datos
company cards) use `grid-row: span N; grid-template-rows: subgrid` so each band (header, last-sync
box, notices, button) takes the height of the tallest sibling. **Never clip text to force
alignment** — no `line-clamp`, no fixed heights; reserve `min-height` for bands instead (header
72px, last-sync box 100px) so cards in different grid rows also match. Transient messages (a sync
result or error) get their own band so they cannot push the button of one card out of line.

**Detail Is a Route, Not a Modal.** A drill-down (a gerencia from the Organigrama) is its own route
(`/organizacion/organigrama/:id`) with a BackLink, the hero, KPIs and paginated lists (client-side
`Pagination`, 20–30 per page). Modals are only for confirmations and one-time results.

**Fixed-height detail pages.** Pages with a side nav (employee profile, Empresa) don't scroll as a
whole: the nav and the content pane scroll independently (both `data-lenis-prevent`), and the hero
lives inside the content pane.

**Notification Panel.** The bell opens a 392px white panel (`radius-lg`, `--shadow-floating`):
header with the Title, a count chip (Info Surface / Azul Vibrante) and "Marcar todas como leídas";
pill tabs **Todas / Sin leer / Contratos**; a scrolling body between a fixed header and a fixed
footer link ("Ver contratos por vencer", only for accounts with reports access). Body sections have
micro-titles — **Por decidir** (requests waiting for *my* decision: RR.HH. approvals, a manager's
team), **Tus solicitudes** (outcome of my own requests, with an unread dot), and contract
reminders grouped by urgency (esta semana / este mes / más adelante). Each item: a 36px rounded-
square icon on a semantic surface, a bold short title, Data detail, Label meta, and a right-hand
chip (count, or urgency: danger ≤ 7 days, warning ≤ 30, neutral beyond). Empty state: an icon in a
circle, "Estás al día". The bell's badge counts pending decisions + unread + reminders.

**Reportes: charts & saved views.** Each report has a KPI row, a collapsible "Gráficos" section
(two charts computed in the browser from the filtered rows, reusing the Dashboard's ApexCharts
`DonutChart`/`CategoryBarChart`), a Filter Grid, and a strip of **saved views** (a select +
"Guardar filtros actuales" + delete) that stores a named filter set per user. Exports (CSV / Excel /
PDF) carry an icon and honor the active filters; columns marked `pdf: false` appear only in CSV/Excel.

**Self-service request pages (2026-10-03).** Each request type (`/mis-solicitudes/:tipo`) is a Detail
Hero (the type's icon, its one-line purpose, and a badge saying who approves — or "No requiere
aprobación"), an Info callout with the rules (deadlines, attachments), then Section Cards: the
history (with a count chip; an empty state is a dashed box, never bare text) and "Nueva solicitud"
(the form: fields in wrapping rows, attachments as dashed rows with a secondary file button, and an
action bar whose **primary** button submits). A balance/summary (vacation days) is a KPI Row. The
approver's screen (Mi equipo) is a KPI Row plus one card per request type, each row a 40px avatar
+ name + dates and the actions Rechazar (secondary) / Aprobar (primary). The first-login password
screen is the login card with live requirement checks (the submit enables only when all are met and
both fields match).

## 6. Do's and Don'ts

### Do:
- **Do** keep the app canvas cool-tinted neutral (#EDEEFE family) — never the warm cream/sand
  "AI default."
- **Do** reserve Azul Vibrante and Verde Vibrante for actions, status, identity moments, and
  (since 2026-10-01) the Dashboard's data-emphasis surfaces — the Rationed Brand Rule
  (~20% of any screen).
- **Do** use underline tabs for short section sets and a sticky vertical section nav once a
  detail view outgrows what a tab row can hold (see Section Navigation, §5) — the employee
  profile is the reference case at 21 sections.
- **Do** use `tabular-nums` on every numeric table column (now the global default on `body`).
- **Do** use a single typeface — Inter — and vary weight/size for hierarchy (The One Family Rule);
  monospace only for copy-exactly values.
- **Do** open every detail view with the Detail Hero and build detail/edit forms as a stack of
  Section Cards (Redesign Patterns, §5).
- **Do** keep a drill-down (a record, a gerencia) as its own route; use a Modal only to confirm an
  action or reveal a one-time result.
- **Do** align cards in a grid with subgrid and `min-height` bands — never by clipping their text.
- **Do** give every loading/empty/error state real, deliberate content — this product handles
  salaries and medical data, ambiguity erodes trust.
- **Do** let list/table views and forms use the full content width, organizing form fields
  into horizontal rows grouped by named section (see Forms, §5) — never a single narrow
  vertical field stack.
- **Do** gate an existing record's fields behind one global Editar/Guardar/Cancelar control in
  the page header (see View/Edit Mode, §5) — the creation wizard is the only place fields are
  always editable, since nothing is saved there yet.
- **Do** wrap every independently-scrolling content pane in Lenis so scrolling eases
  continuously instead of stepping section by section (see the Fluid Scroll Rule, §4) — but
  leave the sidebar nav and any fixed chrome on native scroll.
- **Do** explain a non-obvious KPI or chart with an Info Tooltip next to its title (§5,
  keyboard-reachable, `role="tooltip"`) instead of permanent caption text under every tile —
  the Explain-on-Demand Rule (§5).
- **Do** render a `<BackLink>` (§5) in the header of every route that drills into one specific
  record — never leave the sidebar as the only way out of a screen.
- **Do** keep a list view's search/filter/page state in `usePersistentState` (§5), not
  `useState` — it must survive leaving the screen and coming back.
- **Do** keep the topbar's triggers consistent (§5, Topbar & UserMenu): icon buttons are identical
  40px circles and the user pill is 44px — a mismatched row of buttons is the tell of an unplanned
  shell.
- **Do** render the sidebar's logo as a white silhouette on the dark rail and keep `overflow` off the
  sidebar so the flyout is never clipped (Primary Navigation, §5).

### Don't:
- **Don't** replicate the SAP/Oracle-2000s look: dense gray forms with no hierarchy, mismatched
  icon styles/weights thrown together ad hoc, unlabeled cramped tables. (This doesn't ban
  `lucide-react` itself — the sidebar rail uses it deliberately, one library, one size, one
  stroke weight, applied consistently. What it bans is reaching for whatever icon happens to be
  at hand, at inconsistent sizes/weights, the way legacy enterprise UIs do.)
- **Don't** ship generic AI-SaaS scaffolding: identical icon+heading+text card grids, gradient
  hero metric tiles, uppercase eyebrows above every section, side-stripe colored borders on
  cards/alerts. (The Dashboard's KPI/chart-card top accent, §2 Colors "Gradación aed Rule"
  location 3, is a *different* thing from a banned side-stripe: it's a thin TOP edge using the
  manual's own 3-stop degradé. That Dashboard accent was removed in the 2026-10-02 redesign; the
  remaining gradient spots are the login bar, empty states, the topbar edge and the Detail Hero.
  None of them is a colored left-border repeated on every card to encode a category, which is the
  actual pattern this bullet bans.)
- **Don't** let the interface feel like a playful consumer app — no bouncy/elastic motion, no
  mascot-like illustration, no gratuitous color on data-dense screens.
- **Don't** use Off-white aed (#F0ECE6) as a screen background — it's a print-collateral color.
- **Don't** add a shadow to anything that isn't floating above the page (see Floating-Only
  Rule).
- **Don't** apply gradient-text (`background-clip: text`) anywhere — the aed gradient is a
  graphic accent element (per the brand manual), never a text treatment.
- **Don't** repeat an Editar/Guardar/Cancelar control inside every tab or section of a detail
  view — one global control per page, always.
- **Don't** grow the accent-vibrant status dot into a stripe, larger chip, or full badge fill —
  it stays a 6px indicator, the one deliberate exception to badges never using the raw accent
  token (see Status Dot, §5).
- **Don't** ship a drill-down route (a real `:id`, not a `:section` tab) without a `<BackLink>`
  in its header — making the sidebar the only way back is the failure this rule exists to
  prevent (see Back Link, §5).
- **Don't** hold a list view's filters/search/page in plain `useState` — it silently resets the
  moment the user leaves the screen and comes back (see Filtros persistentes, §5).
- **Don't** add zebra striping, a sunken header or a colored header underline to a table (Tables, §5)
  — tables are white with a quiet header.
- **Don't** make report rows clickable or add a second typeface — both were explicit decisions
  of the 2026-10-03 redesign.
- **Don't** clip or truncate a card's text (`line-clamp`, fixed heights) to make cards line up.
- **Don't** put session controls (logout, "who am I") in the sidebar — that's the topbar's job
  (see Topbar & UserMenu, §5); a sidebar footer competing with `UserMenu` for the same job is
  duplicated UI, not redundancy that helps anyone.
