// Prefetch the local part-classifier weights so the first breadboard scan does not pay the download.
//
//   pnpm --filter web models:warm
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BREADBOARD_PARTS } from "../src/domains/breadboard/vocabulary";
import { PART_CLASSIFIER_CACHE, PART_CLASSIFIER_MODEL, candidatesFor, classifyCrop, loadClassifier } from "../src/lib/part-classifier";

async function main() {
  const t0 = Date.now();
  await loadClassifier();
  console.log(`${PART_CLASSIFIER_MODEL} ready in ${PART_CLASSIFIER_CACHE} (${Date.now() - t0} ms)`);

  const sample = path.resolve(__dirname, "../../../eval/vision/breadboard/arduino-uno/image.jpg");
  const data = new Uint8Array(await readFile(sample));
  const t1 = Date.now();
  const [top] = await classifyCrop({ data, mediaType: "image/jpeg" }, candidatesFor(BREADBOARD_PARTS));
  console.log(`sample crop -> ${top.id} (${top.score.toFixed(2)}) in ${Date.now() - t1} ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
