// ── Hardware Detection + Ollama Setup Recommendation ─────────────────────────
// Uses only browser-native APIs — no network calls, no permissions required.
// Limitations:
//   • navigator.deviceMemory is capped at 8 GB (privacy spec); we flag this
//     so users with more RAM know the recommendation may be conservative.
//   • WEBGL_debug_renderer_info can be blocked by strict-privacy browsers.
//   • Apple Silicon unified memory is detected from the WebGL renderer string.

export type DeviceOS = 'windows' | 'mac' | 'linux' | 'unknown';

export interface HardwareProfile {
  os: DeviceOS;
  cpuCores: number;
  /** Approximate RAM in GB — capped at 8 by the browser privacy spec. */
  ramGbApprox: number;
  ramCapped: boolean; // true when reading hit the 8 GB browser cap
  gpuRenderer: string | null;
  gpuVendor: string | null;
  isAppleSilicon: boolean;
  /** Best estimate of memory available for model weights (GB). */
  estimatedAvailableGb: number;
}

export interface ModelRecommendation {
  id: string;
  label: string;
  sizeGb: number;
  quality: 'basic' | 'good' | 'great' | 'excellent';
  reason: string;
}

// ── OS detection ─────────────────────────────────────────────────────────────

function detectOS(): DeviceOS {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win'))   return 'windows';
  if (ua.includes('mac'))   return 'mac';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

// ── GPU detection ─────────────────────────────────────────────────────────────

function detectGPU(): { renderer: string | null; vendor: string | null } {
  try {
    const canvas = document.createElement('canvas');
    const gl = (
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')
    ) as WebGLRenderingContext | null;
    if (!gl) return { renderer: null, vendor: null };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return { renderer: null, vendor: null };
    return {
      renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string,
      vendor:   gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)   as string,
    };
  } catch {
    return { renderer: null, vendor: null };
  }
}

// ── VRAM estimation from GPU name ─────────────────────────────────────────────
// Returns GB of VRAM, 0 for integrated graphics, null for unknown.

function estimateVramGb(renderer: string): number | null {
  const r = renderer.toLowerCase();

  // Apple Silicon — unified memory, handled separately
  if (/apple\s*m\d/i.test(r)) return null;

  // NVIDIA RTX 40-series
  if (/rtx\s*4090/.test(r))                  return 24;
  if (/rtx\s*4080/.test(r))                  return 16;
  if (/rtx\s*4070\s*ti/.test(r))             return 12;
  if (/rtx\s*4070/.test(r))                  return 12;
  if (/rtx\s*4060\s*ti/.test(r))             return 8;
  if (/rtx\s*4060/.test(r))                  return 8;

  // NVIDIA RTX 30-series
  if (/rtx\s*3090/.test(r))                  return 24;
  if (/rtx\s*3080\s*ti/.test(r))             return 12;
  if (/rtx\s*3080/.test(r))                  return 10;
  if (/rtx\s*3070\s*ti/.test(r))             return 8;
  if (/rtx\s*3070/.test(r))                  return 8;
  if (/rtx\s*3060\s*ti/.test(r))             return 8;
  if (/rtx\s*3060/.test(r))                  return 12;

  // NVIDIA RTX 20-series
  if (/rtx\s*2080\s*ti/.test(r))             return 11;
  if (/rtx\s*2080/.test(r))                  return 8;
  if (/rtx\s*2070/.test(r))                  return 8;
  if (/rtx\s*2060/.test(r))                  return 6;

  // NVIDIA GTX
  if (/gtx\s*1080\s*ti/.test(r))             return 11;
  if (/gtx\s*(1080|1070\s*ti)/.test(r))      return 8;
  if (/gtx\s*1070/.test(r))                  return 8;
  if (/gtx\s*1660\s*ti/.test(r))             return 6;
  if (/gtx\s*(1660|1060\s*6)/.test(r))       return 6;
  if (/gtx\s*1060/.test(r))                  return 3;
  if (/gtx\s*1050\s*ti/.test(r))             return 4;
  if (/gtx\s*1050/.test(r))                  return 2;

  // AMD RX 7000-series
  if (/rx\s*7900\s*xtx/.test(r))             return 24;
  if (/rx\s*7900\s*xt/.test(r))              return 20;
  if (/rx\s*7800\s*xt/.test(r))              return 16;
  if (/rx\s*7700\s*xt/.test(r))              return 12;
  if (/rx\s*7600/.test(r))                   return 8;

  // AMD RX 6000-series
  if (/rx\s*6950\s*xt/.test(r))              return 16;
  if (/rx\s*6900\s*xt/.test(r))              return 16;
  if (/rx\s*6800\s*xt/.test(r))              return 16;
  if (/rx\s*6800/.test(r))                   return 16;
  if (/rx\s*6700\s*xt/.test(r))              return 12;
  if (/rx\s*6600\s*xt/.test(r))              return 8;
  if (/rx\s*6600/.test(r))                   return 8;

  // Intel integrated (no dedicated VRAM)
  if (r.includes('intel') && (
    r.includes('iris') || r.includes('uhd') || r.includes('hd graphics') || r.includes('arc')
  )) return 0;

  return null; // unrecognised
}

// ── Main detection ────────────────────────────────────────────────────────────

export function detectHardware(): HardwareProfile {
  const os             = detectOS();
  const cpuCores       = navigator.hardwareConcurrency ?? 4;
  const ramGbApprox    = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const ramCapped      = ramGbApprox >= 8;
  const { renderer, vendor } = detectGPU();

  const isAppleSilicon = renderer !== null && /apple\s*m\d/i.test(renderer);

  let estimatedAvailableGb: number;

  if (isAppleSilicon) {
    // Unified memory: Ollama uses RAM directly. deviceMemory caps at 8 but
    // base M1 is 8 GB and most M2/M3 configs are 16–36 GB. We're conservative.
    estimatedAvailableGb = Math.max(ramGbApprox * 0.75, 5);
  } else if (renderer) {
    const vram = estimateVramGb(renderer);
    if (vram === null) {
      // Unknown GPU — fall back to half of detected RAM
      estimatedAvailableGb = Math.max(ramGbApprox * 0.5, 2);
    } else if (vram === 0) {
      // Integrated — model runs in system RAM
      estimatedAvailableGb = Math.max(ramGbApprox * 0.4, 2);
    } else {
      estimatedAvailableGb = vram;
    }
  } else {
    // No GPU info — CPU-only estimate
    estimatedAvailableGb = Math.max(ramGbApprox * 0.5, 2);
  }

  return {
    os,
    cpuCores,
    ramGbApprox,
    ramCapped,
    gpuRenderer: renderer,
    gpuVendor: vendor,
    isAppleSilicon,
    estimatedAvailableGb,
  };
}

// ── Model catalogue ───────────────────────────────────────────────────────────
// Sizes are approximate 4-bit quantized weights on disk / in VRAM.

interface ModelSpec {
  id: string;
  label: string;
  sizeGb: number;
  minGb: number;
  quality: ModelRecommendation['quality'];
}

const MODEL_CATALOGUE: ModelSpec[] = [
  { id: 'gemma3:1b',   label: 'Gemma 3 1B',   sizeGb: 0.8,  minGb: 1.5, quality: 'basic' },
  { id: 'llama3.2:3b', label: 'Llama 3.2 3B', sizeGb: 2.0,  minGb: 3,   quality: 'good' },
  { id: 'gemma3:4b',   label: 'Gemma 3 4B',   sizeGb: 2.4,  minGb: 3.5, quality: 'good' },
  { id: 'qwen2.5:7b',  label: 'Qwen 2.5 7B',  sizeGb: 4.7,  minGb: 6,   quality: 'great' },
  { id: 'gemma3:9b',   label: 'Gemma 3 9B',   sizeGb: 5.5,  minGb: 7,   quality: 'great' },
  { id: 'phi4',        label: 'Phi-4 14B',     sizeGb: 9.1,  minGb: 10,  quality: 'excellent' },
  { id: 'qwen2.5:14b', label: 'Qwen 2.5 14B', sizeGb: 9.0,  minGb: 10,  quality: 'excellent' },
  { id: 'qwen2.5:32b', label: 'Qwen 2.5 32B', sizeGb: 20.0, minGb: 22,  quality: 'excellent' },
];

const QUALITY_LABEL: Record<ModelRecommendation['quality'], string> = {
  basic:     'Basic',
  good:      'Good',
  great:     'Great',
  excellent: 'Excellent',
};

export function recommendModel(profile: HardwareProfile): ModelRecommendation {
  const fitting = MODEL_CATALOGUE.filter(m => m.minGb <= profile.estimatedAvailableGb);
  const best    = fitting.length > 0 ? fitting[fitting.length - 1] : MODEL_CATALOGUE[0];

  const memSource = profile.isAppleSilicon
    ? `~${profile.estimatedAvailableGb.toFixed(0)} GB unified memory`
    : profile.gpuRenderer
      ? `~${profile.estimatedAvailableGb.toFixed(0)} GB VRAM`
      : `~${profile.estimatedAvailableGb.toFixed(0)} GB RAM`;

  const reason = `${QUALITY_LABEL[best.quality]} quality for prompt rewriting. `
    + `Fits in ${memSource} (${best.sizeGb} GB on disk).`;

  return { id: best.id, label: best.label, sizeGb: best.sizeGb, quality: best.quality, reason };
}

// ── Install script generation ─────────────────────────────────────────────────

export function buildSetupScript(os: DeviceOS, modelId: string): string {
  switch (os) {
    case 'windows':
      return [
        '# Step 1 — install Ollama (run in PowerShell)',
        'winget install Ollama.Ollama',
        '',
        '# Step 2 — open a new terminal, then pull your model',
        `ollama pull ${modelId}`,
      ].join('\n');

    case 'mac':
      return [
        '# Step 1 — install Ollama',
        'brew install ollama',
        '# (or download the macOS app from ollama.com)',
        '',
        '# Step 2 — pull your model',
        `ollama pull ${modelId}`,
      ].join('\n');

    default: // linux + unknown
      return [
        '# Step 1 — install Ollama',
        'curl -fsSL https://ollama.com/install.sh | sh',
        '',
        '# Step 2 — pull your model',
        `ollama pull ${modelId}`,
      ].join('\n');
  }
}
