/* Original lightweight sound synthesis via Web Audio API.
   No audio assets were supplied with the packs, so every cue is generated.
   Respects browser autoplay rules: the context resumes on first user gesture. */

type Cue =
  | 'swing'
  | 'hit'
  | 'crit'
  | 'fireball'
  | 'fireImpact'
  | 'frost'
  | 'bolt'
  | 'dodge'
  | 'hurt'
  | 'enemyDeath'
  | 'pickup'
  | 'coin'
  | 'potion'
  | 'levelup'
  | 'bossRoar'
  | 'phase'
  | 'victory'
  | 'death'
  | 'click'
  | 'doorOpen'
  | 'chest'
  | 'shrine'
  | 'summon'
  | 'whirl';

class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicMode: 'explore' | 'boss' | 'menu' = 'menu';
  private volumes = { master: 0.8, music: 0.5, sfx: 0.8 };
  private lastPlay = new Map<string, number>();
  /** Shared white-noise buffer: hit/coin/swing cues fire up to ~25x/sec, and
      generating a fresh AudioBuffer for each one churns memory for nothing. */
  private noiseBuf: AudioBuffer | null = null;

  /** Called from a user gesture (menu click). Safe to call repeatedly. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolumes();
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.volumes = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.musicGain || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.volumes.music * 0.5, t, 0.1);
    this.sfxGain.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  setMusicMode(mode: 'explore' | 'boss' | 'menu'): void {
    this.musicMode = mode;
    this.musicStep = 0;
  }

  /* ------------------------------ music ------------------------------ */
  /* Slow, sparse dark-fantasy arpeggio; boss mode adds a low pulse. */

  private startMusic(): void {
    if (this.musicTimer !== null) return;
    const stepMs = 700;
    this.musicTimer = window.setInterval(() => this.musicTick(), stepMs);
  }

  private musicTick(): void {
    if (!this.ctx || !this.musicGain) return;
    /* background tabs do not need music ticking (and browsers throttle
       intervals there anyway, which would desync the arpeggio) */
    if (typeof document !== 'undefined' && document.hidden) return;
    if (this.ctx.state !== 'running') return;
    if (this.volumes.music <= 0.001 || this.volumes.master <= 0.001) return;
    const t = this.ctx.currentTime;
    const step = this.musicStep++;

    // A minor-ish sparse progression, low register
    const exploreNotes = [110, 130.81, 164.81, 130.81, 98, 116.54, 146.83, 116.54];
    const bossNotes = [82.41, 82.41, 98, 82.41, 87.31, 87.31, 110, 98];
    const menuNotes = [110, 0, 164.81, 0, 130.81, 0, 98, 0];
    const notes = this.musicMode === 'boss' ? bossNotes : this.musicMode === 'menu' ? menuNotes : exploreNotes;
    const freq = notes[step % notes.length];
    if (freq > 0) this.padNote(freq, t, this.musicMode === 'boss' ? 1.3 : 2.4);
    if (this.musicMode === 'boss' && step % 2 === 0) this.pulse(55, t);
    if (this.musicMode === 'explore' && step % 8 === 4) this.pulse(65.41, t);
  }

  private padNote(freq: number, t: number, dur: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'triangle';
    osc2.type = 'sine';
    osc.frequency.value = freq;
    osc2.frequency.value = freq * 2.001;
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.16, t + dur * 0.3);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + dur + 0.05);
    osc2.stop(t + dur + 0.05);
  }

  private pulse(freq: number, t: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.5);
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  /* ------------------------------ sfx helpers ------------------------------ */

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private throttle(key: string, ms: number): boolean {
    const t = performance.now();
    const last = this.lastPlay.get(key) ?? -1e9;
    if (t - last < ms) return false;
    this.lastPlay.set(key, t);
    return true;
  }

  private tone(
    type: OscillatorType,
    freqStart: number,
    freqEnd: number,
    dur: number,
    vol: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.now() + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freqStart), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Lazily build the shared 2-second white-noise buffer. */
  private getNoiseBuffer(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }

  private noise(dur: number, vol: number, filterFreq: number, sweepTo?: number, delay = 0): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.now() + delay;
    const buf = this.getNoiseBuffer();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    /* play a random slice so repeated cues do not sound identical */
    const offset = Math.random() * Math.max(0.001, buf.duration - dur - 0.01);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(filterFreq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(t, offset);
    src.stop(t + dur + 0.02);
  }

  /* ------------------------------ cues ------------------------------ */

  play(cue: Cue): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.volumes.sfx <= 0.001 || this.volumes.master <= 0.001) return;
    switch (cue) {
      case 'swing':
        if (!this.throttle('swing', 60)) return;
        this.noise(0.12, 0.25, 2400, 600);
        this.tone('sawtooth', 320, 140, 0.08, 0.05);
        break;
      case 'hit':
        if (!this.throttle('hit', 40)) return;
        this.noise(0.08, 0.3, 1800, 500);
        this.tone('square', 240, 90, 0.07, 0.12);
        break;
      case 'crit':
        this.noise(0.14, 0.35, 2400, 400);
        this.tone('square', 520, 130, 0.14, 0.16);
        this.tone('square', 700, 160, 0.12, 0.1, 0.03);
        break;
      case 'fireball':
        this.noise(0.35, 0.22, 400, 2200);
        this.tone('sawtooth', 90, 220, 0.3, 0.08);
        break;
      case 'fireImpact':
        this.noise(0.4, 0.4, 900, 120);
        this.tone('sine', 160, 40, 0.35, 0.3);
        break;
      case 'frost':
        this.tone('sine', 900, 1600, 0.35, 0.1);
        this.tone('sine', 1200, 2100, 0.3, 0.08, 0.06);
        this.noise(0.4, 0.12, 3200, 5200);
        break;
      case 'bolt':
        if (!this.throttle('bolt', 70)) return;
        this.tone('square', 760, 320, 0.09, 0.1);
        this.noise(0.06, 0.1, 3000, 1500);
        break;
      case 'whirl':
        this.noise(0.4, 0.28, 1200, 2600);
        this.tone('sawtooth', 140, 320, 0.35, 0.08);
        break;
      case 'dodge':
        this.noise(0.18, 0.2, 1600, 3800);
        break;
      case 'hurt':
        if (!this.throttle('hurt', 150)) return;
        this.tone('square', 180, 70, 0.16, 0.2);
        this.noise(0.12, 0.2, 700, 300);
        break;
      case 'enemyDeath':
        if (!this.throttle('edeath', 80)) return;
        this.tone('sawtooth', 220, 55, 0.3, 0.14);
        this.noise(0.24, 0.18, 800, 200);
        break;
      case 'pickup':
        this.tone('sine', 660, 990, 0.09, 0.14);
        break;
      case 'coin':
        if (!this.throttle('coin', 50)) return;
        this.tone('sine', 1050, 1050, 0.05, 0.12);
        this.tone('sine', 1400, 1400, 0.09, 0.12, 0.05);
        break;
      case 'potion':
        this.tone('sine', 400, 800, 0.18, 0.14);
        this.noise(0.2, 0.06, 2000, 900);
        break;
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.14, i * 0.09));
        break;
      case 'bossRoar':
        this.tone('sawtooth', 65, 38, 1.2, 0.3);
        this.tone('sawtooth', 98, 50, 1.1, 0.18, 0.05);
        this.noise(1.0, 0.2, 300, 90);
        break;
      case 'phase':
        this.tone('sawtooth', 100, 400, 0.9, 0.16);
        this.noise(0.9, 0.2, 500, 3000);
        break;
      case 'victory':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone('triangle', f, f, 0.4, 0.16, i * 0.14));
        break;
      case 'death':
        this.tone('sawtooth', 220, 40, 1.6, 0.24);
        this.tone('sine', 110, 30, 1.8, 0.2);
        break;
      case 'click':
        if (!this.throttle('click', 60)) return;
        this.tone('square', 900, 700, 0.04, 0.08);
        break;
      case 'doorOpen':
        this.tone('square', 120, 60, 0.25, 0.2);
        this.noise(0.3, 0.2, 400, 150);
        break;
      case 'chest':
        [392, 494, 587, 784].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.13, i * 0.07));
        break;
      case 'shrine':
        this.tone('sine', 520, 780, 0.6, 0.12);
        this.tone('sine', 780, 1170, 0.5, 0.08, 0.2);
        break;
      case 'summon':
        this.tone('sawtooth', 300, 80, 0.5, 0.14);
        this.noise(0.4, 0.15, 900, 300);
        break;
    }
  }
}

export const gameAudio = new GameAudio();
