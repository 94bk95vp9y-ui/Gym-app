// Spielt eine Zeitleiste (Technik oder Kombination) auf einer Figur ab und
// kümmert sich um die Effekte: Leuchtspur von Faust/Fuß, aufleuchtende
// Kraftkette und den Aufprall-Blitz. Die Spur wird aus der Animation selbst
// berechnet (Posen kurz vor jetzt), deshalb stimmt sie auch in Zeitlupe
// und beim Scrubben.
import { solvePose } from '../mobility-figure.js';
import { sampleTimeline, clipDuration } from './anim.js';

const swapSide = (name) => name.replace(/L$/, '§').replace(/R$/, 'L').replace(/§$/, 'R');

function pointOf(j, key) {
  if (key === 'L' || key === 'R') {
    const w = j[`wrist${key}`];
    const e = j[`elbow${key}`];
    const d = [w[0] - e[0], w[1] - e[1], w[2] - e[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return [w[0] + (d[0] / l) * 0.075, w[1] + (d[1] / l) * 0.075, w[2] + (d[2] / l) * 0.075];
  }
  if (key === 'footL' || key === 'footR') {
    const s = key.slice(-1);
    const a = j[`ankle${s}`];
    const k = j[`knee${s}`];
    // Kontaktpunkt Schienbein/Rist: etwas über dem Knöchel
    return [a[0] + (k[0] - a[0]) * 0.18, a[1] + (k[1] - a[1]) * 0.18, a[2] + (k[2] - a[2]) * 0.18];
  }
  if (key === 'kneeL' || key === 'kneeR') return j[key];
  return j.head;
}

export class Performer {
  constructor(stage, figure, { mirror = false, trail = true, chain = true, flash = true, idle = 1, trailColor } = {}) {
    this.stage = stage;
    this.figure = figure;
    this.mirror = mirror;
    this.showTrail = trail;
    this.showChain = chain;
    this.showFlash = flash;
    this.idle = idle;
    this.timeline = { items: [], dur: 2, marks: [] };
    this.trails = [stage.trail(trailColor ?? 0xff4a3a), stage.trail(trailColor ?? 0xffb13a)];
  }

  setTimeline(tl) { this.timeline = tl; }

  poseAt(t) {
    return sampleTimeline(this.timeline, t, { idle: this.idle, mirror: this.mirror });
  }

  update(t) {
    const pose = this.poseAt(t);
    this.figure.apply(pose);
    this.t = t;

    // Aktive Clips mit Effekten
    const glow = {};
    let trailIndex = 0;
    let flashPoint = null;
    let flashAge = -1;
    this.timeline.items.forEach((it) => {
      const clip = it.clip;
      const local = t - it.start;
      const dur = clipDuration(clip);
      if (local < -0.05 || local > dur + 0.35) return;

      if (this.showTrail && clip.trail && trailIndex < this.trails.length && local >= 0 && local <= dur) {
        const key = this.mirror ? swapSide(clip.trail) : clip.trail;
        const win = 0.2;
        const pts = [];
        for (let k = 0; k < 24; k += 1) {
          const tk = t - win + (win * k) / 23;
          if (tk < it.start) continue;
          const j = solvePose(this.poseAt(tk));
          pts.push(this.figure.world(pointOf(j, key)));
        }
        const impact = clip.impact ?? dur * 0.4;
        const strength = local < impact ? Math.min(1, local / Math.max(0.05, impact * 0.6)) : Math.max(0, 1 - (local - impact) / 0.22);
        if (pts.length > 1) this.trails[trailIndex].update(pts, strength);
        trailIndex += 1;
      }

      // Kraftkette als Welle: vom Boden über Hüfte und Rumpf bis zur Faust
      // bzw. zum Schienbein läuft ein Leuchten durch den Körper.
      if (this.showChain && clip.chain) {
        const { from, to, parts } = clip.chain;
        if (local >= from && local <= to + 0.3) {
          const last = parts.length - 1;
          const wave = Math.min(1, (local - from) / Math.max(0.01, to - from)) * last;
          const after = local > to ? 1 - (local - to) / 0.3 : 1;
          parts.forEach((name, i) => {
            let v = Math.max(0, 1 - Math.abs(wave - i) / 1.8);
            if (i === last && local > to) v = after;
            else v *= local > to ? after * 0.6 : 1;
            const n = this.mirror ? swapSide(name) : name;
            glow[n] = Math.max(glow[n] || 0, v);
          });
        }
      }

      if (this.showFlash && clip.impact !== undefined && clip.trail) {
        const age = local - clip.impact;
        if (age >= 0 && age <= 0.32) {
          const key = this.mirror ? swapSide(clip.trail) : clip.trail;
          const j = solvePose(this.poseAt(it.start + clip.impact));
          flashPoint = this.figure.world(pointOf(j, key));
          flashAge = age;
        }
      }
    });
    for (let i = trailIndex; i < this.trails.length; i += 1) this.trails[i].hide();
    this.figure.setGlow(glow);
    this.stage.showFlash(flashPoint, flashAge);
  }

  // Bildausschnitt, in dem die ganze Zeitleiste Platz hat
  frame(pad = 0.12, samples = 16) {
    const pts = [];
    const dur = this.timeline.dur || 1;
    for (let i = 0; i <= samples; i += 1) {
      const j = solvePose(this.poseAt((dur * i) / samples));
      ['head', 'pelvis', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'wristL', 'wristR', 'elbowL', 'elbowR']
        .forEach((k) => pts.push(this.figure.world(j[k])));
    }
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    pts.forEach((p) => { for (let k = 0; k < 3; k += 1) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); } });
    min[1] = Math.min(min[1], 0);
    max[1] += 0.12; // Kopf
    const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const radius = Math.max(0.75, ...pts.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]))) + pad;
    return { center, radius };
  }
}
