import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const moduleUrl = source => {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
};
const logger = moduleUrl(readFileSync(new URL("../shared/utils/logger.ts", import.meta.url), "utf8"));
const source = readFileSync(new URL("../contents/lib/artworkBrightness.ts", import.meta.url), "utf8")
  .replace("@/shared/utils/logger", logger);
const { measureHighlightLuminance, brightnessForHighlight } = await import(moduleUrl(source));

function sortedReference(data) {
  const divisor = data instanceof Float32Array ? 1 : 255;
  const values = new Float32Array(data.length / 4);
  for (let i = 0; i < values.length; i++) {
    values[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / divisor;
  }
  values.sort();
  return values.length ? values[Math.min(values.length - 1, Math.floor(values.length * 0.9))] : 0;
}

test("percentile selection matches a full sort across gradients, flat frames and repeated colors", () => {
  let seed = 12345;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  // Descending sizes check that a reused scratch buffer does not include stale pixels.
  for (const count of [147456, 4096, 1024, 17, 2, 1, 0]) {
    for (const kind of ["random", "ascending", "descending", "flat", "repeated", "alternating"]) {
      const data = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        const v = kind === "random" ? random() : kind === "ascending" ? i / count :
          kind === "descending" ? 1 - i / count : kind === "flat" ? 0.5 :
          kind === "repeated" ? Math.floor(random() * 4) / 3 : i % 2;
        data.set([v, v / 2, v / 3, 1], i * 4);
      }
      const original = data.slice();
      assert.equal(measureHighlightLuminance(data), sortedReference(data), `${count} ${kind}`);
      assert.deepEqual(data, original, "measurement must not mutate the sampled colors");
      const bytes = Uint8ClampedArray.from(data, value => value * 255);
      assert.equal(measureHighlightLuminance(bytes), sortedReference(bytes));
    }
  }
});

test("normalized float and byte white get identical dimming", () => {
  const float = measureHighlightLuminance(new Float32Array([1, 1, 1, 1]));
  const byte = measureHighlightLuminance(new Uint8ClampedArray([255, 255, 255, 255]));
  assert.equal(float, 1);
  assert.equal(float, byte);
  assert.equal(brightnessForHighlight(float, 0.3), 0.76);
});
