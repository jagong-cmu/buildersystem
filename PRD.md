# Reality Compiler — PRD & Technical Architecture

**Status:** v1.2, hackathon build spec (HackMIT 2026). **Implementation status is tracked in `README.md`.**
**Scope decisions (v1.2):** the Ray-Ban Meta glasses are the primary input for the whole session; Dropbox is the content layer (see `docs/dropbox-integration.md`). Dropped from scope: Arduino UNO Q hardware verification and webcam source, ASUS/local-VLM hardware, voice vendors, multiplayer rooms, LLM cost-saving write-ups. Code for the UNO Q probe agent remains in `services/unoq-agent` but is parked and not part of the plan.
**Audience:** an autonomous coding agent (and the team) building this project from an empty repo.
**How to use this document:** read it top to bottom once, then execute the Milestones in §19 in order. Every design decision needed to start is made here; open decisions are listed in §21 with defaults. Do not widen scope beyond §2.

---

## 1. Summary

**One line:** You have leftover parts and don't know what to make. Wearing Ray-Ban Meta glasses, you look at the pile; the system identifies the parts, tells you what you can build from a library of manuals, and walks you through an interactive, scrollable, step-by-step visual guide that adapts when a part is missing and verifies your progress as you build.

**Pitch line:** *Traditional instructions assume you have the right pieces. We generate instructions from the pieces you actually have.*

**Domains (fixed for this build):**
1. **LEGO** — bricks/plates
2. **Breadboard electronics** — an Uno-format microcontroller board + jumper wires + discrete components
3. **Fabric scraps** — cotton/denim/fleece offcuts + notions (zipper, cord, elastic)

**What makes this different from Brickit (LEGO-only, retrieval + set instructions):**
- Cross-domain: one core, three domains, adding a fourth is a folder.
- The guide is *generated* from a structured manual (3D/2D renderer, scroll-driven animation), not a PDF.
- Near-miss handling: "you are one 220Ω short → use two 100Ω in series," with the guide re-generated from the substitution.
- Verification: vision (before/after) from the wearer's own view.
- Hands-free: the glasses are the camera for the whole session; narration is spoken back into the glasses; verification triggers itself when the hands leave the frame.

---

## 2. Goals and non-goals

### Goals (must ship)
- G1. Inventory from the glasses' continuous video (glasses → phone bridge → stream hub → web app), filling in as the wearer looks around; photo upload as a fallback.
- G2. "Possible builds" screen: buildable now / buildable with substitutions / missing parts, per domain.
- G3. Scrollable step-by-step guide with a sticky animated viewport (LEGO 3D, breadboard 2D, fabric 2D).
- G4. Substitution engine (small, deterministic rules per domain).
- G5. Step verification: vision verifier for all domains, auto-triggered from the glasses feed.
- G6. Cherry-picked manual library: 3 manuals per domain, sharing physical parts the team owns.
- G7. Source-agnostic observation layer: glasses (primary) and phone PWA camera (fallback), through one protocol.

### Non-goals (do not build)
- Ingesting arbitrary PDF manuals into 3D. Manuals are authored files (§10).
- Generative design (inventing new structures). Retrieval from the manual library + substitutions only.
- A database. Manuals are files in the repo; session state is in memory / URL.
- Supporting every LEGO/IKEA/electronic part. Vocabulary = union of the cherry-picked manuals' parts.
- Distributing the glasses bridge app. It runs on one team phone (Meta's SDK is developer-preview only).
- Live AR overlay on video. Fabric cut-line overlay is on a still frame only.

---

## 3. Demo script (north star — everything serves this)

90 seconds, one laptop screen, one person wearing Ray-Ban Meta glasses, parts on a table on a printed marker mat.

1. Wearer looks at the table. Laptop "Live" panel shows the glasses feed. Wearer taps **Scan** on the phone (or says "scan"). Inventory strip fills in: `8 × 2x4 brick (red)`, `4 × 2x2 (blue)` …
2. **Possible builds** screen: three cards. Two "Buildable now", one "Missing 1 × 220Ω — substitute 2 × 100Ω in series".
3. Pick one. **Guide** opens. Scroll: each step card activates, the sticky viewport ghosts what's built and flies the new part into place. Judges can grab the mouse and rotate.
4. Wearer builds step 3 and takes their hands away. The card shows ✓ verified and the wearer hears "Verified" in the glasses (or taps **Check** on the phone).
5. Hide a part. Say "I don't have the 2x4." Banner: **Plan updated from step 7** — remaining steps re-render with two 2x2s.
6. Switch domain (fabric): scan scraps, "zipper pouch fits on scrap 2," scroll the cut layout and sewing steps. Same app, same UI.

Payoffs: phone stands on the LEGO stand; LED lights when the LDR is covered; earbuds go in the pouch.

---

## 4. Users and positioning

- Primary: hobbyists, kids' parents, sewists, makers — people with a drawer of leftover parts who don't use AI tools. **The AI is invisible; the artifact is a manual.**
- Secondary: makerspaces and classrooms.

---

## 5. Screens and flows

### 5.1 `/` — Start
Domain picker (LEGO / Breadboard / Fabric), glasses status (connected, fps; phone fallback), buttons: **Scan**, **Open builds**.

### 5.2 `/scan` — Inventory
```
┌──────────────────────────────────────────────┬─────────────────────────┐
│ LIVE FEED (from stream hub)                  │ INVENTORY               │
│ bounding boxes drawn from last detection     │ 8 × 2x4 brick  red  [-+]│
│                                              │ 4 × 2x2 brick  blue [-+]│
│ [Scan 10s]  [Snap photo]  [Upload photo]     │ 1 × 2x8 plate  grey [-+]│
│ progress: frames 7/10 · aggregating          │ conf ●●●○                │
│                                              │ [Find builds →]         │
└──────────────────────────────────────────────┴─────────────────────────┘
```
Inventory is **editable** (±) — the demo must never be blocked by a misdetection.

### 5.3 `/builds` — Possible builds
Three buckets, cards with final-state thumbnail, title, est. minutes, "uses 15 of your 17 parts," substitution chips, missing chips with **Shop the gap** link (commerce, §17).

### 5.4 `/guide/[manualId]` — Scrollable guide
```
┌───────────────────────────────┬─────────────────────────────────┐
│                               │ Phone Stand · 12 steps · 8 min  │
│   STICKY VIEWPORT             │ Parts 15/15 ✓ · 1 substituted   │
│   (LEGO r3f / breadboard SVG  │ ▢ Step 3  [2× red 2x2]          │
│    / fabric SVG)              │   "Place on the back row…"      │
│   ghosted so far, new parts   │─────────────────────────────────│
│   outlined + flying in        │ ▣ Step 4  ← active              │
│   [Live PiP toggle]           │   [1× 2x8 plate] "Bridge walls" │
│   [rotate/zoom]  STEP 4/12    │   ✓ verified · A0=512           │
│                               │─────────────────────────────────│
│   ▲ "Plan updated from step 7"│ ▢ Step 5 …                      │
└───────────────────────────────┴─────────────────────────────────┘
```
- Scroll-driven: the active step is the last card whose top has crossed the 40%-of-viewport line (rAF-throttled scroll listener). Cards use `scroll-margin-top: 38vh`, so deep links, j/k and prev/next land exactly on a step. Renderer receives `{step, direction}` and animates.
- Keyboard: `j/k` next/prev; deep link `?step=n`.
- Per card: step number, callout parts (mini renders + qty), instruction text, verification badge (`pending / checking / verified / mismatch + hint`), **Mark done** override.
- Top: parts checklist vs inventory, substitutions called out.
- Replan banner when remaining steps change.
- **Live PiP**: small camera feed over the viewport; expands on hover.
- Mobile: viewport pins to top, cards scroll beneath.

### 5.5 `/live` — Debug
Sources, fps, last 5 frames, probe log, VLM call log. Not shown to judges but essential during the build.

---

## 6. System architecture

```
OBSERVATION SOURCES                           STREAM HUB (Node, ws)                    WEB APP (Next.js)
┌──────────────────────┐   ws /produce        ┌──────────────────────┐   ws /consume   ┌───────────────────────────┐
│ Glasses bridge (phone)│──────────────────►  │ per-source ring buf  │ ───────────────►│ Live panel, PiP           │
│   PRIMARY             │                     │ (30 s of JPEG frames)│   GET /frames   │ Inventory service (VLM)   │
│ Phone PWA camera      │──────────────────►  │ control bus (JSON)   │◄───────────────►│ Verification worker       │
│   fallback            │   ws /control       │ motion detector      │                 │ Matcher · Guide · Renderers│
└──────────────────────┘                      └──────────────────────┘                 └───────────────────────────┘
                                                                                                 ▲
Dropbox (manual library in, build records out) ── docs/dropbox-integration.md ───────────────────┘
```

Principles:
- **Everything domain-specific lives behind `DomainPlugin`** (§15). Core never branches on domain.
- **Observation sources are interchangeable** producers on one protocol (§8). The glasses are the default and primary source; the phone PWA is the fallback. The UI prefers an online glasses source automatically.
- **Manual files are the single source of truth.** `requires` and steps are derived, never hand-listed.
- **Verification is an event bus.** Vision and hardware verifiers post results; the guide subscribes.
- **Everything runs on one laptop + LAN** during the demo (laptop hotspot). Vercel deploy is optional for a judges' link with recorded assets.

---

## 7. Meta glasses continuous video (G1, G7)

### 7.1 Facts that constrain the design (verified Sept 2026)
- Meta **Wearables Device Access Toolkit (DAT)** is an **iOS/Android SDK** (`facebook/meta-wearables-dat-ios`, `facebook/meta-wearables-dat-android`). It exposes video streaming, photo capture, microphone/audio, and (on Ray-Ban Display) the display.
- Video stream: **max 720p @ 30 fps**, bandwidth-limited (Bluetooth-bound per Meta's FAQ).
- **Developer Preview**: build and test on your own device; cannot distribute. Requires registration at the Wearables Developer Center; full capabilities only in supported countries.
- A **Mock Device Kit** allows development without hardware.
- Supported today: Ray-Ban Meta, Oakley Meta HSTN.
- **There is no glasses → laptop path.** A phone app must receive the stream and forward it.

### 7.2 Glasses bridge app (`apps/glasses-bridge-ios`) — built, see `docs/glasses-bridge.md`
SwiftUI app whose DAT layer is ported from the team's Brownmellon app (`jagong-cmu/hackmit`), which already streams from real glasses:
- Screen: hub URL + source id (persisted), **Connect glasses** (Meta AI registration handoff via the `glassesbridge://` scheme), **Start/Stop stream**, glasses→phone fps, phone→hub fps / latency / sent / dropped, buttons **Scan** / **Check** / **Next** / **Prev** / **Missing** (current step's callouts from `step.activated`, tap → `part.missing`).
- SDK facts (0.9.0) that differ from the earlier assumptions above: `StreamConfiguration(videoCodec:resolution:frameRate:)` only accepts **2/7/15/24/30 fps** and `low` 360×640 / `medium` 504×896 / `high` 720×1280 (portrait). Frames arrive as `VideoFrame` (`CMSampleBuffer`, `makeUIImage()`) on the SDK's queue; there is no callback-rate control below 15 fps other than 2/7, so the bridge requests `medium @ 15` and throttles to **≤ 10 fps** itself. A `DeviceSession` must reach `.started` before `addCamera`; the camera permission is granted inside the Meta AI app (`requestPermission(.camera)`), not by iOS.
- On each admitted frame: downscale to ≤ 960 px wide (medium already fits), JPEG q≈0.6, send over WebSocket to `/produce?source=glasses&kind=glasses` in the exact §8 binary format; drop (never queue) when a send is in flight or the socket is down; reconnect with 0.5 s→8 s backoff.
- Control buttons POST `{type:'scan.start'|'check'|'next'|'prev'|'part.missing'}` to `/control`; the guide reacts to `next`/`prev`/`check` (its own `check` echoes carry `origin:'guide'` and are ignored).
- Mock Device Kit (`MWDATMockDevice`, Simulator only) pairs a mock Ray-Ban Meta fed by the Mac camera or a bundled video, so the whole path runs without hardware.
- **Narration back to the glasses (cheap, high impact):** the hub broadcasts `{type:'say', text}` when a step activates or a verification completes; the phone speaks it with platform TTS. The glasses are the phone's Bluetooth audio output, so the wearer hears it in the glasses' open-ear speakers.
- Stretch: on-phone speech recognition of "scan / check / next" → control messages.

Default platform: whichever phone a teammate owns; the iOS route needs Xcode on the Mac (available), the Android route avoids provisioning friction. Pick one, don't build both.

### 7.3 Fallbacks (build these first; the glasses plug into the same slot)
1. **Glasses simulator** (`services/stream-hub/scripts/glasses-sim.mts`): replays a folder of JPEGs as source `glasses` so every glasses-first screen is testable without hardware; the hub recorder dumps a real session for replay (also the stage backup).
2. **Phone PWA camera** (`/source/phone` route in the web app): `getUserMedia`, canvas → JPEG, same WebSocket protocol. The on-stage fallback if the glasses fail.
3. **Laptop webcam** via the same PWA route.

Every demo screen must work with sources (1) and (2).

### 7.4 Hands-free polish — built (Phase 3)
- **State estimation on join:** renderer snapshots for steps 1..N are produced once per manual in the browser (offscreen `StepSnapshots`) and posted with the current glasses frame to `/api/estimate-step`; a confident step ≥ 2 is proposed by voice with a 5 s objection window (`prev`, ←/`k`, header button). Accepting marks earlier steps verified; navigating cancels the proposal. Emits `step.estimated`.
- **Where is it:** `where` control message (or **where?** / `w` in the guide) → `say` with the callout's location from the latest bbox, or a "not in view" prompt.
- **Recorded demo mode:** `pnpm demo:replay` (`services/stream-hub/scripts/replay.mts`) replays a `record` folder's frames as source `glasses` and its operator control messages (`nav`, `scan.*`, `check`, `next`, `prev`, `part.missing`, `where`) at recorded offsets; `--check` is the CI self-test. New additive control types: `where`, `nav`, `step.estimated`.

---

## 8. Stream hub (`services/stream-hub`)

Node + `ws`. Runs on the laptop, port 8787.

**Producer:** `ws://<hub>/produce?source=<id>&kind=glasses|phone|unoq`
Binary message = `uint32 headerLen` + JSON header + JPEG bytes.
Header: `{ v:1, sourceId, seq, ts (ms epoch), w, h, mime:'image/jpeg' }`.

**Consumer:** `ws://<hub>/consume?source=<id>` — receives the same messages (latest-wins; the hub drops frames if a consumer lags).

**Control bus:** `ws://<hub>/control` — JSON messages, broadcast to all: `scan.start | scan.stop | check | next | prev | say | part.missing | inventory.updated | step.activated | verify.result | motion | source.status`. `step.activated` additionally carries `total` and `callouts` (the step's requirements) so the bridge can build its Missing list; `check` may carry `origin` so the guide ignores its own echo.

**HTTP:**
- `GET /frames/latest?source=` → JPEG
- `GET /frames/range?source=&from=&to=` → JSON list of `{seq, ts}` + `GET /frames/:seq` → JPEG (for before/after verification)
- `POST /probe/jobs`, `GET /probe/jobs?board=`, `POST /probe/results` (§14.2)

**Buffer:** per-source ring buffer, 30 s at 10 fps (300 frames, ~30 MB).

**Motion/settle detector:** per source, mean absolute diff between consecutive downscaled greyscale frames; emits `motion.active` / `motion.settled` (below threshold for 1.5 s). Used to auto-trigger verification (§14.3).

---

## 9. Inventory service (G1)

One vision call per frame with **structured output constrained to the plugin vocabulary** (zod enum of `PartType.id`). Model: `claude-sonnet-5` via Vercel AI SDK (`generateObject`), provider string configurable. Prompt includes the domain's `visionHint`s and 1–3 reference images per part type.

Output per frame:
```ts
{ items: { partType: string; qty: number; color?: string; conf: number; bbox: [x,y,w,h] /* normalized */ }[] }
```

**Photo mode:** one frame → inventory.
**Video/scan mode** (10 s window, 1 fps sampled from the hub): per `partType`, `qty = max over frames` (never sum — the same brick appears in every frame), `conf = mean`, `bbox` from the latest frame containing it. Skip near-duplicate frames (motion detector says static and perceptual hash within 4 bits of the last processed frame).

Scale (fabric only, LEGO optional): printed **marker mat** with 4 ArUco markers at known spacing → homography → mm. Library: `js-aruco2` or OpenCV.js in the browser. Fabric scraps are returned as polygons in mm, not counts.

Inventory is always user-editable before matching.

---

## 10. Manual library and formats (G6)

`manuals/<domain>/<id>/` containing the source file, `meta.json` (title, description, estMinutes, thumbnail), and reference images. Indexed at build time into normalized `Manual` objects (§15). **`requires` is derived from the source file.**

### 10.1 LEGO — LDraw `.ldr`
- Author in **BrickLink Studio**, define steps in its Instruction Maker, export as LDraw (`.ldr`/`.mpd`, verify the export path in your Studio version). Alternative: an official set from the LDraw OMR if the team owns that set.
- Parse: line type `1 <color> x y z a b c d e f g h i <part>.dat` → `PartInstance{ ldrawPart, ldrawColor, matrix }`; `0 STEP` closes a step. Submodels in `.mpd` are flattened for the MVP.
- Units: 1 LDU = 0.4 mm; stud pitch 20 LDU; brick height 24; plate 8; **−Y is up**. Colors: 0 black, 1 blue, 2 green, 4 red, 14 yellow, 15 white (`LDConfig.ldr` has the map).
- Demo pick: a **Creator 3-in-1** set the team owns (one inventory → three official builds) or three Studio-authored models (phone stand, small bridge, one free-form) built from the bricks in the box.

### 10.2 Breadboard — JSON
```jsonc
{
  "id": "night_light", "title": "Photoresistor night light", "board": "uno_q",
  "parts": [
    { "id": "ldr1", "partType": "bb:photoresistor", "pins": [ {"row":"e","col":10}, {"row":"e","col":14} ] },
    { "id": "r1",   "partType": "bb:resistor_10k",  "pins": [ {"row":"d","col":14}, {"row":"d","col":18} ] },
    { "id": "led1", "partType": "bb:led_red",       "pins": [ {"row":"e","col":22}, {"row":"e","col":23} ], "polarity": ["anode","cathode"] },
    { "id": "r2",   "partType": "bb:resistor_220",  "pins": [ {"row":"d","col":23}, {"row":"gnd","col":23} ] }
  ],
  "wires": [
    { "id": "w1", "from": {"board":"5V"},  "to": {"row":"a","col":10} },
    { "id": "w2", "from": {"row":"a","col":14}, "to": {"board":"A0"} },
    { "id": "w3", "from": {"row":"a","col":18}, "to": {"board":"GND"} },
    { "id": "w4", "from": {"board":"D9"}, "to": {"row":"a","col":22} }
  ],
  "steps": [
    { "add": ["ldr1","w1"], "text": "Place the photoresistor across e10–e14 and wire 5V to a10.",
      "probes": [] },
    { "add": ["r1","w2","w3"], "text": "Add the 10k resistor d14–d18, A0 to a14, GND to a18.",
      "probes": [ { "pin":"A0", "mode":"analogRead", "expect": { "min":100, "max":950 }, "note":"LDR divider" } ] },
    { "add": ["led1","r2","w4"], "text": "LED at e22–e23 (long leg at 22), 220Ω to GND, D9 to a22.",
      "probes": [ { "pin":"D9", "mode":"pulse", "expect": { "value":1 }, "note":"camera confirms blink" } ] }
  ],
  "sketch": "sketches/night_light.ino"
}
```
Cherry-picks: `blink` → `button_led` → `night_light` (a parts ladder sharing an Uno, LEDs, resistors, button, LDR, jumpers).

### 10.3 Fabric — JSON
```jsonc
{
  "id": "zipper_pouch", "title": "Zipper pouch", "params": { "w": 180, "h": 120, "seam": 10 },
  "pieces": [
    { "id": "front", "polygon": [[0,0],[200,0],[200,140],[0,140]], "fabricClass": "fab:cotton_woven", "qty": 1 },
    { "id": "back",  "polygon": [[0,0],[200,0],[200,140],[0,140]], "fabricClass": "fab:cotton_woven", "qty": 1 }
  ],
  "notions": [ { "partType": "fab:zipper", "minLengthMm": 180, "qty": 1 } ],
  "steps": [
    { "kind": "cut",  "pieces": ["front","back"], "text": "Cut two 200×140 mm rectangles." },
    { "kind": "sew",  "seam": { "a": ["front","top"], "b": ["zipper","top"] }, "text": "Sew the zipper to the top edge of the front." },
    { "kind": "sew",  "seam": { "a": ["back","top"],  "b": ["zipper","bottom"] }, "text": "…and the back." },
    { "kind": "sew",  "seam": { "a": ["front","sides+bottom"], "b": ["back","sides+bottom"] }, "text": "Right sides together, sew around, turn." }
  ]
}
```
Cherry-picks: `coaster` (1 rect), `drawstring_bag` (2 rects + cord), `zipper_pouch` (2 rects + zipper). Optional: a FreeSewing design (`@freesewing/core` renders SVG natively).

---

## 11. Matcher (G2, G4)

```
for manual in library[domain]:
  need = multiset(manual.requires); have = multiset(inventory)
  if colorMode == 'agnostic': strip colors (default for LEGO; UI toggle)
  missing = need − have
  if missing is empty → status 'buildable'
  else:
    for req in missing (largest qty first):
      candidates = rules where rule.produces.partType == req.partType and rule.consumes ⊆ have_remaining
      apply lowest-penalty candidate, repeat (depth ≤ 2 per requirement)
    if all resolved → 'with-subs' (record AppliedSub[]) else → 'missing' (list remaining)
  utilization = parts consumed / total inventory qty
  if plugin.feasibility: merge its result (fabric: nesting must succeed)
order: buildable (utilization desc, penalty asc) → with-subs → missing (fewest missing first)
```

Substitution rules (data, per domain):
- LEGO: `2 × 2x2 → 2x4` (penalty 1, requires stagger check in renderer), `2 × 1x4 → 2x8 plate` (penalty 2), color-agnostic match (penalty 0.5, flagged).
- Breadboard: generated at startup from E12 values: series/parallel pairs within ±10 % of target (penalty 1); LED color swap with resistor re-computed from Vf (penalty 1).
- Fabric: piece a panel from two scraps with a seam (penalty 1); zipper → drawstring (penalty 2; switches manual variant).

**Replan mid-build:** on `part.missing` (user says so, or vision reports it) re-run matching over the **remaining steps'** callouts with subs. If resolved, patch remaining steps: callouts + text always; placements via `rule.transform(instance) → instances[]` when the plugin provides one (LEGO 2x4 → two 2x2 at the same transform ± 20 LDU). Emit `plan.updated { fromStep }`. Completed steps never change.

---

## 12. Guide generation (G3)

`Manual → Guide`: for each step produce a card model `{ n, title, text, callouts, expected, verification }`. Text comes from the manual; an optional LLM pass rewrites it for the wearer ("the red 2x4 in front of you") using inventory bboxes — off by default, on for the demo if it's reliable.

`expected.description` (for the vision verifier) is generated from the diff between step N−1 and N ("a red 2x4 brick added on top of the back row"). `expected.image` is a **canvas snapshot of the renderer at step N** — the renderer is the oracle.

---

## 13. Renderers (per plugin)

Shared contract: `<Renderer manual step direction onSnapshot />`. Must support: ghosting completed parts (opacity 0.35), outlining current-step parts, fly-in animation (600 ms ease-out from an offset along the attach direction, then snap + outline flash), reverse on scroll-back, auto-framing, and `snapshot(): Promise<Blob>`.

### 13.1 LEGO — react-three-fiber
- **Implemented (M1):** procedural bricks (box + stud cylinders) instanced from the `.ldr` transforms, in `apps/web/src/domains/lego/Renderer.tsx`. Zero asset dependencies, works offline. Part dimensions live in the `DIMS` table there; add a row when a new part number appears in a manual.
- **Upgrade path (optional):** load each part `.dat` once with three.js `LDrawLoader`, cache geometry, and swap `BrickGeometry` for it. Do not load the model file into the loader; keep instancing per part so animation and ghosting stay per-part. Vendor only the needed part files + the primitives they reference under `public/ldraw/`.
- Fly-in: start 3 bricks (72 LDU) above target in −Y. Auto-frame: 3/4 top view aimed at the new part's bounding box, damped.
- drei: `OrbitControls`, `Outline` (postprocessing), `Html` for labels.

### 13.2 Breadboard — hand-drawn SVG
- **Implemented (M1):** `apps/web/src/domains/breadboard/Renderer.tsx` draws the breadboard (rows a–e / f–j × 30 columns, two rails), a pin strip for the board, and symbols for resistor (with color bands from the value), LED, LDR, button, pot, buzzer; wires are cubic paths. `@wokwi/elements` was evaluated and dropped: it has no breadboard element (that lives in the Wokwi app), so hole coordinates would have been hand-mapped anyway.
- Animations: wires draw via `stroke-dashoffset`; current-step parts glow; target holes pulse. Earlier steps at 35% opacity.

### 13.3 Fabric — SVG
- Two views, toggled per step kind: **cut layout** (scrap polygons from inventory with nested pieces) and **assembly diagram** (pieces offset, active seam highlighted and drawing itself).
- Nesting: rectangle packing for the MVP (all cherry-picked pieces are rectangles); upgrade to SVGnest for polygons if time allows.
- Stretch: project cut lines onto the **still** scan frame using the marker-mat homography.

---

## 14. Verification (G5)

### 14.1 Step state machine
`pending → armed (card active) → checking → verified | mismatch(hint) → armed` — plus a manual **Mark done** override that always works.

### 14.2 Vision verifier (all domains; the only verifier in scope)
Inputs: `expected.description`, `expected.image` (renderer snapshot), `before` frame (at card activation), `after` frame (on `check` or on `motion.settled` following `motion.active`). One VLM call → `{ status: 'verified'|'mismatch'|'unsure', conf, hint }`. `unsure` never blocks; show "couldn't confirm — mark done?".

With the glasses as the primary source, verification is **auto-triggered**: when a step is armed and the hub reports motion.active followed by motion.settled (hands left the frame), the verifier runs (debounced, at most once per 10 s per step, off switch in the header). On verified, the guide auto-advances after a spoken 3 s countdown; on mismatch, the hint is spoken.

### 14.3 Parked: hardware probe verifier
`services/unoq-agent` and the hub's `/probe/*` queue implement an electrical self-test for breadboard builds on a microcontroller. This is **out of scope for the plan** (no board in the demo); the breadboard verifier route falls back to vision. Leave the code in place; do not extend it.

---

## 15. Core types and the plugin interface

```ts
// src/core/types.ts
export type DomainId = 'lego' | 'breadboard' | 'fabric';

export interface PartType { id: string; domain: DomainId; name: string; visionHint: string; refImages?: string[]; props?: Record<string, string | number>; }
export interface Requirement { partType: string; qty: number; color?: string; }
export interface InventoryItem { partType: string; qty: number; color?: string; conf: number; bbox?: [number, number, number, number]; polygonMm?: [number, number][]; }
export interface Inventory { domain: DomainId; items: InventoryItem[]; capturedAt: string; sourceId: string; frameSeqs: number[]; }

export interface PartInstance<P> { id: string; partType: string; color?: string; placement: P; }
export interface Probe { pin: string; mode: 'analogRead' | 'digitalRead' | 'pulse'; expect: { min?: number; max?: number; value?: 0 | 1 }; note?: string; }
export interface Expected { description: string; probes?: Probe[]; imageUrl?: string; }
export interface Step<P> { n: number; title: string; text: string; add: string[]; callouts: Requirement[]; expected: Expected; camera?: { target: [number, number, number]; azimuthDeg?: number; elevationDeg?: number }; }
export interface Manual<P = unknown> { id: string; domain: DomainId; title: string; description: string; thumbnail: string; estMinutes: number; source: { kind: 'ldr' | 'json'; path: string }; requires: Requirement[]; parts: PartInstance<P>[]; steps: Step<P>[]; }

export interface SubstitutionRule<P = unknown> { id: string; domain: DomainId; consumes: Requirement[]; produces: Requirement; penalty: number; note: string; transform?: (i: PartInstance<P>) => PartInstance<P>[]; }
export interface AppliedSub { ruleId: string; forStep?: number; note: string; }
export interface Match { manualId: string; status: 'buildable' | 'with-subs' | 'missing'; subs: AppliedSub[]; missing: Requirement[]; utilization: number; penalty: number; }

export type VerifyStatus = 'pending' | 'armed' | 'checking' | 'verified' | 'mismatch' | 'unsure';
export interface VerifyResult { manualId: string; step: number; status: VerifyStatus; conf?: number; hint?: string; evidence?: Record<string, unknown>; }

// src/core/plugin.ts
export interface RendererProps<P> { manual: Manual<P>; step: number; direction: 'forward' | 'back'; onSnapshot?: (blob: Blob) => void; }
export interface Verifier<P> { id: 'vision' | 'hardware'; verify(step: Step<P>, ctx: { before?: Blob; after?: Blob; expectedImage?: Blob; hub: HubClient }): Promise<VerifyResult>; }
export interface DomainPlugin<P = unknown> {
  id: DomainId;
  vocabulary: PartType[];
  loadManual(dir: string): Promise<Manual<P>>;
  substitutions: SubstitutionRule<P>[];
  feasibility?(inv: Inventory, m: Manual<P>): { ok: boolean; detail: string; assignment?: unknown };
  Renderer: React.ComponentType<RendererProps<P>>;
  verifiers: Verifier<P>[];
  commerce?(missing: Requirement[]): { label: string; url: string }[];
}

// Placement types
export interface LegoPlacement { ldrawPart: string; ldrawColor: number; matrix: number[]; /* 16, column-major, LDU */ }
export type BoardPlacement =
  | { kind: 'part'; pins: { row: string; col: number }[]; polarity?: string[] }
  | { kind: 'wire'; from: Hole | BoardPin; to: Hole | BoardPin };
export type Hole = { row: string; col: number }; export type BoardPin = { board: string };
export type FabricPlacement =
  | { kind: 'piece'; polygonMm: [number, number][]; fabricClass: string; scrapId?: string; xMm?: number; yMm?: number; rotDeg?: number }
  | { kind: 'seam'; a: [string, string]; b: [string, string] };
```

---

## 16. Tech stack and repo layout

- **pnpm workspace**, TypeScript strict everywhere.
- `apps/web` — Next.js 16 (App Router), React 19, Tailwind 4, react-three-fiber + drei + three, zod, Vercel AI SDK v7 (`generateText` + `Output.object`) with provider string `anthropic/claude-sonnet-5` via AI Gateway (`AI_GATEWAY_API_KEY`) or `@ai-sdk/anthropic` with `ANTHROPIC_API_KEY`.
- `services/stream-hub` — Node 24, `ws`, `sharp` (downscale/greyscale for motion), in-memory ring buffers.
- `services/unoq-agent` — Python 3, `requests`; App Lab project with the probe sketch.
- `apps/glasses-bridge-ios` (Swift) **or** `apps/glasses-bridge-android` (Kotlin) — from Meta's sample app.
- `manuals/{lego,breadboard,fabric}/<id>/` — sources + `meta.json` + refs.
- `apps/web/public/ldraw/` (part subset), `apps/web/public/refs/` (vision reference images), `apps/web/public/marker-mat.pdf`.

```
apps/web/src/
  core/        types.ts plugin.ts matcher.ts guide.ts inventory.ts hub-client.ts verify.ts
  domains/     lego/ breadboard/ fabric/   (each: index.ts vocabulary.ts loader.ts subs.ts Renderer.tsx verifiers.ts)
  app/         page.tsx scan/ builds/ guide/[manualId]/ live/ source/phone/ api/{inventory,verify,manuals}/
  ui/          ScrollGuide.tsx StepCard.tsx LivePanel.tsx InventoryStrip.tsx BuildCard.tsx
```

Env: `AI_GATEWAY_API_KEY` | `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_HUB_WS=ws://<laptop-ip>:8787`, `HUB_HTTP=http://<laptop-ip>:8787`, `UNOQ_BOARD_ID`.

Scripts: `pnpm dev` (web + hub concurrently), `pnpm manuals:index` (parse all manuals → `manuals.index.json`, fails on parse errors), `pnpm test` (parsers, matcher, substitution rules — these three must have tests).

Conventions: no database; no global state beyond the hub; every domain-specific line of code lives under `src/domains/<id>/`; the demo must run with the glasses simulator alone and with the phone PWA source alone.

---

## 17. Integrations in scope

| Integration | Status | Notes |
|---|---|---|
| **Ray-Ban Meta glasses** | Core (§7) | Primary camera for the whole session; narration into the glasses via the phone bridge. |
| **Dropbox** | In progress | Manual library in, build records out, photos → inventory. Spec: `docs/dropbox-integration.md`. |
| **Shop the gap** | Done | `plugin.commerce(missing)`: BrickLink wanted list (LEGO), Adafruit search (breadboard), notions retailer (fabric). A feature, not a sponsor track. |

Everything else that was discussed (Arduino UNO Q, ASUS, Deepgram/ElevenLabs voice vendors, Elasticsearch, Dimensional, The Token Company, Visa, multiplayer rooms) is **out of scope**. Do not add sponsor-specific code paths.

---

## 18. Demo assets to prepare (physical + digital)

- LEGO: the chosen set/bricks (≤ 8 part types, ≤ 3 colors), 3 manuals authored in Studio, part reference photos on the marker mat.
- Breadboard: an Uno-format board (any Uno R3/R4 or compatible), half-size breadboard, red + green LED, 220Ω ×1, 100Ω ×2, 10kΩ ×1, LDR, button, 10 jumpers; 3 manuals; sketches; labeled bins.
- Fabric: 3 cotton scraps (roughly rectangular), 1 fleece scrap (deliberately unsuitable), 18 cm zipper, 1 m cord, thread, scissors; the object to hold (earbuds case); 3 manuals.
- Printed **marker mat** (A3, 4 ArUco markers), plain dark tablecloth.
- Laptop hotspot; phone with the bridge app; glasses charged and paired; spare phone running the PWA source.
- Recorded fallback video of the whole flow.

---

## 19. Milestones and acceptance criteria (≈ 36 h, 4 people)

**M0 — Skeleton (h0–2).** Workspace, `core/types.ts`, `plugin.ts`, one LEGO `.ldr` parsed to `Manual` with derived `requires`, `pnpm test` green, `pnpm dev` serves `/`.
*Accept:* `manuals:index` prints the LEGO manual with correct step count and part counts.

**M1 — Guide vertical slice (h2–8).** `/guide/[id]` scrollytelling with the LEGO renderer: ghosting, outline, fly-in, reverse, auto-frame, snapshot. `/builds` with the matcher over a hard-coded inventory, including one `with-subs` case.
*Accept:* scrolling through 10 steps animates correctly at 60 fps on the demo laptop; substitution chip appears for a rigged inventory.

**M2 — Observation + inventory (h8–14).** Stream hub, phone PWA source, `/scan` with live feed, VLM inventory (photo + 10 s scan), editable strip, `/live` debug.
*Accept:* from a phone pointed at the LEGO pile, the inventory is within ±1 per part type on 3 of 3 trials on the marker mat.

**M3 — Breadboard + verification (h14–20).** Breadboard plugin (loader, subs from E12 math, SVG renderer), vision verifier, step state machine + badges, replan banner.
*Accept:* hiding the 220Ω yields the series-100Ω substitution and re-rendered steps; a verified step shows the badge with a hint.

**M4 — Glasses as the core (h20–26).** Glasses simulator + glasses-first web experience (primary-source selection, continuous inventory with detection overlay, hands-free auto-verify, narration), then the native bridge app streaming at ≥ 5 fps with Scan/Check/Next/Prev buttons and TTS. Fabric plugin (loader, rect nesting feasibility, cut-layout + assembly SVG).
*Accept:* with the simulator, scan → builds → guide → verify runs with no clicks after the guide opens; on hardware, the wearer scans, picks a build, hears "Step 1: …" in the glasses.

**M5 — Dropbox + polish + rehearsal (h26–32).** Dropbox Phases A–C per `docs/dropbox-integration.md`, shop-the-gap links, empty/error states, fallback switches (source, model provider), demo assets, three full rehearsals, recorded backup video.

**M6 — Buffer (h32–36).** Stretch only if M0–M5 are solid: fabric cut-line overlay on the scan frame, on-phone voice commands, state estimation on join.

---

## 20. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Glasses SDK access (registration, country, preview limits) or Bluetooth bandwidth | Glasses simulator for all web work; Mock Device Kit for the bridge; phone PWA as the on-stage fallback. Cap at 10 fps. |
| VLM misclassifies parts | Small vocabulary, reference images in prompt, marker mat + plain background, editable inventory, max-not-sum aggregation. |
| Breadboard vision too small for the glasses camera | Verify at the end state (LED on / off) rather than per wire; the wearer leans in; Mark done always works. |
| LDraw library size / loader quirks | Vendor only the needed parts; instance parts yourself (§13.1). |
| Scroll jank | Throttle step activation (one transition in flight), `requestAnimationFrame` tweens, memoized geometry. |
| Demo network | Everything on the laptop hotspot; no cloud dependency except the VLM call; local VLM or cached inventories as a last resort. |
| A judge hides an unplanned part | Substitution rules are general within the vocabulary; "missing" bucket always lists the exact part; Mark-done override. |

---

## 21. Open decisions (defaults in bold)

1. Glasses bridge platform: **the phone the team owns**; iOS if a Mac with Xcode is at the table, else Android.
2. LEGO source: **Creator 3-in-1 set the team owns** (OMR or Studio recreation); else 3 Studio-authored models.
3. Vision provider: **`anthropic/claude-sonnet-5` via AI Gateway**; direct provider keys as fallback.
4. Deploy: **local laptop for the demo**; optional Vercel deploy of `apps/web` with recorded frames for a judges' link.
5. Color handling for LEGO matching: **color-agnostic by default**, chip shows the swap.

---

## 22. References

- Meta Wearables Device Access Toolkit: https://developers.meta.com/blog/introducing-meta-wearables-device-access-toolkit/ · https://developers.meta.com/wearables/faq/ · https://github.com/facebook/meta-wearables-dat-ios · https://github.com/facebook/meta-wearables-dat-android · docs: https://wearables.developer.meta.com/docs/develop/
- LDraw: https://library.ldraw.org · three.js LDraw example: https://threejs.org/examples/webgl_loader_ldraw.html
- BrickLink Studio instructions maker: https://studiohelp.bricklink.com/hc/en-us/articles/5626403887511
- Rebrickable downloads (if a larger LEGO vocabulary is ever needed): https://rebrickable.com/downloads/
- FreeSewing (optional fabric designs): https://freesewing.org
- SVGnest (polygon nesting, optional): https://github.com/Jack000/SVGnest

---

## 23. Glossary

- **Manual**: an authored source file (LDraw/JSON) normalized into `Manual` with derived requirements and steps.
- **Inventory**: parts detected from frames, user-editable.
- **Match**: a manual's buildability against an inventory, with substitutions.
- **Guide**: the scrollable, animated presentation of one manual's steps.
- **Observation source**: any producer of JPEG frames on the hub protocol (glasses bridge, glasses simulator, phone PWA).
- **Verifier**: vision or hardware check of one step, producing `VerifyResult`.
- **Replan**: recomputation of remaining steps after a part goes missing.
