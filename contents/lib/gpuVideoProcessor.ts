import { measureHighlightLuminance } from "./artworkBrightness";
import type { VideoFrameInfo } from "./videoFrameSampler";

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}
interface BrightnessSettings {
  enabled: boolean;
  size: number;
  intervalMs: number;
}
const VERTEX = `#version 300 es
in vec2 position;
out vec2 uv;
void main() { uv = position * 0.5 + 0.5; gl_Position = vec4(position, 0., 1.); }`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform highp sampler2D source;
uniform highp sampler2D history;
uniform vec2 footprint;
uniform float response;
uniform int operation;
in vec2 uv;
out vec4 color;
void main() {
  vec4 current;
  if (operation == 1) {
    vec2 d = footprint * 0.25;
    current = 0.25 * (texture(source, uv + vec2(-d.x, -d.y)) +
      texture(source, uv + vec2(d.x, -d.y)) + texture(source, uv + vec2(-d.x, d.y)) +
      texture(source, uv + vec2(d.x, d.y)));
  } else current = texture(source, uv);
  current = clamp(current, 0., 1.);
  color = operation == 2 && response < 1. ? mix(texture(history, uv), current, response) : current;
}`;

// Owned by one Kawarp canvas/context. Color frames never pass through JS arrays.
// Only an optional small brightness thumbnail is read after a GPU fence signals.
export class GpuVideoProcessor {
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vertices: WebGLBuffer | null = null;
  private source: WebGLTexture | null = null;
  private pack: WebGLBuffer | null = null;
  private uniforms!: Record<"source" | "history" | "footprint" | "response" | "operation", WebGLUniformLocation | null>;
  private stages: Target[] = [];
  private histories: Target[] = [];
  private output: Target | null = null;
  private analysis: Target | null = null;
  private key = "";
  private sourceKey = "";
  private frameId = -1;
  private historyIndex = 0;
  private hasHistory = false;
  private analysisFrame = -1;
  private analysisTime = -Infinity;
  private fence: WebGLSync | null = null;
  private pollId: number | null = null;
  private bytes = new Uint8Array(0);
  private disposed = false;

  constructor(
    private gl: WebGL2RenderingContext,
    private onBrightness: (highlight: number) => void
  ) {
    if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("Float render targets unavailable");
    try {
      const vertex = this.shader(gl.VERTEX_SHADER, VERTEX);
      let fragment: WebGLShader;
      try {
        fragment = this.shader(gl.FRAGMENT_SHADER, FRAGMENT);
      } catch (error) {
        gl.deleteShader(vertex);
        throw error;
      }
      this.program = gl.createProgram();
      if (!this.program) {
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        throw new Error("GPU video program allocation failed");
      }
      gl.attachShader(this.program, vertex);
      gl.attachShader(this.program, fragment);
      gl.linkProgram(this.program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(this.program) ?? "GPU video shader link failed");
      this.uniforms = Object.fromEntries(
        ["source", "history", "footprint", "response", "operation"].map(name => [
          name,
          gl.getUniformLocation(this.program!, name),
        ])
      ) as typeof this.uniforms;
      this.vao = gl.createVertexArray();
      this.vertices = gl.createBuffer();
      this.pack = gl.createBuffer();
      if (!this.vao || !this.vertices || !this.pack) throw new Error("GPU video buffer allocation failed");
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.source = this.texture(gl.LINEAR);
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      this.restoreBindings();
    }
  }

  private shader(type: number, code: string): WebGLShader {
    const gl = this.gl,
      shader = gl.createShader(type);
    if (!shader) throw new Error("GPU video shader allocation failed");
    gl.shaderSource(shader, code);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message ?? "GPU video shader compile failed");
    }
    return shader;
  }
  private texture(filter: number): WebGLTexture {
    const gl = this.gl,
      texture = gl.createTexture();
    if (!texture) throw new Error("GPU video texture allocation failed");
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }
  private target(width: number, height: number, format: number): Target {
    const gl = this.gl;
    const texture = this.texture(format === gl.RGBA32F ? gl.NEAREST : gl.LINEAR);
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      gl.deleteTexture(texture);
      throw new Error("GPU video framebuffer allocation failed");
    }
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      format,
      width,
      height,
      0,
      gl.RGBA,
      format === gl.RGBA8 ? gl.UNSIGNED_BYTE : gl.FLOAT,
      null
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw new Error("GPU video framebuffer format unavailable");
    }
    return { texture, framebuffer, width, height };
  }
  private release(target: Target | null): void {
    if (!target) return;
    this.gl.deleteFramebuffer(target.framebuffer);
    this.gl.deleteTexture(target.texture);
  }
  private clearTargets(): void {
    for (const target of [...this.stages, ...this.histories]) this.release(target);
    this.release(this.output);
    this.output = null;
    this.stages = [];
    this.histories = [];
    this.hasHistory = false;
    this.frameId = -1;
    this.cancelAnalysis();
    this.analysisFrame = -1;
  }
  private restoreBindings(): void {
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }
  private draw(target: Target, source: WebGLTexture, operation = 0, history = source, response = 1): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(this.uniforms.source, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, history);
    gl.uniform1i(this.uniforms.history, 1);
    gl.uniform1i(this.uniforms.operation, operation);
    gl.uniform1f(this.uniforms.response, response);
    gl.uniform2f(this.uniforms.footprint, 1 / target.width, 1 / target.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  process(
    video: HTMLVideoElement,
    info: VideoFrameInfo,
    brightness: BrightnessSettings
  ): { texture: WebGLTexture; highPrecision: boolean; changed: boolean } {
    if (this.disposed || this.gl.isContextLost()) throw new Error("GPU video context unavailable");
    const gl = this.gl,
      settings = info.settings;
    const highPrecision = settings.highPrecision !== false;
    const format = highPrecision ? gl.RGBA16F : gl.RGBA8;
    const key = [
      video.videoWidth,
      video.videoHeight,
      settings.width,
      settings.height,
      highPrecision,
      settings.stagedDownsampling,
      settings.downsampleFactor,
    ].join(":");
    let changed = false;
    try {
      if (key !== this.key) {
        this.clearTargets();
        this.key = "";
        let width = video.videoWidth,
          height = video.videoHeight;
        while (
          settings.stagedDownsampling &&
          (width > settings.width * settings.downsampleFactor || height > settings.height * settings.downsampleFactor)
        ) {
          width = Math.max(settings.width, Math.ceil(width / settings.downsampleFactor));
          height = Math.max(settings.height, Math.ceil(height / settings.downsampleFactor));
          this.stages.push(this.target(width, height, format));
        }
        this.stages.push(this.target(settings.width, settings.height, format));
        // Float32 feedback avoids slowly accumulated rounding in long smoothing.
        this.histories.push(this.target(settings.width, settings.height, gl.RGBA32F));
        this.histories.push(this.target(settings.width, settings.height, gl.RGBA32F));
        this.output = this.target(settings.width, settings.height, format);
        this.key = key;
      }
      if (info.id !== this.frameId) {
        if (info.resetHistory) {
          this.hasHistory = false;
          this.cancelAnalysis();
          this.analysisFrame = -1;
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.source);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        const sourceKey = [video.videoWidth, video.videoHeight, format].join(":");
        const type = highPrecision ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
        // Keep the DOM-video import on Chrome's accelerated texImage2D path.
        // texSubImage2D is useful for typed arrays, but on real decoded video it
        // can take a slow conversion/copy path even at unchanged dimensions.
        gl.texImage2D(gl.TEXTURE_2D, 0, format, gl.RGBA, type, video);
        if (sourceKey !== this.sourceKey) {
          if (gl.getError() !== gl.NO_ERROR) throw new Error("Direct video texture format unavailable");
          this.sourceKey = sourceKey;
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        let source = this.source!;
        for (const target of this.stages) {
          this.draw(target, source, settings.stagedDownsampling ? 1 : 0);
          source = target.texture;
        }
        const nextHistory = 1 - this.historyIndex;
        const amount =
          !this.hasHistory || settings.responseMs <= 0
            ? 1
            : 1 - Math.exp(-Math.max(0, info.elapsedMs) / settings.responseMs);
        this.draw(this.histories[nextHistory], source, 2, this.histories[this.historyIndex].texture, amount);
        this.historyIndex = nextHistory;
        this.hasHistory = true;
        this.draw(this.output!, this.histories[this.historyIndex].texture);
        this.frameId = info.id;
        changed = true;
      }
      this.requestAnalysis(brightness);
      return { texture: this.output!.texture, highPrecision, changed };
    } finally {
      this.restoreBindings();
    }
  }

  private requestAnalysis(settings: BrightnessSettings): void {
    if (!settings.enabled) {
      this.cancelAnalysis();
      return;
    }
    const gl = this.gl;
    const size = Math.max(8, Math.min(64, Math.round(settings.size)));
    if (this.analysis?.width !== size) {
      this.cancelAnalysis();
      this.release(this.analysis);
      this.analysis = null;
      this.analysis = this.target(size, size, gl.RGBA8);
      this.analysisFrame = -1;
      this.bytes = new Uint8Array(size * size * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pack);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.bytes.byteLength, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    }
    if (
      this.fence ||
      this.analysisFrame === this.frameId ||
      performance.now() - this.analysisTime < settings.intervalMs
    )
      return;
    this.draw(this.analysis, this.output!.texture, 1);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pack);
    // Offset overload queues GPU->buffer work. JS only copies the tiny result once ready.
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    if (!this.fence) throw new Error("GPU brightness fence unavailable");
    this.analysisTime = performance.now();
    this.analysisFrame = this.frameId;
    gl.flush();
    this.pollId = requestAnimationFrame(() => this.pollAnalysis());
  }
  private pollAnalysis(): void {
    this.pollId = null;
    if (this.disposed || !this.fence) return;
    const gl = this.gl,
      status = gl.clientWaitSync(this.fence, 0, 0);
    if (status === gl.TIMEOUT_EXPIRED) {
      this.pollId = requestAnimationFrame(() => this.pollAnalysis());
      return;
    }
    gl.deleteSync(this.fence);
    this.fence = null;
    if (status === gl.WAIT_FAILED || gl.isContextLost()) return;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pack);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.bytes);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.onBrightness(measureHighlightLuminance(new Uint8ClampedArray(this.bytes.buffer)));
  }
  private cancelAnalysis(): void {
    if (this.pollId !== null) cancelAnimationFrame(this.pollId);
    this.pollId = null;
    if (this.fence) this.gl.deleteSync(this.fence);
    this.fence = null;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTargets();
    this.release(this.analysis);
    this.analysis = null;
    const gl = this.gl;
    gl.deleteTexture(this.source);
    gl.deleteBuffer(this.pack);
    gl.deleteBuffer(this.vertices);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}
