// Theme card previews (002 T025/T026): three cards rendered ONCE per page visit through the
// real terrain/surface/sky/material pipeline at the fixed PREVIEW_SEED, one shared
// 256x144 RGBA8 target, sequential so a card burst never blocks a frame. Readback is async;
// every card is a DOM-decoded object URL — failures keep text and offer retry instead of
// shipping a degraded-but-"successful" startup.
import {
  BufferGeometry,
  Color,
  Mesh,
  NoToneMapping,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { CHUNK_SIZE } from "../constants";
import { PREVIEW_SEED, THEMES, themeById, type ThemeId, type WorldContext } from "../sim/themes";
import { beginChunkFill, makeSurfaceGeometry, makeTerrainGeometry, stepChunkFill } from "./terrainMesh";
import { applyThemeToSky, createSkyMesh, updateSkyMesh } from "./sky";
import { applyThemeToMaterial } from "./terrainMaterial";

export const PREVIEW_W = 256;
export const PREVIEW_H = 144;

export type PreviewStatus = "pending" | "ready" | "failed";

export interface PreviewCard {
  themeId: ThemeId;
  status: PreviewStatus;
  url: string | null;
}

export interface PreviewSet {
  cards: PreviewCard[];
  /** Monotonic token — async completions for an older set are rejected as stale. */
  generation: number;
  done: boolean;
}

// readback verification adapter (T029): absent from the production bundle via DCE
type VerifyInject =
  | { kind: "fail" }
  | { kind: "delay"; ms: number }
  | { kind: "nullblob" }
  | undefined;
declare global {
  var __verifyPreview: ((themeId: ThemeId) => VerifyInject) | undefined;
}
function verifyPreviewInject(themeId: ThemeId): VerifyInject {
  if (!__VERIFY_HOOKS__) return undefined;
  return globalThis.__verifyPreview?.(themeId);
}

export function createPreviewSet(): PreviewSet {
  return {
    cards: THEMES.map((t) => ({ themeId: t.id, status: "pending" as const, url: null })),
    generation: 0,
    done: false,
  };
}

// --- shared per-card render ---

const PREVIEW_CHUNKS_R = 4; // lod1 ring count around the preview target (~2 km)
const PREVIEW_CHUNKS_HI = 1; // lod0 margin around the focal chunk

interface PreviewResources {
  scene: Scene;
  camera: PerspectiveCamera;
  sky: Mesh;
  terrains: Mesh[];
  surfaces: Mesh[];
  geometries: BufferGeometry[];
}

// Fill the landforms a card needs: a hi-res disc at the look target plus a coarser ring,
// surface sheets included. Allocations happen here — previews are startup-only.
function buildPreviewScene(
  themeId: ThemeId,
  material: ShaderMaterial,
): { res: PreviewResources; world: WorldContext } {
  const theme = themeById(themeId);
  const world: WorldContext = { theme, seed: PREVIEW_SEED };
  const [tx, , tz] = theme.preview.cameraTarget;
  const tcx = Math.floor(tx / CHUNK_SIZE);
  const tcz = Math.floor(tz / CHUNK_SIZE);
  const scene = new Scene();
  const sky = createSkyMesh();
  applyThemeToSky(sky, theme);
  scene.add(sky);
  const camera = new PerspectiveCamera(50, PREVIEW_W / PREVIEW_H, 1, CHUNK_SIZE * 20);
  camera.position.set(...theme.preview.cameraPosition);
  camera.lookAt(new Vector3(...theme.preview.cameraTarget));
  camera.updateMatrixWorld();

  const terrains: Mesh[] = [];
  const surfaces: Mesh[] = [];
  const geometries: BufferGeometry[] = [];
  for (let dx = -PREVIEW_CHUNKS_R; dx <= PREVIEW_CHUNKS_R; dx++) {
    for (let dz = -PREVIEW_CHUNKS_R; dz <= PREVIEW_CHUNKS_R; dz++) {
      if (dx * dx + dz * dz > PREVIEW_CHUNKS_R * PREVIEW_CHUNKS_R) continue;
      const lod: 0 | 1 | 2 =
        Math.max(Math.abs(dx), Math.abs(dz)) <= PREVIEW_CHUNKS_HI ? 0 : 1;
      const key = { cx: tcx + dx, cz: tcz + dz, lod };
      const terrainGeo = makeTerrainGeometry(lod);
      geometries.push(terrainGeo);
      const fill = beginChunkFill(terrainGeo, key, world);
      while (!fill.done) {
        if (fill.surfaceCounts > 0 && !fill.surface) {
          fill.surface = makeSurfaceGeometry(lod);
          geometries.push(fill.surface);
        } else {
          stepChunkFill(fill, 1 << 20);
        }
      }
      const mesh = new Mesh(terrainGeo, material);
      mesh.position.set(key.cx * CHUNK_SIZE, 0, key.cz * CHUNK_SIZE);
      terrains.push(mesh);
      scene.add(mesh);
      if (fill.surface) {
        const sm = new Mesh(fill.surface, material);
        sm.position.set(key.cx * CHUNK_SIZE, 0, key.cz * CHUNK_SIZE);
        surfaces.push(sm);
        scene.add(sm);
      }
    }
  }
  return { res: { scene, camera, sky, terrains, surfaces, geometries }, world };
}

interface SavedRendererState {
  target: WebGLRenderTarget | null;
  viewport: Vector4;
  scissor: Vector4;
  scissorTest: boolean;
  clearColor: Color;
  clearAlpha: number;
  toneMapping: number;
  toneMappingExposure: number;
  camPos: unknown;
  planePos: [number, number];
}

// Render one card: themed uniforms staged on the SHARED material/sky, card scene rendered
// into the shared target, async readback -> 2D canvas -> blob -> object URL -> decoded img.
async function renderCard(
  set: PreviewSet,
  card: PreviewCard,
  renderer: WebGLRenderer,
  material: ShaderMaterial,
  target: WebGLRenderTarget,
  restoreMaterial: () => void,
): Promise<void> {
  const theme = themeById(card.themeId);
  const gen = set.generation;

  const saved: SavedRendererState = {
    target: renderer.getRenderTarget(),
    viewport: renderer.getViewport(new Vector4()),
    scissor: renderer.getScissor(new Vector4()),
    scissorTest: renderer.getScissorTest(),
    clearColor: renderer.getClearColor(new Color()),
    clearAlpha: renderer.getClearAlpha(),
    toneMapping: renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
    camPos: material.uniforms.uCamPos.value,
    planePos: (material.uniforms.uPlanePos.value as Vector2).toArray() as [number, number],
  };

  let res: PreviewResources | null = null;
  try {
    const inject = verifyPreviewInject(card.themeId);
    if (inject?.kind === "fail") throw new Error(`verify: preview ${card.themeId} failed`);

    const built = buildPreviewScene(card.themeId, material);
    res = built.res;
    applyThemeToMaterial(material, theme);
    // the card's "camera" feeds the shader's fog/specular eye position during the render
    material.uniforms.uCamPos.value = res.camera.position;
    (material.uniforms.uPlanePos.value as Vector2).set(
      theme.preview.cameraTarget[0],
      theme.preview.cameraTarget[2],
    );
    updateSkyMesh(res.sky, res.camera);

    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, PREVIEW_W, PREVIEW_H);
    renderer.setScissor(0, 0, PREVIEW_W, PREVIEW_H);
    renderer.setScissorTest(false);
    renderer.toneMapping = NoToneMapping; // the shaders own the colour path
    renderer.setClearColor(new Color(0), 1);
    renderer.clear();
    renderer.render(res.scene, res.camera);
    // the card's geometry lives only until its pixels land on the target
    disposeCardScene(res);
    res = null;
  } finally {
    // restore before yielding — the async readback happens after this
    if (res) disposeCardScene(res);
    renderer.setRenderTarget(saved.target);
    renderer.setViewport(saved.viewport);
    renderer.setScissor(saved.scissor);
    renderer.setScissorTest(saved.scissorTest);
    renderer.toneMapping = saved.toneMapping as typeof renderer.toneMapping;
    renderer.toneMappingExposure = saved.toneMappingExposure;
    renderer.setClearColor(saved.clearColor, saved.clearAlpha);
    material.uniforms.uCamPos.value = saved.camPos;
    (material.uniforms.uPlanePos.value as Vector2).set(...saved.planePos);
    // the card theme stained the SHARED material — repaint the live world's uniforms
    // before the next frame, or the background renders in the last card's palette
    restoreMaterial();
  }

  const pixels = new Uint8Array(PREVIEW_W * PREVIEW_H * 4);
  const inject2 = verifyPreviewInject(card.themeId);
  if (inject2?.kind === "delay") await new Promise((r) => setTimeout(r, inject2.ms));
  await renderer.readRenderTargetPixelsAsync(target, 0, 0, PREVIEW_W, PREVIEW_H, pixels);
  if (set.generation !== gen) return; // stale completion — discard quietly

  // flip rows (GL origin is bottom-left) and force opaque alpha, then blob -> URL -> decode
  const w = PREVIEW_W;
  const h = PREVIEW_H;
  const row = w * 4;
  const flipped = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    flipped.set(pixels.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  }
  for (let i = 3; i < flipped.length; i += 4) flipped[i] = 255;
  const cnv = document.createElement("canvas");
  cnv.width = w;
  cnv.height = h;
  const ctx = cnv.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  ctx.putImageData(new ImageData(flipped, w, h), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => cnv.toBlob(resolve, "image/png"));
  const inject3 = verifyPreviewInject(card.themeId);
  if (inject3?.kind === "nullblob" || !blob) throw new Error("card blob unavailable");
  const url = URL.createObjectURL(blob);
  // decode before accepting — a broken image must read as failed, not as a missing preview
  const img = new Image();
  const decoded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("card decode failed"));
  });
  img.src = url;
  try {
    await decoded;
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  if (set.generation !== gen) {
    URL.revokeObjectURL(url); // stale success — clean up and discard
    return;
  }
  card.url = url;
  card.status = "ready";
}

/**
 * Render the next pending-or-failed card into the shared target. Sequential by design:
 * the caller awaits each card before starting the next, keeping startup deadline-sliced.
 */
export async function renderNextPreview(
  set: PreviewSet,
  renderer: WebGLRenderer,
  material: ShaderMaterial,
  target: WebGLRenderTarget,
  restoreMaterial: () => void,
): Promise<boolean> {
  const card = set.cards.find((c) => c.status !== "ready");
  if (!card) {
    set.done = true;
    return false;
  }
  try {
    await renderCard(set, card, renderer, material, target, restoreMaterial);
  } catch (e) {
    card.status = "failed";
    if (card.url) {
      URL.revokeObjectURL(card.url);
      card.url = null;
    }
  }
  set.done = set.cards.every((c) => c.status === "ready");
  return true;
}

/** Retry only failed cards; ready cards keep their cached URLs untouched. */
export async function retryFailedPreviews(
  set: PreviewSet,
  renderer: WebGLRenderer,
  material: ShaderMaterial,
  target: WebGLRenderTarget,
  restoreMaterial: () => void,
): Promise<void> {
  for (const card of set.cards) {
    if (card.status === "failed") {
      card.status = "pending";
      await renderNextPreview(set, renderer, material, target, restoreMaterial);
    }
  }
}

/** Revoke every object URL and mark the set stale — called at teardown and reset only. */
export function disposePreviewSet(set: PreviewSet): void {
  set.generation += 1;
  for (const card of set.cards) {
    if (card.url) URL.revokeObjectURL(card.url);
    card.url = null;
    card.status = "pending";
  }
  set.done = false;
}

/** A card's geometry/scene payload is released after the readback settles. */
export function disposeCardScene(res: PreviewResources): void {
  for (const g of res.geometries) g.dispose();
  res.scene.clear();
}

// --- verification-only overview capture (T039): render a theme at its preview pose into
// a fresh w x h target and return a PNG data URL. Only reachable via __verifyOverview in
// the verification build; dead code in production needs no budget anyway (<1 kB).
export async function renderOverviewShot(
  renderer: WebGLRenderer,
  material: ShaderMaterial,
  themeId: ThemeId,
  w: number,
  h: number,
  restoreMaterial: () => void,
): Promise<string> {
  const theme = themeById(themeId);
  const target = new WebGLRenderTarget(w, h, {
    format: RGBAFormat,
    type: UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  const saved = {
    target: renderer.getRenderTarget(),
    toneMapping: renderer.toneMapping,
    camPos: material.uniforms.uCamPos.value,
    planePos: (material.uniforms.uPlanePos.value as Vector2).toArray() as [
      number,
      number,
    ],
  };
  let res: PreviewResources | null = null;
  try {
    const built = buildPreviewScene(themeId, material);
    res = built.res;
    res.camera.aspect = w / h;
    res.camera.updateProjectionMatrix();
    applyThemeToMaterial(material, theme);
    material.uniforms.uCamPos.value = res.camera.position;
    (material.uniforms.uPlanePos.value as Vector2).set(
      theme.preview.cameraTarget[0],
      theme.preview.cameraTarget[2],
    );
    updateSkyMesh(res.sky, res.camera);
    renderer.setRenderTarget(target);
    renderer.toneMapping = NoToneMapping;
    renderer.setClearColor(new Color(0), 1);
    renderer.clear();
    renderer.render(res.scene, res.camera);
    const pixels = new Uint8Array(w * h * 4);
    await renderer.readRenderTargetPixelsAsync(target, 0, 0, w, h, pixels);
    const row = w * 4;
    const flipped = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      flipped.set(pixels.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    }
    for (let i = 3; i < flipped.length; i += 4) flipped[i] = 255;
    const cnv = document.createElement("canvas");
    cnv.width = w;
    cnv.height = h;
    cnv.getContext("2d")!.putImageData(new ImageData(flipped, w, h), 0, 0);
    return cnv.toDataURL("image/png");
  } finally {
    if (res) disposeCardScene(res);
    renderer.setRenderTarget(saved.target);
    renderer.toneMapping = saved.toneMapping as typeof renderer.toneMapping;
    material.uniforms.uCamPos.value = saved.camPos;
    (material.uniforms.uPlanePos.value as Vector2).set(...saved.planePos);
    restoreMaterial(); // repaint live-world theme uniforms on the shared material
    target.dispose();
  }
}
