import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import { Game } from './game/game';
import { Dir } from './config';

const embedded = new URLSearchParams(location.search).has('embed');
let presentationPaused = false;
let demoAutoplay = false;
let nextDemoStep = 1.2;
let cinematicTime = 0;
let victoryTime = 0;
let firstLevelWon = false;
let victoryOrbit: THREE.Spherical | null = null;
const tellParent = (type: string) => {
  if (embedded) window.parent.postMessage({ type }, location.origin);
};
window.addEventListener('error', () => tellParent('frogger-error'));

function failBoot(msg: string) {
  const el = document.getElementById('loading');
  if (el) {
    el.textContent = msg;
    el.style.color = '#ff6b6b';
  }
}

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch {
  failBoot('WEBGL NOT SUPPORTED');
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
const app = document.getElementById('app');
if (app) app.appendChild(renderer.domElement);
else throw new Error('#app missing');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9efdc);
scene.fog = new THREE.Fog(0xe9efdc, 80, 190);

const camera = new THREE.PerspectiveCamera(
  34,
  window.innerWidth / window.innerHeight,
  0.1,
  300
);

const ambient = new THREE.HemisphereLight(0xe9f5ff, 0x9a956d, 1.65);
scene.add(ambient);

const key = new THREE.DirectionalLight(0xfff1d5, 2.15);
key.position.set(-5, 16, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -12;
key.shadow.camera.right = 12;
key.shadow.camera.top = 12;
key.shadow.camera.bottom = -12;
key.shadow.camera.near = 2;
key.shadow.camera.far = 45;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.03;
scene.add(key);
scene.add(key.target);

const fill = new THREE.DirectionalLight(0xc6e9ef, 0.35);
fill.position.set(-8, 6, -10);
scene.add(fill);

const game = new Game(scene, camera);
if (embedded) game.toggleMute();
(window as unknown as { __vf: Game; __cam: THREE.PerspectiveCamera }).__vf = game;
(window as unknown as { __cam: THREE.PerspectiveCamera }).__cam = camera;

const CAM_DIR = new THREE.Vector3(0.32, 0.85, 0.68).normalize();
function fitCamera() {
  const fov = (camera.fov * Math.PI) / 180;
  const aspect = camera.aspect;
  const halfW = 9.3;
  const halfH = 9.4;
  const dW = halfW / (Math.tan(fov / 2) * aspect);
  const dH = halfH / Math.tan(fov / 2);
  const dist = Math.max(dW, dH) * 1.08;
  camera.position.copy(CAM_DIR).multiplyScalar(dist);
  camera.lookAt(0, -0.9, 0);
}
fitCamera();

// Free orbit: drag to rotate the whole map from any angle.
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, -0.9, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.9;
controls.enablePan = false;
controls.minPolarAngle = 0.28;
controls.maxPolarAngle = 1.45; // stay above the horizon
controls.minDistance = 16;
controls.maxDistance = 52;
controls.update();
const openingOrbit = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));

// Rotation is a mouse/trackpad gesture. A single finger on touch is a hop
// (handled below), so keep OrbitControls from grabbing it. Two-finger zoom
// still works because it relies on enableZoom, not enableRotate.
window.addEventListener(
  'pointerdown',
  (e) => {
    if (e.pointerType === 'touch' && e.target === renderer.domElement) controls.enableRotate = false;
  },
  true
);
window.addEventListener(
  'pointerup',
  (e) => {
    if (e.pointerType === 'touch') controls.enableRotate = true;
  },
  true
);

renderer.domElement.style.cursor = 'grab';
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') renderer.domElement.style.cursor = 'grabbing';
});
window.addEventListener('pointerup', () => {
  renderer.domElement.style.cursor = 'grab';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (embedded) { fitCamera(); controls.update(); }
});

/* ------------------------------ input ------------------------------ */

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (embedded && k === 'i' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    tellParent('frogger-skip');
    return;
  }
  if (embedded && k === 'p') {
    e.preventDefault();
    presentationPaused = true;
    tellParent('frogger-finish');
    return;
  }
  if (embedded && (KEY_DIRS[k] || k === ' ' || k === 'Enter')) {
    demoAutoplay = false;
    tellParent('frogger-manual');
  }
  if (k === 'm') {
    game.toggleMute();
    return;
  }
  if (k === 'p') {
    game.togglePause();
    return;
  }
  const dir = KEY_DIRS[k];
  if (dir) {
    e.preventDefault();
    game.onKey(dir);
    return;
  }
  if (k === ' ' || k === 'Enter') {
    e.preventDefault();
    game.primary();
  }
});

// touch: swipe = hop anywhere, tap = primary (start / restart)
let touchStart: { x: number; y: number } | null = null;
window.addEventListener(
  'touchstart',
  (e) => {
    const t = e.target instanceof Element ? e.target.closest('#dpad, #hud-top') : null;
    if (t) return;
    if (e.touches.length > 1) {
      touchStart = null; // two fingers = orbit/zoom, not a hop
      return;
    }
    if (!touchStart) {
      const p = e.changedTouches[0];
      touchStart = { x: p.clientX, y: p.clientY };
    }
  },
  { passive: true }
);

if (embedded) {
  window.addEventListener('pointerdown', () => {
    demoAutoplay = false;
    tellParent('frogger-manual');
  });
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'frogger-demo') return;
    if (event.data.action === 'state') {
      presentationPaused = Boolean(event.data.paused);
      demoAutoplay = Boolean(event.data.autoplay);
      if (event.data.active) game.primary();
    }
    if (event.data.action === 'key' && KEY_DIRS[event.data.key]) {
      demoAutoplay = false;
      game.onKey(KEY_DIRS[event.data.key]);
    }
  });
}
window.addEventListener(
  'touchend',
  (e) => {
    if (!touchStart) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - touchStart.x;
    const dy = p.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
      game.primary();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) game.onKey(dx > 0 ? 'right' : 'left');
    else game.onKey(dy > 0 ? 'down' : 'up');
  },
  { passive: true }
);

// redraw sign textures once the pixel font is actually loaded
const fontsReady = document.fonts?.ready ?? Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]).then(() => {
  game.onFontsReady();
});

/* ------------------------------ loop ------------------------------- */

const clock = new THREE.Clock();
let booted = false;
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  if (presentationPaused) return;
  if (demoAutoplay && !firstLevelWon) {
    cinematicTime += dt;
    nextDemoStep -= dt;
    if (nextDemoStep <= 0) { game.demoStep(); nextDemoStep = 0.32; }
  }
  if (!firstLevelWon) game.update(dt);
  if (demoAutoplay && game.demoStatus.state === 'clearing' && game.demoStatus.level === 1) {
    if (!firstLevelWon) {
      firstLevelWon = true;
      victoryOrbit = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      tellParent('frogger-level-complete');
    }
    victoryTime += dt;
  }
  if (demoAutoplay) {
    const orbit = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if (victoryOrbit) {
      // Settle back into the opening composition during the four-second win hold.
      const progress = Math.min(1, victoryTime / 3.6);
      const ease = progress * progress * (3 - 2 * progress);
      orbit.theta = THREE.MathUtils.lerp(victoryOrbit.theta, openingOrbit.theta, ease);
      orbit.phi = THREE.MathUtils.lerp(victoryOrbit.phi, openingOrbit.phi, ease);
    } else {
      // A slow horizontal orbit plus a visible lower-to-overhead sweep.
      orbit.theta = Math.atan2(CAM_DIR.x, CAM_DIR.z) + .38 * Math.sin(cinematicTime * .065);
      orbit.phi = .73 + .22 * Math.sin(cinematicTime * .24);
    }
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(orbit));
    if (firstLevelWon && victoryTime >= 4) { presentationPaused = true; tellParent('frogger-finish'); }
  }
  controls.update();
  game.updateCloudVisibility();
  renderer.render(scene, camera);
  if (!booted) {
    booted = true;
    const l = document.getElementById('loading');
    if (l) l.remove();
    tellParent('frogger-ready');
  }
});
