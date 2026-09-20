# Curated Dropbox seed

This seed is a compact, relevant App Folder fixture for the three construction
domains:

- `Manuals/lego/` contains six small LDraw builds (tower, bench, car body,
  staircase, letter R, and table), each using only the existing ten-part LEGO
  vocabulary.
- `Manuals/breadboard/` contains five Uno circuits covering LEDs, a
  potentiometer, a button, a buzzer, and a photoresistor. Every component is
  from the existing breadboard vocabulary.
- `Manuals/fabric/` contains four projects using the existing fabric classes
  and notions: a tote, pillow cover, bookmark, and pot holder.
- Breadboard has two PDF-only document-ingestion fixtures. Fabric has one
  genuinely on-domain public-domain sewing booklet. LEGO intentionally has no
  PDF fixtures: LEGO instruction PDFs are copyrighted, so this seed does not
  pad the LEGO folder with unrelated documents. PDFs are downloaded at seed
  time from the URLs in `pdf.url`; they are not checked into Git.
- `Photos/<domain>/` lists a small set of existing evaluation images in
  `photos.json`. The uploader copies those files to Dropbox without adding
  duplicate binaries to the repository.

The breadboard PDF fixtures are SparkFun's LilyPad and Squishy Circuits
handouts, both CC BY-SA. The fabric fixture is the 22-page public-domain
*Community sewing in relief programs* booklet from the United States Bureau of
Home Economics. The source URL, license, and attribution are repeated in each
`meta.json`.

From the repository root, with Dropbox credentials in `apps/web/.env.local`:

```bash
pnpm --filter web dropbox:seed --dry-run
pnpm --filter web dropbox:seed
pnpm --filter web dropbox:seed --only manuals
pnpm --filter web dropbox:seed --only pdfs
pnpm --filter web dropbox:seed --only photos
```

The script is idempotent and uses overwrite uploads. It validates ordinary
manuals with the existing loaders and generates runtime thumbnails before
uploading them. PDF-only entries are intentionally left as `source.pdf` plus
metadata so they appear as document-ingestion candidates.
