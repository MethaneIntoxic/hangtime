# Hangtime home hero design QA

- Source visual truth: `C:\Users\admin\.codex\generated_images\01a00ab4-ee90-7a51-bb06-106f51f25743\exec-081f2ea1-9c9b-4ef8-8840-a5f936deea7d.png`
- Implementation capture: `C:\Users\admin\Desktop\random projs\dinner_time\design-qa-home.png`
- Viewport: 1536 × 1024 CSS px, device scale factor 1
- Source pixels: 1536 × 1024
- Implementation pixels: 1536 × 1024
- Density normalization: none required
- State: populated Hangtime demo home as Maya, favourite companion Ethan

## Full-view comparison evidence

The provided source and implementation were opened together at the same pixel dimensions. The original generic greeting and stock companion promo have been replaced by a single editorial composition: a product-specific headline and an adjacent Hangtime plan pass. The revised hierarchy gives the upper screen one clear story and moves Active plans below the fold without obscuring it.

## Focused region comparison evidence

The annotated upper-hero region was inspected at full resolution. A separate crop was unnecessary because the headline, CTA, pair identity, three planning steps, and privacy stamp are all legible in the 1536 × 1024 comparison.

## Required fidelity surfaces

- Fonts and typography: the display serif now carries a deliberate editorial hierarchy; compact uppercase labels and UI sans text separate brand voice from task information. Weight, line height, and wrapping are coherent at desktop and mobile widths.
- Spacing and layout rhythm: the hero uses a balanced 0.78/1.22 split, consistent dividers, and a compact plan-pass grid. No horizontal overflow was present at the mobile check (375 px client width).
- Colors and visual tokens: the implementation stays within Hangtime's cream, terracotta, sage, amber, plum, and ink tokens. Contrast remains clear across the paper surface, green frame, and primary CTA.
- Image quality and asset fidelity: the redesign intentionally removes the generic stock illustration. Product meaning is carried by real Lucide interface icons and live profile initials; no placeholder imagery or recreated source illustration remains.
- Copy and content: generic “Hello” copy is replaced with Hangtime-specific language around scheduling, fair transit, budget, dietary needs, voting, and booking.

## Findings

No actionable P0, P1, or P2 issues remain in the annotated hero.

## Comparison history

1. Earlier finding: the source hero used a generic greeting, broad question, and stock couple card without explaining Hangtime's distinctive planning workflow.
2. Fix: introduced “Plans that leave the chat,” the outcome-led headline, dynamic pair identity, and a three-step When / Where / Decide plan pass with a companion-specific CTA.
3. Post-fix evidence: `design-qa-home.png` shows the populated desktop state at the matching viewport. The design is more specific, structured, and brand-ownable while preserving all existing routes and data.

## Interaction and browser checks

- “Start with Ethan” navigated to `/plans/new?companionId=user_ethan`.
- Ethan was visibly preselected on the plan form.
- Desktop populated state and mobile no-overflow state were checked in the in-app browser.
- Browser console errors checked: none.
- Targeted ESLint and TypeScript typecheck passed.

## Follow-up polish

No blocking follow-up. A future iteration could add real user avatars once profile photo support exists; initials are the correct live-data treatment for the current MVP.

final result: passed
