import * as THREE from 'three';
import { toon, getRingTexture, makeSignTexture } from './materials';

/** A box mesh with shadow flags set. */
function box(
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ------------------------------------------------------------------ */
/* Frog                                                                */
/* ------------------------------------------------------------------ */

/** Voxel frog. Modeled facing -Z (the "up" direction on the board). Origin at the feet. */
export function makeFrog(): THREE.Group {
  const g = new THREE.Group();

  const green = 0x8cdb48;
  const darkGreen = 0x4d9b38;
  const belly = 0xe1efa4;

  // body
  g.add(box(0.56, 0.3, 0.54, green, 0, 0.24, 0));
  // back shade
  g.add(box(0.58, 0.14, 0.3, darkGreen, 0, 0.4, -0.16));
  // head
  g.add(box(0.5, 0.24, 0.34, green, 0, 0.42, 0.2));
  // belly
  g.add(box(0.4, 0.1, 0.3, belly, 0, 0.18, 0.32));
  // eyes
  g.add(box(0.16, 0.14, 0.12, 0xfdfdff, -0.17, 0.58, 0.24));
  g.add(box(0.16, 0.14, 0.12, 0xfdfdff, 0.17, 0.58, 0.24));
  // pupils
  g.add(box(0.07, 0.08, 0.04, 0x191d1a, -0.17, 0.57, 0.31));
  g.add(box(0.07, 0.08, 0.04, 0x191d1a, 0.17, 0.57, 0.31));
  // front legs
  g.add(box(0.15, 0.12, 0.28, darkGreen, -0.28, 0.08, 0.22));
  g.add(box(0.15, 0.12, 0.28, darkGreen, 0.28, 0.08, 0.22));
  // back legs
  g.add(box(0.17, 0.13, 0.32, darkGreen, -0.3, 0.08, -0.22));
  g.add(box(0.17, 0.13, 0.32, darkGreen, 0.3, 0.08, -0.22));

  // The original geometry faced +Z, despite the movement contract specifying -Z.
  // Rotate the geometry itself so the group's yaw remains the movement direction.
  for (const part of g.children) {
    part.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    part.rotation.y += Math.PI;
  }
  g.add(box(0.12, 0.035, 0.14, 0xb3ed68, -0.13, 0.48, 0.13));
  g.add(box(0.09, 0.035, 0.1, 0xb3ed68, 0.12, 0.48, 0.18));

  return g;
}

/* ------------------------------------------------------------------ */
/* Vehicles / water objects                                            */
/* ------------------------------------------------------------------ */

const CAR_COLORS = [0xda7155, 0xe8bb58, 0x6fabbf, 0xf3e7cc, 0x779689, 0x63a99c];

export function randomCarColor(): number {
  return CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
}

function wheels(g: THREE.Group, len: number, width: number) {
  const dark = 0x23262e;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.22, 0.23, 0.16, dark, sx * (len / 2 - 0.22), 0.12, sz * (width / 2 - 0.03)));
      g.add(box(0.09, 0.09, 0.018, 0xc5c9bb, sx * (len / 2 - 0.22), 0.12, sz * (width / 2 + 0.057)));
    }
  }
}

/** Small car, ~1 cell long. Origin at road surface, centered on x. Faces +X. */
export function makeCar(color: number): THREE.Group {
  const g = new THREE.Group();
  const len = 0.95;
  const width = 0.72;
  // body
  g.add(box(len, 0.26, width, color, 0, 0.3, 0));
  // cabin
  g.add(box(0.48, 0.22, 0.6, 0x315a68, -0.08, 0.5, 0));
  g.add(box(0.5, 0.065, 0.63, color, -0.08, 0.64, 0));
  g.add(box(0.055, 0.22, 0.615, color, -0.1, 0.5, 0));
  // bumpers
  g.add(box(0.08, 0.14, width, 0x9aa3b2, len / 2 - 0.02, 0.24, 0));
  g.add(box(0.08, 0.14, width, 0x9aa3b2, -len / 2 + 0.02, 0.24, 0));
  // headlights
  g.add(box(0.05, 0.08, 0.12, 0xfff3b0, len / 2 - 0.02, 0.36, 0.2));
  g.add(box(0.05, 0.08, 0.12, 0xfff3b0, len / 2 - 0.02, 0.36, -0.2));
  g.add(box(0.045, 0.08, 0.13, 0xc54735, -len / 2 - 0.01, 0.36, -0.2));
  g.add(box(0.045, 0.08, 0.13, 0xc54735, -len / 2 - 0.01, 0.36, 0.2));
  wheels(g, len, width);
  return g;
}

/** Truck, ~2 cells long. Origin at road surface. Faces +X. */
export function makeTruck(color: number): THREE.Group {
  const g = new THREE.Group();
  // bed
  g.add(box(1.15, 0.58, 0.78, 0xe1dcc8, -0.35, 0.49, 0));
  g.add(box(1.16, 0.12, 0.79, color, -0.35, 0.44, 0));
  // bed rails
  g.add(box(1.19, 0.07, 0.82, 0xeee8d7, -0.35, 0.81, 0));
  // cab
  g.add(box(0.55, 0.52, 0.76, color, 0.68, 0.42, 0));
  g.add(box(0.4, 0.18, 0.77, 0x315a68, 0.7, 0.61, 0));
  g.add(box(0.57, 0.07, 0.79, color, 0.68, 0.74, 0));
  for (const z of [-0.25, 0.25]) g.add(box(0.035, 0.1, 0.12, 0xffecac, 0.966, 0.4, z));
  // bumper
  g.add(box(0.08, 0.16, 0.8, 0x9aa3b2, 0.97, 0.26, 0));
  wheels(g, 1.9, 0.78);
  // extra front wheel
  g.add(box(0.2, 0.18, 0.16, 0x23262e, 0.68, 0.09, 0.32));
  g.add(box(0.2, 0.18, 0.16, 0x23262e, 0.68, 0.09, -0.32));
  return g;
}

/** Voxel log, `len` cells long, lying along X. Origin at its center (y = surface). */
export function makeLog(len: number): THREE.Group {
  const g = new THREE.Group();
  const r = 0.3;
  const cy = LOG_CENTER_Y;

  const body = new THREE.Mesh(new THREE.BoxGeometry(len - 0.12, r * 1.7, r * 1.7), toon(0x8a5a2b));
  body.position.y = cy;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // lighter top band
  const top = new THREE.Mesh(new THREE.BoxGeometry(len - 0.3, 0.06, r * 1.1), toon(0xa5713c));
  top.position.y = cy + r - 0.05;
  top.castShadow = true;
  g.add(top);

  // end caps with ring texture
  const ring = toon(0xffffff, { map: getRingTexture() });
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.07, r * 1.8, r * 1.8), toon(0x6e4520));
    cap.position.set(s * (len / 2 - 0.06), cy, 0);
    cap.castShadow = true;
    g.add(cap);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.6, r * 1.6), ring);
    face.rotation.y = s * (Math.PI / 2);
    face.position.set(s * (len / 2), cy, 0);
    g.add(face);
  }
  for (let i = 0; i < len * 3; i++) {
    g.add(box(0.19, 0.025, 0.09, i % 2 ? 0xb78d4e : 0x674726, -len / 2 + 0.22 + i * 0.31, cy + r * 0.86, i % 2 ? 0.13 : -0.13));
  }
  return g;
}

export const LOG_CENTER_Y = 0.34; // log axis height above water surface

/** Voxel turtle, ~0.7 cell. Origin at water surface. Faces +Z by default. */
export function makeTurtle(): THREE.Group {
  const g = new THREE.Group();
  const shellA = 0x3d7551;
  const shellB = 0x7caa61;
  const skin = 0xa9c777;

  g.add(box(0.52, 0.12, 0.52, shellA, 0, 0.08, 0));
  g.add(box(0.38, 0.14, 0.38, shellB, 0, 0.18, 0));
  g.add(box(0.055, 0.018, 0.36, shellA, 0, 0.26, 0));
  g.add(box(0.36, 0.018, 0.045, shellA, 0, 0.26, 0));
  // head
  g.add(box(0.16, 0.12, 0.15, skin, 0, 0.14, 0.33));
  for (const x of [-0.07, 0.07]) {
    g.add(box(0.05, 0.055, 0.055, 0xf5f2d9, x, 0.2, 0.36));
    g.add(box(0.027, 0.03, 0.018, 0x233f31, x, 0.205, 0.393));
  }
  // legs
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.12, 0.09, 0.13, skin, sx * 0.27, 0.05, sz * 0.27));
    }
  }
  // tail
  g.add(box(0.09, 0.07, 0.1, skin, 0, 0.07, -0.3));
  return g;
}

/* ------------------------------------------------------------------ */
/* Scenery                                                             */
/* ------------------------------------------------------------------ */

/** Voxel tree. Origin at grass surface. */
export function makeTree(scale = 1, leafColor = 0x3f7754): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.24, 0.55, 0.24, 0x7a4a21, 0, 0.28, 0));
  const l1 = leafColor;
  const l2 = 0x599262;
  const l3 = 0x7ca96b;
  g.add(box(0.92, 0.42, 0.92, l1, 0, 0.72, 0, ));
  g.add(box(0.68, 0.38, 0.68, l2, 0, 1.04, 0));
  g.add(box(0.42, 0.34, 0.42, l3, 0, 1.34, 0));
  g.scale.setScalar(scale);
  return g;
}

/** Little decorative voxel flower. Origin at surface. */
export function makeFlower(color: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.05, 0.12, 0.05, 0x3fae35, 0, 0.06, 0));
  g.add(box(0.13, 0.09, 0.13, color, 0, 0.15, 0));
  return g;
}

/** A chunky voxel cloud. */
export function makeCloud(color = 0xf1f4ff): THREE.Group {
  const g = new THREE.Group();
  const b = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color, { emissive: 0x666980, emissiveIntensity: 0.5 }));
    m.position.set(x, y, z);
    g.add(m);
  };
  b(2.4, 0.7, 1.2, 0, 0, 0);
  b(1.4, 0.6, 1.0, -0.8, 0.45, 0.2);
  b(1.2, 0.5, 0.9, 0.7, 0.4, -0.2);
  b(0.9, 0.5, 0.8, 0.1, 0.75, 0.1);
  return g;
}

/* ------------------------------------------------------------------ */
/* Sign cards                                                          */
/* ------------------------------------------------------------------ */

/** Chunky 3D sign card: `w` x `h` face, slab depth 0.3. */
export function makeSignCard(
  w: number,
  h: number,
  lines: { text: string; size: number; color: string; y: number }[],
  bg = '#241d4e',
  border = '#6fd3ff',
): THREE.Group {
  const g = new THREE.Group();
  const tex = makeSignTexture(lines, 512, Math.round((h / w) * 512), bg, border);
  const side = toon(0x1a1538);
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.3),
    [
      side, // +x
      side, // -x
      side, // +y
      side, // -y
      new THREE.MeshToonMaterial({ map: tex }), // +z (front)
      side, // -z
    ],
  );
  face.castShadow = true;
  g.add(face);
  // corner bolts
  const boltMat = toon(0xffd43b);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.36), boltMat);
      bolt.position.set(sx * (w / 2 - 0.3), sy * (h / 2 - 0.3), 0);
      g.add(bolt);
    }
  }
  // posts
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, h * 0.9, 0.22), toon(0x8a5a2b));
    post.position.set(sx * (w / 2 - 0.5), -h / 2 - (h * 0.9) / 2 + 0.2, -0.1);
    post.castShadow = true;
    g.add(post);
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* Scenery (sky, field, hills, groves)                                 */
/* ------------------------------------------------------------------ */

/**
 * Distant world dressing around the board: gradient sky dome, open field,
 * meadow patches, a ring of voxel hills and scattered trees.
 * All placement is deterministic (no Math.random) so the layout is stable.
 */
export function buildScenery(scene: THREE.Scene) {
  // sky dome — vertical gradient, immune to fog, covers every orbit angle
  const cv = document.createElement('canvas');
  cv.width = 2;
  cv.height = 512;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#6fbdea');
  grad.addColorStop(0.42, '#b9dcf1');
  grad.addColorStop(0.62, '#e9efdc');
  grad.addColorStop(1, '#f4efdb');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 512);
  const skyTex = new THREE.CanvasTexture(cv);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(190, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  scene.add(sky);

  // open field
  const field = new THREE.Mesh(new THREE.CircleGeometry(185, 48), toon(0xc6d59f));
  field.rotation.x = -Math.PI / 2;
  field.position.y = -1.42;
  scene.add(field);

  // meadow patches (keep the board's footprint clear)
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + (i % 5) * 0.07;
    const r = 15 + ((i * 29) % 44);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < 13 && Math.abs(z) < 16) continue;
    const p = new THREE.Mesh(new THREE.BoxGeometry(3 + (i % 3) * 2.2, 0.18, 2.4 + (i % 4) * 1.3), toon(i % 2 ? 0xb3c78d : 0xcddc9c));
    p.position.set(x, -1.36, z);
    scene.add(p);
  }

  // scattered trees in the mid ring
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + ((i * 7) % 4) * 0.11;
    const r = 40 + ((i * 13) % 4) * 7;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < 16 && Math.abs(z) < 18) continue;
    const s = 0.7 + ((i * 3) % 4) * 0.3;
    const t = makeTree(s, i % 3 === 0 ? 0x4c7a4a : 0x3f7754);
    t.position.set(x, -1.42, z);
    scene.add(t);
  }

  // distant voxel hill ring
  const tones = [0x94b87c, 0x85ad70, 0xa2c086, 0x8fb57e, 0x9dbc84];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + ((i * 13) % 7) * 0.035;
    const r = 70 + ((i * 17) % 5) * 9;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 2.4 + ((i * 11) % 5) * 1.2;
    const w = 11 + ((i * 7) % 4) * 4;
    const d = 9 + ((i * 5) % 3) * 4;
    const rot = (i % 5) * 0.2;
    const hill = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(tones[i % tones.length]));
    hill.position.set(x, h / 2 - 1.55, z);
    hill.rotation.y = rot;
    scene.add(hill);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.52, h * 0.46, d * 0.52), toon(tones[(i + 2) % tones.length]));
    cap.position.set(x - Math.sin(rot) * 0.8, h - 1.55 + h * 0.2, z + Math.cos(rot) * 0.8);
    cap.rotation.y = rot;
    scene.add(cap);
  }
}
