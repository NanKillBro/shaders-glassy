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
const source = readFileSync(new URL("../contents/lib/audioBridge.ts", import.meta.url), "utf8").replace(
  "@/shared/utils/logger",
  logger
);
const { audioResultFrom, clampBeatMultipliers } = await import(moduleUrl(source));

globalThis.window = { location: { origin: "https://music.youtube.com" } };
const sameWindowEvent = data => ({ source: window, origin: window.location.origin, data });
const beat = { type: "bls-audio-beat", isBeat: true, speedMultiplier: 4, scaleMultiplier: 1.02 };
const settings = { audioResponsive: true, audioBeatThreshold: 0.75, audioSpeedMultiplier: 4, kawarpAudioScaleBoost: 2 };

test("accepts a complete beat message from the same window", () => {
  assert.deepEqual(audioResultFrom(sameWindowEvent(beat)), beat);
});

test("rejects beat messages with a missing or malformed beat flag", () => {
  const { isBeat, ...withoutFlag } = beat;
  assert.equal(audioResultFrom(sameWindowEvent(withoutFlag)), null);
  assert.equal(audioResultFrom(sameWindowEvent({ ...beat, isBeat: "true" })), null);
  assert.equal(audioResultFrom(sameWindowEvent({ ...beat, speedMultiplier: Number.NaN })), null);
});

test("rejects beat messages from another origin", () => {
  assert.equal(audioResultFrom({ ...sameWindowEvent(beat), origin: "https://example.com" }), null);
});

test("clamps multipliers to the authorized range and gates the beat flag", () => {
  assert.deepEqual(clampBeatMultipliers({ isBeat: true, speedMultiplier: 1e9, scaleMultiplier: 0 }, settings), {
    isBeat: true,
    speedMultiplier: 4,
    scaleMultiplier: 1,
  });
  assert.equal(clampBeatMultipliers(beat, { ...settings, audioResponsive: false }).isBeat, false);
  assert.deepEqual(clampBeatMultipliers(beat, null), { isBeat: false, speedMultiplier: 1, scaleMultiplier: 1 });
});
