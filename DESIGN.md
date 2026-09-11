# VIA USDM Settlement Studio — Design Context

## Product thesis
Cross-chain settlement without cross-chain complexity. The user states an economic intent; the interface handles chain-specific mechanics while preserving an inspectable technical trace.

## Audience
Primary: VIA/Midnight sprint judges and developers evaluating a reference implementation. Secondary: technically curious USDM users who should not need protocol expertise to complete a transfer.

## Visual direction
**Precision instrument, not crypto casino.** The interface should feel like a high-end systems console whose complexity is selectively revealed.

### Tokens
- Canvas: `#0A0B0D` — graphite black
- Surface: `#111319` — primary instrument surface
- Raised: `#171A21` — nested controls
- Text: `#F4F1E8` — warm white
- Muted: `#8F96A3` — technical secondary text
- Gold: `#D7B56D` — intent, authorization, active route only
- Signal: `#6CD9D1` — verified/healthy infrastructure state
- Danger: `#F27D70` — blocking or failed state

Gold is scarce. It must not become a generic gradient accent.

## Typography
- Display: `Georgia`, used only for the product thesis and large monetary intent.
- UI/body: `Inter`, `Segoe UI`, system sans-serif fallback.
- Data/trace: `SFMono-Regular`, `Cascadia Code`, `Roboto Mono`, monospace.

## Layout
Desktop: 12-column instrument panel. Left rail holds product thesis + wallet state; center owns the economic intent; lower/wide region owns the Intent Rail and trace. Mobile collapses to one linear action flow.

## Signature element: Intent Rail
A single continuous route visually translates `Intent → source wallet → VIA → destination wallet`. It is not decorative. Its nodes reflect real bridge hook phases and never claim destination settlement before the available APIs can verify it.

## Interaction contract
- Default view is Simple: amount, source, destination, authorize.
- Advanced reveals address routing and preflight details.
- Trace reveals protocol stages, raw identifiers, wallet standards, and explorer links.
- Never show a generic spinner when a named bridge phase is available.
- Never expose raw provider errors as the primary message. Translate them, retain raw detail in Trace.
- A successful source transaction is labeled as source acceptance; VIA/destination delivery is not falsely labeled complete without verification.
- DUST is preflighted for Midnight-origin actions; sponsorship is not claimed unless actually implemented.
- Primary controls remain stable in size during pending states.

## Accessibility
WCAG 2.2 AA target. Native buttons/inputs, visible focus, text labels alongside status color, reduced-motion support, minimum 44px primary touch targets, and no hover-only information.

## Required receipt surface — September 10

Five panels show Source accepted, VIA delivered, Destination verified, Local proof, and Application settlement. Their explicit statuses distinguish SDK reports from provider-backed verification. The shared receipt summary separates 3 / 3 transfer evidence from 5 / 5 operation evidence, route integrity, exact amount continuity, and a wrapping SHA-256 hash. A balance increase remains an observation. Missing evidence never receives verified styling. The surface stacks below 760px, supports frozen partial receipts and local file checks, and keeps retry actions read-only. Compact controls live in Advanced mode, while Compact settlement and a locally proved return are required sprint gates.

A downloadable receipt is a distinct frozen state. Live evidence may update on screen, but download and copy controls remain unavailable until a complete read attempt has settled, `finalizedAt` is set, and the immutable snapshot hash has been computed. Refreshing evidence immediately retires the previous snapshot from those controls. Frozen partial receipts preserve every unverified boundary explicitly.


September 10 scope correction: the receipt is a cross-chain correlation surface. Show five evidence boundaries, with 3 / 3 transport distinguished from incomplete 3 / 5 operation evidence. Local execution modality cannot be inferred from wallet identity. Compact settlement and locally proved VIA return are required sprint milestones. Delegate native transaction inspection to CardanoScan, VIA Scan, and 1AM Explorer. Saved receipts remain inspectable without wallets and recompute correlations from saved evidence; hash integrity is not authenticity.
