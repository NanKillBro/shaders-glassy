# Kawarp output and video controls

`@kawarp/core@1.2.2.patch` adds an optional `highPrecision` constructor option and a
`highPrecisionOutput` result flag. pnpm applies this patch during installation;
review it when upgrading Kawarp.

The option requests WebGL2, adapts the existing shaders to GLSL ES 3, retains
float16 intermediate render targets, and requests an RGBA16F drawing buffer when
supported. Unsupported output falls back to RGBA8. This increases precision
within the existing brightness range; it does not enable brighter-than-white
rendering or change the source video's color space.

The extension requests this path on HDR displays and retains configured dithering
by default. Video settings can optionally reduce dithering when high-precision
output succeeds; moving to an SDR display restores normal dithering. The earlier
25% default was too optimistic: drawing-buffer precision does not verify the
browser compositor, OS, or monitor. The high-precision video sampler avoids byte rounding when supported, but this
still cannot establish the precision of final display output.

`tests/rendererPrecision.browser.ts` is a browser regression probe. Bundle it for
the browser and call its exported `runRendererPrecisionChecks()`. It checks a
gradient with dithering disabled, canvas resize, and missing-WebGL2/storage
fallbacks. Its pixel readback measures drawing-buffer precision, not physical
display output.

The patch also allows `blurPasses = 0` through the public setter, bypassing the
Kawase blur passes (the existing tint/copy passes remain). Animation speed accepts
0 through 16 so a zero speed and the maximum configured 2× speed / 8× beat boost
are honored rather than silently clamped to 0.1–5.

`tests/videoControls.browser.ts` checks live video controls with a synthetic
canvas stream: resize/FPS limiting, independent beat motion and artwork settings,
blur bypass readback, paused changes, HDR diagnostics, fallback, and cleanup.
Bundle it and call `runVideoControlsChecks()` on an empty visible page.

`highPrecisionInput` requests WebGL2 source-texture support independently of HDR
output. `loadImageData` accepts normalized `Float32Array` pixels and uploads them
as `RGBA16F` using `FLOAT`, keeping sampling and smoothing results out of an 8-bit
buffer. `highPrecisionSource` reports the result of the last upload. WebGL1 or a
failed float allocation falls back to normalized bytes; failed allocations are
not retried every frame. Byte inputs continue to work, including subarray views.
Shader samplers explicitly use high precision. The renderer regression probe
checks sub-byte source colors, float-to-byte switching, and WebGL1 fallback.

The sampler requests `colorType: "float16"` for every 2D surface and
`pixelFormat: "rgba-float16"` for readback, verifies both, and rebuilds the entire
chain in byte mode if unsupported. It keeps sRGB, standard tone mapping and
0–1 input values; this is a precision change, not HDR brightness or gamut support.

Steady-size/format source uploads use `texSubImage2D` to reuse texture storage.
Float support is checked when allocating, rather than synchronously querying GL
errors on every frame. Artwork loads invalidate the upload cache; resizing or
switching byte/float formats reallocates and verifies the new format.

Video readback converts float16 with a native typed-array copy, avoiding a JS
mapping callback per component. Brightness uses an exact percentile selection
with reusable scratch storage instead of sorting every frame. The selector has
a bounded partition budget and a sorting fallback for pathological ordering.
`tests/videoPerformance.browser.ts` measures a synthetic 1080p source at three
sample resolutions. Its timings cover CPU work and synchronous submission stalls,
not asynchronous GPU completion or displayed frame rate.
