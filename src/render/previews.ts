// Flight chooser card previews: three theme cards rendered ONCE per page visit through
// the real terrain/surface/sky/material pipeline at the fixed PREVIEW_SEED (002 T025/T026),
// then six aircraft cards that borrow the boot-built groups over a themed sky gradient
// (003 T014). One shared 256x144 RGBA8 target, sequential so a card burst never blocks a
// frame. Readback is async; every card is a DOM-decoded object URL — failures keep text
// and offer retry instead of shipping a degraded-but-"successful" startup.
import {
  Box3,
  BufferGeometry,
  Color,
  Mesh,
  NoToneMapping,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Sphere,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { CHUNK_SIZE } from "../constants";
import { AIRCRAFT_ORDER, type AircraftTypeId } from "../sim/aircraft";
import { PREVIEW_SEED, THEMES, themeById, type ThemeId, type WorldContext } from "../sim/themes";
import { beginChunkFill, makeSurfaceGeometry, makeTerrainGeometry, stepChunkFill } from "./terrainMesh";
import { applyThemeToLights, createAircraftLights, type Aircraft } from "./aircraft";
import { applyThemeToSky, createSkyMesh, updateSkyMesh } from "./sky";
import { applyThemeToMaterial } from "./terrainMaterial";

export const PREVIEW_W = 256;
export const PREVIEW_H = 144;

export type PreviewStatus = "pending" | "ready" | "failed";

export interface ThemeCard {
  kind: "theme";
  themeId: ThemeId;
  status: PreviewStatus;
  url: string | null;
}

export interface AircraftCard {
  kind: "aircraft";
  aircraftType: AircraftTypeId;
  status: PreviewStatus;
  url: string | null;
}

export type PreviewCard = ThemeCard | AircraftCard;

/** Card reference the chooser consumes: `id` names the card within its kind. */
export type PreviewCardKey =
  | { kind: "theme"; id: ThemeId }
  | { kind: "aircraft"; id: AircraftTypeId };

export function previewCardKey(card: PreviewCard): PreviewCardKey {
  return card.kind === "theme"
    ? { kind: "theme", id: card.themeId }
    : { kind: "aircraft", id: card.aircraftType };
}

export interface PreviewSet {
  cards: PreviewCard[];
  /** Boot-built aircraft borrowed by aircraft cards — geometry is never rebuilt here. */
  aircraft: ReadonlyMap<AircraftTypeId, Aircraft>;
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
  var __verifyPreview: ((id: string) => VerifyInject) | undefined;
}
function verifyPreviewInject(card: PreviewCard): VerifyInject {
  if (!__VERIFY_HOOKS__) return undefined;
  const id = card.kind === "theme" ? card.themeId : card.aircraftType;
  return globalThis.__verifyPreview?.(id);
}

// Nine cards per set: the three themes, then the six aircraft in chooser order. The map
// holds the boot-built Aircrafts — each card borrows its group for a single render.
export function createPreviewSet(aircraft: ReadonlyMap<AircraftTypeId, Aircraft>): PreviewSet {
  return {
    cards: [
      ...THEMES.map(
        (t): ThemeCard => ({ kind: "theme", themeId: t.id, status: "pending", url: null }),
      ),
      ...AIRCRAFT_ORDER.map(
        (id): AircraftCard => ({
          kind: "aircraft",
          aircraftType: id,
          status: "pending",
          url: null,
        }),
      ),
    ],
    aircraft,
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
}

function saveRendererState(renderer: WebGLRenderer): SavedRendererState {
  return {
    target: renderer.getRenderTarget(),
    viewport: renderer.getViewport(new Vector4()),
    scissor: renderer.getScissor(new Vector4()),
    scissorTest: renderer.getScissorTest(),
    clearColor: renderer.getClearColor(new Color()),
    clearAlpha: renderer.getClearAlpha(),
    toneMapping: renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
  };
}

function restoreRendererState(renderer: WebGLRenderer, saved: SavedRendererState): void {
  renderer.setRenderTarget(saved.target);
  renderer.setViewport(saved.viewport);
  renderer.setScissor(saved.scissor);
  renderer.setScissorTest(saved.scissorTest);
  renderer.toneMapping = saved.toneMapping as typeof renderer.toneMapping;
  renderer.toneMappingExposure = saved.toneMappingExposure;
  renderer.setClearColor(saved.clearColor, saved.clearAlpha);
}

// Render one theme card: themed uniforms staged on the SHARED material/sky, card scene
// rendered into the shared target, then the shared readback tail produces the card URL.
async function renderThemeCard(
  set: PreviewSet,
  card: ThemeCard,
  renderer: WebGLRenderer,
  material: ShaderMaterial,
  target: WebGLRenderTarget,
  restoreMaterial: () => void,
): Promise<void> {
  const theme = themeById(card.themeId);
  const gen = set.generation;

  const saved = saveRendererState(renderer);
  const savedCamPos = material.uniforms.uCamPos.value;
  const savedPlanePos = (material.uniforms.uPlanePos.value as Vector2).toArray() as [
    number,
    number,
  ];

  let res: PreviewResources | null = null;
  try {
    const inject = verifyPreviewInject(card);
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
    restoreRendererState(renderer, saved);
    material.uniforms.uCamPos.value = savedCamPos;
    (material.uniforms.uPlanePos.value as Vector2).set(...savedPlanePos);
    // the card theme stained the SHARED material — repaint the live world's uniforms
    // before the next frame, or the background renders in the last card's palette
    restoreMaterial();
  }

  await finishCard(set, card, renderer, target, gen);
}

// Render one aircraft card: the boot-built group is borrowed for a single render into the
// shared target — never rebuilt, never left reparented. Framing mirrors the visual study's
// card view: bounding-sphere fit at fov 30, camera on direction (-0.6, 0.34, 0.72),
// lookAt (0, 0.1, 0.2), lit by the aircraft lights over a Nature sky gradient.
async function renderAircraftCard(
  set: PreviewSet,
  card: AircraftCard,
  renderer: WebGLRenderer,
  target: WebGLRenderTarget,
): Promise<void> {
  const gen = set.generation;
  const inject = verifyPreviewInject(card);
  if (inject?.kind === "fail") throw new Error(`verify: preview ${card.aircraftType} failed`);
  const aircraft = set.aircraft.get(card.aircraftType);
  if (!aircraft) throw new Error(`no built aircraft for ${card.aircraftType}`);
  const group = aircraft.group;

  const saved = saveRendererState(renderer);
  const borrowed = {
    parent: group.parent,
    visible: group.visible,
    position: group.position.clone(),
    quaternion: group.quaternion.clone(),
  };

  const theme = themeById("nature");
  const cardScene = new Scene();
  const sky = createSkyMesh();
  applyThemeToSky(sky, theme);
  const lights = createAircraftLights();
  applyThemeToLights(lights, theme);
  cardScene.add(sky, lights.hemi, lights.sun);
  const camera = new PerspectiveCamera(30, PREVIEW_W / PREVIEW_H, 0.1, 1000);

  try {
    group.visible = true;
    group.position.set(0, 0, 0);
    group.quaternion.identity();
    cardScene.add(group);
    const radius = new Box3().setFromObject(group).getBoundingSphere(new Sphere()).radius;
    const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 0.92;
    camera.position.set(-0.6, 0.34, 0.72).normalize().multiplyScalar(distance);
    camera.lookAt(0, 0.1, 0.2);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    updateSkyMesh(sky, camera);

    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, PREVIEW_W, PREVIEW_H);
    renderer.setScissor(0, 0, PREVIEW_W, PREVIEW_H);
    renderer.setScissorTest(false);
    renderer.toneMapping = NoToneMapping;
    renderer.setClearColor(new Color(0), 1);
    renderer.clear();
    renderer.render(cardScene, camera);
  } finally {
    // hand the group back before yielding — visible, pose and parent exactly as borrowed
    group.visible = borrowed.visible;
    group.position.copy(borrowed.position);
    group.quaternion.copy(borrowed.quaternion);
    if (borrowed.parent) borrowed.parent.add(group);
    else group.removeFromParent();
    sky.geometry.dispose();
    (sky.material as ShaderMaterial).dispose();
    lights.hemi.dispose();
    lights.sun.dispose();
    restoreRendererState(renderer, saved);
  }

  await finishCard(set, card, renderer, target, gen);
}

// Shared card tail for both kinds: async readback -> row flip -> opaque alpha -> PNG blob
// -> object URL -> DOM decode. A decode failure revokes the URL and marks the card failed
// via the caller's catch.
async function finishCard(
  set: PreviewSet,
  card: PreviewCard,
  renderer: WebGLRenderer,
  target: WebGLRenderTarget,
  gen: number,
): Promise<void> {
  const pixels = new Uint8Array(PREVIEW_W * PREVIEW_H * 4);
  const inject2 = verifyPreviewInject(card);
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
  const inject3 = verifyPreviewInject(card);
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
  const card = set.cards.find((c) => c.status === "pending");
  if (!card) {
    set.done = set.cards.every((c) => c.status === "ready");
    return false;
  }
  try {
    if (card.kind === "theme") {
      await renderThemeCard(set, card, renderer, material, target, restoreMaterial);
    } else {
      await renderAircraftCard(set, card, renderer, target);
    }
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
