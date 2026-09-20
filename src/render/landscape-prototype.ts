// Throwaway visual study: three Nature and three Arctic directions, ?variant=N1…A3.
import {
  Color, DoubleSide, Matrix4, Mesh, NoToneMapping, PerspectiveCamera,
  PlaneGeometry, Scene, ShaderMaterial, Uniform, Vector3, WebGLRenderer,
} from "three";
import { fbm } from "../sim/noise";
import { createPlaneMesh } from "./plane";

interface Direction {
  id: string;
  name: string;
  description: string;
  arctic: boolean;
  amplitude: number;
  frequency: number;
  ridge: number;
  valley: number;
  flatness: number;
  snow: number;
  rock: number;
  greens: readonly [number, number];
  stone: number;
  snowColor: number;
  water: readonly [number, number];
  sky: readonly [number, number];
  fog: number;
  sun: readonly [number, number, number];
}

const directions: Direction[] = [
  {
    id: "N1", name: "Alpine Lakes", description: "Green foothills · granite ridges · turquoise lakes",
    arctic: false, amplitude: 1550, frequency: 0.0007, ridge: 0.32, valley: 780, flatness: 1.5,
    snow: 750, rock: 510, greens: [0x63834e, 0x214e40], stone: 0x929994,
    snowColor: 0xf0f4ed, water: [0x67b3b6, 0x267f99], sky: [0x72b2dc, 0xd8e9e9],
    fog: 0.00013, sun: [-0.6, 0.8, 0.25],
  },
  {
    id: "N2", name: "Emerald Highlands", description: "Soft green uplands · forest bands · deep blue lakes",
    arctic: false, amplitude: 1170, frequency: 0.00055, ridge: 0.05, valley: 1090, flatness: 0.95,
    snow: 750, rock: 590, greens: [0x92a769, 0x345e40], stone: 0x949b8c,
    snowColor: 0xf1f1e5, water: [0x71a9b7, 0x356d87], sky: [0x8bbddd, 0xe0e9da],
    fog: 0.00017, sun: [-0.6, 0.88, 0.25],
  },
  {
    id: "N3", name: "Limestone Range", description: "Pale rock faces · alpine meadows · sapphire lakes",
    arctic: false, amplitude: 1440, frequency: 0.00086, ridge: 0.45, valley: 880, flatness: 1.4,
    snow: 860, rock: 410, greens: [0x889256, 0x3a6146], stone: 0xc5beb0,
    snowColor: 0xf5f4ed, water: [0x63b6b9, 0x246887], sky: [0x7fb9db, 0xe5ede8],
    fog: 0.0001, sun: [-0.7, 0.7, 0.4],
  },
  {
    id: "A1", name: "Glacier Basin", description: "Broad glacial valleys · blue shadows · milky frozen lakes",
    arctic: true, amplitude: 1380, frequency: 0.00065, ridge: 0.2, valley: 1050, flatness: 2.4,
    snow: 140, rock: 680, greens: [0xd8e7ec, 0xb9d7e3], stone: 0x718693,
    snowColor: 0xf3f7f8, water: [0xb7e4eb, 0x7fbaca], sky: [0x8eb8d5, 0xe2edf0],
    fog: 0.00014, sun: [-0.6, 0.55, 0.25],
  },
  {
    id: "A2", name: "Icefield Ridges", description: "Sculpted snow ridges · exposed stone · saturated blue ice",
    arctic: true, amplitude: 1800, frequency: 0.00095, ridge: 0.7, valley: 800, flatness: 2.0,
    snow: 180, rock: 560, greens: [0xb3d5e6, 0x9dc2d8], stone: 0x566d84,
    snowColor: 0xf1f6fb, water: [0x95d4e2, 0x4599b6], sky: [0x669aca, 0xc9e0ec],
    fog: 0.00011, sun: [-0.8, 0.46, 0.3],
  },
  {
    id: "A3", name: "Polar Inlets", description: "Wide frozen basins · low snowy massifs · quiet polar daylight",
    arctic: true, amplitude: 1150, frequency: 0.0005, ridge: 0.38, valley: 1510, flatness: 3.2,
    snow: 240, rock: 440, greens: [0xd8e0e2, 0xc2d3dc], stone: 0x74828b,
    snowColor: 0xf1f2ed, water: [0xd5e8e8, 0xa6c8d3], sky: [0xa6bdcd, 0xe7edeb],
    fog: 0.00015, sun: [-0.6, 0.65, 0.5],
  },
];

const seed = 42;
const params = new URLSearchParams(location.search);
let selected = Math.max(0, directions.findIndex(direction => direction.id === params.get("variant")));
let overview = params.get("view") === "overview";
document.body.classList.toggle("capture", params.has("capture"));
const canvas = document.querySelector<HTMLCanvasElement>("#landscape");
const select = document.querySelector<HTMLSelectElement>("#variant");
if (!canvas || !select) throw new Error("Prototype canvas and controls are required");
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = NoToneMapping;
const scene = new Scene();
const camera = new PerspectiveCamera(54, 16 / 9, 1, 24000);
const plane = createPlaneMesh();
plane.position.set(0, -10, -55);
plane.scale.setScalar(0.64);
plane.rotation.z = -0.06;
camera.add(plane);
scene.add(camera);

const skyUniforms = {
  inverse: new Uniform(new Matrix4()),
  cameraPositionWorld: new Uniform(new Vector3()),
  zenith: new Uniform(new Color()),
  horizon: new Uniform(new Color()),
  sun: new Uniform(new Vector3()),
};
const sky = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
  uniforms: skyUniforms,
  depthWrite: false, depthTest: false,
  vertexShader: `
    uniform mat4 inverse;
    uniform vec3 cameraPositionWorld;
    varying vec3 ray;
    void main() {
      vec4 p = inverse * vec4(position.xy, 0.9999, 1.0);
      ray = p.xyz / p.w - cameraPositionWorld;
      gl_Position = vec4(position.xy, 0.9999, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 zenith, horizon, sun;
    varying vec3 ray;
    void main() {
      vec3 dir = normalize(ray);
      vec3 color = mix(horizon, zenith, smoothstep(-0.04, 0.65, dir.y));
      color += vec3(0.22, 0.23, 0.2) * pow(max(dot(dir, sun), 0.0), 36.0);
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
    }`,
}));
sky.renderOrder = -1;
sky.frustumCulled = false;
scene.add(sky);

const terrainGeometry = new PlaneGeometry(15000, 17000, 400, 440);
terrainGeometry.rotateX(-Math.PI / 2);
terrainGeometry.translate(0, 0, -4300);
const uniforms = {
  low: new Uniform(new Color()),
  forest: new Uniform(new Color()),
  stone: new Uniform(new Color()),
  snowColor: new Uniform(new Color()),
  horizon: new Uniform(new Color()),
  sun: new Uniform(new Vector3()),
  snowLine: new Uniform(0),
  rockLine: new Uniform(0),
  arctic: new Uniform(0),
  fog: new Uniform(0),
};
const worldVertex = `
  varying vec3 worldPosition, worldNormal;
  void main() {
    worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    worldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
  }`;
const terrain = new Mesh(terrainGeometry, new ShaderMaterial({
  uniforms,
  vertexShader: worldVertex,
  fragmentShader: `
    uniform vec3 low, forest, stone, snowColor, horizon, sun;
    uniform float snowLine, rockLine, arctic, fog;
    varying vec3 worldPosition, worldNormal;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec3 n = normalize(worldNormal);
      float h = worldPosition.y;
      float speckle = hash(floor(worldPosition.xz / 12.0));
      float forestBand = smoothstep(40.0, 140.0, h) * (1.0 - smoothstep(rockLine - 140.0, rockLine, h));
      vec3 color = mix(low, forest, forestBand * (0.72 + speckle * 0.28) * (1.0 - arctic));
      float cliff = 1.0 - smoothstep(0.57, 0.85, n.y);
      float rockBand = smoothstep(rockLine - 100.0, rockLine + 100.0, h);
      color = mix(color, stone, max(cliff, rockBand) * (1.0 - arctic * 0.82));
      float snow = smoothstep(snowLine - 65.0, snowLine + 90.0, h + (speckle - 0.5) * 22.0);
      color = mix(color, snowColor, snow * smoothstep(0.48, 0.82, n.y));
      color = mix(color, stone, cliff * arctic * 0.72);
      color *= 0.97 + 0.03 * speckle;
      float light = max(dot(n, sun), 0.0);
      color *= mix(vec3(0.51, 0.65, 0.81), vec3(1.08, 1.07, 1.01), light);
      float distanceFog = 1.0 - exp(-pow(length(worldPosition - cameraPosition) * fog, 1.6));
      color = mix(color, horizon, distanceFog);
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
    }`,
}));
scene.add(terrain);
const waterUniforms = {
  nearColor: new Uniform(new Color()),
  deepColor: new Uniform(new Color()),
  horizon: uniforms.horizon, sun: uniforms.sun, fog: uniforms.fog, arctic: uniforms.arctic,
};
const surfaceGeometry = new PlaneGeometry(15000, 17000);
surfaceGeometry.rotateX(-Math.PI / 2);
surfaceGeometry.translate(0, 28, -4300);
const water = new Mesh(surfaceGeometry, new ShaderMaterial({
  uniforms: waterUniforms,
  side: DoubleSide,
  vertexShader: worldVertex,
  fragmentShader: `
    uniform vec3 nearColor, deepColor, horizon, sun;
    uniform float fog, arctic;
    varying vec3 worldPosition, worldNormal;
    vec2 hash2(vec2 p) {
      return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
    }
    float iceEdge(vec2 p) {
      vec2 cell = floor(p);
      vec2 local = fract(p);
      float first = 10.0;
      float second = 10.0;
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 offset = vec2(float(x), float(y));
          float d = length(offset + hash2(cell + offset) - local);
          if (d < first) { second = first; first = d; }
          else { second = min(second, d); }
        }
      }
      return 1.0 - smoothstep(0.002, 0.018, second - first);
    }
    void main() {
      vec3 v = normalize(cameraPosition - worldPosition);
      float ripple = sin(worldPosition.x * 0.026 + sin(worldPosition.z * 0.018))
        * sin(worldPosition.z * 0.055) * 0.015 * (1.0 - arctic);
      vec3 color = mix(deepColor, nearColor, 0.35 + 0.14 * sin(worldPosition.z * 0.0015) + ripple);
      float frost = sin(worldPosition.x * 0.013 + worldPosition.z * 0.003)
        * sin(worldPosition.z * 0.007);
      color += frost * 0.02 * arctic;
      if (arctic > 0.5) {
        color = mix(color, nearColor * 0.75, iceEdge(worldPosition.xz / 230.0) * 0.42);
      }
      float fresnel = pow(1.0 - max(v.y, 0.0), 4.0);
      color = mix(color, horizon, fresnel * 0.4);
      color += pow(max(dot(normalize(v + sun), vec3(0.0, 1.0, 0.0)), 0.0), 110.0) * 0.3;
      float f = 1.0 - exp(-pow(length(worldPosition - cameraPosition) * fog, 1.6));
      gl_FragColor = vec4(mix(color, horizon, f), 1.0);
      #include <colorspace_fragment>
    }`,
}));
scene.add(water);

function height(x: number, z: number, direction: Direction): number {
  const bend = Math.sin(z * 0.00055) * 330 + Math.sin(z * 0.00023 + 2) * 260;
  const width = direction.valley * (1.0 + 0.22 * Math.sin(z * 0.00073));
  const distance = Math.abs(x - bend) / width;
  const valley = Math.pow(Math.min(1, Math.max(0, (distance - 0.16) / 1.8)), direction.flatness);
  const n = fbm(x * direction.frequency, z * direction.frequency, seed, 5, 2, 0.46);
  const ridge = 1 - Math.abs(n * 2 - 1);
  const shape = n * n * 1.6 * (1 - direction.ridge) + Math.pow(ridge, 3) * direction.ridge;
  const distantMassif = Math.max(0, Math.min(1, (-z - 2400) / 5500)) * 480;
  const detail = (fbm(x * 0.006, z * 0.006, seed + 500, 3, 2, 0.5) - 0.5) * 90;
  return -42 + valley * (120 + shape * direction.amplitude + distantMassif + detail);
}

function render(): void {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.position.set(overview ? 2500 : 0, overview ? 2200 : 490, overview ? 2400 : 1350);
  camera.lookAt(0, overview ? 130 : 260, -2600);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  plane.visible = !overview;
  skyUniforms.inverse.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
  skyUniforms.cameraPositionWorld.value.copy(camera.position);
  renderer.render(scene, camera);
  document.documentElement.dataset.ready = directions[selected].id;
}

function show(): void {
  const direction = directions[selected];
  document.documentElement.dataset.ready = "";
  const positions = terrainGeometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, height(positions.getX(i), positions.getZ(i), direction));
  }
  positions.needsUpdate = true;
  terrainGeometry.computeVertexNormals();
  terrainGeometry.computeBoundingSphere();
  uniforms.low.value.setHex(direction.greens[0]);
  uniforms.forest.value.setHex(direction.greens[1]);
  uniforms.stone.value.setHex(direction.stone);
  uniforms.snowColor.value.setHex(direction.snowColor);
  uniforms.horizon.value.setHex(direction.sky[1]);
  uniforms.sun.value.set(...direction.sun).normalize();
  uniforms.snowLine.value = direction.snow;
  uniforms.rockLine.value = direction.rock;
  uniforms.arctic.value = Number(direction.arctic);
  uniforms.fog.value = direction.fog;
  skyUniforms.zenith.value.setHex(direction.sky[0]);
  skyUniforms.horizon.value.setHex(direction.sky[1]);
  skyUniforms.sun.value.copy(uniforms.sun.value);
  waterUniforms.nearColor.value.setHex(direction.water[0]);
  waterUniforms.deepColor.value.setHex(direction.water[1]);
  document.querySelector("#title")?.replaceChildren(`${direction.id} / ${direction.name}`);
  document.querySelector("#description")?.replaceChildren(direction.description);
  document.querySelector("#view")?.replaceChildren(overview ? "Flight view" : "Overview");
  if (select) select.value = direction.id;
  const url = new URL(location.href);
  url.searchParams.set("variant", direction.id);
  url.searchParams.set("view", overview ? "overview" : "flight");
  history.replaceState(null, "", url);
  console.info("Landscape prototype", { seed, view: overview ? "overview" : "flight", ...direction });
  render();
}

for (const direction of directions) {
  const option = document.createElement("option");
  option.value = direction.id;
  option.textContent = `${direction.id} · ${direction.name}`;
  select.append(option);
}
select.addEventListener("change", () => {
  selected = directions.findIndex(direction => direction.id === select.value);
  show();
});
function cycle(delta: number): void {
  selected = (selected + delta + directions.length) % directions.length;
  show();
}
document.querySelector("#previous")?.addEventListener("click", () => cycle(-1));
document.querySelector("#next")?.addEventListener("click", () => cycle(1));
document.querySelector("#view")?.addEventListener("click", () => {
  overview = !overview;
  show();
});
window.addEventListener("keydown", event => {
  if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable]")) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    cycle(event.key === "ArrowLeft" ? -1 : 1);
  }
});
window.addEventListener("resize", render);
show();
