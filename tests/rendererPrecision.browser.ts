import Kawarp from "@kawarp/core";

// Browser regression probe: bundle as an IIFE and call runRendererPrecisionChecks().
// Readback verifies canvas precision; it cannot measure the monitor's compositor.
export const runRendererPrecisionChecks = () => {
  const run = (highPrecision: boolean, disableStorage = false, disableWebGL2 = false) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 4;
    if (disableStorage) {
      const gl = canvas.getContext("webgl2")!;
      Object.defineProperty(gl, "drawingBufferStorage", { value: undefined });
    }
    if (disableWebGL2) {
      const getContext = canvas.getContext.bind(canvas);
      canvas.getContext = ((type: string, options?: unknown) =>
        type === "webgl2" ? null : getContext(type, options)) as typeof canvas.getContext;
    }
    const renderer = new Kawarp(canvas, {
      highPrecision,
      warpIntensity: 0,
      blurPasses: 1,
      dithering: 0,
      saturation: 1,
      tintIntensity: 0,
    });
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))!;
    let allocations = 0,
      updates = 0,
      errorChecks = 0;
    const texImage = gl.texImage2D;
    const texSubImage = gl.texSubImage2D;
    const getError = gl.getError;
    gl.texImage2D = ((...args: unknown[]) => {
      allocations++;
      return Reflect.apply(texImage, gl, args);
    }) as typeof gl.texImage2D;
    gl.texSubImage2D = ((...args: unknown[]) => {
      updates++;
      return Reflect.apply(texSubImage, gl, args);
    }) as typeof gl.texSubImage2D;
    gl.getError = () => {
      errorChecks++;
      return getError.call(gl);
    };
    try {
      const source = new Uint8ClampedArray(256 * 4);
      for (let x = 0; x < 256; x++) source.set([x, x, x, 255], x * 4);
      renderer.loadImageData(source, 256, 1);
      renderer.renderFrame(0);
      const pixels = renderer.highPrecisionOutput ? new Float32Array(1024 * 4) : new Uint8Array(1024 * 4);
      gl.readPixels(0, 2, 1024, 1, gl.RGBA, renderer.highPrecisionOutput ? gl.FLOAT : gl.UNSIGNED_BYTE, pixels);
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`Renderer GL error: ${error}`);
      const levels = new Set(Array.from(pixels).filter((_, index) => index % 4 === 0)).size;
      const bits = gl.getParameter(gl.RED_BITS) as number;
      canvas.width = 512;
      renderer.renderFrame(0);
      const bitsAfterResize = gl.getParameter(gl.RED_BITS) as number;
      if (gl.getError() !== gl.NO_ERROR) throw new Error("Renderer failed after resize");
      if (levels < 100) throw new Error("Gradient was not rendered");
      if (renderer.highPrecisionOutput && (bits !== 16 || bitsAfterResize !== 16 || levels <= 256)) {
        throw new Error("High precision output lost gradient precision");
      }
      if ((!highPrecision || disableStorage || disableWebGL2) && renderer.highPrecisionOutput) {
        throw new Error("Unsupported output did not fall back");
      }
      renderer.transitionDuration = 0;
      renderer.blurPasses = 0;
      const readCenter = (data: Float32Array | Uint8Array | Uint8ClampedArray) => {
        renderer.loadImageData(data, 1, 1);
        renderer.renderFrame(0);
        const pixel = renderer.highPrecisionOutput ? new Float32Array(4) : new Uint8Array(4);
        gl.readPixels(256, 2, 1, 1, gl.RGBA, renderer.highPrecisionOutput ? gl.FLOAT : gl.UNSIGNED_BYTE, pixel);
        if (gl.getError() !== gl.NO_ERROR) throw new Error("Source upload/readback failed");
        return pixel[0];
      };
      // Both values round to byte 128. They must stay distinguishable in float mode.
      const low = readCenter(new Float32Array([0.5001, 0.5001, 0.5001, 1]));
      const allocationsBefore = allocations,
        updatesBefore = updates,
        checksBefore = errorChecks;
      const high = readCenter(new Float32Array([0.5018, 0.5018, 0.5018, 1]));
      if (allocations !== allocationsBefore || updates !== updatesBefore + 1) {
        throw new Error("Steady video frame reallocated its texture");
      }
      // The single error query is our readback assertion, not the upload path.
      if (errorChecks !== checksBefore + 1) throw new Error("Steady video upload queried GL errors");
      const floatSource = renderer.highPrecisionSource;
      if (renderer.highPrecisionOutput && (!floatSource || high <= low)) {
        throw new Error("Sub-byte source colors were quantized away");
      }
      if (disableWebGL2 && floatSource) throw new Error("WebGL1 did not fall back to bytes");
      const bytes = new Uint8ClampedArray([0, 0, 0, 0, 128, 128, 128, 255]);
      const byteValue = readCenter(bytes.subarray(4));
      if (renderer.highPrecisionSource || byteValue <= 0) throw new Error("Byte subarray upload failed");
      return {
        highPrecision: renderer.highPrecisionOutput,
        bits,
        levels,
        bitsAfterResize,
        floatSource,
        low,
        high,
        byteValue,
        reusedTexture: true,
      };
    } finally {
      renderer.dispose();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
  return {
    standard: run(false),
    highPrecision: run(true),
    missingStorage: run(true, true),
    missingWebGL2: run(true, false, true),
  };
};
