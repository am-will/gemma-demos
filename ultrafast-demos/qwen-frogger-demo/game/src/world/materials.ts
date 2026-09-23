import * as THREE from 'three';

// Shared 4-step gradient map gives every material the same chunky toon banding.
let gradientMap: THREE.DataTexture | null = null;

export function getGradientMap(): THREE.DataTexture {
  if (!gradientMap) {
    const data = new Uint8Array([
      46, 46, 46, 255,
      118, 118, 118, 255,
      190, 190, 190, 255,
      255, 255, 255, 255,
    ]);
    gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.generateMipmaps = false;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: number, opts: Partial<THREE.MeshToonMaterialParameters> = {}): THREE.MeshToonMaterial {
  const key = `${color}_${JSON.stringify(opts)}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap(), ...opts });
    cache.set(key, m);
  }
  return m;
}

/** Log-end ring pattern, drawn once on a tiny canvas. */
let ringTex: THREE.CanvasTexture | null = null;
export function getRingTexture(): THREE.CanvasTexture {
  if (!ringTex) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#d9a05f';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#8f5a28';
    g.lineWidth = 3;
    for (const r of [10, 19, 28]) {
      g.strokeRect(32 - r, 32 - r, r * 2, r * 2);
    }
    g.beginPath();
    g.arc(32, 32, 3, 0, Math.PI * 2);
    g.fillStyle = '#8f5a28';
    g.fill();
    ringTex = new THREE.CanvasTexture(c);
    ringTex.colorSpace = THREE.SRGBColorSpace;
  }
  return ringTex;
}

export interface SignSpec {
  lines: { text: string; size: number; color: string; y: number }[];
  w: number;
  h: number;
  bg: string;
  border: string;
  tex: THREE.CanvasTexture;
}

const registeredSigns: SignSpec[] = [];

/** Redraws every card that has been registered (call after fonts load). */
export function redrawSignTextures() {
  for (const s of registeredSigns) {
    const c = s.tex.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    drawSignCanvas(g, s);
    s.tex.needsUpdate = true;
  }
}

function drawSignCanvas(g: CanvasRenderingContext2D, s: SignSpec) {
  const { lines, w, h, bg, border } = s;
  // card body
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = border;
  g.lineWidth = 10;
  g.strokeRect(10, 10, w - 20, h - 20);
  // inner line
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 3;
  g.strokeRect(24, 24, w - 48, h - 48);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const l of lines) {
    g.font = `${l.size}px "Press Start 2P", monospace`;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillText(l.text, w / 2 + 4, l.y + 5);
    g.fillStyle = l.color;
    g.fillText(l.text, w / 2, l.y);
  }
}

/** Text drawn onto a chunky sign card. */
export function makeSignTexture(
  lines: { text: string; size: number; color: string; y: number }[],
  w = 512,
  h = 256,
  bg = '#241d4e',
  border = '#6fd3ff',
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const spec: SignSpec = { lines, w, h, bg, border, tex: t };
  registeredSigns.push(spec);
  const g = c.getContext('2d')!;
  drawSignCanvas(g, spec);
  t.needsUpdate = true;
  return t;
}
