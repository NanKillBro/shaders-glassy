import { logger } from "@/shared/utils/logger";
import { pageFetch } from "@/shared/utils/pageFetch";

const SAMPLE_SIZE = 32;
const HIGHLIGHT_PERCENTILE = 0.9;
const MAX_TARGET_REDUCTION = 0.8;

export const measureHighlightLuminance = (rgbaPixels: Uint8ClampedArray): number => {
  const pixelCount = rgbaPixels.length / 4;
  if (pixelCount === 0) return 0;

  const luminances = new Float32Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4;
    luminances[pixel] =
      (0.2126 * rgbaPixels[offset] + 0.7152 * rgbaPixels[offset + 1] + 0.0722 * rgbaPixels[offset + 2]) / 255;
  }
  luminances.sort();
  return luminances[Math.min(pixelCount - 1, Math.floor(pixelCount * HIGHLIGHT_PERCENTILE))];
};

export const brightnessForHighlight = (highlightLuminance: number, dimStrength: number): number => {
  const targetHighlightLuminance = 1 - MAX_TARGET_REDUCTION * Math.min(1, Math.max(0, dimStrength));
  if (highlightLuminance <= targetHighlightLuminance) return 1;
  return targetHighlightLuminance / highlightLuminance;
};

export const measureArtworkHighlight = async (imageUrl: string): Promise<number | null> => {
  try {
    const response = await pageFetch(imageUrl);
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
