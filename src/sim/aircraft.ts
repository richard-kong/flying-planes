// Aircraft Types: the visual identity of the Plane. Pure records — no Three.js —
// chosen in the Flight Chooser and consumed by the render layer's aircraft module.
// Selection changes appearance only; every type flies the same Flight Model.

export type AircraftTypeId =
  | "helicopter"
  | "light"
  | "fighter"
  | "airliner"
  | "biplane"
  | "glider";

export interface SpinnerSpec {
  readonly name: "propeller" | "mainRotor" | "tailRotor";
  readonly axis: "x" | "y" | "z";
  readonly rate: number;
}

export interface AircraftType {
  readonly id: AircraftTypeId;
  readonly name: string;
  readonly description: string;
  /** Natural extents in metres; for the helicopter `span` is the main-rotor disc. */
  readonly footprint: { readonly length: number; readonly span: number };
  readonly spinners: readonly SpinnerSpec[];
}

/** Screen footprint shared by every Aircraft Type (prior box plane's 8m span, scaled). */
export const PLANE_FOOTPRINT = 8 * 0.64;

export const AIRCRAFT: readonly AircraftType[] = [
  {
    id: "helicopter",
    name: "Helicopter",
    description: "Executive — teardrop cabin · tapered boom · shrouded tail rotor · white and blue",
    footprint: { length: 9.2, span: 10.4 },
    spinners: [
      { name: "mainRotor", axis: "y", rate: 7 },
      { name: "tailRotor", axis: "x", rate: 28 },
    ],
  },
  {
    id: "light",
    name: "Light Plane",
    description: "Classic trainer — strut-braced high wing · tricycle gear · swept fin · white with red cheatline",
    footprint: { length: 7.2, span: 10.6 },
    spinners: [{ name: "propeller", axis: "z", rate: 40 }],
  },
  {
    id: "fighter",
    name: "Fighter Jet",
    description: "Interceptor — long nose · thin swept wings · tall fin · white with day-glo orange",
    footprint: { length: 13.5, span: 7.8 },
    spinners: [],
  },
  {
    id: "airliner",
    name: "Passenger Jet",
    description: "Narrow-body — classic twin-jet · small winglets · white with blue cheatline and tail",
    footprint: { length: 22, span: 17.2 },
    spinners: [],
  },
  {
    id: "biplane",
    name: "Biplane",
    description: "Sport — compact body · N struts · tight gap · silver with red tail",
    footprint: { length: 5.8, span: 8.4 },
    spinners: [{ name: "propeller", axis: "z", rate: 40 }],
  },
  {
    id: "glider",
    name: "Glider",
    description: "Vintage — gull wings · conventional tail · long canopy · cream and walnut brown",
    footprint: { length: 7.4, span: 14.0 },
    spinners: [],
  },
];

// Order used by the chooser's Aircraft section.
export const AIRCRAFT_ORDER: readonly AircraftTypeId[] = [
  "helicopter",
  "light",
  "fighter",
  "airliner",
  "biplane",
  "glider",
];

export const DEFAULT_AIRCRAFT: AircraftTypeId = "light";

export function aircraftById(id: AircraftTypeId): AircraftType {
  const found = AIRCRAFT.find((a) => a.id === id);
  if (!found) throw new Error(`unknown aircraft type: ${id}`);
  return found;
}

export function footprintScale(type: AircraftType): number {
  return PLANE_FOOTPRINT / Math.max(type.footprint.length, type.footprint.span);
}

const TAU = Math.PI * 2;

export function stepSpin(phase: number, dt: number): number {
  return (phase + dt) % TAU;
}
