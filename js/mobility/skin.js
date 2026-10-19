// Menschliches Modell für die Mobility-Figur.
//
// Das Modell (CC0, „3D Male Base Mesh“ von BoQsc) hat ein Skelett aus
// Blender. Bewegt wird es nicht über eigene Animationen, sondern über
// dieselben Gelenkpunkte, die solvePose() für die Gliederpuppe ausrechnet:
// Jeder tragende Knochen beginnt an „seinem“ Gelenk, zeigt zum nächsten und
// wird bei Bedarf entlang seiner Achse auf die Länge aus BODY gestreckt.
// Finger, Zehen und Becken folgen ihrem Elternknochen starr.
//
// Die Knochen hängen nicht im Szenengraph – ihre Weltmatrizen werden hier
// direkt gesetzt, three.js liest sie nur fürs Skinning.

import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const MODEL_URL = new URL('../../models/figure.glb', import.meta.url).href;

let bufferPromise = null;
// Datei nur einmal laden; jede Bühne baut sich daraus ihr eigenes Modell.
function modelBuffer() {
  if (!bufferPromise) {
    bufferPromise = fetch(MODEL_URL).then((r) => {
      if (!r.ok) throw new Error(`Modell nicht geladen (${r.status})`);
      return r.arrayBuffer();
    });
    bufferPromise.catch(() => { bufferPromise = null; });
  }
  return bufferPromise;
}

const v = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

// Drehung der Basis (x = y × z, y = aim, z = ref senkrecht zu aim)
function basisQuat(aim, ref, out = new THREE.Quaternion()) {
  const y = aim.clone().normalize();
  const z = ref.clone().addScaledVector(y, -ref.dot(y));
  if (z.lengthSq() < 1e-8) {
    z.set(0, 0, 1);
    if (Math.abs(y.z) > 0.9) z.set(0, 1, 0);
    z.addScaledVector(y, -z.dot(y));
  }
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  tmpM.makeBasis(x, y, z);
  return out.setFromRotationMatrix(tmpM);
}

// Name aus der Datei → Kurzname (GLTFLoader entfernt die Punkte)
const key = (name) => name.replace(/[.\s]/g, '');

// Körperbereiche für Kleidung und Hervorhebung
const LEG = /^(thigh|shin|foot|toe|heel02)[LR]$/;
const HIP = /^(spine|pelvis[LR])$/;

export class SkinnedFigure {
  constructor(gltf) {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    let mesh = null;
    root.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
    if (!mesh) throw new Error('Kein Skinned Mesh im Modell');
    this.mesh = mesh;
    const bones = mesh.skeleton.bones;
    this.bones = bones;
    this.byName = Object.fromEntries(bones.map((b) => [key(b.name), b]));

    // Modell schaut nach +x, links liegt bei −z, Füße bei y ≈ −1.
    // Figur: schaut nach +z, links bei +x, Boden y = 0.
    const minY = this.meshMinY(mesh);
    this.scale = 0.969;
    const toFig = new THREE.Matrix4()
      .makeScale(this.scale, this.scale, this.scale)
      .multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2))
      .multiply(new THREE.Matrix4().makeTranslation(0, -minY, 0));
    this.figRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

    // Ruhelage in Figur-Koordinaten
    this.rest = new Map();
    bones.forEach((b) => {
      const m = toFig.clone().multiply(b.matrixWorld);
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      m.decompose(pos, q, sc);
      this.rest.set(b, { pos, q, localPos: b.position.clone(), localQ: b.quaternion.clone() });
    });
    // Länge jedes Knochens bis zum (ersten tragenden) Kind
    const tailOf = { thighL: 'shinL', thighR: 'shinR', shinL: 'footL', shinR: 'footR',
      upper_armL: 'forearmL', upper_armR: 'forearmR', forearmL: 'handL', forearmR: 'handR',
      shoulderL: 'upper_armL', shoulderR: 'upper_armR',
      spine: 'spine001', spine001: 'spine002', spine002: 'spine003', spine003: 'spine004', spine004: 'spine005' };
    this.restLen = {};
    Object.entries(tailOf).forEach(([a, b]) => {
      this.restLen[a] = this.restOf(a).pos.distanceTo(this.restOf(b).pos);
    });
    const hipMid = this.restOf('thighL').pos.clone().add(this.restOf('thighR').pos).multiplyScalar(0.5);
    this.restHipMid = hipMid;
    // Höhe der Wirbel über der Hüfte (für die Verteilung entlang der Wirbelsäule)
    this.spineRest = ['spine001', 'spine002', 'spine003', 'spine004'].map((n) => this.restOf(n).pos.y - hipMid.y);
    this.spineOffset = this.restOf('spine').pos.clone().sub(hipMid);
    this.headLen = this.restLen.spine004;

    // Skinning: Mesh direkt in der Figur-Szene, Knochen außerhalb
    mesh.removeFromParent();
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrixWorld(true);
    mesh.bindMatrix.identity();
    mesh.bindMatrixInverse.identity();
    mesh.bindMode = 'detached';
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bones.forEach((b) => { b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; });
    this.order = [];
    const walk = (b) => { this.order.push(b); b.children.forEach((c) => { if (c.isBone) walk(c); }); };
    bones.filter((b) => !b.parent?.isBone).forEach(walk);

    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 });
    mesh.material = this.material;
    this.prepareRegions(toFig);
    this.final = new Map();
  }

  restOf(name) { return this.rest.get(this.byName[name]); }

  meshMinY(mesh) {
    const pos = mesh.geometry.attributes.position;
    let min = Infinity;
    for (let i = 0; i < pos.count; i += 1) min = Math.min(min, pos.getY(i));
    return min;
  }

  // Jede Ecke bekommt Kleidung (aus Ort und stärkstem Knochen) und ein
  // Gewicht je Knochen für die Hervorhebung.
  prepareRegions(toFig) {
    const geo = this.mesh.geometry;
    const pos = geo.attributes.position;
    const si = geo.attributes.skinIndex;
    const sw = geo.attributes.skinWeight;
    const n = pos.count;
    this.cloth = new Uint8Array(n);
    this.vertBones = [];
    const p = new THREE.Vector3();
    const r = (name) => this.restOf(name).pos;
    const waist = r('spine001').y + 0.03;
    const thighCut = (side) => r(`thigh${side}`).y * 0.45 + r(`shin${side}`).y * 0.55;
    const head = r('spine005');
    for (let i = 0; i < n; i += 1) {
      p.fromBufferAttribute(pos, i).applyMatrix4(toFig);
      let best = 0;
      let bestW = -1;
      const list = [];
      for (let k = 0; k < 4; k += 1) {
        const w = sw.getComponent(i, k);
        if (w <= 0) continue;
        const name = key(this.bones[si.getComponent(i, k)].name);
        list.push([name, w]);
        if (w > bestW) { bestW = w; best = name; }
      }
      this.vertBones.push(list);
      // 0 Haut, 1 Shirt, 2 Shorts, 3 Schuhe, 4 Haare
      let c = 0;
      const side = p.x >= 0 ? 'L' : 'R';
      if (LEG.test(best) || HIP.test(best)) {
        if (p.y < 0.105) c = 3;
        else if (p.y > thighCut(side)) c = 2;
      } else if (/^spine00[123]$/.test(best) || /^shoulder[LR]$/.test(best)) {
        c = p.y > waist ? 1 : 2;
      } else if (/^upper_arm[LR]$/.test(best)) {
        // Ärmel: die ersten 12 cm entlang des Oberarms
        const a = r(`upper_arm${side}`);
        const axis = r(`forearm${side}`).clone().sub(a).normalize();
        c = p.clone().sub(a).dot(axis) < 0.12 ? 1 : 0;
      } else if (best === 'spine005') {
        if (p.y > head.y + 0.115 || (p.y > head.y + 0.03 && p.z < head.z - 0.035)) c = 4;
      }
      this.cloth[i] = c;
    }
    this.colors = new Float32Array(n * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
  }

  // Farben: Kleidung plus weich auslaufende Hervorhebung der Zielmuskeln
  paint(palette, highlight) {
    const cols = [palette.skin, palette.shirt, palette.shorts, palette.shoes, palette.hair];
    const accent = palette.accent;
    const tmp = new THREE.Color();
    for (let i = 0; i < this.cloth.length; i += 1) {
      tmp.copy(cols[this.cloth[i]]);
      let h = 0;
      this.vertBones[i].forEach(([name, w]) => { if (highlight.has(name)) h += w; });
      if (h > 0) tmp.lerp(accent, Math.min(1, h) * 0.85);
      this.colors[i * 3] = tmp.r;
      this.colors[i * 3 + 1] = tmp.g;
      this.colors[i * 3 + 2] = tmp.b;
    }
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }

  // ---------- Pose ----------
  // Tragender Knochen: Kopf bei head, Achse aim, „vorn“ ref, Länge len.
  // restAim/restRef beschreiben dieselben Richtungen in der Ruhelage.
  drive(name, head, aim, ref, restAim, restRef, len = null) {
    const bone = this.byName[name];
    const rest = this.rest.get(bone);
    const q = basisQuat(aim, ref).multiply(basisQuat(restAim, restRef).invert()).multiply(rest.q);
    const k = len ? len / this.restLen[name] : 1;
    const s = this.scale;
    bone.matrixWorld.compose(head, q, tmpV.set(s, s * k, s));
    this.final.set(bone, q);
  }

  // Mitlaufender Knochen: starr am Elternknochen
  follow(bone) {
    const rest = this.rest.get(bone);
    const parent = bone.parent;
    const pq = this.final.get(parent);
    const head = rest.localPos.clone().applyMatrix4(parent.matrixWorld);
    const q = pq.clone().multiply(rest.localQ);
    bone.matrixWorld.compose(head, q, tmpV.set(this.scale, this.scale, this.scale));
    this.final.set(bone, q);
  }

  pose(j) {
    const P = (a) => v(a);
    const up = new THREE.Vector3(0, 1, 0);
    const fwd = new THREE.Vector3(0, 0, 1);
    const back = new THREE.Vector3(0, 0, -1);
    const pbU = P(j.pb.u);
    const pbF = P(j.pb.f);
    const cbF = P(j.cb.f);
    const done = new Set();
    const drive = (name, ...args) => { this.drive(name, ...args); done.add(this.byName[name]); };

    // Becken und Wirbelsäule: Wirbel entlang Hüfte → Becken → Taille → Hals
    const hipL = P(j.hipL);
    const hipR = P(j.hipR);
    const hipC = hipL.clone().add(hipR).multiplyScalar(0.5);
    const pelvisQ = basisQuat(pbU, pbF).multiply(basisQuat(up, fwd).invert());
    const spineHead = this.spineOffset.clone().applyQuaternion(pelvisQ).add(hipC);
    const line = [hipC, P(j.pelvis), P(j.waist), P(j.neck)];
    const seg = [];
    let total = 0;
    for (let i = 1; i < line.length; i += 1) { const d = line[i].distanceTo(line[i - 1]); seg.push(d); total += d; }
    const along = (u) => {
      let rest = u * total;
      for (let i = 0; i < seg.length; i += 1) {
        if (rest <= seg[i] || i === seg.length - 1) return line[i].clone().lerp(line[i + 1], Math.min(1, rest / (seg[i] || 1)));
        rest -= seg[i];
      }
      return line[line.length - 1].clone();
    };
    const top = this.spineRest[3];
    const pts = this.spineRest.map((h) => along(h / top));
    const headUp = P(j.headUp);
    const look = P(j.look);
    const headPt = pts[3].clone().addScaledVector(headUp, this.headLen * this.scale * 0.95);
    drive('spine', spineHead, pts[0].clone().sub(spineHead), pbF, up, fwd, spineHead.distanceTo(pts[0]));
    const names = ['spine001', 'spine002', 'spine003'];
    names.forEach((n, i) => {
      const f = pbF.clone().lerp(cbF, (i + 1) / 3);
      drive(n, pts[i], pts[i + 1].clone().sub(pts[i]), f, up, fwd, pts[i].distanceTo(pts[i + 1]));
    });
    drive('spine004', pts[3], headUp, look, up, fwd, pts[3].distanceTo(headPt));
    drive('spine005', headPt, headUp, look, up, fwd);

    ['L', 'R'].forEach((s) => {
      // Schlüsselbein: vom Brustkorb zum Schultergelenk
      const shoulder = this.byName[`shoulder${s}`];
      const shHead = this.rest.get(shoulder).localPos.clone().applyMatrix4(shoulder.parent.matrixWorld);
      const sh = P(j[`sh${s}`]);
      const restSh = this.restOf(`upper_arm${s}`).pos.clone().sub(this.restOf(`shoulder${s}`).pos);
      drive(`shoulder${s}`, shHead, sh.clone().sub(shHead), cbF, restSh, fwd, Math.max(0.05, sh.distanceTo(shHead)));

      // Arm: Beugerichtung des Ellbogens aus der IK
      const elbow = P(j[`elbow${s}`]);
      const wrist = P(j[`wrist${s}`]);
      const armBend = P(j[`elbowBend${s}`]);
      const r = (n) => this.restOf(n).pos;
      const restUp = r(`forearm${s}`).clone().sub(r(`upper_arm${s}`));
      const restFore = r(`hand${s}`).clone().sub(r(`forearm${s}`));
      drive(`upper_arm${s}`, sh, elbow.clone().sub(sh), armBend, restUp, back, sh.distanceTo(elbow));
      drive(`forearm${s}`, elbow, wrist.clone().sub(elbow), armBend, restFore, back, elbow.distanceTo(wrist));

      // Bein: Kniescheibe zeigt in Beugerichtung
      const hip = P(j[`hip${s}`]);
      const knee = P(j[`knee${s}`]);
      const ankle = P(j[`ankle${s}`]);
      const legBend = P(j[`kneeBend${s}`]);
      const restThigh = r(`shin${s}`).clone().sub(r(`thigh${s}`));
      const restShin = r(`foot${s}`).clone().sub(r(`shin${s}`));
      drive(`thigh${s}`, hip, knee.clone().sub(hip), legBend, restThigh, fwd, hip.distanceTo(knee));
      drive(`shin${s}`, knee, ankle.clone().sub(knee), legBend, restShin, fwd, knee.distanceTo(ankle));
      // Fuß: Ruhelage entspricht der Grundstellung footDir = (0, −0,05, 0,17)
      const shinUp = knee.clone().sub(ankle);
      drive(`foot${s}`, ankle, P(j[`footDir${s}`]), shinUp, new THREE.Vector3(0, -0.05, 0.17), up);
    });

    // Rest folgt starr, Eltern vor Kindern
    this.order.forEach((b) => { if (!done.has(b)) this.follow(b); });
  }
}

// Neues Modell für eine Bühne; wirft, wenn Datei oder Inhalt fehlen.
export async function loadFigure() {
  const buffer = await modelBuffer();
  const gltf = await new GLTFLoader().parseAsync(buffer.slice(0), '');
  return new SkinnedFigure(gltf);
}
