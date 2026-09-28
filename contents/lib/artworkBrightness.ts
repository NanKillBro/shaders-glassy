import { logger } from "@/shared/utils/logger";

const SAMPLE_SIZE = 32;
const HIGHLIGHT_PERCENTILE = 0.9;
const MAX_TARGET_REDUCTION = 0.8;
let luminanceScratch = new Float32Array(0);

// Select the exact percentile without sorting every pixel. Three-way partitioning
// handles flat video regions cheaply; a bounded work budget prevents quadratic
// behavior on adversarial ordering. The remaining slice is sorted only on bailout.
const selectLuminance = (values: Float32Array, count: number, rank: number): number => {
  let left = 0;
  let right = count - 1;
  let workBudget = count * 8;
  while (left < right) {
    workBudget -= right - left + 1;
    if (workBudget < 0) {
      values.subarray(left, right + 1).sort();
      return values[rank];
    }
    const a = values[left];
    const b = values[(left + right) >>> 1];
    const c = values[right];
    const pivot = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
    let lower = left;
    let upper = right;
    let cursor = left;
    while (cursor <= upper) {
      const value = values[cursor];
      if (value < pivot) {
        values[cursor++] = values[lower];
        values[lower++] = value;
      } else if (value > pivot) {
        values[cursor] = values[upper];
        values[upper--] = value;
      } else {
        cursor++;
      }
    }
    if (rank < lower) right = lower - 1;
    else if (rank > upper) left = upper + 1;
    else return values[rank];
  }
  return values[rank];
};

export const measureHighlightLuminance = (rgbaPixels: Uint8ClampedArray | Float32Array): number => {
  const pixelCount = rgbaPixels.length / 4;
  if (pixelCount === 0) return 0;

  if (luminanceScratch.length < pixelCount) luminanceScratch = new Float32Array(pixelCount);
  const luminances = luminanceScratch;
  const divisor = rgbaPixels instanceof Float32Array ? 1 : 255;
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4;
    luminances[pixel] =
      (0.2126 * rgbaPixels[offset] + 0.7152 * rgbaPixels[offset + 1] + 0.0722 * rgbaPixels[offset + 2]) / divisor;
  }
  return selectLuminance(
    luminances,
    pixelCount,
    Math.min(pixelCount - 1, Math.floor(pixelCount * HIGHLIGHT_PERCENTILE))
  );
};

export const brightnessForHighlight = (highlightLuminance: number, dimStrength: number): number => {
  const targetHighlightLuminance = 1 - MAX_TARGET_REDUCTION * Math.min(1, Math.max(0, dimStrength));
  if (highlightLuminance <= targetHighlightLuminance) return 1;
  return targetHighlightLuminance / highlightLuminance;
};

export const measureArtworkHighlight = async (imageUrl: string): Promise<number | null> => {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      logger.warn("Artwork brightness request failed:", response.status, imageUrl);
      return null;
    }

    const bitmap = await createImageBitmap(await response.blob(), {
      resizeWidth: SAMPLE_SIZE,
      resizeHeight: SAMPLE_SIZE,
      resizeQuality: "high",
    });
    const canvas = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return null;
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const highlightLuminance = measureHighlightLuminance(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
    logger.log("Artwork highlight luminance:", highlightLuminance.toFixed(3));
    return highlightLuminance;
  } catch (error) {
    logger.error("Failed to measure artwork brightness:", error);
    return null;
  }
};
