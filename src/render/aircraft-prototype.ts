// Throwaway visual study for 003: five procedural design directions for each of the six
// Aircraft Types, selected with ?variant=&view=. Geometry is built from lofted rings,
// so no model or texture assets are involved. Aircraft are normalised to one screen footprint.
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  Box3,
  Sphere,
} from "three";
import { CAMERA_LOOK_AHEAD, CAMERA_OFFSET_Y, CAMERA_OFFSET_Z, CAMERA_ROLL_FOLLOW, MAX_PITCH, MAX_ROLL } from "../constants";

export type AircraftTypeId = "helicopter" | "light" | "fighter" | "airliner" | "biplane" | "glider";
export type ViewId = "card" | "level" | "bank" | "detail";

interface Paint {
  body: number;
  accent: number;
  trim: number;
}

interface Design {
  id: string;
  type: AircraftTypeId;
  name: string;
  description: string;
  paint: Paint;
  build: (m: Materials) => Group;
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
  blade: MeshLambertMaterial;
}

function makeMaterials(paint: Paint): Materials {
  const phong = (color: number, shininess: number, specular = 0x444444): MeshPhongMaterial =>
    new MeshPhongMaterial({ color, shininess, specular, side: DoubleSide });
  return {
    body: phong(paint.body, 28),
    accent: phong(paint.accent, 28),
    trim: phong(paint.trim, 20, 0x222222),
    glass: phong(0x18344d, 110, 0xbbccdd),
    metal: phong(0x9aa0a8, 70, 0x888888),
    rubber: new MeshLambertMaterial({ color: 0x1c1d20, side: DoubleSide }),
    blade: new MeshLambertMaterial({ color: 0x2a2c30, side: DoubleSide }),
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
  const mainRotor = rotor(H * 0.5 + 0.6, 0, o.rotorRadius, o.blades, m);
  mainRotor.userData.rotor = true;
  g.add(mainRotor);
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
// Design catalogue: five directions per type. Paint = body / accent / trim.

export const DESIGNS: Design[] = [
  // Helicopters
  { id: "H1", type: "helicopter", name: "Bubble trainer", description: "Full bubble canopy · open lattice boom · two-blade rotor · slim skids", paint: { body: 0xe8552c, accent: 0xf4efe6, trim: 0x2b2f36 },
    build: (m) => helicopter(m, { cabinLength: 3.6, cabinWidth: 1.7, cabinHeight: 1.7, boxy: 0, boomLength: 4.2, boomRadius: 0.16, boomRise: 0.3, rotorRadius: 4.6, blades: 2, finHeight: 0.8, stabiliser: false, bubble: 1, sideWindows: false, lattice: true, fenestron: false, skidWidth: 0.9 }) },
  { id: "H2", type: "helicopter", name: "Utility", description: "Long side-windowed cabin · enclosed boom · four-blade rotor · stabiliser", paint: { body: 0x3f5a3a, accent: 0xd9c9a3, trim: 0x2b2f36 },
    build: (m) => helicopter(m, { cabinLength: 5.2, cabinWidth: 1.9, cabinHeight: 1.9, boxy: 0.5, boomLength: 4.6, boomRadius: 0.36, boomRise: 0.35, rotorRadius: 5.6, blades: 4, finHeight: 1.1, stabiliser: true, bubble: 0.35, sideWindows: true, lattice: false, fenestron: false, skidWidth: 1.05 }) },
  { id: "H3", type: "helicopter", name: "Executive", description: "Teardrop cabin · tapered boom · shrouded tail rotor · white and blue", paint: { body: 0xf3f4f2, accent: 0x2a4f9a, trim: 0x2b2f36 },
    build: (m) => helicopter(m, { cabinLength: 4.8, cabinWidth: 1.8, cabinHeight: 1.75, boxy: 0.15, boomLength: 4.4, boomRadius: 0.34, boomRise: 0.55, rotorRadius: 5.2, blades: 4, finHeight: 1.45, stabiliser: true, bubble: 0.5, sideWindows: true, lattice: false, fenestron: true, skidWidth: 1.0 }) },
  { id: "H4", type: "helicopter", name: "Rescue", description: "Boxy cabin · tall fin · three-blade rotor · red and white livery", paint: { body: 0xc8312b, accent: 0xf6f3ee, trim: 0x2b2f36 },
    build: (m) => helicopter(m, { cabinLength: 5.0, cabinWidth: 2.1, cabinHeight: 2.0, boxy: 0.9, boomLength: 4.3, boomRadius: 0.4, boomRise: 0.4, rotorRadius: 5.4, blades: 3, finHeight: 1.6, stabiliser: true, bubble: 0.4, sideWindows: true, lattice: false, fenestron: false, skidWidth: 1.15 }) },
  { id: "H5", type: "helicopter", name: "Light sport", description: "Compact glazed cabin · short boom · three-blade rotor · yellow and black", paint: { body: 0xf2c531, accent: 0x23252b, trim: 0x2b2f36 },
    build: (m) => helicopter(m, { cabinLength: 3.9, cabinWidth: 1.6, cabinHeight: 1.65, boxy: 0.2, boomLength: 3.6, boomRadius: 0.24, boomRise: 0.25, rotorRadius: 4.4, blades: 3, finHeight: 0.95, stabiliser: false, bubble: 0.75, sideWindows: false, lattice: false, fenestron: false, skidWidth: 0.95 }) },

  // Light planes
  { id: "L1", type: "light", name: "Classic trainer", description: "Strut-braced high wing · tricycle gear · swept fin · white with red cheatline", paint: { body: 0xf5f3ee, accent: 0xc8312b, trim: 0x2b2f36 },
    build: (m) => lightPlane(m, { length: 7.2, width: 1.35, noseRound: 0.3, cabinBoxy: 0.4, span: 5.3, chord: 1.55, taper: 0.7, struts: true, taildragger: false, finSweep: 0.5, finRound: false, tipUp: 0, wheelRadius: 0.24, cheatline: true, windowsBack: true }) },
  { id: "L2", type: "light", name: "Bush taildragger", description: "Tandem cabin · rounded tail · tailwheel · fat tyres · yellow with black lightning trim", paint: { body: 0xf0c02f, accent: 0x23252b, trim: 0x2b2f36 },
    build: (m) => lightPlane(m, { length: 6.8, width: 1.15, noseRound: 0.1, cabinBoxy: 0.7, span: 5.4, chord: 1.6, taper: 0.95, struts: true, taildragger: true, finSweep: 0.1, finRound: true, tipUp: 0, wheelRadius: 0.36, cheatline: false, windowsBack: true }) },
  { id: "L3", type: "light", name: "Touring", description: "Rounded nose · long cabin · tapered wing · blue over white", paint: { body: 0x2b5fae, accent: 0xf4f4f0, trim: 0x2b2f36 },
    build: (m) => lightPlane(m, { length: 7.8, width: 1.45, noseRound: 0.9, cabinBoxy: 0.1, span: 5.4, chord: 1.5, taper: 0.55, struts: false, taildragger: false, finSweep: 0.65, finRound: false, tipUp: 0, wheelRadius: 0.24, cheatline: true, windowsBack: true }) },
  { id: "L4", type: "light", name: "STOL utility", description: "Boxy cabin · constant-chord wing · heavy struts · green and cream", paint: { body: 0x2f6b4f, accent: 0xefe6cf, trim: 0x2b2f36 },
    build: (m) => lightPlane(m, { length: 7.4, width: 1.5, noseRound: 0.2, cabinBoxy: 1, span: 5.6, chord: 1.7, taper: 1, struts: true, taildragger: true, finSweep: 0.2, finRound: false, tipUp: 0, wheelRadius: 0.32, cheatline: false, windowsBack: true }) },
  { id: "L5", type: "light", name: "Modern composite", description: "Smooth pod cabin · upturned wingtips · slim fin · silver with orange", paint: { body: 0xd8dbdf, accent: 0xef7d2a, trim: 0x2b2f36 },
    build: (m) => lightPlane(m, { length: 7.0, width: 1.3, noseRound: 0.8, cabinBoxy: 0, span: 5.5, chord: 1.4, taper: 0.6, struts: false, taildragger: false, finSweep: 0.7, finRound: false, tipUp: 0.5, wheelRadius: 0.22, cheatline: true, windowsBack: false }) },

  // Fighter jets
  { id: "F1", type: "fighter", name: "Delta", description: "Single fin · pure delta wing · chin intake · air-superiority grey", paint: { body: 0x8b939c, accent: 0x6d757e, trim: 0x2b2f36 },
    build: (m) => fighter(m, { length: 12.5, width: 1.6, wingSpan: 4.0, rootChord: 6.5, tipChord: 0.8, sweep: 5.2, wingZ: 2.6, twinFins: false, finHeight: 2.4, intakes: "chin", canards: false, twinExhaust: false, canopyLength: 2.6, stripe: false }) },
  { id: "F2", type: "fighter", name: "Twin-tail", description: "Twin canted fins · side intakes · twin exhausts · dark grey with blue", paint: { body: 0x4a5561, accent: 0x2f6fb5, trim: 0x2b2f36 },
    build: (m) => fighter(m, { length: 12.0, width: 1.7, wingSpan: 4.3, rootChord: 4.6, tipChord: 1.2, sweep: 3.0, wingZ: 1.6, twinFins: true, finHeight: 2.2, intakes: "side", canards: false, twinExhaust: true, canopyLength: 2.8, stripe: false }) },
  { id: "F3", type: "fighter", name: "Classic swept", description: "Nose intake · mid swept wing · tall fin · bare metal with red flash", paint: { body: 0xb9bec4, accent: 0xc8312b, trim: 0x2b2f36 },
    build: (m) => fighter(m, { length: 11.0, width: 1.5, wingSpan: 4.2, rootChord: 3.4, tipChord: 1.4, sweep: 2.2, wingZ: 1.4, twinFins: false, finHeight: 2.5, intakes: "nose", canards: false, twinExhaust: false, canopyLength: 2.2, stripe: true }) },
  { id: "F4", type: "fighter", name: "Canard delta", description: "Canards ahead of a delta · single fin · side intakes · woodland camouflage green", paint: { body: 0x5b6b4a, accent: 0x3d4a35, trim: 0x2b2f36 },
    build: (m) => fighter(m, { length: 12.0, width: 1.6, wingSpan: 4.1, rootChord: 5.6, tipChord: 0.9, sweep: 4.4, wingZ: 1.4, twinFins: false, finHeight: 2.3, intakes: "side", canards: true, twinExhaust: false, canopyLength: 2.4, stripe: false }) },
  { id: "F5", type: "fighter", name: "Interceptor", description: "Long nose · thin swept wings · tall fin · white with day-glo orange", paint: { body: 0xf3f2ee, accent: 0xf26a1b, trim: 0x2b2f36 },
    build: (m) => fighter(m, { length: 13.5, width: 1.5, wingSpan: 3.9, rootChord: 3.6, tipChord: 1.0, sweep: 2.8, wingZ: 0.6, twinFins: false, finHeight: 2.8, intakes: "side", canards: false, twinExhaust: true, canopyLength: 2.4, stripe: true }) },

  // Passenger jets
  { id: "P1", type: "airliner", name: "Narrow-body", description: "Classic twin-jet · small winglets · white with blue cheatline and tail", paint: { body: 0xf5f5f2, accent: 0x214f9e, trim: 0x2b2f36 },
    build: (m) => airliner(m, { length: 22, radius: 1.35, span: 8.6, sweep: 2.9, winglet: 0.9, engineRadius: 0.75, windows: 14, cheatline: true, tailStripe: true, finHeight: 3.6, ovalWindows: false }) },
  { id: "P2", type: "airliner", name: "Regional", description: "Short slim fuselage · straight-ish wing · small engines · red livery", paint: { body: 0xc8312b, accent: 0xf3f0ea, trim: 0x2b2f36 },
    build: (m) => airliner(m, { length: 17, radius: 1.05, span: 7.6, sweep: 1.8, winglet: 0.5, engineRadius: 0.55, windows: 11, cheatline: false, tailStripe: true, finHeight: 3.1, ovalWindows: false }) },
  { id: "P3", type: "airliner", name: "Wide-body", description: "Fat fuselage · big fans · long raked wings · white with teal tail", paint: { body: 0xf6f6f3, accent: 0x1f8a80, trim: 0x2b2f36 },
    build: (m) => airliner(m, { length: 26, radius: 1.9, span: 11.5, sweep: 4.4, winglet: 0.6, engineRadius: 1.15, windows: 16, cheatline: false, tailStripe: true, finHeight: 4.4, ovalWindows: false }) },
  { id: "P4", type: "airliner", name: "Retro", description: "Oval windows · bold cheatline · modest sweep · polished silver and red", paint: { body: 0xc9ced3, accent: 0xb8262c, trim: 0x2b2f36 },
    build: (m) => airliner(m, { length: 20, radius: 1.3, span: 8.2, sweep: 2.2, winglet: 0, engineRadius: 0.62, windows: 12, cheatline: true, tailStripe: false, finHeight: 3.4, ovalWindows: true }) },
  { id: "P5", type: "airliner", name: "Modern", description: "Tall blended winglets · large chevron nacelles · white with green", paint: { body: 0xf4f6f4, accent: 0x3f9d47, trim: 0x2b2f36 },
    build: (m) => airliner(m, { length: 23, radius: 1.4, span: 9.4, sweep: 3.4, winglet: 1.6, engineRadius: 0.9, windows: 14, cheatline: false, tailStripe: true, finHeight: 3.7, ovalWindows: false }) },

  // Biplanes
  { id: "B1", type: "biplane", name: "Radial trainer", description: "Round radial cowl · two open cockpits · equal wings · yellow and blue", paint: { body: 0x2a4a8c, accent: 0xf2c531, trim: 0x2b2f36 },
    build: (m) => biplane(m, { length: 6.6, width: 1.2, radial: true, span: 4.6, lowerSpan: 4.1, chord: 1.35, gap: 1.05, stagger: 0.3, nStruts: true, wheelRadius: 0.3, checker: false, twoSeat: true, finRound: true }) },
  { id: "B2", type: "biplane", name: "Barnstormer", description: "Small lower wing · single cockpit · red with white checker upper wing", paint: { body: 0xc8312b, accent: 0xf6f3ee, trim: 0x2b2f36 },
    build: (m) => biplane(m, { length: 6.2, width: 1.15, radial: true, span: 4.9, lowerSpan: 3.4, chord: 1.3, gap: 1.0, stagger: 0.45, nStruts: false, wheelRadius: 0.28, checker: true, twoSeat: false, finRound: true }) },
  { id: "B3", type: "biplane", name: "Wartime scout", description: "Inline engine · flat nose · staggered wings · olive drab", paint: { body: 0x6b6d45, accent: 0x8a8c60, trim: 0x2b2f36 },
    build: (m) => biplane(m, { length: 6.4, width: 1.05, radial: false, span: 4.5, lowerSpan: 4.3, chord: 1.4, gap: 1.1, stagger: 0.6, nStruts: false, wheelRadius: 0.3, checker: false, twoSeat: false, finRound: false }) },
  { id: "B4", type: "biplane", name: "Sport", description: "Compact body · N struts · tight gap · silver with red tail", paint: { body: 0xd6d9dc, accent: 0xc8312b, trim: 0x2b2f36 },
    build: (m) => biplane(m, { length: 5.8, width: 1.1, radial: false, span: 4.2, lowerSpan: 4.0, chord: 1.25, gap: 0.9, stagger: 0.35, nStruts: true, wheelRadius: 0.26, checker: false, twoSeat: false, finRound: false }) },
  { id: "B5", type: "biplane", name: "Racer", description: "Narrow chord · wide gap · single seat · black and gold", paint: { body: 0x1e1f24, accent: 0xd8a63a, trim: 0x2b2f36 },
    build: (m) => biplane(m, { length: 6.0, width: 1.0, radial: true, span: 4.4, lowerSpan: 4.0, chord: 1.05, gap: 1.2, stagger: 0.5, nStruts: false, wheelRadius: 0.24, checker: false, twoSeat: false, finRound: false }) },

  // Gliders
  { id: "G1", type: "glider", name: "Standard class", description: "T-tail · slim pod · long straight wings · white with red tips", paint: { body: 0xf7f7f5, accent: 0xd62d2d, trim: 0x2b2f36 },
    build: (m) => glider(m, { length: 7.0, radius: 0.36, span: 7.6, chord: 0.85, tipChord: 0.42, dihedral: 0.35, gull: false, tTail: true, winglet: 0, canopyLength: 2.1, wingY: 0.05, tipColour: true, stripe: false }) },
  { id: "G2", type: "glider", name: "Vintage", description: "Gull wings · conventional tail · long canopy · cream and walnut brown", paint: { body: 0xf0e8d8, accent: 0x6b4a2e, trim: 0x2b2f36 },
    build: (m) => glider(m, { length: 7.4, radius: 0.4, span: 7.0, chord: 1.0, tipChord: 0.45, dihedral: 0.8, gull: true, tTail: false, winglet: 0, canopyLength: 2.4, wingY: 0.25, tipColour: false, stripe: true }) },
  { id: "G3", type: "glider", name: "Open class", description: "Very long tapered wings · winglets · T-tail · white with blue", paint: { body: 0xf7f8fa, accent: 0x2b6fc4, trim: 0x2b2f36 },
    build: (m) => glider(m, { length: 7.6, radius: 0.36, span: 9.2, chord: 0.8, tipChord: 0.32, dihedral: 0.5, gull: false, tTail: true, winglet: 0.5, canopyLength: 2.2, wingY: 0.05, tipColour: false, stripe: true }) },
  { id: "G4", type: "glider", name: "Two-seat trainer", description: "Longer two-place canopy · mid wing · T-tail · white with yellow", paint: { body: 0xf6f5f0, accent: 0xf1c232, trim: 0x2b2f36 },
    build: (m) => glider(m, { length: 8.0, radius: 0.42, span: 7.8, chord: 0.95, tipChord: 0.5, dihedral: 0.3, gull: false, tTail: true, winglet: 0, canopyLength: 3.0, wingY: 0.15, tipColour: true, stripe: true }) },
  { id: "G5", type: "glider", name: "Club", description: "Low tail · high wing · rounded tips · light grey with orange", paint: { body: 0xdfe2e4, accent: 0xf07f2a, trim: 0x2b2f36 },
    build: (m) => glider(m, { length: 6.8, radius: 0.38, span: 7.2, chord: 0.9, tipChord: 0.55, dihedral: 0.25, gull: false, tTail: false, winglet: 0, canopyLength: 2.0, wingY: 0.3, tipColour: true, stripe: false }) },
];

export const TYPE_LABELS: Record<AircraftTypeId, string> = {
  helicopter: "Helicopter",
  light: "Light Plane",
  fighter: "Fighter Jet",
  airliner: "Passenger Jet",
  biplane: "Biplane",
  glider: "Glider",
};

// ---------------------------------------------------------------------------------------------
// Normalisation: every aircraft is scaled so its largest span or length equals FOOTPRINT
// metres, then centred on its bounding box. The current box plane has an 8 m wingspan.

const FOOTPRINT = 9;
const MAX_ROTOR_DIAMETER = 9.6;

export function buildDesign(design: Design): Group {
  const materials = makeMaterials(design.paint);
  const inner = design.build(materials);
  // the rotor disc may exceed the shared footprint slightly; the airframe sets the scale
  const rotors: Object3D[] = [];
  inner.traverse((o) => {
    if (o.userData.rotor) rotors.push(o);
  });
  const parents = rotors.map((r) => r.parent!);
  rotors.forEach((r) => r.removeFromParent());
  const box = new Box3().setFromObject(inner);
  rotors.forEach((r, i) => parents[i].add(r));
  const size = box.getSize(new Vector3());
  let scale = FOOTPRINT / Math.max(size.x, size.z);
  if (rotors.length) {
    const rotorBox = new Box3().setFromObject(rotors[0]);
    const diameter = rotorBox.getSize(new Vector3()).x;
    scale = Math.min(scale, MAX_ROTOR_DIAMETER / diameter);
  }
  const centre = box.getCenter(new Vector3());
  inner.position.sub(centre);
  const outer = new Group();
  outer.add(inner);
  outer.scale.setScalar(scale);
  return outer;
}

// ---------------------------------------------------------------------------------------------
// Scene, views, and the page/capture hook.

const canvas = document.querySelector<HTMLCanvasElement>("#aircraft");
if (!canvas) throw new Error("Prototype canvas is required");
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = NoToneMapping;
const scene = new Scene();
const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 6000);
scene.add(camera);
scene.add(new HemisphereLight(0xdbe9f7, 0x5c6b58, 1.05));
const sun = new DirectionalLight(0xfff3df, 1.7);
sun.position.set(-0.55, 0.75, 0.35).multiplyScalar(100);
scene.add(sun);
const fill = new DirectionalLight(0xbfd4ee, 0.35);
fill.position.set(0.6, -0.2, -0.7).multiplyScalar(100);
scene.add(fill);

// Ground reference for chase views: a wide slab of Nature-like greens under fog.
const ground = new Mesh(new PlaneGeometry(6000, 6000, 1, 1), new MeshLambertMaterial({ color: 0x5f7d4c }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -90;
scene.add(ground);
const skyHorizon = new Color(0xdfece9);

let current: Group | null = null;
let currentId = "";

function disposeGroup(group: Group): void {
  group.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      const mat = o.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat.dispose();
    }
  });
}

function show(id: string): Design {
  const design = DESIGNS.find((d) => d.id === id) ?? DESIGNS[5];
  if (currentId !== design.id) {
    if (current) {
      scene.remove(current);
      disposeGroup(current);
    }
    current = buildDesign(design);
    scene.add(current);
    currentId = design.id;
  }
  return design;
}

const tmpQ = new Quaternion();
const tmpV = new Vector3();
const roll = new Quaternion();

export function render(id: string, view: ViewId, width: number, height: number): void {
  const design = show(id);
  const aircraft = current!;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  ground.visible = view !== "card";
  scene.fog = view === "card" ? null : new Fog(skyHorizon, 300, 2500);
  camera.up.set(0, 1, 0);
  aircraft.position.set(0, 0, 0);
  aircraft.quaternion.identity();
  aircraft.scale.setScalar(1);
  if (view === "card") {
    camera.fov = 30;
    const radius = new Box3().setFromObject(aircraft).getBoundingSphere(new Sphere()).radius;
    const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 0.92;
    camera.position.set(-0.6, 0.34, 0.72).normalize().multiplyScalar(distance);
    camera.lookAt(0, 0.1, 0.2);
  } else if (view === "detail") {
    camera.fov = 45;
    camera.position.set(-7.5, 4.5, -12);
    camera.lookAt(0, 0.2, 0.5);
  } else {
    // chase views reproduce the current in-app footprint: the 8 m box plane at scale 0.64
    aircraft.scale.setScalar((8 * 0.64) / FOOTPRINT);
    camera.fov = 60;
    const rollAngle = view === "bank" ? -MAX_ROLL : 0;
    const pitchAngle = view === "bank" ? MAX_PITCH * 0.5 : 0;
    tmpQ.setFromAxisAngle(tmpV.set(1, 0, 0), -pitchAngle);
    roll.setFromAxisAngle(tmpV.set(0, 0, 1), rollAngle);
    aircraft.quaternion.copy(tmpQ).multiply(roll);
    camera.position.set(0, CAMERA_OFFSET_Y, CAMERA_OFFSET_Z).applyQuaternion(aircraft.quaternion);
    tmpV.set(0, 0, 1).applyQuaternion(tmpQ).multiplyScalar(CAMERA_LOOK_AHEAD);
    const viewDir = tmpV.clone().sub(camera.position).normalize();
    const up = new Vector3(0, 1, 0).applyAxisAngle(viewDir, rollAngle * CAMERA_ROLL_FOLLOW);
    camera.up.copy(up);
    camera.lookAt(tmpV);
  }
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  document.documentElement.dataset.ready = `${design.id}:${view}`;
  document.querySelector("#title")?.replaceChildren(`${design.id} · ${TYPE_LABELS[design.type]} · ${design.name}`);
  document.querySelector("#description")?.replaceChildren(design.description);
}

const params = new URLSearchParams(location.search);
const initialId = params.get("variant") ?? "L1";
const initialView = (params.get("view") as ViewId | null) ?? "card";
document.body.classList.toggle("capture", params.has("capture"));

function fit(): void {
  render(currentId || initialId, currentView, innerWidth, innerHeight);
}
let currentView: ViewId = initialView;
window.addEventListener("resize", fit);

// Capture hook: returns a PNG data URL for one design/view at an exact size.
(globalThis as { __shot?: (id: string, view: ViewId, w: number, h: number) => string }).__shot = (id, view, w, h) => {
  render(id, view, w, h);
  return canvas.toDataURL("image/png");
};
(globalThis as { __designs?: () => { id: string; type: AircraftTypeId; name: string; description: string }[] }).__designs = () =>
  DESIGNS.map(({ id, type, name, description }) => ({ id, type, name, description }));

const select = document.querySelector<HTMLSelectElement>("#variant");
const viewSelect = document.querySelector<HTMLSelectElement>("#view");
if (select && viewSelect) {
  for (const d of DESIGNS) {
    const option = document.createElement("option");
    option.value = d.id;
    option.textContent = `${d.id} · ${TYPE_LABELS[d.type]} · ${d.name}`;
    select.append(option);
  }
  select.value = initialId;
  viewSelect.value = initialView;
  select.addEventListener("change", () => {
    currentId = "";
    render(select.value, currentView, innerWidth, innerHeight);
  });
  viewSelect.addEventListener("change", () => {
    currentView = viewSelect.value as ViewId;
    fit();
  });
}
render(initialId, initialView, innerWidth, innerHeight);
