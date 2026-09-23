import * as THREE from 'three';
import { COLS, ROWS, HOME_ROW, MEDIUM_ROW, WATER_ROWS, ROAD_ROWS, PIT_COLS, TREE_COLS, inRows, colX, rowZ } from '../config';
import { toon } from './materials';
import { makeTree, makeFlower } from './models';

export interface WaterTile {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  baseY: number;
  phase: number;
}
export interface BoardRef {
  group: THREE.Group;
  waterTiles: WaterTile[];
  foamMats: THREE.MeshBasicMaterial[];
  homePads: Map<number, THREE.Mesh>;
}
const WATER_DEEP = 0x167cb9;
const WATER_MID = 0x2196cf;
const WATER_LIGHT = 0x5cd6f2;

function tile(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

/** Playable land tops are at y=0. The frame must never cover the field. */
export function buildBoard(scene: THREE.Scene): BoardRef {
  const group = new THREE.Group();
  scene.add(group);
  const waterTiles: WaterTile[] = [];
  const foamMats: THREE.MeshBasicMaterial[] = [];
  const homePads = new Map<number, THREE.Mesh>();
  const add = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => {
    const mesh = tile(w, h, d, color, x, y, z);
    group.add(mesh);
    return mesh;
  };
  // Layered soil, capped by four narrow grass borders.
  add(14.4, 0.8, 14.4, 0x806247, 0, -0.83, 0).castShadow = true;
  add(14.55, 0.16, 14.55, 0xb5966d, 0, -0.47, 0);
  add(14.4, 0.18, 14.4, 0x476f42, 0, -0.3, 0);
  for (const side of [-1, 1]) {
    add(0.7, 0.22, 14.4, 0x7ca857, side * 6.85, -0.11, 0);
    add(13, 0.22, 0.7, 0x7ca857, 0, -0.11, side * 6.85);
    for (let i = 0; i < 18; i++) add(0.32 + (i % 3) * 0.12, 0.12, 0.025, i % 2 ? 0xa58a63 : 0x68543f, -6.6 + i * 0.76, -0.8 - (i % 3) * 0.1, side * 7.21);
  }
  for (let r = 0; r < ROWS; r++) {
    const z = rowZ(r);
    if (inRows(WATER_ROWS, r)) {
      add(COLS, 0.24, 1, 0x0e5c8f, 0, -0.19, z);
      for (let c = 0; c < COLS; c++) {
        const mat = new THREE.MeshBasicMaterial({ color: WATER_MID });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.002, 0.08, 1.002), mat);
        mesh.position.set(colX(c), -0.1, z);
        group.add(mesh);
        waterTiles.push({ mesh, mat, baseY: -0.1, phase: c * 0.55 + r * 1.8 });
        // Long pixel ripples make the water readable even between platforms.
        for (let k = 0; k < 2; k++) {
          const foam = new THREE.Mesh(new THREE.BoxGeometry(0.14 + ((c + k) % 4) * 0.1, 0.012, 0.035), new THREE.MeshBasicMaterial({ color: k ? 0xa4e7f5 : 0x69cee9, transparent: true, opacity: 0.65 }));
          foam.position.set(-0.26 + k * 0.38, 0.055, -0.31 + ((c * 3 + k) % 5) * 0.14);
          mesh.add(foam);
        }
      }
      continue;
    }
    if (inRows(ROAD_ROWS, r)) {
      const tones = [0x3a444c, 0x363f47, 0x3e4850, 0x333c43];
      for (let c = 0; c < COLS; c++) add(1, 0.2, 1, tones[(c * 5 + r * 7) % 4], colX(c), -0.1, z);
      for (let c = 0; c < COLS; c++) if ((c * 13 + r * 29) % 11 < 3) add(0.7, 0.005, 0.6, 0x2e363d, colX(c) + ((c % 3) - 1) * 0.22, 0.002, z + ((r % 3) - 1) * 0.18);
      for (let c = 0; c < 26; c++) add(0.055, 0.006, 0.035, (c * 7 + r) % 3 ? 0x526065 : 0x2b333a, -6.3 + c * 0.5, 0.004, z + ((c * 7) % 9 - 4) * 0.09);
      if (inRows(ROAD_ROWS, r + 1)) {
        for (let c = 0; c < 13; c++) add(0.52, 0.015, 0.045, 0xe4e3cd, colX(c), 0.014, z + 0.5);
      }
      continue;
    }
    for (let c = 0; c < COLS; c++) add(1, 0.2, 1, (c * 3 + r) % 4 === 0 ? 0x8cb663 : 0x83ae5b, colX(c), -0.1, z);
  }
  // Solid white edge lines where the roadways meet the median.
  for (const edge of [5.5, 6.5]) {
    add(COLS, 0.015, 0.07, 0xf1efe3, 0, 0.014, rowZ(edge) + (edge === 5.5 ? -0.15 : 0.15));
  }
  const manholes: [number, number][] = [[-3.2, 4], [2.4, 8], [-0.6, 10]];
  for (const [mx, mr] of manholes) {
    add(0.36, 0.012, 0.36, 0x242c32, mx, 0.012, rowZ(mr));
    add(0.22, 0.014, 0.22, 0x55616b, mx, 0.015, rowZ(mr));
  }
  // River banks: sand rims, drifting foam lines, stone lip, boulders.
  for (const [b, s] of [[-5.5, 1], [-3.5, -1]] as const) {
    add(COLS, 0.03, 0.2, 0xd6c28c, 0, -0.052, b + s * 0.3);
    const fm = new THREE.MeshBasicMaterial({ color: 0xeaf9ff, transparent: true, opacity: 0.4 });
    const foam = new THREE.Mesh(new THREE.BoxGeometry(COLS, 0.012, 0.05), fm);
    foam.position.set(0, -0.048, b + s * 0.52);
    group.add(foam);
    foamMats.push(fm);
  }
  for (let c = 0; c < COLS; c++) add(0.97, 0.12 + (c % 2) * 0.03, 0.4, [0x98a4ac, 0x89949c, 0xa7b1b8][c % 7 === 3 ? 2 : c % 2], colX(c), 0.01 + (c % 2) * 0.015, -3.16);
  const rockXs = [-5.3, -4.1, -2.7, -1.4, 0.6, 1.9, 3.4, 4.8];
  rockXs.forEach((x, i) => {
    add(0.3 + (i % 3) * 0.14, 0.1 + (i % 2) * 0.06, 0.3, i % 3 ? 0x9aa4ab : 0xb09a76, x, 0.03, -5.72 - (i % 3) * 0.08);
    if (i % 2 === 0) add(0.16, 0.2, 0.16, 0x8d8574, x + 0.22, 0.1, -5.66);
  });
  // Stone curbs and ochre shoulder paint outline both roadways.
  for (const edge of [2.5, 5.5, 6.5, 10.5]) {
    const z = rowZ(edge);
    add(COLS, 0.016, 0.045, 0xeaca75, 0, 0.018, z + (edge === 2.5 || edge === 6.5 ? 0.1 : -0.1));
    for (let c = 0; c < COLS; c++) add(0.97, 0.08, 0.13, c % 2 ? 0xc6cfb9 : 0xd9dfca, colX(c), 0.035, z);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      add(0.22, 0.13 + (i % 2) * 0.08, 0.28, i % 2 ? 0xa3b6a2 : 0xc4ccb0, side * 6.62, 0.04, -5.4 + i * 0.36);
      if (i % 2 === 0) {
        add(0.04, 0.52, 0.04, 0x49744a, side * 6.88, 0.23, -5.3 + i * 0.36);
        add(0.08, 0.16, 0.08, 0x82643e, side * 6.88, 0.51, -5.3 + i * 0.36);
      }
    }
  }
  for (const c of PIT_COLS) {
    add(0.94, 0.025, 0.95, WATER_DEEP, colX(c), 0.016, rowZ(HOME_ROW));
    const pad = add(0.73, 0.065, 0.7, 0xb4d76c, colX(c), 0.06, rowZ(HOME_ROW));
    pad.add(tile(0.5, 0.016, 0.035, 0xd7ed94, 0, 0.04, 0));
    pad.add(tile(0.035, 0.016, 0.48, 0xd7ed94, 0, 0.04, 0));
    homePads.set(c, pad);
  }
  for (const c of TREE_COLS) {
    const tree = makeTree(c % 4 ? 0.65 : 0.85);
    tree.position.set(colX(c), 0, rowZ(HOME_ROW) - 0.14);
    group.add(tree);
  }
  for (const r of [MEDIUM_ROW, 12]) {
    for (let i = 0; i < 15; i++) {
      const x = -6 + i * 0.85;
      const z = rowZ(r) + (i % 2 ? 0.24 : -0.18);
      if (r === 12 && Math.abs(x) < 1.2) continue;
      const flower = makeFlower([0xfff3c4, 0xe9b169, 0xf3e8d4][i % 3]);
      flower.position.set(x, 0, z);
      group.add(flower);
      add(0.04, 0.12, 0.04, 0x547e43, x + 0.17, 0.06, z + 0.08);
    }
  }
  for (const side of [-1, 1]) {
    for (const z of [5.6, 6.45]) {
      const tree = makeTree(z === 5.6 ? 0.8 : 1.15);
      tree.position.set(side * 6.05, 0, z);
      group.add(tree);
    }
    for (const z of [-2.6, -0.4, 1.4, 4.1]) {
      add(0.09, 0.34, 0.09, 0xe6dfc5, side * 6.78, 0.17, z);
      add(0.1, 0.08, 0.1, 0x465f55, side * 6.78, 0.26, z);
    }
  }
  for (let i = 0; i < 3; i++) add(0.55, 0.035, 0.3, 0xcbd4b5, 0, 0.018, 6.5 - i * 0.46);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: 0x44614e, opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.26;
  ground.receiveShadow = true;
  scene.add(ground);
  return { group, waterTiles, foamMats, homePads };
}
export const waterRamp = { a: new THREE.Color(WATER_MID), b: new THREE.Color(WATER_LIGHT) };
export { WATER_DEEP };
