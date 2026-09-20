# Dropbox Integration — PRD + Implementation Spec

**Audience:** an autonomous coding agent implementing this feature end to end, and the team reviewing it.
**Prerequisites:** read `PRD.md`, `README.md`, `apps/web/src/core/types.ts`, `apps/web/src/core/plugin.ts`, `apps/web/src/lib/manuals.ts`, `apps/web/src/ui/ScrollGuide.tsx`, and `apps/web/src/app/api/inventory/route.ts` first.
**Sponsor context:** Dropbox's challenge is "turn digital chaos into something useful": *files into action*, *smarter photo libraries*, *reimagine organizing content*. This integration maps onto all three, in that order of importance.

---

## 1. Why Dropbox, in one paragraph

Today the manual library is 8 files in the repo and the inventory lives in the browser. With Dropbox as the content layer, **a folder of instruction PDFs and photos becomes a set of interactive, adaptive, verified build guides** (files → action), **photos of your parts bins become a persistent inventory of what you own** (smarter photo library), and **every build you complete is written back as a project folder documented from the builder's own eyes** via the Ray-Ban Meta camera (a new kind of record). The core pipeline (matcher, guide, verifier) does not change; Dropbox becomes where content comes from and where results go.

## 2. Goals / non-goals

**Goals**
- G1. Connect a Dropbox account once; the app can read and write inside its own App Folder.
- G2. **Build records out:** completing a build (or clicking Save) writes a project folder with a README, the manual snapshot, substitutions, and a before/after frame per verified step, and returns a shared link.
- G3. **Manual library in:** manuals in the Dropbox folder (already-structured `.ldr` / `manual.json`, and unstructured PDFs) appear in the app's library and on `/builds`.
- G4. **PDF ingestion:** a PDF manual is parsed into steps (text, parts, page-region visual) with per-step confidence, reviewable before publishing, and renders in the existing scrollable guide with a document renderer.
- G5. **Photos → inventory:** a folder of photos (parts bins, table shots, Ray-Ban captures) is scanned into a persistent per-domain inventory stored in Dropbox and loadable on `/scan`.
- G6. Everything degrades gracefully: with no Dropbox connection the app behaves exactly as today.

**Non-goals**
- Multi-user accounts, team spaces, or Dropbox Business features.
- Editing manuals inside Dropbox's UI. Review/editing happens in the app.
- The universal assembly IR (see the generalization plan); ingested PDFs use a *document* placement type, not 3D geometry.
- Real-time collaboration.

## 3. Folder layout inside the App Folder

Dropbox "App folder" access type → all paths are relative to `/Apps/<AppName>/`.

```
/Manuals/<domain>/<id>/          domain ∈ lego | breadboard | fabric
    meta.json                    { title, description, estMinutes }
    model.ldr | manual.json      structured (same formats as the repo's manuals/)
    source.pdf                   optional: unstructured manual to ingest
    ingested.json                written by the app after review (document manual)
    thumb.svg
/Inventory/<domain>.json         persistent inventory ({ domain, items[], sources[], updatedAt })
/Photos/<domain>/…               photos to scan (any images); subfolders allowed
/Builds/<YYYY-MM-DD>-<manualId>-<shortid>/
    README.md                    human-readable record
    manual.json                  snapshot of the manual as built (after any replans)
    result.json                  { manualId, startedAt, finishedAt, subs[], steps[{ n, status, hint, conf, before, after }] }
    steps/01-before.jpg, 01-after.jpg, …   frames from the hub ring buffer
    steps/01-expected.png        renderer snapshot when available
    thumb.svg
```

## 4. Auth and setup (human does this once, agent documents it)

1. Create an app at the Dropbox App Console: **Scoped access**, **App folder**, name it (e.g. "Reality Compiler").
2. Permissions tab: `account_info.read`, `files.metadata.read`, `files.metadata.write`, `files.content.read`, `files.content.write`, `sharing.write`. Submit.
3. Settings tab: add redirect URI `http://localhost:3000/api/dropbox/callback`. Note the **App key** and **App secret**.
4. Env (`apps/web/.env.local`):
   ```
   DROPBOX_APP_KEY=
   DROPBOX_APP_SECRET=
   DROPBOX_REFRESH_TOKEN=        # filled by the one-time auth script or the in-app connect flow
   DROPBOX_ROOT=                 # optional subfolder inside the App Folder, default ""
   ```

Two ways to obtain the refresh token; implement both:
- **`pnpm dropbox:auth`** (script): PKCE flow with `token_access_type=offline`, opens the browser, listens on localhost for the callback, prints the refresh token to paste into `.env.local`. Single-user, demo-proof, no cookies.
- **In-app Connect** (`/library` → Connect): same PKCE flow through `/api/dropbox/auth` and `/api/dropbox/callback`; stores the refresh token in an encrypted, httpOnly cookie (`DROPBOX_COOKIE_SECRET`). Env token takes precedence when present.

Use the official `dropbox` npm SDK with `{ clientId, clientSecret, refreshToken }` so access tokens refresh automatically. All Dropbox calls are server-side (route handlers / server modules), never from the browser.

## 5. Architecture

```
Dropbox App Folder
   │ list/download (SDK, server-side)                     upload/share (SDK)
   ▼                                                              ▲
apps/web/src/lib/dropbox/                                          │
   client.ts      SDK factory, token source (env | cookie), retry, path helpers
   library.ts     list /Manuals, download changed files into .cache/dropbox/manuals/<domain>/<id>/, cursor-based sync
   inventory.ts   read/write /Inventory/<domain>.json
   builds.ts      write a build record folder, create shared link
   ingest.ts      PDF → page images → VLM structured steps → document manual (ingested.json)
   │
   ▼
Manual library = built-in index (repo, static) + runtime manuals (cache dir) merged by src/lib/manuals.ts
```

- **Runtime manuals**: `getManuals()` becomes async and merges `manuals.index.json` with manuals loaded from `.cache/dropbox/manuals/**` via the same `loadLibrary()` code path (`MANUALS_DIR` override already exists in `core/library.ts`). `/builds` and `/guide/[id]` read through `getManuals()`; `/guide/[id]` keeps `generateStaticParams` for built-ins and renders runtime ids dynamically (`dynamicParams = true`).
- **No database.** The cache dir is disposable; `/Inventory/*.json` in Dropbox is the persistent store; a sync cursor is kept in `.cache/dropbox/cursor.json`.
- **Feature flag**: `NEXT_PUBLIC_DROPBOX_ENABLED` derived server-side from the presence of `DROPBOX_APP_KEY`; UI hides Dropbox controls when off.

## 6. Features, in delivery order

### Phase A — Connect + build records out (branch `feat/dropbox-records`)

1. `lib/dropbox/client.ts`, the auth script, the callback route, `/api/dropbox/status` (connected? account name? root path?).
2. `/library` page: connection status, Connect/Disconnect, App Folder path, last sync time (sync itself lands in Phase B; render the shell now).
3. **Build record**: in `ScrollGuide`, a "Save build" button in the header and an automatic prompt when the last step is verified. `POST /api/dropbox/builds` with `{ manualId, manualSnapshot, verify: Record<step, VerifyResult>, subs }`. The server:
   - Pulls frames from the hub for each step: before = `/frames/at?ts=armedAt`, after = `/frames/at?ts=verifiedAt` (extend `VerifyResult.evidence` to carry `armedAt`, `verifiedAt`, `sourceId`, and the expected-image blob id when a snapshot was taken; the guide already has these values, it just doesn't persist them).
   - Writes the folder per §3 with `filesUpload` (create the README from a template: title, date, source of frames, per-step table with status/hint, substitutions, "Documented from the builder's point of view via Ray-Ban Meta glasses" when the source kind is `glasses`).
   - Creates a shared link (`sharingCreateSharedLinkWithSettings`, fall back to `sharingListSharedLinks` if one exists) and returns `{ path, url }`.
   - Shows the link in the guide with a QR code (`qrcode` npm, rendered as SVG) so a judge can open it on their phone.
4. Tests: README template rendering, record path naming, and a mocked SDK test for upload ordering/failure handling (partial uploads must not throw away the record; retry per file, report which files failed).

**Accept:** with a connected account, finishing the LEGO phone stand (Mark done on all steps with the hub running and the replay/phone source producing frames) creates a folder in Dropbox with a README, result.json, and before/after JPEGs for each step; the shared link opens; with Dropbox disconnected the button is hidden and nothing else changes.

### Phase B — Manual library sync (branch `feat/dropbox-library`)

1. `lib/dropbox/library.ts`: `sync()` lists `/Manuals` recursively with `filesListFolder` + `filesListFolderContinue` (persist the cursor; use `filesListFolderGetLatestCursor` on first run after a full download), downloads new/changed files into the cache dir, deletes local copies of removed folders, and returns a change summary. `POST /api/dropbox/sync` triggers it; the `/library` page shows each manual folder with domain, id, files present, parse status (ok / error message from `loadManual`), and whether it's built-in or from Dropbox.
2. `getManuals()` merge (see §5). Dropbox manuals with the same id as a built-in override it (so the team can iterate on a manual by dropping a file, without a deploy).
3. Long-poll or a 30 s interval on `/library` to auto-refresh sync state; keep it simple.
4. Tests: merge precedence, cursor persistence, a parse error in one Dropbox manual does not hide the others.

**Accept:** drop a new `manuals/lego/<id>/` folder (model.ldr + meta.json) into Dropbox → within one sync it appears on `/builds` with a thumbnail and opens in the guide; delete it in Dropbox → it disappears after sync; a broken manual shows an error on `/library` and nothing else breaks.

### Phase C — PDF ingestion + document renderer (branch `feat/dropbox-ingest`)

This is the "files into action" headline.

1. Rasterize: `source.pdf` → PNG per page at ~110 dpi. Use a pure-JS/WASM path with no system binaries (`mupdf` WASM, or `pdfjs-dist` + `@napi-rs/canvas`); cap at 40 pages; cache page images in the cache dir.
2. Parse: one `visionObject()` call per page (batch 2 pages per call when small) with the schema:
   ```
   { steps: [{ n?: number, text, partsUsed: [{ name, qty }], region: { page, bbox: [x,y,w,h] /* normalized */ }, cautions?: string[], confidence: 0..1 }],
     partsList?: [{ name, qty, notes }], detectedDomain?: 'lego'|'breadboard'|'fabric'|'other' }
   ```
   Merge pages, renumber steps, keep per-step confidence. Prompt must instruct the model to use the manual's own step numbering when visible and to describe *the physical action*, not the picture.
3. Map parts to the domain vocabulary: for the chosen/detected domain, one LLM call maps `partsUsed[].name` → `PartType.id` with a confidence; below 0.6 the part becomes an **extra part type** declared on the manual (`Manual.extraParts?: PartType[]`, additive field; id `ext:<slug>`), so the inventory editor can list it and the matcher can require it. Never silently drop a part.
4. Document manual: `Manual` with `render: 'document'` (additive optional field), `domain` = mapped domain, `parts` = one PartInstance per required part with placement `{ kind: 'page', page, bbox }`, steps with `expected.description` from the step text, `steps[].meta = { region, confidence, cautions }`, `requires` derived as usual. Written to `/Manuals/<domain>/<id>/ingested.json` in Dropbox and to the cache; `loadLibrary` loads `ingested.json` when present.
5. Review UI: `/library/<id>/review`: page image on the left with the step region highlighted, editable step list on the right (text, parts/qty with vocabulary picker, confidence badge, delete/merge/split step). "Publish" writes `ingested.json`; "Re-parse" re-runs ingestion. Low-confidence steps (< 0.7) are flagged and the manual is marked `needsReview` until published.
6. **Document renderer** (`apps/web/src/domains/document/Renderer.tsx`, registered in `domains/renderers.tsx` and selected when `manual.render === 'document'`): shows the current step's page crop (from the cached page image, served by `/api/manuals/<id>/page/<n>`) with the region outlined, previous step's crop ghosted small in a corner, and a "full page" toggle. Snapshot = the crop. Reuses ScrollGuide unchanged; verification (vision before/after) works as-is because it only needs `expected.description` and frames.
7. Tests: page merge/renumbering, part mapping fallback to `ext:` ids, `loadLibrary` on an `ingested.json` fixture, renderer crop math.

**Accept:** put a real public PDF manual (e.g. a simple flat-pack shelf or a breadboard kit guide) in `/Manuals/<domain>/<id>/source.pdf` → sync → ingest → review shows steps with regions → publish → it appears on `/builds`, matches against an inventory (with `ext:` parts addable in the editor), and opens as a scrollable guide with page crops; verification and replan (callouts/text only) still work. Report the confidence distribution and hand-counted step accuracy for two PDFs in the PR.

### Phase D — Photos → persistent inventory (branch `feat/dropbox-inventory`)

1. `/scan` gets "Scan Dropbox photos": pick `/Photos/<domain>` (or a subfolder), the server downloads each image (skip > 12 MP by downscaling with `sharp`), calls the inventory service, and aggregates with a user-chosen mode: **same pile** (max per type, as in video scan) or **different bins** (sum). Show per-photo results and the merged inventory; the user edits and confirms.
2. Persistent inventory: "Save to Dropbox" writes `/Inventory/<domain>.json` (items + a `sources` list of photo paths and timestamps); "Load from Dropbox" on `/scan` restores it. `/builds` shows a chip "inventory from Dropbox, N photos, updated <date>" when applicable.
3. Ray-Ban captures: document (README) how to get glasses photos into `/Photos` (Meta AI app export / camera roll → Dropbox camera upload); no SDK work here.
4. Tests: aggregation modes, JSON round-trip, image downscale path.

**Accept:** 5 photos of parts bins in `/Photos/lego` → merged inventory within ±1 per type of a hand count on the team's test set → saved → reload the browser → `/builds` uses it.

## 7. UI summary

- `/library`: connection card (status, Connect/Disconnect, folder path, Sync now, last sync), manuals table (source, domain, id, status, actions: open guide / review / re-parse), photos section (folders, Scan), build records list (links).
- `/scan`: "Scan Dropbox photos", "Load from Dropbox", "Save to Dropbox" (fabric/breadboard/lego alike).
- Guide header: "Save build" + saved link with QR.
- All Dropbox controls hidden when the feature flag is off.

## 8. Constraints for the agent

- Additive type changes only: `Manual.render?`, `Manual.extraParts?`, `VerifyResult.evidence` fields, a `document` placement type. Existing plugins, renderers, tests, and the demo path must keep working.
- Server-side Dropbox only; never expose the app secret or tokens to the browser.
- No database. Cache dir under `apps/web/.cache/` (gitignored) + Dropbox as the durable store.
- Respect rate limits and failures: retry with backoff on 429/5xx, surface partial results with clear messages, never block the guide on Dropbox.
- Every phase: `pnpm test`, `pnpm --filter web lint`, `pnpm --filter web exec tsc --noEmit`, `pnpm --filter web build` green; screenshots of the UI in the PR; a short "how to demo" section in the PR description; README status updated.
- One PR per phase, in order A → B → C → D. Stop after each and wait for review.

## 9. Demo script for the Dropbox judges (90 s)

1. Open Dropbox on the laptop: `/Manuals` has a PDF someone dropped in; `/Photos/lego` has five phone photos of bins.
2. `/library` → Sync → the PDF is ingested; open review, show steps and regions, publish.
3. `/scan` → Scan Dropbox photos → merged inventory saved to Dropbox.
4. `/builds` → the PDF's project is buildable from those bins → open the guide, scroll two steps with page crops, mark them done with the glasses producing frames.
5. Save build → open the shared link on a phone: README + first-person before/after frames per step.
Line to say: "A folder of PDFs and photos became something you can build, verified from your own eyes, and the record wrote itself back."

## 10. Open decisions (defaults)

- App Folder vs full Dropbox access: **App Folder**.
- Token storage: **env refresh token via `pnpm dropbox:auth`** for the demo; cookie flow as the second path.
- PDF rasterizer: agent's choice, **no system binaries**.
- Page cap for ingestion: **40 pages**; larger PDFs are rejected with a message.
