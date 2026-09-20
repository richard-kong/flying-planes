// Pastel Dawn sky (FR-022a, FR-022g): a full-screen quad drawn first, no depth interaction,
// plus the shared skyGradient() GLSL string the terrain shader includes so fog resolves to
// the same horizon colour (R4).
import {
  Matrix4,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  ShaderMaterial,
  Uniform,
  Vector3,
} from "three";
import {
  COLOR_SKY_HORIZON,
  COLOR_SKY_MID,
  COLOR_SKY_ZENITH,
  COLOR_SUN_DISC,
  COLOR_SUN_HALO,
  SUN_DIR_X,
  SUN_DIR_Y,
  SUN_DIR_Z,
} from "../constants";

function hexToVec3(hex: number): string {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
}

export const SKY_GRADIENT_GLSL = `
const vec3 SUN_DIR = vec3(${SUN_DIR_X.toFixed(6)}, ${SUN_DIR_Y.toFixed(6)}, ${SUN_DIR_Z.toFixed(6)});
const vec3 SKY_HORIZON = ${hexToVec3(COLOR_SKY_HORIZON)};
const vec3 SKY_MID = ${hexToVec3(COLOR_SKY_MID)};
const vec3 SKY_ZENITH = ${hexToVec3(COLOR_SKY_ZENITH)};
const vec3 SUN_DISC = ${hexToVec3(COLOR_SUN_DISC)};
const vec3 SUN_HALO = ${hexToVec3(COLOR_SUN_HALO)};

vec3 skyGradient(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 sky = mix(SKY_HORIZON, SKY_MID, smoothstep(0.0, 0.15, h));
  sky = mix(sky, SKY_ZENITH, smoothstep(0.15, 0.55, h));
  float s = max(dot(dir, SUN_DIR), 0.0);
  sky += SUN_HALO * 0.45 * pow(s, 24.0);
  sky += SUN_DISC * smoothstep(0.9992, 0.99975, s);
  return sky;
}
`;

const SKY_VERTEX = `
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
varying vec3 vDir;
void main() {
  vec4 p = uInvViewProj * vec4(position.xy, 0.9999, 1.0);
  vDir = p.xyz / p.w - uCamPos;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const SKY_FRAGMENT = `
${SKY_GRADIENT_GLSL}
varying vec3 vDir;
void main() {
  gl_FragColor = vec4(skyGradient(normalize(vDir)), 1.0);
}
`;

export function createSkyMesh(): Mesh {
  const material = new ShaderMaterial({
    uniforms: {
      uInvViewProj: new Uniform(new Matrix4()),
      uCamPos: new Uniform(new Vector3()),
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

export function updateSkyMesh(mesh: Mesh, camera: PerspectiveCamera): void {
  const mat = mesh.material as ShaderMaterial;
  const u = mat.uniforms;
  (u.uInvViewProj.value as Matrix4).multiplyMatrices(
    camera.matrixWorld,
    camera.projectionMatrixInverse,
  );
  (u.uCamPos.value as Vector3).copy(camera.position);
}
