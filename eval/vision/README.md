# Vision evaluation set

Each case lives at `eval/vision/<domain>/<case>/` and contains exactly one
`image.jpg` or `image.png` plus a `truth.json` file. Domains currently covered
are `lego`, `breadboard`, and `fabric`.

Run the default Gemini evaluation from the app directory:

```bash
pnpm eval:vision
pnpm eval:vision -- --model google/gemini-2.5-pro
```

Optional filters include `--domain <domain>` and `--case <case>`. The harness
writes timestamped `results-*.json` files beside this README; those result
files are intentionally ignored by git.

## Feedback cases (corrections from the scan UI)

"Correct last scan" on `/scan` saves the exact frame the model saw plus the
user-corrected inventory to `eval/vision/feedback/<domain>/<id>/`:
`image.jpg`, a small `scene.jpg`, `truth.json` (truth + what was predicted),
and `neg-*.jpg` crops of every rejected detection. `detectInventory` loads
these as few-shot exemplars (`VISION_EXEMPLARS=0` disables;
`VISION_FEEDBACK_DIR` relocates the store).

```bash
pnpm eval:vision -- --set curated|feedback|all   # default: all
pnpm eval:vision -- --no-exemplars               # measure the bare prompt
pnpm eval:vision -- --baseline                   # also write baseline.json
pnpm eval:vision -- --fail-below 0.8             # exit 1 if mean F1 < 80%
```

Feedback cases are scored with that case excluded from its own exemplars.
When `baseline.json` exists the summary prints a per-metric delta against it.

Truth labels use the domain vocabulary IDs and count each confidently
identifiable part once. LEGO labels include a color; breadboard and fabric
labels do not require one. Every truth file records the public source URL,
license, and a note for any deliberately omitted or ambiguous objects.
