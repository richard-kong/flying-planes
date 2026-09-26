// Flight chooser card previews: three theme cards rendered ONCE per page visit through
// the real terrain/surface/sky/material pipeline at the fixed PREVIEW_SEED (002 T025/T026),
// then six aircraft cards that borrow the boot-built groups over a themed sky gradient
// (003 T014). One shared 768x288 RGBA8 atlas target of 256x144 cells; renders are pipelined
// (002 contract: preview cards) so no card waits on another's readback or encode, and the
// six aircraft share one pass and one readback. Every card is a DOM-decoded object URL —
// failures keep text and offer retry instead of shipping a degraded-but-"successful" startup.
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
/** Shared target: a 3x2 grid of cards so the six aircraft render in one pass. */
export const PREVIEW_ATLAS_COLS = 3;
export const PREVIEW_ATLAS_W = PREVIEW_W * PREVIEW_ATLAS_COLS;
export const PREVIEW_ATLAS_H = PREVIEW_H * Math.ceil(AIRCRAFT_ORDER.length / PREVIEW_ATLAS_COLS);

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

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// Point the shared atlas target at one 256x144 cell (GL origin bottom-left). three.js
// takes viewport/scissor from the target itself while a render target is bound.
function bindCell(renderer: WebGLRenderer, target: WebGLRenderTarget, x: number, y: number): void {
  target.viewport.set(x, y, PREVIEW_W, PREVIEW_H);
  target.scissor.set(x, y, PREVIEW_W, PREVIEW_H);
  target.scissorTest = true;
  renderer.setRenderTarget(target);
  renderer.toneMapping = NoToneMapping; // the shaders own the colour path
  renderer.setClearColor(new Color(0), 1);
  renderer.clear();
}

function unbindCells(target: WebGLRenderTarget): void {
  target.viewport.set(0, 0, target.width, target.height);
  target.scissor.set(0, 0, target.width, target.height);
  target.scissorTest = false;
}

// Render one theme card into atlas cell 0: themed uniforms staged on the SHARED
// material/sky, card scene rendered, geometry freed, renderer + material restored — all
// synchronously. Returns the in-flight readback; GL command order keeps a later card's
// render from overwriting pixels this readback has already queued.
function renderThemeCard(
  card: ThemeCard,
  renderer: WebGLRenderer,
  material: ShaderMaterial,
  target: WebGLRenderTarget,
  restoreMaterial: () => void,
): Promise<Uint8Array> {
  const theme = themeById(card.themeId);
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

    res = buildPreviewScene(card.themeId, material).res;
    applyThemeToMaterial(material, theme);
    // the card's "camera" feeds the shader's fog/specular eye position during the render
    material.uniforms.uCamPos.value = res.camera.position;
    (material.uniforms.uPlanePos.value as Vector2).set(
      theme.preview.cameraTarget[0],
      theme.preview.cameraTarget[2],
    );
    updateSkyMesh(res.sky, res.camera);

    bindCell(renderer, target, 0, 0);
    renderer.render(res.scene, res.camera);
    const pixels = new Uint8Array(PREVIEW_W * PREVIEW_H * 4);
    return renderer
      .readRenderTargetPixelsAsync(target, 0, 0, PREVIEW_W, PREVIEW_H, pixels)
      .then(() => pixels);
  } finally {
    if (res) disposeCardScene(res);
    unbindCells(target);
    restoreRendererState(renderer, saved);
    material.uniforms.uCamPos.value = savedCamPos;
    (material.uniforms.uPlanePos.value as Vector2).set(...savedPlanePos);
    // the card theme stained the SHARED material — repaint the live world's uniforms
    // before the next frame, or the background renders in the last card's palette
    restoreMaterial();
  }
}

// Atlas cell for an aircraft card: AIRCRAFT_ORDER index laid out left-to-right, bottom-up.
function aircraftCell(id: AircraftTypeId): [number, number] {
  const i = AIRCRAFT_ORDER.indexOf(id);
  return [(i % PREVIEW_ATLAS_COLS) * PREVIEW_W, Math.floor(i / PREVIEW_ATLAS_COLS) * PREVIEW_H];
}

// Render every given aircraft card into its atlas cell in one pass, then issue ONE
// readback of the whole atlas. Each boot-built group is borrowed for its cell only —
// never rebuilt, never left reparented. Framing mirrors the visual study's card view:
// bounding-sphere fit at fov 30, camera on direction (-0.6, 0.34, 0.72), lookAt
// (0, 0.1, 0.2), lit by the aircraft lights over a Nature sky gradient. Cards whose
// render throws are marked failed and left out of `rendered`.
function renderAircraftAtlas(
  set: PreviewSet,
  cards: AircraftCard[],
  renderer: WebGLRenderer,
  target: WebGLRenderTarget,
): { rendered: AircraftCard[]; pixels: Promise<Uint8Array> | null } {
  const saved = saveRendererState(renderer);
  const theme = themeById("nature");
  const cardScene = new Scene();
  const sky = createSkyMesh();
  applyThemeToSky(sky, theme);
  const lights = createAircraftLights();
  applyThemeToLights(lights, theme);
  cardScene.add(sky, lights.hemi, lights.sun);
  const camera = new PerspectiveCamera(30, PREVIEW_W / PREVIEW_H, 0.1, 1000);
  const rendered: AircraftCard[] = [];

  try {
    for (const card of cards) {
      try {
        renderAircraftCell(set, card, renderer, target, cardScene, sky, camera);
        rendered.push(card);
      } catch {
        failCard(card);
      }
    }
    if (rendered.length === 0) return { rendered, pixels: null };
    const pixels = new Uint8Array(target.width * target.height * 4);
    return {
      rendered,
      pixels: renderer
        .readRenderTargetPixelsAsync(target, 0, 0, target.width, target.height, pixels)
        .then(() => pixels),
    };
  } finally {
    sky.geometry.dispose();
    (sky.material as ShaderMaterial).dispose();
    lights.hemi.dispose();
    lights.sun.dispose();
    unbindCells(target);
    restoreRendererState(renderer, saved);
  }
}

function renderAircraftCell(
  set: PreviewSet,
  card: AircraftCard,
  renderer: WebGLRenderer,
  target: WebGLRenderTarget,
  cardScene: Scene,
  sky: Mesh,
  camera: PerspectiveCamera,
): void {
  const inject = verifyPreviewInject(card);
  if (inject?.kind === "fail") throw new Error(`verify: preview ${card.aircraftType} failed`);
  const aircraft = set.aircraft.get(card.aircraftType);
  if (!aircraft) throw new Error(`no built aircraft for ${card.aircraftType}`);
  const group = aircraft.group;
  const borrowed = {
    parent: group.parent,
    visible: group.visible,
    position: group.position.clone(),
    quaternion: group.quaternion.clone(),
  };
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
    const [x, y] = aircraftCell(card.aircraftType);
    bindCell(renderer, target, x, y);
    renderer.render(cardScene, camera);
  } finally {
    // hand the group back — visible, pose and parent exactly as borrowed
    group.visible = borrowed.visible;
    group.position.copy(borrowed.position);
    group.quaternion.copy(borrowed.quaternion);
    if (borrowed.parent) borrowed.parent.add(group);
    else group.removeFromParent();
  }
}

// Shared card tail for both kinds: cut the card's cell out of a readback (row flip, opaque
// alpha) -> PNG blob -> object URL -> DOM decode. A decode failure revokes the URL and
// throws so the caller marks the card failed. Tails of different cards run concurrently.
async function publishCard(
  set: PreviewSet,
  card: PreviewCard,
  pixels: Uint8Array,
  stride: number,
  x0: number,
  y0: number,
  gen: number,
): Promise<void> {
  const inject2 = verifyPreviewInject(card);
  if (inject2?.kind === "delay") await new Promise((r) => setTimeout(r, inject2.ms));
  if (set.generation !== gen) return; // stale completion — discard quietly

  const w = PREVIEW_W;
  const h = PREVIEW_H;
  const row = w * 4;
  const flipped = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + h - 1 - y) * stride + x0) * 4;
    flipped.set(pixels.subarray(src, src + row), y * row);
  }
  for (let i = 3; i < flipped.length; i += 4) flipped[i] = 255;
  // OffscreenCanvas encodes off the rAF-idle path that canvas.toBlob waits on
  const cnv = new OffscreenCanvas(w, h);
  const ctx = cnv.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  ctx.putImageData(new ImageData(flipped, w, h), 0, 0);
  const blob = await cnv.convertToBlob({ type: "image/png" });
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

function failCard(card: PreviewCard): void {
  card.status = "failed";
  if (card.url) {
    URL.revokeObjectURL(card.url);
    card.url = null;
  }
}

/**
 * Render every pending card into the shared atlas target, pipelined: theme cards render
 * one per frame without waiting for their readbacks, the six aircraft share one atlas
 * pass and one readback, and all card tails (readback -> blob -> decode) overlap.
 * `onSettled` fires as each card reaches ready or failed; resolves once all have.
 */
export async function renderPreviews(
  set: PreviewSet,
  renderer: WebGLRenderer,
  material: ShaderMaterial,
  target: WebGLRenderTarget,
  restoreMaterial: () => void,
  onSettled: (card: PreviewCard) => void,
): Promise<void> {
  const gen = set.generation;
  const pending = set.cards.filter((c) => c.status === "pending");
  const tails: Promise<void>[] = [];
  const settle = (card: PreviewCard): void => {
    set.done = set.cards.every((c) => c.status === "ready");
    onSettled(card);
  };
  const track = (card: PreviewCard, tail: Promise<void>): void => {
    tails.push(
      tail.then(
        () => settle(card),
        () => {
          failCard(card);
          settle(card);
        },
      ),
    );
  };

  for (const card of pending) {
    if (card.kind !== "theme") continue;
    try {
      const pixels = renderThemeCard(card, renderer, material, target, restoreMaterial);
      track(card, pixels.then((px) => publishCard(set, card, px, PREVIEW_W, 0, 0, gen)));
    } catch {
      failCard(card);
      settle(card);
    }
    // one terrain build per frame — never block boot on a card burst
    await nextFrame();
  }

  const aircraftCards = pending.filter((c): c is AircraftCard => c.kind === "aircraft");
  if (aircraftCards.length > 0) {
    const { rendered, pixels } = renderAircraftAtlas(set, aircraftCards, renderer, target);
    for (const card of aircraftCards) if (card.status === "failed") settle(card);
    if (pixels) {
      for (const card of rendered) {
        const [x, y] = aircraftCell(card.aircraftType);
        track(card, pixels.then((px) => publishCard(set, card, px, target.width, x, y, gen)));
      }
    }
  }

  await Promise.all(tails);
  set.done = set.cards.every((c) => c.status === "ready");
}

/** Retry only failed cards; ready cards keep their cached URLs untouched. */
export async function retryFailedPreviews(
  set: PreviewSet,
  renderer: WebGLRenderer,
  material: ShaderMaterial,
  target: WebGLRenderTarget,
  restoreMaterial: () => void,
): Promise<void> {
  for (const card of set.cards) if (card.status === "failed") card.status = "pending";
  await renderPreviews(set, renderer, material, target, restoreMaterial, () => {});
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

/** A card's geometry/scene payload is released once its render is submitted. */
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
