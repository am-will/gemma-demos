import * as THREE from 'three';
import { toon } from '../world/materials';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

export interface BurstOpts {
  colors: number[];
  count?: number;
  spread?: number;
  up?: number;
  life?: number;
  size?: number;
}

const GRAVITY = -9;

/** Simple confetti-like voxel particle system with a shared box geometry. */
export class Particles {
  private group = new THREE.Group();
  private parts: Particle[] = [];
  private geo = new THREE.BoxGeometry(1, 1, 1);

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  burst(origin: THREE.Vector3, opts: BurstOpts) {
    const {
      colors,
      count = 14,
      spread = 1.8,
      up = 2.8,
      life = 0.8,
      size = 0.22,
    } = opts;
    for (let i = 0; i < count; i++) {
      const mat = toon(colors[i % colors.length]);
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.position.copy(origin);
      const s = size * (0.5 + Math.random() * 0.6);
      mesh.scale.setScalar(s);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.group.add(mesh);
      this.parts.push({
        mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 2 * spread,
          up * (0.45 + Math.random() * 0.7),
          (Math.random() - 0.5) * 2 * spread,
        ),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
        ),
        life,
        maxLife: life,
        size: s,
      });
    }
  }

  update(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        this.parts.splice(i, 1);
        continue;
      }
      p.vel.y += GRAVITY * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      // shrink over the last half of life
      const k = p.life < p.maxLife * 0.5 ? p.life / (p.maxLife * 0.5) : 1;
      p.mesh.scale.setScalar(Math.max(0.01, p.size * k));
    }
  }
}