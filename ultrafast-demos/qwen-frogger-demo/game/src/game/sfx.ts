/** Tiny WebAudio chip-tune synth. No assets, everything synthesized. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _muted = false;
  private readonly masterVol = 0.3;

  get muted() {
    return this._muted;
  }

  /** Create/resume the AudioContext. Call on a user gesture. */
  ensure() {
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : this.masterVol;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    if (this.master) this.master.gain.value = this._muted ? 0 : this.masterVol;
    return this._muted;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'square',
    vol = 1,
    slideTo?: number,
    delay = 0,
  ) {
    if (!this.ctx || !this.master || this._muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (slideTo != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    }
    g.gain.setValueAtTime(vol * 0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  private noise(dur: number, vol = 1, cutoff = 1200, delay = 0) {
    if (!this.ctx || !this.master || this._muted) return;
    const t0 = this.ctx.currentTime + delay;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * 0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  jump() {
    this.tone(330, 0.09, 'square', 0.35, 580);
  }

  spawn() {
    this.tone(220, 0.08, 'triangle', 0.4, 340);
    this.tone(440, 0.09, 'triangle', 0.3, 660, 0.06);
  }

  splash() {
    this.noise(0.35, 0.6, 1400);
    this.tone(300, 0.28, 'sine', 0.3, 70);
  }

  hit() {
    this.noise(0.22, 0.8, 2400);
    this.tone(160, 0.3, 'sawtooth', 0.5, 45);
  }

  home(combo: number) {
    const n = Math.min(combo, 6);
    for (let i = 0; i < n; i++) {
      this.tone(520 * Math.pow(1.189, i), 0.09, 'square', 0.3, undefined, i * 0.06);
    }
  }

  levelUp() {
    [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.12, 'square', 0.35, undefined, i * 0.1));
  }

  gameOver() {
    [330, 262, 208, 155].forEach((f, i) => this.tone(f, 0.22, 'sawtooth', 0.4, f * 0.9, i * 0.18));
  }

  extraLife() {
    this.tone(660, 0.1, 'square', 0.35);
    this.tone(880, 0.1, 'square', 0.35, undefined, 0.08);
    this.tone(1046, 0.18, 'square', 0.3, 1400, 0.16);
  }

  tick() {
    this.tone(880, 0.05, 'square', 0.2);
  }
}