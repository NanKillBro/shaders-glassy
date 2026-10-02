import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

async function load(path) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { videoMotion } = await load("../shared/utils/videoSettings.ts");
const { DEFAULT_GRADIENT_SETTINGS } = await load("../shared/constants/gradientSettings.ts");

test("video beats retain independent speed and zoom when artwork boosts are neutral", () => {
  const settings = {
    ...DEFAULT_GRADIENT_SETTINGS,
    // Pinned rather than inherited: this fork ships audio-reactive off by default,
    // and this test is about the beat math, not about what the defaults are.
    audioResponsive: true,
    videoAudioResponsive: true,
    videoAnimationSpeed: 0.5,
    videoBeatSpeedMultiplier: 3,
    videoBeatZoom: 7,
  };
  assert.deepEqual(videoMotion(settings, { isBeat: true, speedMultiplier: 1, scaleMultiplier: 1 }), {
    speed: 1.5,
    scale: 1.07,
  });
  assert.deepEqual(videoMotion(settings, { isBeat: false, speedMultiplier: 4, scaleMultiplier: 1.1 }), {
    speed: 0.5,
    scale: 1,
  });
  for (const disabled of ["audioResponsive", "videoAudioResponsive"]) {
    assert.deepEqual(
      videoMotion({ ...settings, [disabled]: false }, { isBeat: true, speedMultiplier: 4, scaleMultiplier: 1.1 }),
      { speed: 0.5, scale: 1 }
    );
  }
});
