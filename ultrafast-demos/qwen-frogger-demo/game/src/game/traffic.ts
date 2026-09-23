import * as THREE from 'three';
import { COLS, rowZ } from '../config';
import { makeCar, makeTruck, makeLog, makeTurtle, randomCarColor } from '../world/models';

export type MoverKind = 'log' | 'turtle' | 'car' | 'truck';

export interface Mover {
  group: THREE.Group;
  kind: MoverKind;
  row: number;
  x: number;
  len: number;
  speed: number; // signed cells/second
}

interface LaneSpec {
  row: number;
  kind: MoverKind;
  dir: 1 | -1;
  speed: number; // unsigned, scaled per level
  count: number;
  len: number;
}

interface TrafficScene {
  add(o: THREE.Object3D): this;
}

export class Traffic {
  movers: Mover[] = [];
  private group = new THREE.Group();
  private bankPlanes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), COLS / 2),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), COLS / 2),
  ];

  constructor(scene: TrafficScene) {
    scene.add(this.group);
  }

  /** Rebuilds every lane for the given level. */
  spawn(level: number) {
    this.clear();
    const s = Math.min(2.0, 1 + 0.06 * (level - 1));
    const extra = Math.min(2, Math.floor((level - 1) / 3));

    const lanes: LaneSpec[] = [
      { row: 1, kind: 'log', dir: -1, speed: 0.95 * s, count: 4, len: 3 },
      { row: 2, kind: 'turtle', dir: 1, speed: 0.8 * s, count: 6, len: 1 },
      { row: 3, kind: 'car', dir: -1, speed: 1.5 * s, count: 3, len: 1 },
      { row: 4, kind: 'truck', dir: 1, speed: 1.1 * s, count: 2 + Math.min(1, extra), len: 2 },
      { row: 5, kind: 'car', dir: 1, speed: 1.7 * s, count: 3, len: 1 },
      { row: 7, kind: 'car', dir: -1, speed: 1.4 * s, count: 3, len: 1 },
      { row: 8, kind: 'truck', dir: 1, speed: 1.2 * s, count: 2, len: 2 },
      { row: 9, kind: 'car', dir: -1, speed: 1.6 * s, count: 3, len: 1 },
      { row: 10, kind: 'car', dir: 1, speed: 1.9 * s, count: 3 + extra, len: 1 },
    ];

    for (const lane of lanes) {
      const span = COLS + lane.len + 2; // full wrap length
      const gap = span / lane.count;
      const offset = Math.random() * gap;
      for (let i = 0; i < lane.count; i++) {
        const x = -span / 2 + offset + i * gap;
        const group = this.makeMover(lane.kind, lane.len);
        // Hide the wrapping portion beyond the diorama, including its shadow.
        group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const clip = (source: THREE.Material) => {
            const material = source.clone();
            material.clippingPlanes = this.bankPlanes;
            material.clipShadows = true;
            return material;
          };
          object.material = Array.isArray(object.material) ? object.material.map(clip) : clip(object.material);
        });
        const z = rowZ(lane.row);
        group.position.set(x, 0, z);
        if (lane.kind === 'turtle') {
          group.rotation.y = lane.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
        } else if (lane.kind !== 'log') {
          if (lane.dir === -1) group.rotation.y = Math.PI;
        }
        this.group.add(group);
        this.movers.push({ group, kind: lane.kind, row: lane.row, x, len: lane.len, speed: lane.speed * lane.dir });
      }
    }
  }

  private makeMover(kind: MoverKind, len: number): THREE.Group {
    switch (kind) {
      case 'log':
        return makeLog(len);
      case 'turtle':
        return makeTurtle();
      case 'car':
        return makeCar(randomCarColor());
      case 'truck':
        return makeTruck(randomCarColor());
    }
  }

  clear() {
    for (const m of this.movers) {
      this.group.remove(m.group);
      m.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
    }
    this.movers.length = 0;
  }

  update(dt: number) {
    for (const m of this.movers) {
      m.x += m.speed * dt;
      const span = COLS + m.len + 2;
      const half = span / 2;
      if (m.speed > 0 && m.x > half) m.x -= span;
      else if (m.speed < 0 && m.x < -half) m.x += span;
      m.group.position.x = m.x;
    }
  }

  /** Rideable mover (log/turtle) in `row` whose surface covers world `x`. */
  riderFor(row: number, x: number): Mover | null {
    for (const m of this.movers) {
      if (m.row !== row) continue;
      if (m.kind !== 'log' && m.kind !== 'turtle') continue;
      if (Math.abs(x - m.x) <= m.len / 2 + 0.06) return m;
    }
    return null;
  }

  /** Vehicle overlapping a frog on a road row. */
  hitAt(row: number, x: number): Mover | null {
    for (const m of this.movers) {
      if (m.row !== row) continue;
      if ((m.kind === 'car' || m.kind === 'truck') && Math.abs(x - m.x) < m.len / 2 + 0.3) return m;
    }
    return null;
  }
}
