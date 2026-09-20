# Reality Compiler

Point a camera at a pile of parts → see what you can build → follow a generated, scrollable, step-by-step guide that adapts to missing parts and verifies as you build. Domains: **LEGO**, **breadboard electronics**, **fabric scraps**.

Read **[PRD.md](PRD.md)** first. It is the spec; this file is the run sheet and the status board.

## Run

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # add AI_GATEWAY_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or ANTHROPIC_API_KEY for vision
pnpm dev            # web on :3000 + stream hub on :8787
pnpm test           # parsers, matcher, nesting, hub protocol
pnpm manuals:index  # parse manuals/ → apps/web/src/generated/manuals.index.json (also runs before dev/build/test)
```

Vision can use the AI Gateway, Google Gemini, or Anthropic directly. Set
`GOOGLE_GENERATIVE_AI_API_KEY` and leave `VISION_MODEL` unset to default to
`google/gemini-3.6-flash`; use `VISION_MODEL=google/gemini-3.1-pro-preview` or an
`anthropic/...` model to select a direct provider explicitly.

- Web app: http://localhost:3000 — `/scan`, `/builds`, `/guide/<manualId>`, `/live`
- Phone as camera: open `http://<laptop-lan-ip>:3000/source/phone` on a phone on the same Wi-Fi, set the hub to `ws://<laptop-lan-ip>:8787`, Start. (Camera needs a secure context: use `next dev --experimental-https` or a localhost tunnel.)
- Hub health: `curl localhost:8787/health`

Dropbox Phase A uses an App Folder: set `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`,
and `DROPBOX_COOKIE_SECRET`, then run `cd apps/web && pnpm dropbox:auth` once to
obtain `DROPBOX_REFRESH_TOKEN`. The app reports Dropbox as not connected when no
refresh token is configured. `/library` connection and build-record export are
implemented; manual sync, PDF ingestion, and persistent photo inventory are
planned for Phases B–D.

## Glasses (primary source)

The Ray-Ban Meta glasses are the primary observation source: an online `kind: "glasses"` source wins over the phone, which wins over anything else (`lib/sources.ts`, override via the dropdown under the feed). The header chip shows online/offline, fps and last-frame age. `/scan` fills the inventory continuously from what the wearer looks at (≤ 1 fps, prefers frames after the hub's motion `settled`, dedupes `seq`, one vision call in flight, max-not-sum over the last 8 processed frames, hand-edited rows pinned until Reset, hard cap `30` vision calls/min); the guide shows a live PiP with the active step's parts highlighted, auto-verifies after `motion.active → settled` (once per 10 s per step, header off switch, never during a manual Check) and speaks everything wearer-relevant as `say` control messages.

### Demo without hardware

```bash
pnpm dev:hub                                                    # hub on :8787
VISION_MOCK=1 pnpm dev:web                                      # deterministic mock detections, no provider key needed (drop VISION_MOCK for real vision)
pnpm --filter stream-hub sim -- --dir ~/photos/lego-pile --pan --loop --motion   # or --synthetic for generated frames
```

Sim flags: `--dir <jpeg|png folder>`, `--fps` (≤ 10), `--loop`, `--pan` (crop-and-drift across large images), `--motion` (alternates `motion.active`/`settled` every `--motion-period` s), `--synthetic [n]`, `--source`, `--kind`. Then open `/scan` (feed + boxes + inventory growing with no clicks), `/builds` (tick **keep looking**), and `/guide/phone_stand` (PiP top-right, **In your view** panel, auto-verify runs on simulated motion and speaks the result / a 3 s countdown).

Record a live session for replay or as the stage backup:

```bash
pnpm --filter stream-hub record -- --source glasses --dir recordings/take1 [--seconds 120]
pnpm --filter stream-hub sim -- --dir recordings/take1 --loop
```

## Add a manual

Drop a folder under `manuals/<domain>/<id>/` with `meta.json` and the source file (`model.ldr` for LEGO — export from BrickLink Studio with steps; `manual.json` for breadboard/fabric, see PRD §10 for the schemas). Requirements and callouts are derived from the file. `pnpm manuals:index` fails loudly on a bad manual.

For LEGO, `0 !RC TITLE …` and `0 !RC TEXT …` meta lines before a `0 STEP` set the card title and text. Add a `DIMS` row in `apps/web/src/domains/lego/Renderer.tsx` for any part number the vocabulary doesn't have yet.

## Status (PRD §19 milestones)

- [x] **M0** workspace, core types, plugin interface, LEGO/breadboard/fabric loaders, 8 sample manuals, matcher + substitutions, tests
- [x] **M1** scrollable guide with sticky viewport; LEGO 3D renderer (procedural bricks, fly-in, ghosting, auto-frame, snapshot); breadboard SVG renderer; fabric SVG renderer (cut layout + seams); possible-builds screen with buckets, substitution/missing chips, shop-the-gap links
- [x] **M2** stream hub (frames, ring buffer, control bus, motion detector, probe queue), phone PWA source, `/scan` with live feed + editable inventory, vision inventory API, `/live` debug
- [ ] **M3** UNO Q probe agent + firmware (`services/unoq-agent`), hardware verifier wired into the guide (the hub's `/probe/*` queue and the step `probes` are ready)
- [x] **M4a** glasses-first web: simulator + recorder, primary-source model, continuous inventory, detection overlay, hands-free guide (auto-verify + narration)
- [ ] **M4b** glasses bridge app (`apps/glasses-bridge-*`) speaking the hub protocol; TTS of `say` messages
- [ ] **M5** demo assets (real manuals for the chosen LEGO set, reference photos for vision, marker mat), rehearsal, recorded fallback
- Vision verifier (`/api/verify`) is implemented and returns `unsure` with a plain hint when the hub or provider is unavailable; **Mark done** always works.
- Dropbox Phase A build-record export and `/library` connection are complete; Phases B–D are planned.

### Replan

During a build, report a missing part from a step card or send a `part.missing` control message. The remaining steps are matched again with domain substitution rules, while completed steps stay unchanged:

```bash
curl -X POST localhost:8787/control -d '{"type":"part.missing","partType":"lego:3001"}'
```

Rules with `transform` rewrite placements for the replacement parts; transform-less rules only update callouts and step text.

## Layout

```
apps/web/src/core        types, plugin interface, matcher, inventory service, library loader
apps/web/src/domains     lego/ breadboard/ fabric/ (vocabulary, loader, subs, Renderer) + registry
apps/web/src/ui          ScrollGuide, BuildsView, ScanView, LiveFeed, PhoneSource, …
apps/web/src/app         routes: / scan builds guide/[manualId] live source/phone api/{inventory,verify}
services/stream-hub      Node ws hub (PRD §8)
manuals/<domain>/<id>/   manual sources + meta.json
```
