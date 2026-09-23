// Aircraft builders (003 T006): the six approved design directions from the visual study
// (H3 Executive, L1 Classic trainer, F5 Interceptor, P1 Narrow-body, B4 Sport, G2 Vintage),
// keyed by AircraftTypeId. Geometry is built from lofted rings, so no model or texture
// assets are involved. buildAircraft normalises every aircraft to PLANE_FOOTPRINT metres,
// centres it on the airframe bounding box (rotor/propeller discs excluded), forward +Z,
// up +Y, and returns the spinner pivots that main.ts rotates from the shared spin phase.
// Allocates at boot only — nothing here runs per frame.
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { footprintScale, type AircraftType, type AircraftTypeId } from "../sim/aircraft";
import type { Theme } from "../sim/themes";

interface Paint {
  body: number;
  accent: number;
  trim: number;
}

// ---------------------------------------------------------------------------------------------
// Materials: painted body, accent paint, dark trim, tinted glass, bare metal, rubber.

interface Materials {
  body: MeshPhongMaterial;
  accent: MeshPhongMaterial;
  trim: MeshPhongMaterial;
  glass: MeshPhongMaterial;
  metal: MeshPhongMaterial;
  rubber: MeshLambertMaterial;
  blade: MeshPhongMaterial;
}

function makeMaterials(paint: Paint): Materials {
  const phong = (color: number, shininess: number, specular = 0x444444): MeshPhongMaterial =>
    new MeshPhongMaterial({ color, shininess, specular, side: DoubleSide });
  return {
    body: phong(paint.body, 28),
    accent: phong(paint.accent, 28),
    trim: phong(paint.trim, 20, 0x222222),
    glass: new MeshPhongMaterial({
      color: 0x18344d,
      shininess: 110,
      specular: 0xbbccdd,
      side: DoubleSide,
      transparent: true,
      opacity: 0.85,
    }),
    metal: phong(0x9aa0a8, 70, 0x888888),
    rubber: new MeshLambertMaterial({ color: 0x1c1d20, side: DoubleSide }),
    blade: phong(0x2a2c30, 40),
  };
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers. Forward is +Z, up is +Y, starboard is +X (matches src/render/plane.ts).

type Ring = Vector3[];

// Connect rings with equal point counts into a skin; optionally close both ends with fans.
function loft(rings: Ring[], capStart = true, capEnd = true): BufferGeometry {
  const positions: number[] = [];
  const push = (a: Vector3, b: Vector3, c: Vector3): void => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const n = rings[0].length;
  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r];
    const b = rings[r + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      push(a[i], b[i], b[j]);
      push(a[i], b[j], a[j]);
    }
  }
  const cap = (ring: Ring, flip: boolean): void => {
    const c = ring.reduce((acc, p) => acc.add(p), new Vector3()).multiplyScalar(1 / ring.length);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (flip) push(c, ring[j], ring[i]);
      else push(c, ring[i], ring[j]);
    }
  };
  if (capStart) cap(rings[0], true);
  if (capEnd) cap(rings[rings.length - 1], false);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Superellipse cross-section in the XY plane at depth z. power 2 = ellipse, higher = boxier.
function section(z: number, rx: number, ry: number, y = 0, power = 2, n = 20, dropY = 0): Ring {
  const ring: Ring = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / power) * rx;
    let yy = Math.sign(s) * Math.pow(Math.abs(s), 2 / power) * ry;
    if (s < 0) yy *= 1 + dropY; // deeper belly than roof
    ring.push(new Vector3(x, y + yy, z));
  }
  return ring;
}

interface BodySection {
  z: number;
  rx: number;
  ry: number;
  y?: number;
  power?: number;
  drop?: number;
}

// Fuselage or boom built from a nose-to-tail run of cross-sections.
function body(sections: BodySection[], material: MeshPhongMaterial, n = 20): Mesh {
  const rings = sections.map((s) => section(s.z, s.rx, s.ry, s.y ?? 0, s.power ?? 2, n, s.drop ?? 0));
  return new Mesh(loft(rings), material);
}

// Rounded airfoil ring in the YZ plane at spanwise position x. Leading edge at le (z).
function airfoil(x: number, le: number, chord: number, thickness: number, y: number, n = 7): Ring {
  const top: Vector3[] = [];
  const bottom: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const camber =
      2.969 * Math.sqrt(t) - 1.26 * t - 3.516 * t * t + 2.843 * t * t * t - 1.036 * t * t * t * t;
    const h = camber * thickness * chord * 0.5;
    const z = le - t * chord;
    top.push(new Vector3(x, y + h, z));
    if (i > 0 && i < n) bottom.push(new Vector3(x, y - h * 0.55, z));
  }
  return [...top, ...bottom.reverse()];
}

interface WingSpec {
  root: [number, number, number]; // root leading edge x, y, z
  span: number; // one side
  rootChord: number;
  tipChord: number;
  sweep: number; // tip LE z offset (negative = swept back)
  dihedral: number; // tip rise
  thickness: number; // fraction of chord
  side: 1 | -1;
  mid?: number; // fraction of span where the planform kinks (optional two-panel wing)
}

function wing(spec: WingSpec, material: MeshPhongMaterial): Mesh {
  const [rx, ry, rz] = spec.root;
  const rings: Ring[] = [airfoil(rx, rz, spec.rootChord, spec.thickness, ry)];
  if (spec.mid !== undefined) {
    const f = spec.mid;
    rings.push(
      airfoil(
        rx + spec.side * spec.span * f,
        rz + spec.sweep * f,
        spec.rootChord + (spec.tipChord - spec.rootChord) * f,
        spec.thickness,
        ry + spec.dihedral * f * 0.6,
      ),
    );
  }
  rings.push(
    airfoil(rx + spec.side * spec.span, rz + spec.sweep, spec.tipChord, spec.thickness * 0.9, ry + spec.dihedral),
  );
  return new Mesh(loft(rings), material);
}

function wingPair(spec: Omit<WingSpec, "side">, material: MeshPhongMaterial): Group {
  const g = new Group();
  const [rx, ry, rz] = spec.root;
  g.add(wing({ ...spec, side: 1 }, material), wing({ ...spec, root: [-rx, ry, rz], side: -1 }, material));
  return g;
}

// Painted horizontal stripe that follows a fuselage's plan-view taper instead of poking out.
function stripe(sections: BodySection[], y: number, height: number, material: MeshPhongMaterial): Mesh {
  const rings = sections.map((s) => section(s.z, s.rx * 1.015, height / 2, y, 4, 12));
  return new Mesh(loft(rings), material);
}

// Vertical fin: a single wing rotated so span runs up +Y.
function fin(spec: Omit<WingSpec, "side" | "root"> & { base: [number, number, number] }, material: MeshPhongMaterial): Mesh {
  const mesh = wing({ ...spec, side: 1, root: [0, 0, 0] }, material);
  mesh.geometry.rotateZ(Math.PI / 2);
  mesh.position.set(spec.base[0], spec.base[1], spec.base[2]);
  return mesh;
}

// Cylinder between two points (struts, skids, masts, axles).
function rod(a: [number, number, number], b: [number, number, number], radius: number, material: MeshPhongMaterial | MeshLambertMaterial): Mesh {
  const va = new Vector3(...a);
  const vb = new Vector3(...b);
  const len = va.distanceTo(vb);
  const mesh = new Mesh(new CylinderGeometry(radius, radius, len, 10), material);
  mesh.position.copy(va).add(vb).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return mesh;
}

// Wheel with axis along X.
function wheel(x: number, y: number, z: number, radius: number, width: number, m: Materials): Group {
  const g = new Group();
  const tyre = new Mesh(new CylinderGeometry(radius, radius, width, 18), m.rubber);
  tyre.rotation.z = Math.PI / 2;
  const hub = new Mesh(new CylinderGeometry(radius * 0.45, radius * 0.45, width * 1.1, 12), m.metal);
  hub.rotation.z = Math.PI / 2;
  g.add(tyre, hub);
  g.position.set(x, y, z);
  return g;
}

// Nose propeller with spinner; blades lie in the XY plane at z.
function propeller(z: number, y: number, radius: number, blades: number, m: Materials, spinner = 0.28): Group {
  const g = new Group();
  const cone = new Mesh(new CylinderGeometry(0.05, spinner, spinner * 2.2, 14), m.metal);
  cone.rotation.x = Math.PI / 2;
  cone.position.z = spinner * 1.1;
  g.add(cone);
  for (let i = 0; i < blades; i++) {
    const blade = new Mesh(new BoxGeometry(0.16, radius, 0.05), m.blade);
    blade.position.y = radius / 2;
    blade.rotation.y = 0.35;
    const pivot = new Group();
    pivot.add(blade);
    pivot.rotation.z = (i / blades) * Math.PI * 2 + 0.6;
    g.add(pivot);
  }
  g.position.set(0, y, z);
  g.userData.rotor = true; // prop disc: excluded from the airframe bounding box
  g.userData.spinner = "propeller";
  return g;
}

// Main rotor: hub plus blades in the XZ plane at y.
function rotor(y: number, z: number, radius: number, blades: number, m: Materials, phase = 0.4): Group {
  const g = new Group();
  const hub = new Mesh(new CylinderGeometry(0.22, 0.26, 0.28, 12), m.metal);
  g.add(hub);
  for (let i = 0; i < blades; i++) {
    const blade = new Mesh(new BoxGeometry(0.28, 0.05, radius), m.blade);
    blade.position.z = radius / 2;
    const pivot = new Group();
    pivot.add(blade);
    pivot.rotation.y = (i / blades) * Math.PI * 2 + phase;
    g.add(pivot);
  }
  g.position.set(0, y, z);
  g.userData.rotor = true; // rotor disc: excluded from the airframe bounding box
  g.userData.spinner = "mainRotor";
  return g;
}

// Tail rotor in the YZ plane on the starboard side.
function tailRotor(x: number, y: number, z: number, radius: number, blades: number, m: Materials): Group {
  const g = new Group();
  const hub = new Mesh(new CylinderGeometry(0.1, 0.1, 0.2, 10), m.metal);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  for (let i = 0; i < blades; i++) {
    const blade = new Mesh(new BoxGeometry(0.04, radius, 0.14), m.blade);
    blade.position.y = radius / 2;
    const pivot = new Group();
    pivot.add(blade);
    pivot.rotation.x = (i / blades) * Math.PI * 2 + 0.5;
    g.add(pivot);
  }
  g.position.set(x, y, z);
  g.userData.rotor = true; // rotor disc: excluded from the airframe bounding box
  g.userData.spinner = "tailRotor";
  return g;
}

function nacelle(x: number, y: number, z: number, length: number, radius: number, m: Materials): Group {
  const g = new Group();
  const shell = body(
    [
      { z: length * 0.55, rx: radius * 0.86, ry: radius * 0.86 },
      { z: length * 0.4, rx: radius, ry: radius },
      { z: -length * 0.2, rx: radius * 0.96, ry: radius * 0.96 },
      { z: -length * 0.5, rx: radius * 0.72, ry: radius * 0.72 },
    ],
    m.metal,
  );
  const inlet = new Mesh(new TorusGeometry(radius * 0.8, radius * 0.1, 8, 24), m.trim);
  inlet.position.z = length * 0.55;
  const core = new Mesh(new CylinderGeometry(radius * 0.4, radius * 0.3, length * 0.3, 12), m.trim);
  core.rotation.x = Math.PI / 2;
  core.position.z = -length * 0.55;
  g.add(shell, inlet, core);
  g.position.set(x, y, z);
  return g;
}

// Row of dark cabin windows along both sides of a fuselage.
function windowRow(zStart: number, zEnd: number, y: number, radius: number, count: number, m: Materials, size = 0.22): Group {
  const g = new Group();
  for (let i = 0; i < count; i++) {
    const z = zStart + ((zEnd - zStart) * i) / (count - 1);
    for (const side of [1, -1]) {
      const w = new Mesh(new BoxGeometry(0.05, size, size * 0.8), m.glass);
      w.position.set(side * radius, y, z);
      g.add(w);
    }
  }
  return g;
}

function canopy(z: number, y: number, length: number, width: number, height: number, m: Materials, power = 2): Mesh {
  const rings: Ring[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const zz = z + length * (0.5 - t);
    const bell = Math.sin(t * Math.PI) ** 0.7;
    rings.push(section(zz, Math.max(0.02, width * (0.35 + 0.65 * bell)), Math.max(0.02, height * bell), y, power, 14));
  }
  return new Mesh(loft(rings), m.glass);
}

function place(o: Object3D, x: number, y: number, z: number): Object3D {
  o.position.set(x, y, z);
  return o;
}

// ---------------------------------------------------------------------------------------------
// Helicopters

function helicopter(
  m: Materials,
  o: {
    cabinLength: number;
    cabinWidth: number;
    cabinHeight: number;
    boxy: number;
    boomLength: number;
    boomRadius: number;
    boomRise: number;
    rotorRadius: number;
    blades: number;
    finHeight: number;
    stabiliser: boolean;
    bubble: number; // 0..1 how much of the nose is glass
    sideWindows: boolean;
    lattice: boolean;
    fenestron: boolean;
    skidWidth: number;
  },
): Group {
  const g = new Group();
  const L = o.cabinLength;
  const W = o.cabinWidth;
  const H = o.cabinHeight;
  const P = 2 + o.boxy * 2;
  const cabin = body(
    [
      { z: L * 0.5, rx: W * 0.18, ry: H * 0.22, y: -H * 0.15, power: 2 },
      { z: L * 0.36, rx: W * 0.42, ry: H * 0.42, y: -H * 0.05, power: P },
      { z: L * 0.12, rx: W * 0.5, ry: H * 0.5, power: P },
      { z: -L * 0.2, rx: W * 0.48, ry: H * 0.47, y: H * 0.02, power: P },
      { z: -L * 0.5, rx: W * 0.28, ry: H * 0.3, y: H * 0.12, power: P },
      { z: -L * 0.62, rx: o.boomRadius * 1.1, ry: o.boomRadius * 1.2, y: H * 0.16, power: 2 },
    ],
    m.body,
  );
  g.add(cabin);
  // glazed nose: a glass shell slightly outside the forward cabin
  const glazeLen = L * (0.25 + 0.35 * o.bubble);
  const glaze = body(
    [
      { z: L * 0.5 + 0.02, rx: W * 0.19, ry: H * 0.24, y: -H * 0.14, power: 2 },
      { z: L * 0.5 - glazeLen * 0.45, rx: W * 0.45, ry: H * 0.45, y: -H * 0.03, power: P },
      { z: L * 0.5 - glazeLen, rx: W * 0.51, ry: H * 0.5, power: P },
    ],
    m.glass,
  );
  g.add(glaze);
  if (o.sideWindows) g.add(windowRow(L * 0.05, -L * 0.3, H * 0.12, W * 0.5, 2, m, H * 0.3));
  // rotor mast and hub
  g.add(rod([0, H * 0.45, 0], [0, H * 0.5 + 0.55, 0], 0.12, m.trim));
  g.add(rotor(H * 0.5 + 0.6, 0, o.rotorRadius, o.blades, m));
  // tail boom
  const boomStart = -L * 0.6;
  const boomEnd = boomStart - o.boomLength;
  if (o.lattice) {
    for (const s of [1, -1]) {
      g.add(rod([s * W * 0.2, H * 0.05, boomStart], [0, H * 0.3 + o.boomRise, boomEnd], o.boomRadius * 0.35, m.trim));
      g.add(rod([s * W * 0.2, H * 0.3, boomStart], [0, H * 0.3 + o.boomRise, boomEnd], o.boomRadius * 0.35, m.trim));
    }
  } else {
    g.add(
      body(
        [
          { z: boomStart, rx: o.boomRadius, ry: o.boomRadius * 1.15, y: H * 0.16 },
          { z: boomEnd + 0.4, rx: o.boomRadius * 0.55, ry: o.boomRadius * 0.7, y: H * 0.16 + o.boomRise },
          { z: boomEnd, rx: o.boomRadius * 0.4, ry: o.boomRadius * 0.55, y: H * 0.16 + o.boomRise },
        ],
        m.body,
      ),
    );
  }
  const tailY = H * 0.2 + o.boomRise;
  g.add(fin({ base: [0, tailY, boomEnd + 0.5], span: o.finHeight, rootChord: 0.9, tipChord: 0.45, sweep: -0.35, dihedral: 0, thickness: 0.14 }, m.accent));
  if (o.stabiliser) g.add(wingPair({ root: [0, tailY, boomEnd + 1.6], span: 0.9, rootChord: 0.45, tipChord: 0.35, sweep: 0, dihedral: 0, thickness: 0.15 }, m.accent));
  if (o.fenestron) {
    const ring = new Mesh(new TorusGeometry(0.62, 0.09, 8, 28), m.accent);
    ring.rotation.y = Math.PI / 2;
    place(ring, 0, tailY + o.finHeight * 0.45, boomEnd + 0.15);
    g.add(ring, tailRotor(0.04, tailY + o.finHeight * 0.45, boomEnd + 0.15, 0.55, 8, m));
  } else {
    g.add(tailRotor(o.boomRadius * 0.6 + 0.08, tailY + o.finHeight * 0.55, boomEnd + 0.2, 0.75, o.blades > 3 ? 4 : 2, m));
  }
  // skids
  const sk = o.skidWidth;
  const skidY = -H * 0.5 - 0.55;
  for (const s of [1, -1]) {
    g.add(rod([s * sk, skidY, L * 0.42], [s * sk, skidY, -L * 0.3], 0.06, m.trim));
    g.add(rod([s * sk, skidY, L * 0.42], [s * sk, skidY + 0.25, L * 0.55], 0.05, m.trim));
    g.add(rod([s * W * 0.35, -H * 0.45, L * 0.22], [s * sk, skidY, L * 0.22], 0.05, m.trim));
    g.add(rod([s * W * 0.35, -H * 0.45, -L * 0.15], [s * sk, skidY, -L * 0.15], 0.05, m.trim));
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Light planes (high wing, nose propeller, fixed wheels)

function lightPlane(
  m: Materials,
  o: {
    length: number;
    width: number;
    noseRound: number; // 0 flat cowl, 1 round cowl
    cabinBoxy: number;
    span: number;
    chord: number;
    taper: number;
    struts: boolean;
    taildragger: boolean;
    finSweep: number;
    finRound: boolean;
    tipUp: number;
    wheelRadius: number;
    cheatline: boolean;
    windowsBack: boolean;
  },
): Group {
  const g = new Group();
  const L = o.length;
  const W = o.width;
  const P = 2 + o.cabinBoxy * 1.5;
  g.add(
    body(
      [
        { z: L * 0.5, rx: W * (0.28 + 0.1 * o.noseRound), ry: W * (0.3 + 0.1 * o.noseRound), y: -0.05, power: 2 },
        { z: L * 0.3, rx: W * 0.42, ry: W * 0.42, power: P },
        { z: L * 0.12, rx: W * 0.5, ry: W * 0.62, y: 0.12, power: P },
        { z: -L * 0.12, rx: W * 0.48, ry: W * 0.6, y: 0.12, power: P },
        { z: -L * 0.35, rx: W * 0.26, ry: W * 0.34, y: 0.12 },
        { z: -L * 0.5, rx: W * 0.1, ry: W * 0.18, y: 0.18 },
      ],
      m.body,
    ),
  );
  // windscreen and cabin glazing wrap under the high wing
  g.add(
    body(
      [
        { z: L * 0.3, rx: W * 0.4, ry: W * 0.18, y: W * 0.3, power: P },
        { z: L * 0.14, rx: W * 0.51, ry: W * 0.3, y: W * 0.36, power: P },
        { z: o.windowsBack ? -L * 0.18 : -L * 0.05, rx: W * 0.5, ry: W * 0.28, y: W * 0.36, power: P },
        { z: o.windowsBack ? -L * 0.26 : -L * 0.12, rx: W * 0.42, ry: W * 0.12, y: W * 0.4, power: P },
      ],
      m.glass,
    ),
  );
  // high wing sitting on the cabin roof
  const wingY = W * 0.62;
  const wingZ = L * 0.12;
  g.add(wingPair({ root: [0, wingY, wingZ + o.chord * 0.5], span: o.span, rootChord: o.chord, tipChord: o.chord * o.taper, sweep: 0, dihedral: 0.15 + o.tipUp, thickness: 0.13, mid: o.tipUp > 0.2 ? 0.8 : undefined }, m.body));
  if (o.cheatline)
    g.add(
      stripe(
        [
          { z: L * 0.3, rx: W * 0.42, ry: 0 },
          { z: L * 0.12, rx: W * 0.5, ry: 0 },
          { z: -L * 0.12, rx: W * 0.48, ry: 0 },
          { z: -L * 0.35, rx: W * 0.26, ry: 0 },
          { z: -L * 0.46, rx: W * 0.14, ry: 0 },
        ],
        0.02,
        0.16,
        m.accent,
      ),
    );
  if (o.struts) {
    for (const s of [1, -1]) {
      g.add(rod([s * W * 0.45, -0.1, wingZ + 0.4], [s * o.span * 0.55, wingY - 0.05, wingZ + 0.4], 0.045, m.trim));
      g.add(rod([s * W * 0.45, -0.1, wingZ - 0.3], [s * o.span * 0.55, wingY - 0.05, wingZ - 0.3], 0.045, m.trim));
    }
  }
  // tail
  g.add(fin({ base: [0, 0.2, -L * 0.5 + 0.2], span: o.finRound ? 1.15 : 1.35, rootChord: 1.2, tipChord: o.finRound ? 0.75 : 0.5, sweep: -o.finSweep, dihedral: 0, thickness: 0.12 }, o.cheatline ? m.accent : m.body));
  g.add(wingPair({ root: [0, 0.22, -L * 0.5 + 1.0], span: 1.55, rootChord: 0.95, tipChord: 0.6, sweep: -0.15, dihedral: 0, thickness: 0.12 }, m.body));
  // propeller and landing gear
  g.add(propeller(L * 0.5 + 0.08, -0.05, 1.05, 2, m));
  const r = o.wheelRadius;
  const gearY = -W * 0.62 - r * 1.3;
  if (o.taildragger) {
    for (const s of [1, -1]) {
      g.add(rod([s * W * 0.3, -W * 0.45, L * 0.28], [s * W * 0.95, gearY + r * 0.5, L * 0.22], 0.05, m.trim));
      g.add(wheel(s * W * 0.98, gearY + r * 0.4, L * 0.22, r, r * 0.6, m));
    }
    g.add(wheel(0, -W * 0.15 - r, -L * 0.5 + 0.1, r * 0.45, r * 0.3, m));
  } else {
    for (const s of [1, -1]) {
      g.add(rod([s * W * 0.3, -W * 0.5, -L * 0.02], [s * W * 0.95, gearY + r * 0.6, -L * 0.05], 0.05, m.trim));
      g.add(wheel(s * W * 0.98, gearY + r * 0.5, -L * 0.05, r, r * 0.6, m));
    }
    g.add(rod([0, -W * 0.45, L * 0.4], [0, gearY + r * 0.6, L * 0.4], 0.05, m.trim));
    g.add(wheel(0, gearY + r * 0.5, L * 0.4, r * 0.8, r * 0.5, m));
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Fighter jets

function fighter(
  m: Materials,
  o: {
    length: number;
    width: number;
    wingSpan: number;
    rootChord: number;
    tipChord: number;
    sweep: number;
    wingZ: number;
    twinFins: boolean;
    finHeight: number;
    intakes: "nose" | "side" | "chin";
    canards: boolean;
    twinExhaust: boolean;
    canopyLength: number;
    stripe: boolean;
  },
): Group {
  const g = new Group();
  const L = o.length;
  const W = o.width;
  const noseZ = L * 0.5;
  g.add(
    body(
      [
        { z: noseZ, rx: 0.04, ry: 0.04, y: 0.05 },
        { z: noseZ - L * 0.12, rx: W * 0.26, ry: W * 0.28, y: 0.02 },
        { z: noseZ - L * 0.28, rx: W * 0.45, ry: W * 0.5, power: 2.4 },
        { z: -L * 0.05, rx: W * 0.55, ry: W * 0.52, y: -0.05, power: 2.6 },
        { z: -L * 0.35, rx: W * 0.5, ry: W * 0.45, y: -0.05, power: 2.4 },
        { z: -L * 0.5, rx: W * (o.twinExhaust ? 0.45 : 0.3), ry: W * 0.3, y: -0.02, power: 2.4 },
      ],
      m.body,
    ),
  );
  g.add(canopy(noseZ - L * 0.28, W * 0.42, o.canopyLength, W * 0.38, W * 0.42, m));
  if (o.stripe)
    g.add(
      stripe(
        [
          { z: noseZ - L * 0.2, rx: W * 0.36, ry: 0 },
          { z: noseZ - L * 0.28, rx: W * 0.45, ry: 0 },
          { z: -L * 0.05, rx: W * 0.55, ry: 0 },
          { z: -L * 0.35, rx: W * 0.5, ry: 0 },
        ],
        W * 0.08,
        W * 0.22,
        m.accent,
      ),
    );
  // wings
  g.add(wingPair({ root: [W * 0.3, -0.08, o.wingZ], span: o.wingSpan, rootChord: o.rootChord, tipChord: o.tipChord, sweep: -o.sweep, dihedral: -0.05, thickness: 0.07 }, m.body));
  if (o.canards) g.add(wingPair({ root: [W * 0.45, 0.05, noseZ - L * 0.3], span: 1.3, rootChord: 1.1, tipChord: 0.45, sweep: -0.9, dihedral: 0.05, thickness: 0.07 }, m.body));
  // tail surfaces
  if (!o.canards) g.add(wingPair({ root: [W * 0.4, -0.05, -L * 0.36], span: 1.7, rootChord: 1.5, tipChord: 0.6, sweep: -1.2, dihedral: -0.05, thickness: 0.07 }, m.body));
  if (o.twinFins) {
    for (const s of [1, -1]) {
      const f = fin({ base: [s * W * 0.35, W * 0.35, -L * 0.42], span: o.finHeight, rootChord: 1.9, tipChord: 0.7, sweep: -1.3, dihedral: 0, thickness: 0.08 }, m.accent);
      f.rotation.z = -s * 0.28;
      g.add(f);
    }
  } else {
    g.add(fin({ base: [0, W * 0.4, -L * 0.45], span: o.finHeight, rootChord: 2.3, tipChord: 0.7, sweep: -1.6, dihedral: 0, thickness: 0.08 }, m.accent));
  }
  // intakes
  if (o.intakes === "nose") {
    const ring = new Mesh(new TorusGeometry(W * 0.22, 0.05, 8, 24), m.trim);
    place(ring, 0, 0.02, noseZ - L * 0.12);
    g.add(ring);
    // move the cone forward as a radome spike
    g.add(rod([0, 0.02, noseZ - L * 0.12], [0, 0.02, noseZ + 0.6], 0.06, m.metal));
  } else if (o.intakes === "side") {
    for (const s of [1, -1]) {
      const box = body(
        [
          { z: L * 0.1, rx: W * 0.22, ry: W * 0.26, power: 5 },
          { z: -L * 0.18, rx: W * 0.24, ry: W * 0.28, power: 5 },
        ],
        m.body,
      );
      box.position.set(s * W * 0.7, -W * 0.05, 0);
      const mouth = new Mesh(new BoxGeometry(W * 0.4, W * 0.48, 0.08), m.trim);
      mouth.position.set(s * W * 0.7, -W * 0.05, L * 0.1);
      g.add(box, mouth);
    }
  } else {
    const chin = body(
      [
        { z: L * 0.1, rx: W * 0.36, ry: W * 0.22, power: 4 },
        { z: -L * 0.3, rx: W * 0.34, ry: W * 0.2, power: 4 },
      ],
      m.body,
    );
    chin.position.set(0, -W * 0.5, 0);
    const mouth = new Mesh(new BoxGeometry(W * 0.68, W * 0.4, 0.08), m.trim);
    mouth.position.set(0, -W * 0.5, L * 0.1);
    g.add(chin, mouth);
  }
  // exhausts
  const nozzles = o.twinExhaust ? [W * 0.22, -W * 0.22] : [0];
  for (const x of nozzles) {
    const nozzle = new Mesh(new CylinderGeometry(W * (o.twinExhaust ? 0.2 : 0.26), W * (o.twinExhaust ? 0.17 : 0.22), 0.7, 16), m.trim);
    nozzle.rotation.x = Math.PI / 2;
    place(nozzle, x, -0.02, -L * 0.5 - 0.2);
    g.add(nozzle);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Passenger jets

function airliner(
  m: Materials,
  o: {
    length: number;
    radius: number;
    span: number;
    sweep: number;
    winglet: number;
    engineRadius: number;
    windows: number;
    cheatline: boolean;
    tailStripe: boolean;
    finHeight: number;
    ovalWindows: boolean;
  },
): Group {
  const g = new Group();
  const L = o.length;
  const R = o.radius;
  g.add(
    body(
      [
        { z: L * 0.5, rx: R * 0.12, ry: R * 0.1, y: -R * 0.25 },
        { z: L * 0.46, rx: R * 0.55, ry: R * 0.5, y: -R * 0.12 },
        { z: L * 0.38, rx: R * 0.92, ry: R * 0.92, y: -R * 0.02 },
        { z: L * 0.3, rx: R, ry: R },
        { z: -L * 0.2, rx: R, ry: R },
        { z: -L * 0.38, rx: R * 0.7, ry: R * 0.72, y: R * 0.3 },
        { z: -L * 0.5, rx: R * 0.2, ry: R * 0.22, y: R * 0.75 },
      ],
      m.body,
    ),
  );
  // cockpit glazing wraps the upper nose
  g.add(
    body(
      [
        { z: L * 0.445, rx: R * 0.6, ry: R * 0.22, y: R * 0.32 },
        { z: L * 0.42, rx: R * 0.78, ry: R * 0.3, y: R * 0.44 },
        { z: L * 0.39, rx: R * 0.86, ry: R * 0.22, y: R * 0.62 },
      ],
      m.glass,
      16,
    ),
  );
  g.add(windowRow(L * 0.3, -L * 0.3, R * 0.25, R * 0.99, o.windows, m, o.ovalWindows ? R * 0.28 : R * 0.2));
  if (o.cheatline)
    g.add(
      stripe(
        [
          { z: L * 0.44, rx: R * 0.7, ry: 0 },
          { z: L * 0.38, rx: R * 0.92, ry: 0 },
          { z: L * 0.3, rx: R, ry: 0 },
          { z: -L * 0.2, rx: R, ry: 0 },
          { z: -L * 0.38, rx: R * 0.7, ry: 0 },
        ],
        -R * 0.05,
        R * 0.2,
        m.accent,
      ),
    );
  // low wing with dihedral, engines hung below
  const wingZ = L * 0.12;
  g.add(wingPair({ root: [R * 0.6, -R * 0.55, wingZ], span: o.span, rootChord: L * 0.17, tipChord: L * 0.045, sweep: -o.sweep, dihedral: o.span * 0.11, thickness: 0.1, mid: 0.35 }, m.body));
  if (o.winglet > 0) {
    for (const s of [1, -1]) {
      const wl = fin({ base: [s * (R * 0.6 + o.span), -R * 0.55 + o.span * 0.11, wingZ - o.sweep], span: o.winglet, rootChord: L * 0.045, tipChord: L * 0.02, sweep: -o.winglet * 0.6, dihedral: 0, thickness: 0.1 }, m.accent);
      wl.rotation.z = -s * 0.25;
      g.add(wl);
    }
  }
  const engX = R * 0.6 + o.span * 0.36;
  for (const s of [1, -1]) {
    const nz = wingZ - o.sweep * 0.36 + L * 0.02;
    g.add(rod([s * engX, -R * 0.55 + o.span * 0.04, nz], [s * engX, -R * 0.8 - o.engineRadius * 0.4, nz + 0.4], 0.14, m.body));
    g.add(nacelle(s * engX, -R * 0.85 - o.engineRadius * 0.7, nz + 0.6, o.engineRadius * 3.2, o.engineRadius, m));
  }
  // conventional tail
  g.add(fin({ base: [0, R * 0.7, -L * 0.48], span: o.finHeight, rootChord: L * 0.13, tipChord: L * 0.06, sweep: -o.finHeight * 0.75, dihedral: 0, thickness: 0.09 }, o.tailStripe ? m.accent : m.body));
  g.add(wingPair({ root: [R * 0.2, R * 0.7, -L * 0.42], span: o.span * 0.38, rootChord: L * 0.09, tipChord: L * 0.04, sweep: -o.span * 0.2, dihedral: o.span * 0.02, thickness: 0.09 }, m.body));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Biplanes

function biplane(
  m: Materials,
  o: {
    length: number;
    width: number;
    radial: boolean;
    span: number;
    lowerSpan: number;
    chord: number;
    gap: number;
    stagger: number;
    nStruts: boolean;
    wheelRadius: number;
    checker: boolean;
    twoSeat: boolean;
    finRound: boolean;
  },
): Group {
  const g = new Group();
  const L = o.length;
  const W = o.width;
  g.add(
    body(
      [
        { z: L * 0.5, rx: W * (o.radial ? 0.5 : 0.32), ry: W * (o.radial ? 0.5 : 0.36), power: o.radial ? 2 : 3 },
        { z: L * 0.32, rx: W * 0.5, ry: W * 0.5, power: 3 },
        { z: L * 0.05, rx: W * 0.5, ry: W * 0.55, power: 3 },
        { z: -L * 0.2, rx: W * 0.36, ry: W * 0.42, y: 0.05, power: 2.5 },
        { z: -L * 0.5, rx: W * 0.08, ry: W * 0.2, y: 0.1 },
      ],
      m.body,
    ),
  );
  if (o.radial) {
    const cowl = new Mesh(new TorusGeometry(W * 0.4, W * 0.12, 10, 24), m.trim);
    place(cowl, 0, 0, L * 0.5 + 0.02);
    g.add(cowl);
    for (let i = 0; i < 7; i++) {
      const cyl = new Mesh(new CylinderGeometry(0.09, 0.09, W * 0.3, 8), m.metal);
      const a = (i / 7) * Math.PI * 2;
      cyl.position.set(Math.cos(a) * W * 0.3, Math.sin(a) * W * 0.3, L * 0.5 + 0.05);
      cyl.rotation.z = a + Math.PI / 2;
      g.add(cyl);
    }
  } else {
    g.add(place(new Mesh(new BoxGeometry(W * 0.5, W * 0.2, L * 0.22), m.trim), 0, W * 0.5, L * 0.36));
    for (const s of [1, -1]) g.add(rod([s * W * 0.5, W * 0.1, L * 0.45], [s * W * 0.5, W * 0.1, L * 0.15], 0.06, m.trim));
  }
  // open cockpits with small windscreens
  const cockpits = o.twoSeat ? [L * 0.1, -L * 0.1] : [-L * 0.02];
  for (const cz of cockpits) {
    const hole = new Mesh(new CylinderGeometry(W * 0.3, W * 0.3, 0.12, 14), m.rubber);
    place(hole, 0, W * 0.5, cz);
    g.add(hole);
    const screen = new Mesh(new BoxGeometry(W * 0.5, W * 0.28, 0.04), m.glass);
    screen.rotation.x = -0.5;
    place(screen, 0, W * 0.66, cz + W * 0.42);
    g.add(screen);
  }
  // wings
  const upperY = W * 0.5 + o.gap;
  const lowerY = -W * 0.42;
  const upperZ = L * 0.15 + o.stagger + o.chord * 0.5;
  const lowerZ = L * 0.15 + o.chord * 0.5;
  g.add(wingPair({ root: [0, upperY, upperZ], span: o.span, rootChord: o.chord, tipChord: o.chord * 0.9, sweep: 0, dihedral: 0.12, thickness: 0.12 }, o.checker ? m.accent : m.body));
  g.add(wingPair({ root: [W * 0.4, lowerY, lowerZ], span: o.lowerSpan, rootChord: o.chord * 0.95, tipChord: o.chord * 0.85, sweep: 0, dihedral: 0.15, thickness: 0.12 }, m.body));
  if (o.checker) {
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * (o.span / 3);
      g.add(place(new Mesh(new BoxGeometry(o.span / 6, 0.03, o.chord * 0.5), m.trim), x, upperY + o.chord * 0.065, upperZ - o.chord * (i % 2 ? 0.28 : 0.72)));
    }
  }
  // interplane struts and cabane
  for (const s of [1, -1]) {
    const sx = s * o.lowerSpan * 0.62;
    g.add(rod([sx, lowerY + 0.1, lowerZ - o.chord * 0.2], [sx, upperY - 0.05, upperZ - o.chord * 0.2], 0.05, m.trim));
    g.add(rod([sx, lowerY + 0.1, lowerZ - o.chord * 0.75], [sx, upperY - 0.05, upperZ - o.chord * 0.75], 0.05, m.trim));
    if (o.nStruts) g.add(rod([sx, lowerY + 0.1, lowerZ - o.chord * 0.75], [sx, upperY - 0.05, upperZ - o.chord * 0.2], 0.04, m.trim));
    g.add(rod([s * W * 0.35, W * 0.45, L * 0.2], [s * W * 0.35, upperY - 0.05, upperZ - o.chord * 0.25], 0.045, m.trim));
    g.add(rod([s * W * 0.35, W * 0.45, L * 0.05], [s * W * 0.35, upperY - 0.05, upperZ - o.chord * 0.75], 0.045, m.trim));
  }
  // tail
  g.add(fin({ base: [0, 0.15, -L * 0.5 + 0.15], span: 1.05, rootChord: 1.0, tipChord: o.finRound ? 0.7 : 0.45, sweep: -0.25, dihedral: 0, thickness: 0.12 }, m.accent));
  g.add(wingPair({ root: [0, 0.16, -L * 0.5 + 0.85], span: 1.35, rootChord: 0.85, tipChord: 0.55, sweep: -0.1, dihedral: 0, thickness: 0.12 }, m.accent));
  // propeller, wheels, tail skid
  g.add(propeller(L * 0.5 + (o.radial ? 0.28 : 0.1), 0, 1.05, 2, m, 0.22));
  const r = o.wheelRadius;
  for (const s of [1, -1]) {
    g.add(rod([s * W * 0.35, -W * 0.4, L * 0.25], [s * W * 0.85, -W * 0.5 - r * 1.3, L * 0.2], 0.05, m.trim));
    g.add(rod([s * W * 0.35, -W * 0.4, L * 0.05], [s * W * 0.85, -W * 0.5 - r * 1.3, L * 0.2], 0.05, m.trim));
    g.add(wheel(s * W * 0.9, -W * 0.5 - r * 1.3, L * 0.2, r, r * 0.55, m));
  }
  g.add(rod([0, -W * 0.15, -L * 0.45], [0, -W * 0.5, -L * 0.5], 0.04, m.trim));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Gliders

function glider(
  m: Materials,
  o: {
    length: number;
    radius: number;
    span: number;
    chord: number;
    tipChord: number;
    dihedral: number;
    gull: boolean;
    tTail: boolean;
    winglet: number;
    canopyLength: number;
    wingY: number;
    tipColour: boolean;
    stripe: boolean;
  },
): Group {
  const g = new Group();
  const L = o.length;
  const R = o.radius;
  g.add(
    body(
      [
        { z: L * 0.5, rx: R * 0.08, ry: R * 0.08, y: -R * 0.2 },
        { z: L * 0.42, rx: R * 0.55, ry: R * 0.6, y: -R * 0.1 },
        { z: L * 0.3, rx: R, ry: R * 1.1 },
        { z: L * 0.08, rx: R * 0.9, ry: R * 1.05, y: R * 0.05 },
        { z: -L * 0.1, rx: R * 0.4, ry: R * 0.5, y: R * 0.15 },
        { z: -L * 0.5, rx: R * 0.22, ry: R * 0.26, y: R * 0.3 },
      ],
      m.body,
    ),
  );
  g.add(canopy(L * 0.28, R * 0.6, o.canopyLength, R * 0.75, R * 0.85, m));
  if (o.stripe)
    g.add(
      stripe(
        [
          { z: L * 0.08, rx: R * 0.9, ry: 0 },
          { z: -L * 0.1, rx: R * 0.4, ry: 0 },
          { z: -L * 0.45, rx: R * 0.23, ry: 0 },
        ],
        R * 0.12,
        R * 0.16,
        m.accent,
      ),
    );
  // long slender wings
  const wingZ = L * 0.1 + o.chord * 0.5;
  g.add(
    wingPair(
      { root: [R * 0.7, o.wingY, wingZ], span: o.span, rootChord: o.chord, tipChord: o.tipChord, sweep: -o.chord * 0.25, dihedral: o.dihedral, thickness: 0.12, mid: o.gull ? 0.3 : 0.6 },
      m.body,
    ),
  );
  if (o.tipColour) {
    for (const s of [1, -1]) {
      g.add(place(new Mesh(new BoxGeometry(o.span * 0.12, 0.08, o.tipChord * 1.05), m.accent), s * (R * 0.7 + o.span * 0.94), o.wingY + o.dihedral * 0.94, wingZ - o.chord * 0.25 - o.tipChord * 0.5));
    }
  }
  if (o.winglet > 0) {
    for (const s of [1, -1]) {
      g.add(fin({ base: [s * (R * 0.7 + o.span), o.wingY + o.dihedral, wingZ - o.chord * 0.25], span: o.winglet, rootChord: o.tipChord, tipChord: o.tipChord * 0.5, sweep: -o.winglet * 0.5, dihedral: 0, thickness: 0.1 }, m.accent));
    }
  }
  // tail
  const finH = R * 2.8;
  g.add(fin({ base: [0, R * 0.4, -L * 0.5 + 0.05], span: finH, rootChord: L * 0.12, tipChord: L * 0.06, sweep: -L * 0.05, dihedral: 0, thickness: 0.09 }, m.body));
  const stabY = o.tTail ? R * 0.4 + finH : R * 0.45;
  const stabZ = o.tTail ? -L * 0.5 - L * 0.04 + L * 0.06 : -L * 0.5 + 0.35 + L * 0.06;
  g.add(wingPair({ root: [0, stabY, stabZ], span: o.span * 0.2, rootChord: L * 0.06, tipChord: L * 0.035, sweep: -L * 0.01, dihedral: 0, thickness: 0.09 }, m.body));
  // single retracted-look belly wheel bump
  g.add(place(new Mesh(new SphereGeometry(R * 0.35, 10, 8), m.rubber), 0, -R * 1.0, L * 0.05));
  return g;
}

// ---------------------------------------------------------------------------------------------
// The six owner-approved directions (003 research §1), keyed by AircraftTypeId.

const BUILDERS: Record<AircraftTypeId, { paint: Paint; build: (m: Materials) => Group }> = {
  helicopter: {
    paint: { body: 0xf3f4f2, accent: 0x2a4f9a, trim: 0x2b2f36 },
    build: (m) =>
      helicopter(m, { cabinLength: 4.8, cabinWidth: 1.8, cabinHeight: 1.75, boxy: 0.15, boomLength: 4.4, boomRadius: 0.34, boomRise: 0.55, rotorRadius: 5.2, blades: 4, finHeight: 1.45, stabiliser: true, bubble: 0.5, sideWindows: true, lattice: false, fenestron: true, skidWidth: 1.0 }),
  },
  light: {
    paint: { body: 0xf5f3ee, accent: 0xc8312b, trim: 0x2b2f36 },
    build: (m) =>
      lightPlane(m, { length: 7.2, width: 1.35, noseRound: 0.3, cabinBoxy: 0.4, span: 5.3, chord: 1.55, taper: 0.7, struts: true, taildragger: false, finSweep: 0.5, finRound: false, tipUp: 0, wheelRadius: 0.24, cheatline: true, windowsBack: true }),
  },
  fighter: {
    paint: { body: 0xf3f2ee, accent: 0xf26a1b, trim: 0x2b2f36 },
    build: (m) =>
      fighter(m, { length: 13.5, width: 1.5, wingSpan: 3.9, rootChord: 3.6, tipChord: 1.0, sweep: 2.8, wingZ: 0.6, twinFins: false, finHeight: 2.8, intakes: "side", canards: false, twinExhaust: true, canopyLength: 2.4, stripe: true }),
  },
  airliner: {
    paint: { body: 0xf5f5f2, accent: 0x214f9e, trim: 0x2b2f36 },
    build: (m) =>
      airliner(m, { length: 22, radius: 1.35, span: 8.6, sweep: 2.9, winglet: 0.9, engineRadius: 0.75, windows: 14, cheatline: true, tailStripe: true, finHeight: 3.6, ovalWindows: false }),
  },
  biplane: {
    paint: { body: 0xd6d9dc, accent: 0xc8312b, trim: 0x2b2f36 },
    build: (m) =>
      biplane(m, { length: 5.8, width: 1.1, radial: false, span: 4.2, lowerSpan: 4.0, chord: 1.25, gap: 0.9, stagger: 0.35, nStruts: true, wheelRadius: 0.26, checker: false, twoSeat: false, finRound: false }),
  },
  glider: {
    paint: { body: 0xf0e8d8, accent: 0x6b4a2e, trim: 0x2b2f36 },
    build: (m) =>
      glider(m, { length: 7.4, radius: 0.4, span: 7.0, chord: 1.0, tipChord: 0.45, dihedral: 0.8, gull: true, tTail: false, winglet: 0, canopyLength: 2.4, wingY: 0.25, tipColour: false, stripe: true }),
  },
};

// ---------------------------------------------------------------------------------------------
// Normalisation: scale by footprintScale so the scaled aircraft (rotor disc included) has
// dominant axis PLANE_FOOTPRINT; centre on the airframe bounding box with rotor/propeller
// discs excluded so a nose prop or tail rotor never drags the visual centre off the fuselage.

export interface Aircraft {
  readonly type: AircraftTypeId;
  readonly group: Group;
  /** Pivot Object3Ds in AircraftType.spinners order; main.ts writes rotation[axis]. */
  readonly spinners: readonly Object3D[];
}

export function buildAircraft(type: AircraftType): Aircraft {
  const entry = BUILDERS[type.id];
  const inner = entry.build(makeMaterials(entry.paint));
  const discs: Object3D[] = [];
  const named = new Map<string, Object3D>();
  inner.traverse((o) => {
    if (o.userData.rotor) discs.push(o);
    const spinner = o.userData.spinner;
    if (typeof spinner === "string") named.set(spinner, o);
  });
  const parents = discs.map((d) => d.parent as Object3D);
  for (const d of discs) d.removeFromParent();
  const box = new Box3().setFromObject(inner);
  discs.forEach((d, i) => parents[i].add(d));
  const centre = box.getCenter(new Vector3());
  inner.position.sub(centre);
  // Footprint records are nominal (builder arguments, not measured geometry): fins,
  // exhausts and winglets overhang them by up to ~16%. The residual correction makes the
  // scaled whole's dominant axis (rotor disc included) exactly PLANE_FOOTPRINT; the outer
  // group still carries footprintScale.
  const union = new Box3().setFromObject(inner).getSize(new Vector3());
  const nominal = Math.max(type.footprint.length, type.footprint.span);
  inner.scale.setScalar(nominal / Math.max(union.x, union.z));
  const group = new Group();
  group.add(inner);
  group.scale.setScalar(footprintScale(type));
  const spinners = type.spinners.map((s) => {
    const pivot = named.get(s.name);
    if (!pivot) throw new Error(`aircraft ${type.id} is missing spinner pivot "${s.name}"`);
    return pivot;
  });
  return { type: type.id, group, spinners };
}

export function disposeAircraft(a: Aircraft): void {
  a.group.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      const mat = o.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat.dispose();
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Aircraft lights (003 contract): one hemisphere light plus one directional sun, created
// once at boot; applyThemeToLights restages them at each Theme commit/restore, never per
// frame. Phong under two lights is the cheapest believable shading (research §2).

export interface AircraftLights {
  readonly hemi: HemisphereLight;
  readonly sun: DirectionalLight;
}

export function createAircraftLights(): AircraftLights {
  const hemi = new HemisphereLight(0xdbe9f7, 0x5c6b58, 1.05);
  const sun = new DirectionalLight(0xfff3df, 1.7);
  sun.position.set(-55, 75, 35);
  return { hemi, sun };
}

export function applyThemeToLights(lights: AircraftLights, theme: Theme): void {
  lights.hemi.color.setHex(theme.sky.zenith);
  lights.hemi.groundColor.setHex(theme.sky.horizon);
  lights.sun.color.setHex(theme.sky.sunDisc);
  lights.sun.position.set(...theme.sky.sunDirection).multiplyScalar(100);
}
