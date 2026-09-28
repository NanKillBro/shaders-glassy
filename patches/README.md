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

The CPU fallback sampler requests `colorType: "float16"` for every 2D surface and
`pixelFormat: "rgba-float16"` for readback, verifies both, and rebuilds the entire
chain in byte mode if unsupported. It keeps sRGB, standard tone mapping and
0–1 input values; this is a precision change, not HDR brightness or gamut support.

Steady-size/format typed-array uploads use `texSubImage2D` to reuse texture storage.
Float support is checked when allocating, rather than synchronously querying GL
errors on every frame. Artwork loads invalidate the upload cache; resizing or
switching byte/float formats reallocates and verifies the new format.

CPU video readback converts float16 with a native typed-array copy, avoiding a JS
mapping callback per component. Brightness uses an exact percentile selection
with reusable scratch storage instead of sorting every frame. The selector has
a bounded partition budget and a sorting fallback for pathological ordering.
`tests/videoPerformance.browser.ts` measures a synthetic 1080p source at three
sample resolutions. Its timings cover CPU work and synchronous submission stalls,
not asynchronous GPU completion or displayed frame rate.

`loadTexture(texture, highPrecision)` accepts a texture in the renderer's own
context. The caller retains ownership and must keep it alive until another input
replaces it. Reblurring retains this source; image/data uploads switch back to the
renderer-owned texture. This lets `GpuVideoProcessor` import video directly and
run staged four-tap downsampling in RGBA16F, temporal feedback in RGBA32F, and a
final RGBA16F copy without CPU color arrays. RGBA32F history uses nearest filtering
at matching resolution, so float-linear filtering support is unnecessary. The
precision toggle uses RGBA8 for source/downsampling/output when disabled.

DOM video imports deliberately use `texImage2D` on every new decoded frame,
retaining the texture object. Do not apply the typed-array `texSubImage2D`
optimization here: a live 1080p YouTube Music probe measured roughly 26 ms per
`texSubImage2D` import versus 0.14 ms for `texImage2D` with the same RGBA16F format.
Repeating the comparison on newly decoded frames reproduced the difference.
The original synthetic canvas probe did not expose this video-specific slow path.

GPU processing requires WebGL2 and float render targets; initialization/import
failures fall back to the existing CPU sampler. Browser video import can still
involve internal copies or conversions: this removes application readback, not a
guarantee of zero-copy decoding. Brightness analysis uses a configurable RGBA8
thumbnail, a pixel-pack buffer, and a fence polled without waiting. Only the small
completed thumbnail reaches JS; its percentile is an approximation of the full
color map. Disabling auto-dimming disables analysis. Seek/source changes reset
history and pending analysis, paused frames are cached, and cleanup frees owned
textures, buffers, fences, and callbacks.

`tests/gpuVideo.browser.ts` checks orientation, temporal blending, sub-byte colors,
async-only thumbnail readback, resize, precision changes, reblur, and disposal.
Call `runVideoControlsChecks(true)` for GPU integration or
`runVideoControlsChecks(true, true)` to force the CPU fallback.
`runVideoPerformanceChecks(40, true)` benchmarks synthetic canvas submission;
omit `true` for the CPU path. This is not sufficient to evaluate decoded-video
performance or FPS.

`tests/decodedVideoPerformance.browser.ts` exports
`runDecodedVideoPerformanceChecks(video, mode, iterations, width, height)`.
Pass a playing decoder-backed HTMLVideoElement and `"gpu"`, `"cpu"`, or
`"gpu-sub-upload"` (reproduces the slow import). Temporarily hide the installed
shader container while running this additional renderer, restoring its display
style in a `finally` block. The probe reports main-thread capture/submission time,
GPU timer results where available, rAF intervals, and dropped video frames. It
owns and disposes only its test renderer. A live 1080p comparison at 128×72
measured about 31 ms of main-thread work for the old GPU path and 0.38 ms for
the corrected path. These measurements exclude the later brightness callback;
rAF and GPU times depend on competing page/browser work. The probe canvas is
offscreen, so this is not a measurement of final compositor presentation FPS.
