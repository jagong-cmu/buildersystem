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

Truth labels use the domain vocabulary IDs and count each confidently
identifiable part once. LEGO labels include a color; breadboard and fabric
labels do not require one. Every truth file records the public source URL,
license, and a note for any deliberately omitted or ambiguous objects.
