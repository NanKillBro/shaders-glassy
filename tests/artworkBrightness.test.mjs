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
const pageFetch = moduleUrl(readFileSync(new URL("../shared/utils/pageFetch.ts", import.meta.url), "utf8"));
const source = readFileSync(new URL("../contents/lib/artworkBrightness.ts", import.meta.url), "utf8")
  .replace("@/shared/utils/logger", logger)
  .replace("@/shared/utils/pageFetch", pageFetch);
const { measureHighlightLuminance, brightnessForHighlight } = await import(moduleUrl(source));

const grayPixels = levels => Uint8ClampedArray.from(levels.flatMap(level => [level, level, level, 255]));

test("returns the 90th percentile luminance regardless of pixel order", () => {
  const levels = Array.from({ length: 100 }, (_, index) => index * 2);
  const expected = Math.fround(((0.2126 + 0.7152 + 0.0722) * 180) / 255);
  assert.equal(measureHighlightLuminance(grayPixels(levels)), expected);
  assert.equal(measureHighlightLuminance(grayPixels(levels.reverse())), expected);
});

test("handles empty, single-pixel and flat frames", () => {
  assert.equal(measureHighlightLuminance(new Uint8ClampedArray(0)), 0);
  assert.equal(
    measureHighlightLuminance(grayPixels([255])),
    measureHighlightLuminance(grayPixels(Array(1024).fill(255)))
  );
});

test("does not mutate the sampled pixels", () => {
  const pixels = grayPixels([200, 10, 90, 40]);
  const original = pixels.slice();
  measureHighlightLuminance(pixels);
  assert.deepEqual(pixels, original);
});

test("dims white to the strength target and leaves dark frames alone", () => {
  const white = measureHighlightLuminance(grayPixels([255]));
  assert.ok(Math.abs(white - 1) < 1e-6);
  assert.ok(Math.abs(brightnessForHighlight(white, 0.3) - 0.76) < 1e-6);
  assert.equal(brightnessForHighlight(0.2, 0.3), 1);
});
