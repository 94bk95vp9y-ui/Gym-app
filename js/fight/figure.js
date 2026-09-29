// 3D-Bühne des Fight-Modus. Baut auf der Gliederpuppe von Mobility auf
// (gleiche IK, gleiche Posen-Schreibweise), bringt aber mit: Handschuhe,
// Kampfhose, Gürtel in der Farbe des Grades, einen zweiten Kämpfer
// (Pratzenhalter/Gegner), Leuchtspuren der Techniken, die aufleuchtende
// Kraftkette und einen Ring für die Startseite.

import * as THREE from '../vendor/three.module.min.js';
import { solvePose, BODY } from '../mobility-figure.js';

const Y = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const addA = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const subA = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mulA = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const normA = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function basis(up, fwd) {
  const u = normA(up);
  const d = u[0] * fwd[0] + u[1] * fwd[1] + u[2] * fwd[2];
  let f = subA(fwd, mulA(u, d));
  if (Math.hypot(f[0], f[1], f[2]) < 1e-4) f = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
  f = normA(f);
  return { u, f, l: [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0]] };
}

export const LOOKS = {
  fighter: { skin: 0xe9dfd4, shorts: 0x121216, trim: 0xff2e3e, glove: 0xd9152b, gloveCuff: 0xf2f2f2 },
  partner: { skin: 0xcfc4b9, shorts: 0x1c2a45, trim: 0x4d8dff, glove: 0x1f4fd6, gloveCuff: 0xe8eefc },
  ghost: { skin: 0xffffff, shorts: 0xffffff, trim: 0xffffff, glove: 0xffffff, gloveCuff: 0xffffff, ghost: true },
};

// Vollbild-Ebenen, hinter denen eine Szene nicht weiterlaufen muss
const OVERLAYS = '.fp, .rx, .cc, .vc, .bc, .rp, .tv, .cel, .att, .mz, .mzp';

// Welche Teile zur Hose gehören (Oberschenkel samt Becken)
const SHORTS = new Set(['pelvis', 'thighL', 'thighR', 'hipBallL', 'hipBallR']);

class Mannequin {
  constructor(stage, look = LOOKS.fighter) {
    this.stage = stage;
    this.look = look;
    this.group = new THREE.Group();
    stage.scene.add(this.group);
    this.parts = {};
    this.mats = {};
    this.glow = {};
    this.build();
  }

  material(color, { rough = 0.6, metal = 0.02 } = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    if (this.look.ghost) { m.transparent = true; m.opacity = 0.22; m.depthWrite = false; }
    m.emissive = new THREE.Color(0xff5a22);
    m.emissiveIntensity = 0;
    return m;
  }

  build() {
    const L = this.look;
    const mesh = (geo, name, color, opts) => {
      const mat = this.material(color, opts);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = !L.ghost;
      m.receiveShadow = !L.ghost;
      m.name = name;
      this.group.add(m);
      this.parts[name] = m;
      this.mats[name] = mat;
      return m;
    };
    const limb = (name, r1, r2, length, color) => mesh(new THREE.CylinderGeometry(r1, r2, length, 22, 1, true), name, color);
    const ball = (name, r, color) => mesh(new THREE.SphereGeometry(r, 22, 16), name, color);
    const blob = (name, color, opts) => mesh(new THREE.SphereGeometry(1, 30, 22), name, color, opts);

    ['L', 'R'].forEach((s) => {
      limb(`thigh${s}`, 0.088, 0.064, BODY.thigh, L.shorts);
      limb(`shin${s}`, 0.056, 0.04, BODY.shin, L.skin);
      limb(`upperArm${s}`, 0.052, 0.042, BODY.upperArm, L.skin);
      limb(`foreArm${s}`, 0.041, 0.034, BODY.foreArm, L.skin);
      ball(`knee${s}`, 0.06, L.skin);
      ball(`ankle${s}`, 0.041, L.skin);
      ball(`elbow${s}`, 0.043, L.skin);
      ball(`shoulder${s}`, 0.06, L.skin);
      ball(`hipBall${s}`, 0.086, L.shorts);
      mesh(new THREE.CapsuleGeometry(0.036, 0.15, 6, 14), `foot${s}`, L.skin);
      // Handschuh: dicke Faust plus heller Bund am Handgelenk
      blob(`hand${s}`, L.glove, { rough: 0.32, metal: 0.05 });
      mesh(new THREE.CylinderGeometry(0.047, 0.05, 0.07, 20), `cuff${s}`, L.gloveCuff, { rough: 0.5 });
    });
    blob('pelvis', L.shorts);
    blob('abdomen', L.skin);
    blob('chest', L.skin);
    limb('neckSeg', 0.047, 0.053, 0.14, L.skin);
    ball('head', 0.105, L.skin);
    const nose = ball('nose', 0.024, L.skin);
    nose.castShadow = false;

    // Bund der Hose in Akzentfarbe
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.13, 10, 40), this.material(L.trim, { rough: 0.5 }));
    band.castShadow = !L.ghost;
    this.group.add(band);
    this.band = band;

    // Gürtel (Farbe des Grades) – Ring um die Taille, Knoten, zwei Enden
    const beltMat = this.material(0xffffff, { rough: 0.7 });
    this.beltMat = beltMat;
    this.belt = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 10, 40), beltMat);
    ring.castShadow = true;
    this.beltRing = ring;
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.03), beltMat);
    knot.position.set(0, 0, 1.02);
    const endA = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.012), beltMat);
    const endB = endA.clone();
    endA.position.set(0.02, -0.08, 1.03);
    endA.rotation.z = 0.25;
    endB.position.set(-0.025, -0.075, 1.03);
    endB.rotation.z = -0.2;
    this.beltKnot = new THREE.Group();
    this.beltKnot.add(knot, endA, endB);
    this.belt.add(ring);
    this.group.add(this.belt, this.beltKnot);
    this.belt.visible = false;
    this.beltKnot.visible = false;

    // Pratzen (nur beim Partner)
    this.pads = ['L', 'R'].map(() => {
      const g = new THREE.Group();
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.05, 28), this.material(0xf5f5f5, { rough: 0.45 }));
      face.rotation.x = Math.PI / 2;
      const ringP = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 10, 30), this.material(0xff2e3e, { rough: 0.4 }));
      ringP.position.z = 0.027;
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.123, 0.11, 0.05, 28), this.material(0x151518, { rough: 0.6 }));
      back.rotation.x = Math.PI / 2;
      back.position.z = -0.045;
      g.add(face, ringP, back);
      [face, back].forEach((m) => { m.castShadow = true; });
      g.visible = false;
      this.group.add(g);
      return g;
    });
  }

  setBelt(color) {
    const on = !!color;
    this.belt.visible = on;
    this.beltKnot.visible = on;
    if (on) this.beltMat.color.set(color);
  }

  setPads(on) { this.pads.forEach((p) => { p.visible = on; }); }

  setTransform(position = [0, 0, 0], yawDeg = 0) {
    this.group.position.set(position[0], position[1], position[2]);
    this.group.rotation.y = (yawDeg * Math.PI) / 180;
  }

  // Leuchten einzelner Teile (Kraftkette), 0..1
  setGlow(levels) {
    Object.entries(this.mats).forEach(([name, mat]) => {
      const v = levels?.[name] || 0;
      if (mat.emissiveIntensity !== v * 0.75) mat.emissiveIntensity = v * 0.75;
    });
  }

  apply(pose) {
    const j = solvePose(pose);
    this.j = j;
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
      if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    };

    ['L', 'R'].forEach((s) => {
      place(P[`thigh${s}`], j[`hip${s}`], j[`knee${s}`]);
      place(P[`shin${s}`], j[`knee${s}`], j[`ankle${s}`]);
      place(P[`upperArm${s}`], j[`sh${s}`], j[`elbow${s}`]);
      place(P[`foreArm${s}`], j[`elbow${s}`], j[`wrist${s}`]);
      at(P[`knee${s}`], j[`knee${s}`]);
      at(P[`ankle${s}`], j[`ankle${s}`]);
      at(P[`elbow${s}`], j[`elbow${s}`]);
      at(P[`shoulder${s}`], j[`sh${s}`]);
      at(P[`hipBall${s}`], j[`hip${s}`]);

      const shinUp = normA(subA(j[`knee${s}`], j[`ankle${s}`]));
      const fd = j[`footDir${s}`];
      const heel = addA(j[`ankle${s}`], addA(mulA(shinUp, -0.035), mulA(fd, -0.045)));
      const toe = addA(j[`ankle${s}`], addA(mulA(shinUp, -0.03), mulA(fd, BODY.foot)));
      tmpA.set(toe[0], toe[1], toe[2]);
      tmpB.set(heel[0], heel[1], heel[2]);
      const foot = P[`foot${s}`];
      foot.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
      foot.quaternion.setFromUnitVectors(Y, tmpA.clone().sub(tmpB).normalize());
      foot.scale.set(1, Math.hypot(...subA(toe, heel)) / 0.222, 1);

      // Handschuh entlang des Unterarms, Daumenseite nach oben/innen
      const fore = normA(subA(j[`wrist${s}`], j[`elbow${s}`]));
      const hb = basis(fore, Math.abs(fore[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0]);
      const glove = addA(j[`wrist${s}`], mulA(fore, 0.07));
      orient(P[`hand${s}`], hb, glove, [0.07, 0.092, 0.078]);
      orient(P[`cuff${s}`], hb, addA(j[`wrist${s}`], mulA(fore, -0.012)), [1, 1, 1]);
      j[`glove${s}`] = glove;
      j[`toePt${s}`] = toe;

      // Pratze vor dem Handschuh, Fläche zeigt in Schlagrichtung des Partners
      const pad = this.pads[s === 'L' ? 0 : 1];
      if (pad.visible) {
        const face = pose[`padDir${s}`] ? normA(pose[`padDir${s}`]) : fore;
        const pb = basis(face, Math.abs(face[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0]);
        tmpM.makeBasis(v3(pb.l), v3(pb.f), v3(pb.u));
        pad.quaternion.setFromRotationMatrix(tmpM);
        const c = addA(glove, mulA(face, 0.06));
        pad.position.set(c[0], c[1], c[2]);
        j[`pad${s}`] = c;
        j[`padFace${s}`] = face;
      }
    });

    orient(P.pelvis, j.pb, addA(j.pelvis, mulA(j.pb.u, -0.015)), [0.158, 0.115, 0.118]);
    const ab = basis(j.lowDir, j.pb.f);
    orient(P.abdomen, ab, addA(j.pelvis, mulA(subA(j.waist, j.pelvis), 0.62)), [0.13, 0.13, 0.1]);
    orient(P.chest, j.cb, addA(addA(j.waist, mulA(subA(j.neck, j.waist), 0.52)), mulA(j.cb.f, 0.008)), [0.165, 0.2, 0.11]);
    const neckTop = addA(j.neck, mulA(j.headUp, 0.12));
    place(P.neckSeg, neckTop, addA(j.neck, mulA(j.headUp, -0.02)));
    at(P.head, j.head);
    at(P.nose, addA(addA(j.head, mulA(j.look, 0.1)), mulA(j.headUp, -0.015)));

    // Hosenbund und Gürtel sitzen um die Taille
    const waistC = addA(j.pelvis, mulA(j.pb.u, 0.075));
    tmpM.makeBasis(v3(j.pb.l), v3(j.pb.f), v3(j.pb.u));
    this.band.quaternion.setFromRotationMatrix(tmpM);
    this.band.position.set(waistC[0], waistC[1], waistC[2]);
    this.band.scale.set(0.148, 0.112, 0.105);
    if (this.belt.visible) {
      const beltC = addA(j.pelvis, mulA(j.pb.u, 0.085));
      this.belt.quaternion.copy(this.band.quaternion);
      this.belt.position.set(beltC[0], beltC[1], beltC[2]);
      this.belt.scale.set(0.16, 0.13, 0.12);
      tmpM.makeBasis(v3(j.pb.l), v3(j.pb.u), v3(j.pb.f));
      this.beltKnot.quaternion.setFromRotationMatrix(tmpM);
      const k = addA(beltC, mulA(j.pb.f, 0.128));
      this.beltKnot.position.set(k[0], k[1], k[2]);
      this.beltKnot.scale.setScalar(1);
      this.beltKnot.children.forEach((c) => { c.position.z = c === this.beltKnot.children[0] ? 0.004 : 0.012; });
    }
    return j;
  }

  // Punkt aus Figur-Koordinaten in Weltkoordinaten
  world(p) {
    tmpA.set(p[0], p[1], p[2]);
    this.group.localToWorld(tmpA);
    return [tmpA.x, tmpA.y, tmpA.z];
  }

  dispose() {
    this.stage.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  }
}

// ---------- Leuchtspur ----------
// Ein Band aus den letzten Positionen einer Faust/eines Fußes, das zur
// Kamera zeigt und nach hinten ausblendet.
class Trail {
  constructor(stage, color = 0xff3b3b) {
    const n = 26;
    this.n = n;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 4), 4));
    const idx = [];
    for (let i = 0; i < n - 1; i += 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.geo = geo;
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.color = new THREE.Color(color);
    stage.scene.add(this.mesh);
    this.stage = stage;
  }

  // points: Weltpunkte, alt → neu; strength 0..1
  update(points, strength = 1) {
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.color.array;
    const cam = this.stage.camera.position;
    const n = this.n;
    const pts = points.slice(-n);
    while (pts.length < n) pts.unshift(pts[0] || [0, -10, 0]);
    for (let i = 0; i < n; i += 1) {
      const p = pts[i];
      const q = pts[Math.min(n - 1, i + 1)];
      const o = pts[Math.max(0, i - 1)];
      const dir = normA(subA(q, o));
      const toCam = normA([cam.x - p[0], cam.y - p[1], cam.z - p[2]]);
      let side = [dir[1] * toCam[2] - dir[2] * toCam[1], dir[2] * toCam[0] - dir[0] * toCam[2], dir[0] * toCam[1] - dir[1] * toCam[0]];
      side = normA(side);
      const k = i / (n - 1);
      const w = 0.005 + 0.05 * k * k;
      const a = addA(p, mulA(side, w));
      const b = addA(p, mulA(side, -w));
      pos.set(a, i * 6);
      pos.set(b, i * 6 + 3);
      const alpha = k ** 1.4 * strength;
      const c = this.color;
      col.set([c.r, c.g, c.b, alpha, c.r, c.g, c.b, alpha], i * 8);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.mesh.visible = strength > 0.01;
  }

  hide() { this.mesh.visible = false; }
}

// ---------- Aufprall: kurzer Ring + Lichtpunkt ----------
function makeFlash(stage) {
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.082, 48), ringMat);
  ring.renderOrder = 6;
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xff6040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), dotMat);
  stage.scene.add(ring, dot);
  return { ring, dot, ringMat, dotMat };
}

// ---------- Ring für die Startseite ----------
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(256, 256, 30, 256, 256, 330);
  grad.addColorStop(0, '#2a2a31');
  grad.addColorStop(1, '#101014');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(255,46,62,0.55)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(256, 256, 118, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.lineWidth = 2;
  for (let i = 1; i < 8; i += 1) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke();
  }
  g.font = 'italic 800 64px "Barlow Condensed", system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.textAlign = 'center';
  g.fillText('FIGHT', 256, 280);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildRing(scene) {
  const group = new THREE.Group();
  const size = 4.2;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(size, 0.08, size), new THREE.MeshStandardMaterial({ map: ringTexture(), roughness: 0.85 }));
  floor.position.y = -0.04;
  floor.receiveShadow = true;
  group.add(floor);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.4, metalness: 0.5 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0xff2e3e, roughness: 0.45 });
  const ropeMats = [
    new THREE.MeshStandardMaterial({ color: 0xff2e3e, roughness: 0.35, emissive: 0x400006, emissiveIntensity: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35 }),
    new THREE.MeshStandardMaterial({ color: 0x2d6bff, roughness: 0.35 }),
  ];
  const h = size / 2 - 0.08;
  const corners = [[h, h], [-h, h], [-h, -h], [h, -h]];
  corners.forEach(([x, z]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.45, 14), postMat);
    post.position.set(x, 0.72, z);
    post.castShadow = true;
    group.add(post);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), padMat);
    pad.position.set(x * 0.985, 0.78, z * 0.985);
    group.add(pad);
  });
  [0.52, 0.86, 1.2].forEach((yy, i) => {
    for (let k = 0; k < 4; k += 1) {
      const a = corners[k];
      const b = corners[(k + 1) % 4];
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, size - 0.16, 10), ropeMats[i]);
      rope.position.set((a[0] + b[0]) / 2, yy, (a[1] + b[1]) / 2);
      if (a[0] === b[0]) rope.rotation.x = Math.PI / 2;
      else rope.rotation.z = Math.PI / 2;
      rope.castShadow = i === 2;
      group.add(rope);
    }
  });
  scene.add(group);
  return group;
}

// ---------- Bühne ----------
export class FightStage {
  constructor({ thumb = false, ring = false, spot = false, shadows = true } = {}) {
    this.thumb = thumb;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: thumb });
    renderer.setPixelRatio(thumb ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.canvas.className = 'f-canvas';

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.05, 80);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a2a2a, spot ? 0.55 : 1.05));
    const key = new THREE.DirectionalLight(0xffffff, spot ? 0.9 : 1.9);
    key.castShadow = shadows && !spot;
    key.shadow.mapSize.set(thumb ? 512 : 1024, thumb ? 512 : 1024);
    Object.assign(key.shadow.camera, { left: -1.8, right: 1.8, top: 1.8, bottom: -1.8, near: 0.5, far: 14 });
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 5;
    key.position.set(1.8, 4.2, 2.6);
    scene.add(key, key.target);
    this.key = key;
    const rim = new THREE.DirectionalLight(0xff4a3a, spot ? 1.3 : 0.9);
    rim.position.set(-2.5, 2.4, -3);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x9fb8ff, 0.45);
    fill.position.set(-3, 1.6, 2.5);
    scene.add(fill);

    if (spot) {
      const s = new THREE.SpotLight(0xfff3e6, 38, 12, 0.5, 0.55, 1.6);
      s.position.set(0.4, 5.2, 1.2);
      s.target.position.set(0, 0.9, 0);
      s.castShadow = shadows;
      s.shadow.mapSize.set(1024, 1024);
      s.shadow.bias = -0.0008;
      s.shadow.normalBias = 0.02;
      scene.add(s, s.target);
      this.spot = s;
    }

    if (ring) this.ring = buildRing(scene);
    else {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.35 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
      const grid = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.57, 64),
        new THREE.MeshBasicMaterial({ color: 0xff2e3e, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      grid.rotation.x = -Math.PI / 2;
      grid.position.y = 0.002;
      scene.add(grid);
      this.floorRing = grid;
    }

    this.figures = [];
    this.trails = [];
    this.flash = makeFlash(this);
    this.flashAt = -1;
    this.az = 30;
    this.el = 10;
    this.target = new THREE.Vector3(0, 1.0, 0.1);
    this.radius = 1.1;
    this.swayBase = 30;
    this.sway = !thumb;
    this.dragging = false;
    this.lastInteraction = 0;
    this.startedAt = performance.now();
    this.mirrored = false;
    this.pov = null;
  }

  add(look = LOOKS.fighter) {
    const m = new Mannequin(this, look);
    this.figures.push(m);
    return m;
  }

  trail(color) {
    const t = new Trail(this, color);
    this.trails.push(t);
    return t;
  }

  // Blickwinkel: az/el in Grad um den Zielpunkt, der Abstand passt sich an.
  view({ az, el, target, radius, sway } = {}) {
    if (az !== undefined) { this.az = az; this.swayBase = az; }
    if (el !== undefined) this.el = el;
    if (target) this.target.set(target[0], target[1], target[2]);
    if (radius) this.radius = radius;
    if (sway !== undefined) this.sway = sway;
    this.pov = null;
    this.lastInteraction = performance.now();
  }

  // Ich-Perspektive (Pratzen/Gegner): Kamera auf Augenhöhe des Nutzers.
  // width: sichtbare Breite in Metern auf Höhe des Partners – im Hochformat
  // wird das Sichtfeld entsprechend größer. lift: Bildausschnitt nach oben
  // verschieben (Anteil der Höhe), damit unten Platz für Timer und Ansagen
  // bleibt, ohne die Kamera zu kippen.
  povView(eye = [0, 1.55, 0], look = [0, 1.35, 1.75], { width = 1.15, lift = 0 } = {}) {
    this.pov = { eye, look, width, lift };
    this.fitPov();
  }

  fitPov() {
    const cam = this.camera;
    const { eye, look, width, lift } = this.pov;
    const d = Math.hypot(look[0] - eye[0], look[2] - eye[2]) || 1;
    const hHalf = Math.atan(width / 2 / d);
    const vHalf = Math.atan(Math.tan(hHalf) / cam.aspect);
    cam.fov = Math.max(40, Math.min(95, (vHalf * 360) / Math.PI));
    const w = this.canvas.width || 100;
    const h = this.canvas.height || 100;
    if (lift) cam.setViewOffset(w, h, 0, h * lift, w, h);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }

  setMirror(on) {
    this.mirrored = on;
    this.canvas.style.transform = on ? 'scaleX(-1)' : '';
  }

  placeCamera() {
    const cam = this.camera;
    if (this.pov) {
      cam.position.set(...this.pov.eye);
      cam.lookAt(new THREE.Vector3(...this.pov.look));
      return;
    }
    const now = performance.now();
    if (this.sway && !this.dragging && now - this.lastInteraction > 2600) {
      const s = (now - this.startedAt) / 1000;
      this.az = this.swayBase + Math.sin(s * 0.28) * 14;
    }
    const az = (this.az * Math.PI) / 180;
    const el = (this.el * Math.PI) / 180;
    const vFov = (cam.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect);
    const dist = this.radius / Math.sin(Math.min(vFov, hFov) / 2);
    cam.position.set(
      this.target.x + dist * Math.sin(az) * Math.cos(el),
      this.target.y + dist * Math.sin(el),
      this.target.z + dist * Math.cos(az) * Math.cos(el),
    );
    cam.lookAt(this.target);
  }

  // Aufprall anzeigen: t = Zeit seit Treffer in Sekunden (negativ = aus)
  showFlash(point, age) {
    const f = this.flash;
    if (!point || age < 0 || age > 0.32) {
      f.ringMat.opacity = 0;
      f.dotMat.opacity = 0;
      return;
    }
    const k = age / 0.32;
    f.ring.position.set(point[0], point[1], point[2]);
    f.ring.quaternion.copy(this.camera.quaternion);
    f.ring.scale.setScalar(0.6 + k * 2.4);
    f.ringMat.opacity = (1 - k) * 0.9;
    f.dot.position.set(point[0], point[1], point[2]);
    f.dot.scale.setScalar(1 + k * 0.6);
    f.dotMat.opacity = (1 - k) ** 2 * 0.8;
  }

  render() {
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
  }

  mount(container) {
    this.container = container;
    container.appendChild(this.canvas);
    this.resize();
    if (!this.ro) this.ro = new ResizeObserver(() => this.resize());
    this.ro.disconnect();
    this.ro.observe(container);
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
    if (this.pov) this.fitPov();
  }

  // Mit dem Finger um die Figur drehen
  enableDrag(onInteract) {
    if (this.dragBound) return;
    this.dragBound = true;
    const c = this.canvas;
    c.style.touchAction = 'none';
    let last = null;
    c.addEventListener('pointerdown', (e) => {
      if (this.pov) return;
      this.dragging = true;
      last = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
      c.setPointerCapture?.(e.pointerId);
      onInteract?.('down');
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.dragging || !last) return;
      const dir = this.mirrored ? -1 : 1;
      this.az -= (e.clientX - last.x) * 0.45 * dir;
      this.el = Math.max(-5, Math.min(70, this.el + (e.clientY - last.y) * 0.3));
      last = { ...last, x: e.clientX, y: e.clientY };
      if (!this.running) this.render();
    });
    const end = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.swayBase = this.az;
      this.startedAt = performance.now();
      this.lastInteraction = performance.now();
      const moved = last ? Math.hypot(e.clientX - last.sx, e.clientY - last.sy) : 99;
      onInteract?.(moved < 6 ? 'tap' : 'up');
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  // frame(dtSeconds) wird pro Bild aufgerufen und stellt Figuren/Spuren.
  start(frame) {
    this.frameFn = frame;
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    let checked = 0;
    let covered = false;
    const loop = (now) => {
      if (!this.running) return;
      if (!this.canvas.isConnected) { this.stop(); return; }
      this.raf = requestAnimationFrame(loop);
      // Liegt ein Vollbild (Einheit, Test, Feier) darüber, ruht die Szene –
      // spart Akku und hält die Einheit selbst flüssig.
      if (now - checked > 400) { checked = now; covered = this.covered(); }
      if (covered) { last = now; return; }
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      this.frameFn?.(dt);
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
  }

  covered() {
    return [...document.querySelectorAll(OVERLAYS)].some((o) => !o.contains(this.canvas) && !o.classList.contains('closing'));
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  snapshot(size = 200) {
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    this.render();
    return this.canvas.toDataURL('image/png');
  }

  dispose() {
    this.stop();
    this.ro?.disconnect();
    this.canvas.remove();
    this.scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material?.map) o.material.map.dispose(); o.material?.dispose?.(); });
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

export { THREE };
