import * as THREE from 'three';
import { Dir, pad5 } from '../config';

/* ------------------------------------------------------------------ */
/* Frog icon (pixel art -> SVG data URL)                               */
/* ------------------------------------------------------------------ */

const FROG_PX = [
  '..GG...GG..',
  '.GwkG.GkwG.',
  'GGGGGGGGGGG',
  'GGbbbbbbbbG',
  '.GbbbbbbbG.',
  '.GG.....GG.',
];

const FROG_COLORS: Record<string, string> = {
  G: '#5ad64c',
  k: '#191d1a',
  b: '#cdf78e',
  w: '#ffffff',
};

export function frogIconUrl(): string {
  let rects = '';
  FROG_PX.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = FROG_COLORS[row[x]];
      if (!col) continue;
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${col}"/>`;
    }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11 6" shape-rendering="crispEdges">${rects}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

export class Hud {
  private camera: THREE.PerspectiveCamera;
  private onDir: (d: Dir) => void;

  private hudEl: HTMLElement;
  private scoreEl: HTMLElement;
  private hiEl: HTMLElement;
  private levelEl: HTMLElement;
  private frogsEl: HTMLElement;
  private livesEl: HTMLElement;
  private timerFill: HTMLElement;
  private floatLayer: HTMLElement;
  private statusEl: HTMLElement;
  private muteBadge: HTMLElement;

  private iconUrl: string;

  constructor(camera: THREE.PerspectiveCamera, onDir: (d: Dir) => void) {
    this.camera = camera;
    this.onDir = onDir;
    this.iconUrl = frogIconUrl();

    this.hudEl = document.createElement('div');
    this.hudEl.id = 'hud';
    this.hudEl.innerHTML = `
      <div id="hud-top">
        <div class="hud-block"><span class="label">SCORE</span><span class="value" id="score">00000</span></div>
        <div class="hud-block"><span class="label">HI-SCORE</span><span class="value" id="hi">00000</span></div>
        <div class="hud-block"><span class="label">LEVEL</span><span class="value" id="level">1</span></div>
        <div class="hud-block block-right">
          <span class="label">HOME&nbsp;&nbsp;<b id="frogs">0/5</b></span>
          <div class="value" id="lives" style="min-height:12px"></div>
        </div>
        <div id="timer-wrap">
          <span class="timer-label">TIME</span>
          <div class="timer-track"><div id="timer-fill"></div></div>
        </div>
      </div>
      <div id="float-layer"></div>
      <div id="hud-bottom">
        <span id="game-status" role="status"></span>
        <span class="hud-hints">ARROWS / WASD HOP &nbsp;·&nbsp; DRAG TO ORBIT &nbsp;·&nbsp; M SOUND${new URLSearchParams(location.search).has('embed') ? '' : ' &nbsp;·&nbsp; P PAUSE'}</span>
      </div>
      <div id="mute-badge">SOUND OFF</div>
      <div id="dpad">
        <button class="up" aria-label="up">&#9650;</button>
        <button class="left" aria-label="left">&#9664;</button>
        <button class="down" aria-label="down">&#9660;</button>
        <button class="right" aria-label="right">&#9654;</button>
      </div>
    `;
    document.body.appendChild(this.hudEl);

    this.scoreEl = this.hudEl.querySelector('#score')!;
    this.hiEl = this.hudEl.querySelector('#hi')!;
    this.levelEl = this.hudEl.querySelector('#level')!;
    this.frogsEl = this.hudEl.querySelector('#frogs')!;
    this.livesEl = this.hudEl.querySelector('#lives')!;
    this.timerFill = this.hudEl.querySelector('#timer-fill')!;
    this.floatLayer = this.hudEl.querySelector('#float-layer')!;
    this.statusEl = this.hudEl.querySelector('#game-status')!;
    this.muteBadge = this.hudEl.querySelector('#mute-badge')!;

    const dpad = this.hudEl.querySelector('#dpad')!;
    const dirs: Array<[string, Dir]> = [
      ['up', 'up'],
      ['left', 'left'],
      ['down', 'down'],
      ['right', 'right'],
    ];
    for (const [cls, d] of dirs) {
      const btn = dpad.querySelector(`.${cls}`) as HTMLButtonElement;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.onDir(d);
      });
    }
  }

  reset(score: number, hi: number, level: number, goal: number, lives: number) {
    this.setScore(score);
    this.setHi(hi);
    this.setLevel(level);
    this.setFrogs(0, goal);
    this.setLives(lives);
    this.setTime(1);
    this.floatLayer.innerHTML = '';
  }

  setScore(n: number) {
    if (this.scoreEl.textContent !== pad5(n)) {
      this.scoreEl.textContent = pad5(n);
      this.bump(this.scoreEl);
    }
  }

  setHi(n: number) {
    if (this.hiEl.textContent !== pad5(n)) {
      this.hiEl.textContent = pad5(n);
      this.bump(this.hiEl);
    }
  }

  private bump(el: HTMLElement) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  setLevel(n: number) {
    this.levelEl.textContent = String(n);
  }

  setFrogs(got: number, goal: number) {
    this.frogsEl.textContent = `${got}/${goal}`;
  }

  setLives(n: number) {
    this.livesEl.innerHTML = '';
    for (let i = 0; i < Math.min(n, 6); i++) {
      const img = document.createElement('img');
      img.className = 'life-icon';
      img.src = this.iconUrl;
      img.alt = 'life';
      this.livesEl.appendChild(img);
    }
    if (n === 0) this.livesEl.innerHTML = '<span style="color:#ff6b6b;font-size:11px">&times;</span>';
  }

  /** frac in 0..1 */
  setTime(frac: number) {
    const f = Math.max(0, Math.min(1, frac));
    this.timerFill.style.width = `${f * 100}%`;
    this.timerFill.style.backgroundColor = f > 0.5 ? '#5ad64c' : f > 0.25 ? '#ffd43b' : '#ff6b6b';
  }

  setMuted(on: boolean) {
    this.muteBadge.classList.toggle('on', on);
  }

  /** Floating score text at a world position. */
  popup(pos: THREE.Vector3, text: string, big = false) {
    const v = pos.clone().project(this.camera);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const el = document.createElement('div');
    el.className = 'pop' + (big ? ' big' : '');
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.floatLayer.appendChild(el);
    setTimeout(() => el.remove(), 1050);
  }

  showTitle(_hi: number, _goal: number) {
    this.hideOverlay();
  }

  showGameOver(_score: number, _hi: number, isRecord: boolean) {
    this.statusEl.textContent = `${isRecord ? 'NEW RECORD · ' : ''}GAME OVER · ENTER / TAP TO RETRY`;
  }

  showClear(level: number, bonus: number, _nextGoal: number) {
    this.statusEl.textContent = `LEVEL ${level} CLEAR · BONUS +${bonus}`;
  }

  showPaused() {
    this.statusEl.textContent = 'PAUSED · P TO RESUME';
  }

  hideOverlay() {
    this.statusEl.textContent = '';
  }
}
