import * as THREE from 'three';
import {
  COLS,
  ROWS,
  HOME_ROW,
  WATER_ROWS,
  ROAD_ROWS,
  START_ROW,
  START_COL,
  PIT_COLS,
  BOARD_HALF,
  colX,
  rowZ,
  LOG_RIDE_Y,
  TURTLE_RIDE_Y,
  HOP_TIME,
  HOP_HEIGHT,
  BASE_TIME,
  MIN_TIME,
  HOP_YAW,
  DIR_DELTA,
  inRows,
  Dir,
} from '../config';
import { buildBoard, waterRamp, BoardRef } from '../world/board';
import { makeFrog, makeCloud, buildScenery } from '../world/models';
import { redrawSignTextures } from '../world/materials';
import { Traffic } from './traffic';
import { Particles } from './particles';
import { Sfx } from './sfx';
import { Hud } from './hud';

type State = 'ready' | 'playing' | 'paused' | 'clearing' | 'gameover';
type DeathKind = 'water' | 'road' | 'time';

interface Hop {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  toRow: number;
  t: number;
}

interface FrogState {
  group: THREE.Group;
  col: number;
  row: number;
  x: number;
  z: number;
  y: number;
  yTarget: number;
  yaw: number;
  hop: Hop | null;
  dead: boolean;
  deathT: number;
  deathKind: DeathKind | null;
  notCovered: number;
  squashT: number;
  popT: number;
  absorbT: number;
}

interface Pit {
  col: number;
  open: boolean;
}

const SQUASH_TIME = 0.16;
const POP_TIME = 0.3;
const HOME_ABSORB = 0.5;
const START_LIVES = 5;
const BASE_GOAL = 5;
const MAX_GOAL = 6;
const HI_KEY = 'vf-hi';

export class Game {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private board: BoardRef;
  private traffic: Traffic;
  private particles: Particles;
  private sfx: Sfx;
  private hud: Hud;
  private clouds: THREE.Group[] = [];
  private cloudClearance = new THREE.Line3();
  private cloudNearest = new THREE.Vector3();
  private frog: FrogState;
  private pits: Pit[];
  private pitByCol = new Map<number, Pit>();
  private placed = new Set<number>();
  private homeFrogs: THREE.Group[] = [];

  private state: State = 'ready';
  private stateTimer = 0;
  private overlayShown = false;
  private elapsed = 0;

  private score = 0;
  private hi: number;
  private level = 1;
  private lives = START_LIVES;
  private combo = 0;
  private nextLifeAt = 1000;
  private goal = BASE_GOAL;
  private homed = 0;
  private timeLeft = BASE_TIME;
  private timeMax = BASE_TIME;
  private lastTickSec = -1;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    buildScenery(scene);
    this.board = buildBoard(scene);
    this.traffic = new Traffic(scene);
    this.particles = new Particles(scene);
    this.sfx = new Sfx();
    this.hud = new Hud(camera, (d) => this.onKey(d));

    // drifting background clouds
    for (let i = 0; i < 12; i++) {
      const c = makeCloud(i % 3 === 0 ? 0xdfe9ff : 0xf3f6ff);
      c.position.set(-56 + Math.random() * 112, 7 + Math.random() * 13, -64 + Math.random() * 80);
      c.scale.setScalar(0.5 + Math.random() * 1.6);
      c.userData.speed = 0.3 + Math.random() * 0.5;
      scene.add(c);
      c.userData.clearanceRadius = new THREE.Box3().setFromObject(c).getBoundingSphere(new THREE.Sphere()).radius;
      this.clouds.push(c);
    }

    const frogGroup = makeFrog();
    scene.add(frogGroup);
    this.frog = {
      group: frogGroup,
      col: START_COL,
      row: START_ROW,
      x: colX(START_COL),
      z: rowZ(START_ROW),
      y: 0,
      yTarget: 0,
      yaw: 0,
      hop: null,
      dead: false,
      deathT: 0,
      deathKind: null,
      notCovered: 0,
      squashT: 0,
      popT: 0,
      absorbT: 0,
    };

    this.pits = PIT_COLS.map((col) => ({ col, open: true }));
    for (const p of this.pits) this.pitByCol.set(p.col, p);

    this.hi = this.loadHi();
    this.fullReset(false);
  }

  /* ---------------------------------------------------------------- */
  /* Setup                                                             */
  /* ---------------------------------------------------------------- */

  private fullReset(startNow: boolean) {
    this.score = 0;
    this.level = 1;
    this.lives = START_LIVES;
    this.combo = 0;
    this.nextLifeAt = 1000;
    this.overlayShown = false;
    this.loadLevel(this.level);
    this.hud.reset(this.score, this.hi, this.level, this.goal, this.lives);
    this.spawnFrog();
    if (startNow) {
      this.state = 'playing';
      this.hud.hideOverlay();
    } else {
      this.state = 'ready';
      this.hud.showTitle(this.hi, this.goal);
    }
  }

  private loadLevel(level: number) {
    // The opening level has three destinations spread across the board.
    // Later levels retain their randomized destination pads.
    for (const p of this.pits) p.open = level === 1 ? [1, 5, 9].includes(p.col) : Math.random() < 0.7;
    let openCount = this.pits.filter((p) => p.open).length;
    if (openCount < 2) {
      for (const p of this.pits) {
        if (openCount >= 2) break;
        if (!p.open) {
          p.open = true;
          openCount++;
        }
      }
    }
    this.goal = Math.min(MAX_GOAL, BASE_GOAL + Math.floor((level - 1) / 2), openCount);
    for (const pit of this.pits) this.board.homePads.get(pit.col)!.visible = pit.open;
    this.homed = 0;
    this.placed.clear();
    this.combo = 0;
    this.timeMax = Math.max(MIN_TIME, BASE_TIME - (level - 1) * 1.2);
    this.timeLeft = this.timeMax;
    this.lastTickSec = Math.ceil(this.timeLeft);
    this.traffic.spawn(level);
    // clear previous level's home frogs
    for (const hf of this.homeFrogs) {
      this.scene.remove(hf);
      hf.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.homeFrogs.length = 0;
    this.hud.setFrogs(0, this.goal);
  }

  private spawnFrog() {
    const f = this.frog;
    f.dead = false;
    f.deathT = 0;
    f.deathKind = null;
    f.absorbT = 0;
    f.notCovered = 0;
    f.hop = null;
    f.squashT = 0;
    f.popT = POP_TIME;
    f.col = START_COL;
    f.row = START_ROW;
    f.x = colX(START_COL);
    f.z = rowZ(START_ROW);
    f.y = 0;
    f.yTarget = 0;
    f.yaw = 0;
    f.group.visible = true;
    f.group.rotation.set(0, 0, 0);
    f.group.scale.setScalar(1);
    this.sfx.spawn();
    this.applyFrog();
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  onKey(dir: Dir) {
    this.sfx.ensure();
    if (this.state === 'ready') {
      this.state = 'playing';
      this.hud.hideOverlay();
    } else if (this.state === 'gameover' && this.overlayShown) {
      this.fullReset(true);
    }
    if (this.state === 'playing') this.input(dir);
  }

  primary() {
    this.sfx.ensure();
    if (this.state === 'ready') {
      this.state = 'playing';
      this.hud.hideOverlay();
    } else if (this.state === 'gameover' && this.overlayShown) {
      this.fullReset(true);
    }
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.hud.showPaused();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hud.hideOverlay();
    }
  }

  toggleMute() {
    this.sfx.ensure();
    this.hud.setMuted(this.sfx.toggleMute());
  }

  onFontsReady() {
    redrawSignTextures();
  }

  get demoStatus() {
    return { state: this.state, level: this.level, homed: this.homed, goal: this.goal, lives: this.lives, score: this.score };
  }

  /** Predict traffic and search timed hops, then issue only the next ordinary input.
   * Replanning from the live board accounts for frame timing and river drift.
   * Collision, scoring, lives, timers and randomized levels remain unchanged.
   */
  demoStep() {
    if (this.state === 'ready' || this.state === 'gameover') { this.primary(); return; }
    const f = this.frog;
    if (this.state !== 'playing' || f.dead || f.hop || f.popT > 0 || f.absorbT > 0) return;
    const step = .32;
    const lanes = Array.from({ length: ROWS }, (_, row) => this.traffic.movers.filter(m => m.row === row));
    const position = (m: typeof this.traffic.movers[number], time: number) => {
      const span = COLS + m.len + 2;
      return ((m.x + m.speed * time + span / 2) % span + span) % span - span / 2;
    };
    type Node = { row: number; x: number; first: Dir | null };
    let frontier: Node[] = [{ row: f.row, x: f.x, first: null }];
    // Breadth-first arrival times select the nearest reachable unfilled home.
    for (let depth = 0; depth < 42; depth++) {
      const next = new Map<string, Node>();
      const time = depth * step;
      for (const node of frontier) {
        for (const dir of ['up', 'left', 'right', null, 'down'] as (Dir | null)[]) {
          const delta = dir ? DIR_DELTA[dir] : { dc: 0, dr: 0 };
          const row = node.row + delta.dr;
          const col = Math.round(node.x + 6) + delta.dc;
          if (row < 0 || row > START_ROW || col < 0 || col >= COLS) continue;
          let x = dir ? colX(col) : node.x;
          const first = depth === 0 ? dir : node.first;
          if (row === HOME_ROW) {
            if (this.pitByCol.get(col)?.open && !this.placed.has(col)) {
              if (first) this.onKey(first);
              return;
            }
            continue;
          }
          const arrival = dir ? HOP_TIME : 0;
          if (inRows(ROAD_ROWS, row) && lanes[row].some(m =>
            [arrival, (arrival + step) / 2, step + .06].some(t =>
              Math.abs(x - position(m, time + t)) < m.len / 2 + .39))) continue;
          if (inRows(WATER_ROWS, row)) {
            const rider = lanes[row].find(m => Math.abs(x - position(m, time + arrival)) < m.len / 2 - .08);
            if (!rider) continue;
            x += rider.speed * (step - arrival);
            if (Math.abs(x) > 6.15) continue;
          }
          const key = `${row}:${Math.round(x * 8)}`;
          if (!next.has(key)) next.set(key, { row, x, first });
        }
      }
      frontier = [...next.values()];
      if (!frontier.length) break;
    }
  }

  private input(dir: Dir) {
    const f = this.frog;
    if (f.dead || f.absorbT > 0 || f.hop || f.popT > 0) return;

    // re-anchor the frog's grid identity to its (possibly drifted) position
    f.col = Math.max(0, Math.min(COLS - 1, Math.round(f.x + 6)));

    const { dc, dr } = DIR_DELTA[dir];
    const toCol = f.col + dc;
    const toRow = f.row + dr;
    if (toCol < 0 || toCol >= COLS || toRow < 0 || toRow >= ROWS) return;

    // home row: only open, unfilled pits are valid targets
    if (toRow === HOME_ROW) {
      const pit = this.pitByCol.get(toCol);
      if (!pit || !pit.open || this.placed.has(toCol)) return;
    }

    f.hop = {
      fromX: f.x,
      fromZ: f.z,
      toX: colX(toCol),
      toZ: rowZ(toRow),
      toRow,
      t: 0,
    };
    f.col = toCol;
    f.yaw = HOP_YAW[dir];
    f.squashT = SQUASH_TIME;
    this.sfx.jump();
  }

  /* ---------------------------------------------------------------- */
  /* Update                                                            */
  /* ---------------------------------------------------------------- */

  update(dt: number) {
    this.elapsed += dt;
    this.updateClouds(dt);
    this.updateWater();
    this.particles.update(dt);
    if (this.state !== 'paused') this.traffic.update(dt);

    if (this.state === 'ready') {
      const f = this.frog;
      if (f.popT > 0) f.popT = Math.max(0, f.popT - dt);
      f.y = Math.sin(this.elapsed * 3) * 0.04 + 0.04;
      this.applyFrog();
      return;
    }

    if (this.state === 'playing') {
      this.timeLeft -= dt;
      const sec = Math.ceil(Math.max(0, this.timeLeft));
      if (sec !== this.lastTickSec) {
        this.lastTickSec = sec;
        if (sec <= 5 && sec > 0) this.sfx.tick();
      }
      this.hud.setTime(Math.max(0, this.timeLeft / this.timeMax));
      this.updateFrog(dt);
      if (this.timeLeft <= 0 && !this.frog.dead) this.killFrog('time');
      return;
    }

    if (this.state === 'clearing') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.level++;
        this.loadLevel(this.level);
        this.state = 'playing';
        this.hud.setLevel(this.level);
        this.hud.hideOverlay();
      }
      return;
    }

    if (this.state === 'gameover' && !this.overlayShown) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.overlayShown = true;
        this.hud.showGameOver(this.score, this.hi, this.score > 0 && this.score >= this.hi);
      }
    }
  }

  private updateWater() {
    const t = this.elapsed;
    for (const wt of this.board.waterTiles) {
      wt.mesh.position.y = wt.baseY + Math.sin(t * 1.6 + wt.phase) * 0.02;
      wt.mat.color
        .copy(waterRamp.a)
        .lerp(waterRamp.b, 0.5 + 0.5 * Math.sin(t * 1.1 + wt.phase * 1.7));
    }
    this.board.foamMats.forEach((m, i) => {
      m.opacity = 0.26 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.4 + i * 1.9));
    });
  }

  /** Keep a clear corridor around the whole board and the current camera.
   * Run after orbit controls so manual rotation has the same protection.
   */
  updateCloudVisibility() {
    this.cloudClearance.start.copy(this.camera.position);
    this.cloudClearance.end.set(0, 0, 0);
    for (const cloud of this.clouds) {
      this.cloudClearance.closestPointToPoint(cloud.position, true, this.cloudNearest);
      const clearance = 12 + (cloud.userData.clearanceRadius as number);
      cloud.visible = cloud.position.distanceToSquared(this.cloudNearest) > clearance * clearance;
    }
  }

  private updateClouds(dt: number) {
    for (const c of this.clouds) {
      c.position.x += dt * (c.userData.speed as number);
      if (c.position.x > 58) c.position.x = -58;
    }
  }

  private updateFrog(dt: number) {
    const f = this.frog;

    // gliding into a home pit
    if (f.absorbT > 0) {
      f.absorbT -= dt;
      const k = Math.max(0, f.absorbT) / HOME_ABSORB;
      f.y = 0.1 - (1 - k) * 0.5;
      f.group.scale.setScalar(Math.max(0.02, k));
      f.group.position.set(f.x, f.y, f.z);
      if (f.absorbT <= 0) this.onFrogExited(false);
      return;
    }

    if (f.dead) {
      this.updateDeath(dt);
      return;
    }

    if (f.popT > 0) f.popT = Math.max(0, f.popT - dt);

    if (f.hop) {
      const h = f.hop;
      h.t += dt / HOP_TIME;
      const t = Math.min(1, h.t);
      f.x = THREE.MathUtils.lerp(h.fromX, h.toX, t);
      f.z = THREE.MathUtils.lerp(h.fromZ, h.toZ, t);
      f.y = Math.sin(Math.PI * t) * HOP_HEIGHT;
      if (t >= 1) this.onLanded();
    } else {
      if (inRows(WATER_ROWS, f.row)) {
        const m = this.traffic.riderFor(f.row, f.x);
        if (m) {
          f.x += m.speed * dt;
          f.yTarget = m.kind === 'log' ? LOG_RIDE_Y : TURTLE_RIDE_Y;
          f.notCovered = 0;
          if (Math.abs(f.x) > BOARD_HALF + 0.35) this.killFrog('water');
        } else {
          f.notCovered += dt;
          f.yTarget = -0.55;
          if (f.notCovered >= 0.14) this.killFrog('water');
        }
      } else {
        f.notCovered = 0;
        f.yTarget = 0;
        if (inRows(ROAD_ROWS, f.row) && this.traffic.hitAt(f.row, f.x)) {
          this.killFrog('road');
        }
      }
      if (!f.dead) f.y += (f.yTarget - f.y) * Math.min(1, dt * 14);
    }

    if (f.squashT > 0) f.squashT = Math.max(0, f.squashT - dt);

    if (!f.dead) this.applyFrog();
  }

  private updateDeath(dt: number) {
    const f = this.frog;
    f.deathT += dt;
    if (f.deathKind === 'road') {
      const k = Math.min(1, f.deathT / 0.45);
      f.group.scale.set(1 + 0.35 * k, 1 - 0.85 * k, 1 + 0.35 * k);
      f.group.position.set(f.x, -0.08 * k, f.z);
    } else {
      const k = Math.min(1, f.deathT / 1.0);
      f.group.position.set(f.x, f.y - k * 0.9, f.z);
      f.group.rotation.x = -k * 2.4;
    }
    f.group.visible = f.deathT < 1.05;
    const dur = f.deathKind === 'road' ? 0.75 : 1.05;
    if (f.deathT >= dur) this.onFrogExited(true);
  }

  private applyFrog() {
    const f = this.frog;
    f.group.position.set(f.x, f.y, f.z);
    f.group.rotation.y = f.yaw;
    let sx = 1;
    let sy = 1;
    if (f.squashT > 0 && f.hop) {
      const k = f.squashT / SQUASH_TIME;
      sx = 1 + 0.2 * k;
      sy = 1 - 0.3 * k;
    }
    if (f.popT > 0) {
      const k = f.popT / POP_TIME; // 1 -> 0
      const s = 1 - k * k;
      sx *= s;
      sy *= s;
    }
    f.group.scale.set(sx, sy, sx);
  }

  /* ---------------------------------------------------------------- */
  /* Events                                                            */
  /* ---------------------------------------------------------------- */

  private onLanded() {
    const f = this.frog;
    const h = f.hop;
    if (!h) return;
    f.hop = null;
    f.row = h.toRow;
    f.x = h.toX;
    f.z = h.toZ;
    f.y = 0;
    f.yTarget = 0;
    if (h.toRow === HOME_ROW) {
      this.homeFrog();
    }
  }

  private homeFrog() {
    const f = this.frog;
    const col = f.col;
    this.placed.add(col);
    this.homed++;
    this.combo++;
    const pts = 20 + (this.combo - 1) * 10;

    f.absorbT = HOME_ABSORB;
    f.hop = null;
    this.addScore(pts);
    this.sfx.home(this.combo);
    this.hud.setFrogs(this.homed, this.goal);

    // leave a smaller frog sitting in the pit
    const homeFrog = makeFrog();
    homeFrog.position.set(colX(col), 0.1, rowZ(HOME_ROW) + 0.05);
    homeFrog.scale.setScalar(0.82);
    homeFrog.rotation.y = Math.PI + (Math.random() - 0.5) * 0.4;
    this.scene.add(homeFrog);
    this.homeFrogs.push(homeFrog);

    const at = new THREE.Vector3(colX(col), 0.8, rowZ(HOME_ROW));
    this.particles.burst(at, {
      colors: [0xffd43b, 0x5ad64c, 0xffffff, 0x6fd3ff],
      count: 22,
      spread: 1.3,
      up: 3.2,
    });
    this.hud.popup(at.clone().setY(1.3), `+${pts}`, this.combo > 1);
    if (this.combo > 1) this.hud.popup(at.clone().setY(2.0), `COMBO x${this.combo}`);
  }

  private killFrog(kind: DeathKind) {
    const f = this.frog;
    if (f.dead || f.absorbT > 0 || this.state !== 'playing') return;
    f.dead = true;
    f.deathT = 0;
    f.deathKind = kind;
    f.hop = null;
    this.lives--;
    this.combo = 0;
    this.hud.setLives(this.lives);
    const at = new THREE.Vector3(f.x, f.y + 0.35, f.z);
    if (kind === 'water') {
      this.sfx.splash();
      this.particles.burst(at, { colors: [0x74c0fc, 0xcfeeff, 0x2f7fd4], count: 16, up: 3 });
      this.hud.popup(at.clone().setY(1.0), 'SPLASH!');
    } else {
      this.sfx.hit();
      this.particles.burst(at, { colors: [0xff6b6b, 0xffd43b, 0xb197fc], count: 18, up: 2.6 });
      this.hud.popup(at.clone().setY(1.0), 'OUCH!');
    }
  }

  private onFrogExited(died: boolean) {
    if (died && this.lives <= 0) {
      this.state = 'gameover';
      this.stateTimer = 1.3;
      this.overlayShown = false;
      this.sfx.gameOver();
      this.saveHi();
      return;
    }
    if (!died && this.homed >= this.goal) {
      this.state = 'clearing';
      this.stateTimer = 2.2;
      const bonus = 10 * this.level;
      this.addScore(bonus);
      this.sfx.levelUp();
      const nextGoal = Math.min(MAX_GOAL, BASE_GOAL + Math.floor(this.level / 2));
      this.hud.showClear(this.level, bonus, nextGoal);
      return;
    }
    this.spawnFrog();
  }

  /* ---------------------------------------------------------------- */
  /* Scoring                                                           */
  /* ---------------------------------------------------------------- */

  private addScore(n: number) {
    this.score += n;
    this.hud.setScore(this.score);
    if (this.score > this.hi) {
      this.hi = this.score;
      this.hud.setHi(this.hi);
      this.saveHi();
    }
    while (this.score >= this.nextLifeAt) {
      this.lives++;
      this.nextLifeAt += 1000;
      this.sfx.extraLife();
      this.hud.setLives(this.lives);
      this.hud.popup(new THREE.Vector3(0, 3, 0), 'EXTRA LIFE!', true);
    }
  }

  private saveHi() {
    try {
      localStorage.setItem(HI_KEY, String(this.hi));
    } catch {
      /* storage unavailable */
    }
  }

  private loadHi(): number {
    try {
      const v = Number(localStorage.getItem(HI_KEY) ?? '0');
      return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    } catch {
      return 0;
    }
  }
}
