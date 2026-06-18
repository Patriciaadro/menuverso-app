# Menuverso — Xibeca reskin: implementation audit

**Audited against:** `menuverso-implementation-spec.md` (§0–§7) and the four reference boards
(`Menuverso-Portal-REFERENCE.html`, `Menuverso-Admin-REFERENCE.html`,
`Menuverso-Member-GapScreens-REFERENCE.html`, `Menuverso-Admin-GapScreens-REFERENCE.html`).
**Target file:** `index.html` (single-file SPA).
**Method:** code inspection + headless render of every route/role (jsdom) + `node --check` + a 236-check
adversarial harness. Evidence (function names / rendered markers) is cited so this can be checked.

**Status legend:** ✅ done · 🟡 partial · ❌ not done · ↔️ deliberate deviation (with reason)

> **Important caveat:** all changes below are **saved locally but NOT yet committed/pushed**. Until
> `git commit && git push` is run on the Mac and Vercel redeploys, none of this is live on menuverso.com.
> Also, per Amir's explicit instruction we worked **"batch, then review"** — this intentionally departs
> from spec guardrail §0.2 ("one screen per commit, stop after each").

---

## ✅ ROUND 2 — gaps now CLOSED (the items previously ❌ / 🟡 / ↔️)

All six brief delight/interaction features that were missing or deviating are now implemented and
verified (jsdom render + the drops actually firing into `document.body`):

1. **Count-up animations (§1 Motion, §4)** — new global `animatedNumber()` (ease-out cubic, ~1.2s,
   honors `prefers-reduced-motion`). Applied to: member Bookings savings (`€` counts up), admin Panel
   scoreboard (3 cards), Clientes stats. ✅
2. **Member redemption drop (§2.3)** — `commitRedeem()` now fires a full-screen **scarlet** flood +
   grain, bone ticket **slam-in** (giant Anton `2×1`, italic venue, deal), "Enséñalo a tu camarero",
   live **MM:SS countdown** (pulsing), "HECHO · LISTO ✓" close → redeems on close. *Verified: overlay
   appears with `background:#F4291A`, "canje confirmado", `15:00`.* ✅
3. **Partner Escanear scanner + GREEN scan-confirm drop (§3.3)** — rewrote `PortalRedeem()`: 360 ink
   scanner panel, grid texture, animated scarlet **scanline** (`mv-scan`), gold corner brackets, faint
   Kaushan "m"; 6-digit code input + "Confirmar canje →". Confirms against a **real booking code** →
   redeems → full-screen **green** drop (giant ✓, "2×1 aplicado", deal · customer · slot,
   "−€X", "Siguiente cliente →"). Invalid / already-redeemed fail states included. Kept the deliberate
   color split (member = scarlet, partner = green). *Verified: green overlay with "canje verificado",
   "−€".* ✅
4. **Partner left ink sidebar (§3)** — replaced the top tab bar with a 270px ink `<aside>`: Kaushan
   wordmark + "Panel para locales", vertical nav (active = solid scarlet), venue chip + "Cerrar
   sesión" pinned bottom. Collapses above content on mobile. ✅
5. **Mis ofertas functional toggles (§3.2)** — `PortalOfertas()` now has live **green switch** toggles
   (ink knob slides) that flip offer state and persist; "+ Nueva oferta" CTA adds a partner-proposed
   offer. ✅
6. **`mv-pulse` + `mv-scan` keyframes + reusable `mvDrop()` overlay** added to the design system. ✅

**Verification after round 2:** `node --check` pass · all member + partner routes render with **0
errors** · both drops fire correctly · adversarial harness **236 passed / 0 failed**.

**Still open (the larger §6/§7 scope, not yet done):** §6 gap-screen *reskins* (restaurant detail,
paywall, auth/waitlist, search/AI results, booking detail+rate, create/edit-offer editor, venue editor,
onboarding, billing — most exist functionally but aren't restyled to the gap-screen boards) · §7
mobile/responsive pass · dedicated WCAG-AA a11y pass on the new screens · real-time (still 2s poll).
Token nits remain (`--gold`/`--green` hardcoded; `--bone` value).

---

---

## §1 Design system

| Item | Status | Evidence |
|---|---|---|
| Color tokens | 🟡 | `:root{ --red:#F4291A; --hot:#FF4326; --ink:#16110F; --paper:#FAF6EE; --bone:#F1E9DA }`. `--gold #F2B100` / `--green #1F9D63` used as **hardcoded hex** throughout, not declared as CSS vars. `--red-700/-800`, `--paper-2`, `--card` not declared as vars (mv-600/-700 Tailwind tokens cover hover/active). `--bone` value is `#F1E9DA` vs spec `#ECE5D6`. |
| Fonts (Anton / Archivo / Kaushan) | ✅ | All three loaded (`family=Anton`, `family=Archivo`, `family=Kaushan+Script`). |
| `.disp` (Anton), `.vname` (Anton italic) | ✅ | Both defined and used across reskinned screens. |
| `.card-lift` hover, `mv-slam` keyframe | ✅ | Added this round + pre-existing slam keyframe. |
| Grain overlay (feTurbulence) | ✅ | One inline `feTurbulence` grain present. |
| Red-duotone photography | ✅ | `mix-blend-mode:luminosity;opacity:.88;filter:contrast(1.15)` over `var(--red)` used in all new cards. |
| **Motion — stat/savings count-up animation** | ❌ | Numbers render **static**; no 0→value ease-out animation implemented (spec §1 Motion + §4). |

## §2 Member portal

| Spec item | Status | Evidence |
|---|---|---|
| Header (wordmark, nav, active tab, Saved(n)) | ✅ (pre-existing) | `AppTopBar()` — Kaushan wordmark SVG + Discover/Map/Bookings/Saved(n) nav. Not re-touched this round. |
| 2.1 "Esta noche" Tonight hero | ✅ | `AppDiscover` → `tonightCard()` + `paintHero()`: scroll-snap row, ‹ › buttons, gold open sticker, ahorras, RESERVAR. |
| 2.1 Grid restyle ("Todos los planes") | ✅ | `discoverCard()` — white/ink/scarlet variants, ♥ save, scarlet-outline deal chips, Anton "ahorras ~€X", circular →. |
| 2.1 AI concierge tile | ✅ | `conciergeTile()` — ink card, "✦ menuverso IA", prompt teaser. (Phase-1 visual only; not wired to AI — matches spec.) |
| 2.2 Map (El mapa header, chips, duotone list) | ✅ | `AppMap()` — Anton "El mapa", ink-bordered filter chips + scarlet "Abierto ahora ✓", `mapListCard()` duotone list. |
| 2.2 Map pins (real SDK + scarlet "m" pin) | ✅ (pre-existing) | Real Leaflet kept; `mv-pin-m` Kaushan "m" markers. |
| 2.3 Bookings header + savings scoreboard | 🟡 | `AppBookings()` — Anton "Tu reserva" + scarlet 88px savings number present; **but it does not animate up** (spec wants counter animation). |
| 2.3 Slide-to-redeem | ✅ (pre-existing) | `Booking()` Stage A: drag track + fill + "Slide to redeem →" + `pointerdown` handler. |
| 2.3 Full-screen redemption "drop" (scarlet flood, bone ticket slam-in, MM:SS countdown) | 🟡 | App has a **different** pre-existing flow: `Booking()` Stage B animated verification screen (rotating token, timestamp). It is **not** the spec's full-screen scarlet drop, and that screen is **not yet Xibeca-restyled** (still `font-serif-display` + slate/mv gradient). |
| 2.4 Saved (passport, progress bar, barrio chips, badges, saved cards) | ✅ | `AppSaved()` — "Tu pasaporte"/"Conquista la ciudad", barrios-visited counter + progress bar, visited/locked chips, badges grid, duotone saved cards. |

## §3 Admin / Partner portal

| Spec item | Status | Evidence |
|---|---|---|
| **Layout: left ink sidebar (270px)** | ↔️ | Built a **top Xibeca tab bar** instead of the 270px left ink sidebar the reference shows. Functional + on-brand, but a layout deviation from the spec. |
| Tabs (Panel / Mis ofertas / Escanear / Clientes) | ✅ | `PartnerPortal()` tab bar — 5 pills (added Perfil); active = scarlet w/ offset shadow. |
| 3.1 Panel: greeting + Escanear CTA | ✅ | `PortalOverview()` — kick date + Anton "Buenas, {venue}." + "⊞ ESCANEAR CANJE". |
| 3.1 Scoreboard (3 cards) | 🟡 | Three cards (scarlet revenue / white customers / ink redemptions-today) from real data. **Counters don't animate up.** |
| 3.1 Actividad en vivo (EN DIRECTO feed) | ✅ | Live feed w/ initials, "{name} canjeó {deal}", +€X, pulsing dot. |
| 3.1 Horas punta (bar chart + gold nudge) | ✅ | Hour-bucket bars, peak in gold, insight box. |
| 3.2 Mis ofertas | ↔️ | `PortalOfertas()` shows offers **read-only** (Activa/Pausada status). **No functional green toggles, no "+ Nueva oferta".** Reason: app's standing business rule is that offer content is **admin-managed** (kept a "suggest a change" mailto). This contradicts the spec's live toggles — needs a product call. |
| 3.3 Escanear: scanner frame + scanline + 6-digit input | ❌ | Not built. Kept the existing live slide-to-confirm feed (`PortalRedeem()`) and only rebranded its header/container. |
| 3.3 GREEN scan-confirm drop | ❌ | Not built. (Reason: app's real flow is member-slides / partner-acknowledges, with no code entry — a fake scanner would misrepresent the flow. Flagged for your call.) |
| 3.4 Clientes (4 stat cards + scarlet band) | ✅ | `PortalClientes()` — Recurrentes/Ticket medio/Nuevos/Valoración + "El boca a boca funciona" band + Ver ofertas →. |

## §4 Interaction inventory

✅ tab routing (active fill) · ✅ Tonight scroll-snap ‹ › · ✅ card hover lift · ✅ ♥ save toggle ·
✅ slide-to-redeem (pre-existing) · ✅ live "EN DIRECTO" pulsing dot ·
🟡 redemption experience (verification screen, not the spec drop) ·
❌ savings counter animation · ❌ admin stat counters animation ·
❌ deal toggles (read-only instead) · ❌ scanner scanline · ❌ green scan-confirm drop.

## §6 Gap screens — **not done this round**

❌ Member gaps (restaurant detail, paywall/subscription, auth+waitlist, search/AI results, booking
detail + post-visit rate, system empty/loading/error) — several exist **functionally** (e.g. `Venue()`,
`Checkout()`, auth, `Booking()`) but were **not reskinned** to the gap-screen references.
❌ Admin gaps (create/edit offer, venue profile editor, onboarding/claim, billing, scanner
fail-states, empty states) — not reskinned to references.

## §7 Cross-cutting — **not done this round**

❌ Responsive / mobile breakpoints pass · ❌ dedicated WCAG-AA a11y pass on the new scarlet-on-paper
screens (a broad contrast sweep was done in earlier work, but not a fresh pass on these new screens) ·
❌ real-time wiring for "EN DIRECTO" (still a 2s poll / static). ✅ ES/EN copy provided for all new strings.

---

## What was reskinned this round (summary)
**Member:** Discover grid + concierge, Map, Bookings header/savings, Saved (passport/badges), Profile (header + stat tiles).
**Partner:** tab bar, Panel dashboard, Clientes (new), Mis ofertas (new, read-only), Escanear (rebranded header).

## Verification performed
- `node --check` on the extracted script: **pass**.
- Headless render of all member + partner routes per role: **0 runtime errors**.
- Adversarial harness (4 roles × all routes + bad params + corrupted storage + XSS): **236 passed, 0 failed**.

## Honest gaps to close next (priority order)
1. **Escanear scanner frame + green scan-confirm drop** (§3.3) — biggest missing delight feature.
2. **Partner left ink sidebar** (§3 layout) — currently top tabs.
3. **Count-up animations** for member savings + admin scoreboard (§1/§4).
4. **Xibeca-restyle the redemption verification screen** (§2.3) to match the drop.
5. **Mis ofertas toggles** — needs a product decision (admin-managed vs partner-controlled).
6. **§6 gap screens** + **§7 mobile / a11y / real-time**.
