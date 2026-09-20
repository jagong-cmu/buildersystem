# Glasses bridge (iOS) — `apps/glasses-bridge-ios`

The phone app that turns Ray-Ban Meta glasses into the hub's `glasses` source.
There is no glasses → laptop path (PRD §7.1): the glasses stream to the phone
over Bluetooth via Meta's Wearables Device Access Toolkit (DAT), and this app
forwards downscaled JPEGs to `services/stream-hub` over Wi-Fi, speaks the hub's
`say` messages, and exposes Scan / Check / Next / Prev / Missing buttons.

```
glasses ──BT (DAT, ≤ 15 fps raw)──▶ iPhone: GlassesBridge ──ws /produce (≤ 10 fps JPEG)──▶ hub ──▶ web
                                        ▲   │
                                        │   └── POST /control  {type: scan.start|check|next|prev|part.missing}
                                        └───── ws /control     {type: say, step.activated, verify.result}
                                             AVSpeechSynthesizer → phone's audio route (glasses when paired for audio)
```

The DAT plumbing (registration, device eligibility, `createSession` →
`addCamera` → stream) is ported from the team's Brownmellon app
(`jagong-cmu/hackmit`, `ios/Brownmellon/Core/DATGlassesSession.swift`), which
already works against real glasses. The difference is that this session stays
open for the whole build instead of taking one still.

## Layout

| Path | What |
| --- | --- |
| `project.yml` | XcodeGen spec (source of truth; the `.xcodeproj` is generated and not committed). Pins `meta-wearables-dat-ios` **0.9.0**. |
| `GlassesBridge/Core/HubProtocol.swift` | Wire format (`uint32 BE header length + JSON header + JPEG`), control-message codec, URL builder. Pure Foundation. |
| `GlassesBridge/Core/Pacing.swift` | `FrameThrottle` (≤ N fps), `Backoff` (0.5 s → 8 s), `fitWidth`, `StreamStats`. Pure Foundation. |
| `GlassesBridge/Core/FrameSocket.swift` | Producer WebSocket. Drops frames when a send is in flight or the socket is down; reconnects with backoff. |
| `GlassesBridge/Core/ControlClient.swift` | `/control` subscriber (say, step.activated with callouts, verify.result) + HTTP POST sender. |
| `GlassesBridge/Core/Narrator.swift` | `AVSpeechSynthesizer` queue; keeps at most one pending utterance so stale countdown ticks are skipped. |
| `GlassesBridge/Core/GlassesStream.swift` | DAT registration/session/camera; `FramePipeline` throttles → downscales (≤ 960 px wide) → JPEG q 0.6 off the main thread. |
| `GlassesBridge/Core/MockGlasses.swift` | Mock Device Kit controls (Simulator Debug builds only). |
| `GlassesBridge/UI/BridgeView.swift` | Single-screen UI: hub settings, glasses status, stream + fps/latency, guide controls, narration, developer section. |
| `GlassesBridgeTests/` | XCTest for the protocol codec, URL builder, throttle, backoff, resize, stats. |

Settings (hub URL, source id, max fps, max width, JPEG quality, narration)
persist in `UserDefaults` via `@AppStorage`.

## 1. Developer registration (once per team)

1. Create an account at the [Meta Wearables Developer Center](https://wearables.developer.meta.com/) and accept the Developer Preview terms.
2. In the **Meta AI** app on the phone that owns the glasses: *Settings → your glasses → Developer Mode → on*. This is what lets a sideloaded app (`MetaAppID: "0"` in `project.yml`) talk to the glasses. A real App ID is only needed for distribution, which the preview does not allow anyway.
3. Make sure the glasses are on the latest firmware (Meta AI prompts; the bridge also shows an *Update firmware* button when the SDK reports `deviceUpdateRequired`).

## 2. Building and installing

Requirements: macOS with Xcode 16+, [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`), an iPhone on iOS 17.2+.

```bash
cd apps/glasses-bridge-ios
xcodegen generate                 # writes GlassesBridge.xcodeproj
open GlassesBridge.xcodeproj
```

In Xcode: select the *GlassesBridge* target → *Signing & Capabilities* → pick
your team (a free Personal Team works). Do not commit the team ID. Plug the
phone in, select it as the run destination, ⌘R. On first launch trust the
developer certificate under *Settings → General → VPN & Device Management*.

Unit tests: ⌘U, or

```bash
xcodebuild test -project GlassesBridge.xcodeproj -scheme GlassesBridge \
  -destination 'platform=iOS Simulator,name=iPhone 16'
```

## 3. Choosing the hub address

The hub must be reachable from the phone over Wi-Fi (same network as the
laptop, no client isolation). Find the laptop's LAN IP:

```bash
ipconfig getifaddr en0          # macOS
```

Enter `http://<that-ip>:8787` as **Hub URL** in the app. The web app must
point at the same hub (`NEXT_PUBLIC_HUB_URL=ws://<that-ip>:8787` when starting
`pnpm dev`, otherwise the laptop's browser talks to `localhost` while the phone
talks to the LAN IP — both are the same process, so this works out of the box
with the default hub binding on `0.0.0.0`). The app pings `GET /health` and
shows *hub unreachable* if it can't get through.

`NSAllowsArbitraryLoads` is set in `project.yml` because the hub is plain
`ws://` on a LAN. If you front the hub with TLS, enter `https://…` and the app
switches to `wss://`.

## 4. Developing without hardware — Mock Device Kit

Run the *GlassesBridge* scheme on an iOS Simulator. The **Developer · Mock
Device Kit** section appears (Simulator Debug builds only):

1. *Pair mock glasses* — enables `MockDeviceKit` (registered, camera permission
   granted), pairs a mock Ray-Ban Meta, powers it on, unfolds it.
2. *Put on* — dons the glasses so `AutoDeviceSelector` considers them eligible.
3. Choose a **Camera feed**: *Mac camera* (the Simulator forwards the Mac's
   webcam) or *Bundled video* (drop `sample-pile.mp4` into
   `GlassesBridge/Resources/` and add it to the target; a screen recording of
   `glasses-sim --pan` over the LEGO pile works well).
4. Set **Hub URL** to `http://localhost:8787` (the Simulator shares the Mac's
   network) and press **Start stream**.

Expected: the stream chip goes *streaming*, *Phone → hub* shows ~10 fps and a
latency figure, and the web app at `http://localhost:3000/live` shows source
`glasses` with the header chip online. `/scan` starts filling the inventory
with no clicks. Open a guide: the phone shows *Step N of M* with the step text;
*Next / Prev* move the guide, *Check* runs the verifier, *Missing* lists the
step's callouts and sends `part.missing` on tap (the guide replans). Every
`say` message is spoken by the Mac's speaker.

## 5. On-device test checklist

Record the results in the table at the bottom.

| # | Step | Pass criterion |
| --- | --- | --- |
| 1 | Glasses paired in Meta AI, Developer Mode on, hinges open | *Glasses* section lists the device with `link: connected · compatible` |
| 2 | **Connect glasses** | Meta AI opens, asks to authorise GlassesBridge, returns to the app via `glassesbridge://`; registration chip shows `registered` |
| 3 | **Start stream** (first time) | Meta AI asks for camera permission; back in the app the stream chip goes `starting → streaming`, preview updates |
| 4 | Laptop `/live` | source `glasses` online in the header chip; fps ≈ the *Phone → hub* figure; frames follow head movement with < 1 s delay |
| 5 | Laptop `/scan` | boxes drawn over the wearer's view, inventory grows without touching the laptop |
| 6 | Open a guide on the laptop | phone shows *Step 1 of N* and the text; the step is spoken |
| 7 | **Next** / **Prev** on the phone | the guide moves; the new step is spoken |
| 8 | **Check** | guide shows "Checking…", then verified/mismatch; the result is spoken |
| 9 | **Missing** → tap a part | guide shows the replan banner and speaks "Plan updated from step N" |
| 10 | Glasses set as the phone's Bluetooth audio output | narration is heard in the glasses, not the phone |
| 11 | Turn Wi-Fi off on the phone for 10 s, back on | *Socket* shows `reconnecting in …`, then `open`; `/live` shows the source offline → online; no app restart needed |
| 12 | Lock the phone for 30 s | stream stops (expected, see limitations), resumes with **Start stream**; narration keeps working |

### Observed on hardware

| Date | Glasses / firmware | iPhone / iOS | Glasses → phone fps | Phone → hub fps | Latency (capture → send) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| _not yet run_ | | | | | | |

## Limitations (honest)

- **Background**: iOS suspends the camera stream when the app leaves the
  foreground; `UIBackgroundModes` keeps narration and the Bluetooth link alive
  but not video. The screen is kept awake (`isIdleTimerDisabled`) while
  streaming; keep the bridge screen open for the whole build. There is no
  Picture-in-Picture or background-camera entitlement for third-party DAT apps
  in the 0.9 preview.
- **Bandwidth**: DAT video is Bluetooth Classic bound. The SDK's adaptive
  ladder may drop the requested `medium @ 15 fps` to lower quality; the app
  shows the *Glasses → phone* fps so you can see what actually arrives.
  Valid `frameRate` values are 2/7/15/24/30 — we request 15 and throttle to ≤ 10.
- **Latency figure** is capture-callback → socket-send on the phone. It does
  not include glasses → phone Bluetooth latency or hub → browser delivery.
- **Speech recognition** (stretch, PRD §7.2) is not implemented in this PR.
- **Distribution**: Developer Preview builds only run on phones you sign for.
- **Not verified in this PR**: nothing here was built with Xcode or run on a
  simulator/device by the author (Linux-only CI box). The pure-logic files
  (`HubProtocol.swift`, `Pacing.swift`) and their tests were compiled and run
  with the Swift 6 toolchain on Linux via a scratch SwiftPM package; the
  UIKit/DAT/SwiftUI files were written against the 0.9.0 `.swiftinterface`
  files and Brownmellon's working code but need one `xcodegen generate` + ⌘B
  on a Mac to confirm.
