// Theme sky (002 T016): a full-screen quad drawn first, no depth interaction, plus the
// shared skyGradient() GLSL string the terrain shader includes so fog resolves to the same
// horizon colour (R4). Gradient stops, sun direction and halo are Theme uniforms, staged
// together by writeSkyUniforms / applyThemeToSky.
import {
  Matrix4,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  ShaderMaterial,
  Uniform,
  Vector3,
  Color,
} from "three";
import type { Theme } from "../sim/themes";

export const SKY_GRADIENT_GLSL = `
uniform vec3 uSkyHorizon;
uniform vec3 uSkyMid;
uniform vec3 uSkyZenith;
uniform vec3 uSunDisc;
uniform vec3 uSkyHalo;
uniform vec3 uSkySunDir;
uniform float uHaloStrength;

vec3 skyGradient(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 sky = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.15, h));
  sky = mix(sky, uSkyZenith, smoothstep(0.15, 0.55, h));
  float s = max(dot(dir, uSkySunDir), 0.0);
  sky += uSkyHalo * uHaloStrength * pow(s, 24.0);
  sky += uSunDisc * smoothstep(0.9992, 0.99975, s);
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
      uSkyHorizon: new Uniform(new Color(0xffffff)),
      uSkyMid: new Uniform(new Color(0xffffff)),
      uSkyZenith: new Uniform(new Color(0xffffff)),
      uSunDisc: new Uniform(new Color(0xffffff)),
      uSkyHalo: new Uniform(new Color(0xffffff)),
      uSkySunDir: new Uniform(new Vector3(0, 1, 0)),
      uHaloStrength: new Uniform(0.45),
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

/**
 * Write the shared sky uniforms on any material that includes SKY_GRADIENT_GLSL
 * (the sky mesh's own ShaderMaterial or the terrain material) — same names, same values.
 */
export function writeSkyUniforms(
  uniforms: Record<string, { value: unknown }>,
  theme: Theme,
): void {
  (uniforms.uSkyHorizon.value as Color).setHex(theme.sky.horizon);
  (uniforms.uSkyMid.value as Color).setHex(theme.sky.mid);
  (uniforms.uSkyZenith.value as Color).setHex(theme.sky.zenith);
  (uniforms.uSunDisc.value as Color).setHex(theme.sky.sunDisc);
  (uniforms.uSkyHalo.value as Color).setHex(theme.sky.sunHalo);
  (uniforms.uSkySunDir.value as Vector3).set(...theme.sky.sunDirection);
  uniforms.uHaloStrength.value = theme.sky.haloStrength;
}

/** Stage the sky mesh's Theme uniforms (pair with applyThemeToMaterial for atomicity). */
export function applyThemeToSky(mesh: Mesh, theme: Theme): void {
  const mat = mesh.material as ShaderMaterial;
  writeSkyUniforms(mat.uniforms, theme);
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
