// 3D-Figur für die Mobility-Übungen.
//
// Statt fertiger Modelle wird eine Gliederpuppe aus einfachen Körpern
// gebaut und jede Übung als wenige Schlüsselposen beschrieben. Beschrieben
// werden dabei nicht Gelenkwinkel, sondern Orte: wo steht der Fuß, wohin
// zeigt das Knie, wo liegt die Hand. Knie und Ellbogen rechnet eine
// Zwei-Gelenk-Inverse-Kinematik aus – so bleiben die Knochen bei jeder
// Zwischenposition gleich lang, und die Bewegung wirkt natürlich.
//
// Koordinaten: Meter, y nach oben, die Figur schaut nach +z, ihre linke
// Seite liegt bei +x. Übungen sind für die linke Seite beschrieben, die
// rechte entsteht durch Spiegeln.

import * as THREE from './vendor/three.module.min.js';

// ---------- Vektoren als [x, y, z] ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Körpermaße (ca. 1,80 m)
export const BODY = {
  thigh: 0.44, shin: 0.43, upperArm: 0.3, foreArm: 0.27,
  lowSpine: 0.22, upSpine: 0.28, neck: 0.2, hip: 0.09, shoulder: 0.19, foot: 0.17,
};

// Orthonormale Basis aus "oben" und "vorn": links = oben × vorn.
function basis(up, fwd) {
  const u = norm(up);
  let f = sub(fwd, mul(u, dot(fwd, u)));
  if (len(f) < 1e-4) f = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
  f = norm(f);
  return { u, f, l: cross(u, f) };
}

// Zwei-Gelenk-IK: Wurzel, Ziel, Knochenlängen und ein Punkt, zu dem hin
// sich das mittlere Gelenk (Knie/Ellbogen) beugen soll.
function ik(root, target, l1, l2, pole) {
  const d = sub(target, root);
  const raw = len(d);
  const dir = raw > 1e-6 ? mul(d, 1 / raw) : [0, -1, 0];
  const dist = clamp(raw, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-4);
  const a = Math.acos(clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1));
  let p = sub(pole, root);
  p = sub(p, mul(dir, dot(p, dir)));
  if (len(p) < 1e-5) p = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
  p = norm(p);
  const mid = add(root, add(mul(dir, Math.cos(a) * l1), mul(p, Math.sin(a) * l1)));
  return { mid, end: add(root, mul(dir, dist)) };
}

// Pose -> Gelenkpositionen
export function solvePose(pose) {
  const P = pose.pelvis;
  const pb = basis(pose.pUp || [0, 1, 0], pose.pFwd || [0, 0, 1]);
  const cb = basis(pose.cUp || pb.u, pose.cFwd || pb.f);
  const j = { pelvis: P, pb, cb };
  j.hipL = add(P, add(mul(pb.l, BODY.hip), mul(pb.u, -0.03)));
  j.hipR = add(P, add(mul(pb.l, -BODY.hip), mul(pb.u, -0.03)));
  const lowDir = norm(add(mul(pb.u, 0.6), mul(cb.u, 0.4)));
  j.waist = add(P, mul(lowDir, BODY.lowSpine));
  j.neck = add(j.waist, mul(cb.u, BODY.upSpine));
  j.lowDir = lowDir;
  j.shL = add(j.neck, add(mul(cb.l, BODY.shoulder), mul(cb.u, -0.05)));
  j.shR = add(j.neck, add(mul(cb.l, -BODY.shoulder), mul(cb.u, -0.05)));
  const headUp = pose.hUp ? norm(pose.hUp) : cb.u;
  j.head = add(j.neck, mul(headUp, BODY.neck));
  j.headUp = headUp;
  j.look = basis(headUp, pose.look || cb.f).f;

  ['L', 'R'].forEach((s) => {
    const hip = j[`hip${s}`];
    const sign = s === 'L' ? 1 : -1;
    const kneePole = pose[`knee${s}`] || add(hip, add(mul(pb.f, 0.5), mul(pb.l, sign * 0.05)));
    const leg = ik(hip, pose[`foot${s}`], BODY.thigh, BODY.shin, kneePole);
    j[`knee${s}`] = leg.mid;
    j[`ankle${s}`] = leg.end;
    const toeTarget = pose[`toe${s}`] || add(leg.end, [0, -0.05, BODY.foot]);
    j[`footDir${s}`] = norm(sub(toeTarget, leg.end));

    const sh = j[`sh${s}`];
    const elbowPole = pose[`elbow${s}`] || add(sh, add(mul(cb.f, -0.3), mul(cb.u, -0.3)));
    const hand = pose[`hand${s}`] || add(sh, [sign * 0.05, -0.6, 0]);
    const arm = ik(sh, hand, BODY.upperArm, BODY.foreArm, elbowPole);
    j[`elbow${s}`] = arm.mid;
    j[`wrist${s}`] = arm.end;
  });
  return j;
}

// ---------- Posen mischen, spiegeln, abtasten ----------
const POSE_KEYS = [
  'pelvis', 'pUp', 'pFwd', 'cUp', 'cFwd', 'hUp', 'look',
  'footL', 'footR', 'kneeL', 'kneeR', 'toeL', 'toeR',
  'handL', 'handR', 'elbowL', 'elbowR',
];

function mixPose(a, b, t) {
  const out = {};
  POSE_KEYS.forEach((k) => {
    if (a[k] && b[k]) out[k] = mix(a[k], b[k], t);
    else if (a[k] || b[k]) out[k] = a[k] || b[k];
  });
  return out;
}

// Catmull-Rom über vier Posen – für fließende Kreise statt Ecken.
function splinePose(p0, p1, p2, p3, t) {
  const out = {};
  const t2 = t * t;
  const t3 = t2 * t;
  POSE_KEYS.forEach((k) => {
    if (!p1[k] || !p2[k]) { if (p1[k] || p2[k]) out[k] = p1[k] || p2[k]; return; }
    const a = p0[k] || p1[k];
    const d = p3[k] || p2[k];
    out[k] = [0, 1, 2].map((i) => 0.5 * ((2 * p1[k][i]) + (-a[i] + p2[k][i]) * t
      + (2 * a[i] - 5 * p1[k][i] + 4 * p2[k][i] - d[i]) * t2
      + (-a[i] + 3 * p1[k][i] - 3 * p2[k][i] + d[i]) * t3));
  });
  return out;
}

export function mirrorPose(p) {
  const m = (v) => v && [-v[0], v[1], v[2]];
  const out = {};
  POSE_KEYS.forEach((k) => {
    if (!p[k]) return;
    const swapped = k.endsWith('L') ? `${k.slice(0, -1)}R` : k.endsWith('R') ? `${k.slice(0, -1)}L` : k;
    out[swapped] = m(p[k]);
  });
  return out;
}

const easeInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

function framesOf(ex) {
  if (!ex._frames) {
    const list = (ex.frames && ex.frames.length ? ex.frames : [{ t: 0 }])
      .map((f) => ({ t: f.t, p: { ...ex.base, ...f.p } }));
    const loop = ex.loop || 1;
    if (list.length > 1 && list[list.length - 1].t < loop) list.push({ t: loop, p: list[0].p });
    ex._frames = list;
  }
  return ex._frames;
}

// Pose einer Übung zu einem Zeitpunkt (Sekunden, läuft in Schleife).
export function sampleExercise(ex, time, side = 'L') {
  const frames = framesOf(ex);
  let pose;
  if (frames.length === 1) {
    pose = frames[0].p;
  } else {
    const loop = frames[frames.length - 1].t;
    const tt = ((time % loop) + loop) % loop;
    let i = 0;
    while (i < frames.length - 2 && tt >= frames[i + 1].t) i += 1;
    const a = frames[i];
    const b = frames[i + 1];
    const u = clamp((tt - a.t) / ((b.t - a.t) || 1), 0, 1);
    if (ex.smooth) {
      const n = frames.length - 1; // letzter Eintrag ist die Wiederholung des ersten
      const at = (k) => frames[((k % n) + n) % n].p;
      pose = splinePose(at(i - 1), at(i), at(i + 1), at(i + 2), u);
    } else {
      pose = mixPose(a.p, b.p, easeInOut(u));
    }
  }
  return side === 'R' ? mirrorPose(pose) : pose;
}

// ---------- Darstellung ----------
const Y = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function cssColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export class FigureStage {
  constructor({ thumb = false } = {}) {
    this.thumb = thumb;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: thumb });
    renderer.setPixelRatio(thumb ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.canvas.className = 'mob-canvas';

    const scene = new THREE.Scene();
    this.scene = scene;
    // Enger Blickwinkel, dafür weiter weg: weniger perspektivische Verzerrung
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.05, 60);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8580, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.castShadow = true;
    key.shadow.mapSize.set(thumb ? 512 : 1024, thumb ? 512 : 1024);
    key.shadow.camera.left = -1.6;
    key.shadow.camera.right = 1.6;
    key.shadow.camera.top = 1.6;
    key.shadow.camera.bottom = -1.6;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 5;
    scene.add(key);
    scene.add(key.target);
    this.key = key;
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55);
    fill.position.set(-3, 2, -2.5);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(0, 3, -4);
    scene.add(rim);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.2 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    this.matMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    const mat = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedRect(0.64, 1.9, 0.05), { depth: 0.012, bevelEnabled: false }),
      this.matMaterial,
    );
    mat.rotation.x = -Math.PI / 2;
    mat.receiveShadow = true;
    this.mat = mat;
    scene.add(mat);

    this.wallMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    this.walls = [];

    this.bodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0.02 });
    this.hiMaterial = new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0.02, emissiveIntensity: 0.22 });
    this.strapMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    this.buildBody();

    this.az = 0;
    this.el = 15;
    this.swayBase = 0;
    this.dragging = false;
    this.lastInteraction = 0;
    this.running = false;
    this.clock = null; // optional: externe Zeitquelle (Player)
    this.startedAt = performance.now();
    this.applyTheme();
  }

  buildBody() {
    const group = new THREE.Group();
    this.scene.add(group);
    this.body = group;
    const parts = {};
    const mesh = (geo, name) => {
      const m = new THREE.Mesh(geo, this.bodyMaterial);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = name;
      group.add(m);
      parts[name] = m;
      return m;
    };
    const limb = (name, r1, r2, length) => mesh(new THREE.CylinderGeometry(r1, r2, length, 22, 1, true), name);
    const ball = (name, r) => mesh(new THREE.SphereGeometry(r, 22, 16), name);
    const blob = (name) => mesh(new THREE.SphereGeometry(1, 30, 22), name);

    ['L', 'R'].forEach((s) => {
      limb(`thigh${s}`, 0.082, 0.058, BODY.thigh);
      limb(`shin${s}`, 0.056, 0.04, BODY.shin);
      limb(`upperArm${s}`, 0.05, 0.04, BODY.upperArm);
      limb(`foreArm${s}`, 0.039, 0.031, BODY.foreArm);
      ball(`knee${s}`, 0.058);
      ball(`ankle${s}`, 0.041);
      ball(`elbow${s}`, 0.041);
      ball(`wrist${s}`, 0.031);
      ball(`shoulder${s}`, 0.058);
      ball(`hipBall${s}`, 0.08);
      mesh(new THREE.CapsuleGeometry(0.036, 0.15, 6, 14), `foot${s}`);
      blob(`hand${s}`);
    });
    blob('pelvis');
    blob('abdomen');
    blob('chest');
    limb('neckSeg', 0.045, 0.05, 0.14);
    ball('head', 0.105);
    const nose = ball('nose', 0.024);
    nose.castShadow = false;
    this.parts = parts;

    this.straps = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 8), this.strapMaterial);
      m.castShadow = true;
      m.visible = false;
      this.scene.add(m);
      return m;
    });
  }

  applyTheme() {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const accent = new THREE.Color(cssColor('--accent', '#ff5a36'));
    this.bodyMaterial.color.set(dark ? 0xd2ccc5 : 0xebe6e0);
    this.hiMaterial.color.copy(accent);
    this.hiMaterial.emissive.copy(accent);
    this.strapMaterial.color.copy(accent).multiplyScalar(0.55);
    this.matMaterial.color.copy(accent).lerp(new THREE.Color(dark ? 0x2a2a2d : 0xffffff), dark ? 0.9 : 0.8);
    this.wallMaterial.color.set(dark ? 0x3a3a3e : 0xf1efec);
    // Die Wand steht meist abgewandt vom Hauptlicht – etwas Eigenleuchten,
    // damit sie nicht wie ein dunkler Block wirkt.
    this.wallMaterial.emissive.set(dark ? 0x1e1e21 : 0x9a9894);
  }

  // Übung einrichten: Hervorhebung, Requisiten, Bildausschnitt.
  setExercise(ex, side = 'L') {
    this.ex = ex;
    this.side = side;
    const hi = new Set((ex.highlight || []).map((n) => (side === 'R'
      ? n.replace(/L$/, '§').replace(/R$/, 'L').replace(/§$/, 'R') : n)));
    Object.entries(this.parts).forEach(([name, m]) => {
      m.material = hi.has(name) ? this.hiMaterial : this.bodyMaterial;
    });

    this.walls.forEach((w) => this.scene.remove(w));
    this.walls = (ex.props || []).filter((p) => p.type === 'wall').map((p) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.3), this.wallMaterial);
      w.receiveShadow = true;
      if (p.z !== undefined) { w.position.set(0, 1.15, p.z); w.rotation.y = Math.PI; }
      if (p.x !== undefined) {
        const x = side === 'R' ? -p.x : p.x;
        w.position.set(x, 1.15, 0);
        w.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      this.scene.add(w);
      return w;
    });
    this.strapDefs = (ex.props || []).filter((p) => p.type === 'strap');
    this.straps.forEach((s, i) => { s.visible = !!this.strapDefs[i]; });

    // Bildausschnitt aus allen Posen der Schleife
    const pts = [];
    const loop = framesOf(ex)[framesOf(ex).length - 1].t || 1;
    for (let i = 0; i < 10; i += 1) {
      const j = solvePose(sampleExercise(ex, (loop * i) / 10, side));
      ['head', 'neck', 'pelvis', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'wristL', 'wristR', 'elbowL', 'elbowR', 'shL', 'shR']
        .forEach((k) => pts.push(j[k]));
      pts.push(add(j.ankleL, mul(j.footDirL, BODY.foot)), add(j.ankleR, mul(j.footDirR, BODY.foot)));
    }
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    pts.forEach((p) => { for (let k = 0; k < 3; k += 1) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); } });
    min[1] = Math.min(min[1], 0);
    const center = mul(add(min, max), 0.5);
    const radius = Math.max(0.68, ...pts.map((p) => len(sub(p, center)))) + 0.12;
    this.target = new THREE.Vector3(center[0], center[1], center[2]);
    this.radius = radius;

    const m = ex.mat || {};
    this.mat.visible = m.hidden !== true;
    this.mat.position.set(side === 'R' ? -(m.x ?? center[0]) : (m.x ?? center[0]), 0.001, m.z ?? center[2]);
    this.mat.rotation.z = ((m.angle || 0) * Math.PI) / 180;

    const cam = ex.cam || {};
    const az = cam.az ?? 30;
    this.swayBase = side === 'R' ? -az : az;
    this.az = this.swayBase;
    this.el = cam.el ?? 15;
    this.key.position.set(this.target.x + 1.8, 4.2, this.target.z + 2.4);
    this.key.target.position.copy(this.target);
    this.lastInteraction = 0;
    this.update(0);
  }

  // Figur auf den Zeitpunkt t (Sekunden) stellen.
  pose(t) {
    const j = solvePose(sampleExercise(this.ex, t, this.side));
    this.joints = j;
    const P = this.parts;
    const place = (m, a, b) => {
      tmpA.set(a[0], a[1], a[2]);
      tmpB.set(b[0], b[1], b[2]);
      m.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(Y, tmpA.sub(tmpB).normalize());
    };
    const at = (m, p) => m.position.set(p[0], p[1], p[2]);
    const orient = (m, b, center, scale) => {
      tmpM.makeBasis(v3(b.l), v3(b.u), v3(b.f));
      m.quaternion.setFromRotationMatrix(tmpM);
      at(m, center);
      m.scale.set(scale[0], scale[1], scale[2]);
    };

    ['L', 'R'].forEach((s) => {
      place(P[`thigh${s}`], j[`hip${s}`], j[`knee${s}`]);
      place(P[`shin${s}`], j[`knee${s}`], j[`ankle${s}`]);
      place(P[`upperArm${s}`], j[`sh${s}`], j[`elbow${s}`]);
      place(P[`foreArm${s}`], j[`elbow${s}`], j[`wrist${s}`]);
      at(P[`knee${s}`], j[`knee${s}`]);
      at(P[`ankle${s}`], j[`ankle${s}`]);
      at(P[`elbow${s}`], j[`elbow${s}`]);
      at(P[`wrist${s}`], j[`wrist${s}`]);
      at(P[`shoulder${s}`], j[`sh${s}`]);
      at(P[`hipBall${s}`], j[`hip${s}`]);

      // Fuß: von der Ferse (etwas unter und hinter dem Knöchel) zur Spitze
      const shinUp = norm(sub(j[`knee${s}`], j[`ankle${s}`]));
      const fd = j[`footDir${s}`];
      const heel = add(j[`ankle${s}`], add(mul(shinUp, -0.035), mul(fd, -0.045)));
      const toe = add(j[`ankle${s}`], add(mul(shinUp, -0.03), mul(fd, BODY.foot)));
      tmpA.set(toe[0], toe[1], toe[2]);
      tmpB.set(heel[0], heel[1], heel[2]);
      const foot = P[`foot${s}`];
      foot.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
      foot.quaternion.setFromUnitVectors(Y, tmpA.clone().sub(tmpB).normalize());
      foot.scale.set(1, len(sub(toe, heel)) / 0.222, 1);

      const fore = norm(sub(j[`wrist${s}`], j[`elbow${s}`]));
      const handBasis = basis(fore, Math.abs(fore[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0]);
      orient(P[`hand${s}`], handBasis, add(j[`wrist${s}`], mul(fore, 0.055)), [0.038, 0.065, 0.022]);
    });

    orient(P.pelvis, j.pb, add(j.pelvis, mul(j.pb.u, -0.015)), [0.152, 0.11, 0.112]);
    const ab = basis(j.lowDir, j.pb.f);
    orient(P.abdomen, ab, mix(j.pelvis, j.waist, 0.62), [0.13, 0.13, 0.1]);
    orient(P.chest, j.cb, add(mix(j.waist, j.neck, 0.52), mul(j.cb.f, 0.008)), [0.16, 0.2, 0.107]);
    const neckTop = add(j.neck, mul(j.headUp, 0.12));
    place(P.neckSeg, neckTop, add(j.neck, mul(j.headUp, -0.02)));
    at(P.head, j.head);
    at(P.nose, add(add(j.head, mul(j.look, 0.1)), mul(j.headUp, -0.015)));

    // Gurt/Handtuch zwischen Hand und Fußballen
    (this.strapDefs || []).forEach((def, i) => {
      const point = (name) => {
        if (name.startsWith('ball')) {
          const s = name.slice(-1);
          return add(j[`ankle${s}`], add(mul(j[`footDir${s}`], 0.11), mul(norm(sub(j[`ankle${s}`], j[`knee${s}`])), 0.03)));
        }
        return j[name.replace('hand', 'wrist')];
      };
      const sideMap = (n) => (this.side === 'R' ? n.replace(/L$/, '§').replace(/R$/, 'L').replace(/§$/, 'R') : n);
      const a = point(sideMap(def.from));
      const b = point(sideMap(def.to));
      const strap = this.straps[i];
      tmpA.set(a[0], a[1], a[2]);
      tmpB.set(b[0], b[1], b[2]);
      strap.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
      strap.quaternion.setFromUnitVectors(Y, tmpA.clone().sub(tmpB).normalize());
      strap.scale.set(1, tmpA.distanceTo(tmpB), 1);
    });
  }

  placeCamera() {
    const cam = this.camera;
    const az = (this.az * Math.PI) / 180;
    const el = (this.el * Math.PI) / 180;
    const vFov = (cam.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect);
    const dist = (this.radius / Math.sin(Math.min(vFov, hFov) / 2)) * (this.thumb ? 0.98 : 1.02);
    cam.position.set(
      this.target.x + dist * Math.sin(az) * Math.cos(el),
      this.target.y + dist * Math.sin(el),
      this.target.z + dist * Math.cos(az) * Math.cos(el),
    );
    cam.lookAt(this.target);
  }

  update(t) {
    if (!this.ex) return;
    this.pose(t);
    // Ohne Eingriff pendelt die Kamera langsam, damit die Figur räumlich wirkt.
    if (!this.dragging && !this.thumb && performance.now() - this.lastInteraction > 2500) {
      const s = (performance.now() - this.startedAt) / 1000;
      this.az = this.swayBase + Math.sin(s * 0.32) * 16;
    }
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
  }

  mount(container) {
    this.container = container;
    container.appendChild(this.canvas);
    this.resize();
    if (!this.ro) {
      this.ro = new ResizeObserver(() => this.resize());
    }
    this.ro.disconnect();
    this.ro.observe(container);
    this.enableDrag();
  }

  resize() {
    const el = this.container;
    if (!el) return;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Mit dem Finger drehen: waagerecht um die Figur, senkrecht die Höhe.
  enableDrag() {
    if (this.dragBound) return;
    this.dragBound = true;
    const c = this.canvas;
    c.style.touchAction = 'none';
    let last = null;
    c.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      last = { x: e.clientX, y: e.clientY };
      c.setPointerCapture?.(e.pointerId);
      this.onInteract?.();
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.dragging || !last) return;
      this.az -= (e.clientX - last.x) * 0.45;
      this.el = clamp(this.el + (e.clientY - last.y) * 0.3, 2, 75);
      last = { x: e.clientX, y: e.clientY };
      if (!this.running) this.update(this.lastT || 0);
    });
    const end = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.swayBase = this.az;
      this.startedAt = performance.now(); // Pendeln setzt nahtlos an der neuen Stelle an
      this.lastInteraction = performance.now();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  // Laufende Animation. time(): liefert die Übungszeit in Sekunden – ohne
  // Angabe läuft die Figur in Echtzeit.
  start(time) {
    this.timeFn = time || null;
    if (this.running) return;
    this.running = true;
    const t0 = performance.now();
    const frame = () => {
      if (!this.running) return;
      // Sheet geschlossen, Leinwand nicht mehr im Dokument: Schleife beenden.
      if (!this.canvas.isConnected) { this.stop(); return; }
      const t = this.timeFn ? this.timeFn() : (performance.now() - t0) / 1000;
      this.lastT = t;
      this.update(t);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  // Standbild als Bild-URL – für die Übersicht.
  snapshot(ex, side = 'L', size = 220) {
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    this.setExercise(ex, side);
    this.update(ex.thumbAt ?? (ex.frames?.[1]?.t ?? 0));
    return this.canvas.toDataURL('image/png');
  }

  dispose() {
    this.stop();
    this.ro?.disconnect();
    this.canvas.remove();
    this.scene.traverse((o) => { o.geometry?.dispose?.(); });
    this.renderer.dispose();
  }
}
