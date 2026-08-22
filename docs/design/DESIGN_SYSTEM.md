# Hangtime visual implementation inventory

The accepted implementation references are:

- `home-dashboard-concept-v2.png` — polished desktop/tablet signed-in home at 1536×1024; supersedes the first generic hero.
- `mobile-shortlist-concept.png` — 390px mobile voting shortlist.

## Direction

Hangtime is playful, warm and socially neutral. The visual idea remains an editorial social planner inspired by independent food magazines and printed event ephemera: warm paper-like space, expressive serif headlines, disciplined sans-serif controls, a terracotta pin mark, a reservation-ticket planner, and open agenda rows instead of a generic dashboard grid.

## Locked palette

| Token | Value | Use |
|---|---|---|
| `--background` | `#fdfaf6` | True warm off-white app background. |
| `--surface` | `#fffdf9` | Raised rows and controls. |
| `--surface-soft` | `#fbf1e8` | Companion/plan summary bands. |
| `--ink` | `#24170f` | Primary espresso text. |
| `--muted` | `#6f6258` | Supporting text. |
| `--border` | `#e6d6c8` | Fine structural borders. |
| `--primary` | `#d94e30` | Primary actions, selected state, active nav. |
| `--primary-dark` | `#b93d24` | Hover/pressed state. |
| `--sage` | `#60764b` | Fairness, privacy, ready status. |
| `--amber` | `#b87812` | Waiting and food-match status. |

No neon, glow, dark SaaS chrome, or broad decorative gradient is permitted. A subtle surface fade is allowed only inside the companion/summary band.

## Typography

- Display/headline: Georgia or a locally available editorial serif, weight 700, tight tracking, line-height 1.05–1.15.
- UI/body: Segoe UI Variable/system sans, weight 400–700, line-height 1.35–1.55.
- Desktop H1: 72–104px with tight editorial line-height. Mobile H1: 52–64px. Mobile screen title: 36–44px. Section title: 24–32px.
- Body: 16–18px. Supporting text: minimum 14px. Avoid 10–11px text for meaningful content.
- Controls: explicitly 14–16px semibold; never browser-default typography.

## Container and spacing

- Desktop content width: 1390px maximum with 72–88px side gutters at 1536px.
- Mobile gutters: 16px; safe-area-aware sticky action region.
- Header: full-width quiet band, 76px desktop and 64–72px mobile.
- Open plan list: a single bordered container with divided rows, not multiple floating cards.
- Primary geometry: restrained square editorial surfaces; circles for avatars/status motifs; 0–8px radii for ordinary controls. Avoid a page made of rounded cards.
- Touch targets: at least 44×44px.

## Component families

- Brand mark: code-native map-pin symbol with `Hangtime` wordmark.
- Header: brand, Home/Companions/Profile navigation, current-user control only in explicit local demo mode.
- Primary button: terracotta fill, white text, offset ink shadow, 48–56px height.
- Meal ticket: clipped paper edge, layered sage backing, paired avatar medallions, dotted transit line, and one `Plan a meal` action.
- Plan list: meal icon rail, title/status, date/window, budget, diners, trailing chevron. Hover changes border/background, not layout.
- Shortlist row: checkbox, venue title/area/cuisine, travel and price explanations, at most one principal recommendation label, trailing detail chevron.
- Voting action: sticky mobile action region showing selection count, full-width primary submit, outlined adjust action.
- Privacy band: low-emphasis sage structure, exact copy `Your exact address stays private.`

## Icon inventory

Use Lucide only where it matches the concept: `Home`, `Users`, `UserRound`, `CalendarDays`, `Clock3`, `WalletCards`, `TrainFront`, `ChevronRight`, `LockKeyhole`, `Map`, `List`, and `Check`. Use 1.75–2px rounded strokes, 18–22px in ordinary controls, and 24–28px in feature circles.

The brand mark may be a custom production SVG combining a rounded location pin and plate ring. All arrows/chevrons remain SVG icons, never text glyphs.

## Allowed home-screen copy

- `Hangtime`
- `Home`
- `Companions`
- `Profile`
- `Singapore, let's eat`
- `Make room for a good meal.`
- `Hi {firstName}. Bring the people and the time; we'll find the fair place in between.`
- `Create a new plan`
- `Plan with {companionName}`
- `Plan a meal`
- `Active plans`
- Plan-derived meal, date, time, budget, diner count, and status text.
- `Your exact address stays private.`

No fake metric, generic trust claim, cartoon couple, waving emoji, or stock photography may be added above the fold.

## Responsive continuation

- Below 720px the desktop header becomes a compact top bar plus bottom navigation.
- The greeting and companion band stack; the primary plan action stays visible in the first viewport.
- Plan row metadata wraps into two lines without shrinking below 14px.
- The voting view becomes the exact mobile pattern from `mobile-shortlist-concept.png`: summary band, count/cap, list/map switch, open venue rows, and sticky actions.

## Required interaction states

- Keyboard-visible focus for every link, button, checkbox, toggle, and dialog control.
- Selected shortlist rows expose real checkbox semantics and `aria-checked`/checked state.
- Loading and recommendation progress use an `aria-live` status.
- Empty/error states preserve plan inputs and present one primary recovery action.
- Reduced-motion users receive no entry or pulsing animations.

## Media treatment

The concepts are design references, not production UI images. All interface text and controls are code-native. The app may use a small code-native/inline decorative plate-and-pin illustration, but no concept screenshot is embedded in the running product.
