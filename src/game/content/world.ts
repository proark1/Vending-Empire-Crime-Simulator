import type { Bounds2, District, Location, Vec2 } from "../core/types";

export type BuildingVisualStyle = "garage" | "supplier" | "laundromat" | "gym" | "arcade" | "transit" | "rival";

export interface WorldBuilding {
  depth: number;
  districtId: string;
  height: number;
  locationId?: string;
  signText: string;
  style: BuildingVisualStyle;
  width: number;
  x: number;
  z: number;
}

export interface WorldRoad {
  depth: number;
  districtId: string;
  id: string;
  width: number;
  x: number;
  z: number;
}

export type InteriorOpenSide = "east" | "north" | "south" | "west";
export type WorldInteriorStyle = "garage" | "supplier" | "laundromat";

export interface WorldInterior {
  depth: number;
  districtId: string;
  id: string;
  label: string;
  locationId: string;
  openSide: InteriorOpenSide;
  style: WorldInteriorStyle;
  width: number;
  x: number;
  z: number;
}

export interface MachinePlacementAnchor {
  rotationY: number;
  x: number;
  z: number;
}

export interface DistrictLabel {
  color: string;
  districtId: string;
  x: number;
  z: number;
}

export interface CityBackdropBuilding {
  color: string;
  depth: number;
  districtId: string;
  height: number;
  lit: number;
  width: number;
  x: number;
  z: number;
}

export type WorldDecorationKind = "billboard" | "bollard" | "dumpster" | "planter" | "streetlight" | "utility_box";

export interface WorldDecoration {
  color?: string;
  districtId: string;
  id: string;
  kind: WorldDecorationKind;
  rotationY: number;
  scale: number;
  x: number;
  z: number;
}

export interface PatrolZone {
  color: string;
  districtId: string;
  id: string;
  label: string;
  radius: number;
  x: number;
  z: number;
}

export interface PolicePatrolPath {
  color: string;
  districtId: string;
  id: string;
  path: Vec2[];
  phase: number;
  speed: number;
  zoneId: string;
}

export interface TrafficLoop {
  color: string;
  districtId: string;
  id: string;
  kind: "civilian" | "delivery" | "police";
  path: Vec2[];
  phase: number;
  speed: number;
}

export interface DistrictVisualProfile {
  accentColor: string;
  curbColor: string;
  laneColor: string;
  lightColor: string;
}

export type NeighborhoodHotspotKind = "landmark" | "market" | "route_choke" | "social" | "supplier_shadow";

export interface NeighborhoodHotspot {
  color: string;
  demandTags: string[];
  description: string;
  districtId: string;
  id: string;
  kind: NeighborhoodHotspotKind;
  label: string;
  radius: number;
  riskNote: string;
  x: number;
  z: number;
}

export type CrimeContactKind = "fixer" | "lookout" | "grey_supplier" | "paperwork";

export interface CrimeContact {
  action: "buy_tip" | "arrange_bribe" | "source_contraband";
  color: string;
  cost: number;
  description: string;
  districtId: string;
  heatRisk: number;
  id: string;
  kind: CrimeContactKind;
  label: string;
  productId?: "mystery_capsules" | "glitch_gum" | "night_syrup" | "focus_cubes";
  radius: number;
  x: number;
  z: number;
}

export interface WorldMapLayout {
  backdropBuildings: CityBackdropBuilding[];
  buildings: WorldBuilding[];
  decorations: WorldDecoration[];
  interiors: WorldInterior[];
  patrolZones: PatrolZone[];
  policePatrolPaths: PolicePatrolPath[];
  roads: WorldRoad[];
  trafficLoops: TrafficLoop[];
}

export const worldBounds: Bounds2 = {
  minX: -126,
  maxX: 124,
  minZ: -92,
  maxZ: 92
};

export const neighborhoodHotspots: NeighborhoodHotspot[] = [
  {
    id: "foam_fold_backlot",
    districtId: "starter_suburb",
    label: "Foam & Fold Backlot",
    kind: "social",
    x: -7.5,
    z: -8.8,
    radius: 5.2,
    color: "#38bdf8",
    demandTags: ["laundry", "student"],
    description: "Laundry regulars, shift workers, and bored students cycle through this alley all day.",
    riskNote: "Low police pressure, but Redline scouts watch the first profitable machine here."
  },
  {
    id: "bus_shelter_triangle",
    districtId: "starter_suburb",
    label: "Bus Shelter Triangle",
    kind: "route_choke",
    x: -12.5,
    z: -3.8,
    radius: 4.8,
    color: "#5eead4",
    demandTags: ["commuter", "utility"],
    description: "Three bus stops feed the same sidewalk pocket, making cheap drinks and chargers move quickly.",
    riskNote: "More eyes on the route means complaints travel faster than the van."
  },
  {
    id: "freight_gate_clock",
    districtId: "industrial_yards",
    label: "Freight Gate Clock",
    kind: "route_choke",
    x: -34,
    z: 4,
    radius: 7,
    color: "#f59e0b",
    demandTags: ["commuter", "utility", "meal"],
    description: "Shift changes dump workers onto the same service road in hard waves.",
    riskNote: "Great for bulk meals and energy stock, but ambush risk spikes after dark."
  },
  {
    id: "dock_lamp_market",
    districtId: "industrial_yards",
    label: "Dock Lamp Market",
    kind: "supplier_shadow",
    x: -94,
    z: 55,
    radius: 7.5,
    color: "#fbbf24",
    demandTags: ["night", "utility"],
    description: "Truckers trade favors, repair tips, and off-menu stock rumors under sodium lamps.",
    riskNote: "Black-market supply talk helps margins, but raises route heat when abused."
  },
  {
    id: "metro_ticket_wall",
    districtId: "downtown_loop",
    label: "Metro Ticket Wall",
    kind: "market",
    x: 30,
    z: -9,
    radius: 6.6,
    color: "#60a5fa",
    demandTags: ["commuter", "office"],
    description: "Commuters queue, miss trains, and buy anything that solves a small panic.",
    riskNote: "High sales, high inspection visibility, and corporate permit pressure."
  },
  {
    id: "skybridge_lunch_rush",
    districtId: "downtown_loop",
    label: "Skybridge Lunch Rush",
    kind: "landmark",
    x: 88,
    z: 24,
    radius: 6.8,
    color: "#93c5fd",
    demandTags: ["office", "commuter"],
    description: "Office traffic crosses in predictable surges, favoring polished machines and premium snacks.",
    riskNote: "Clean paperwork matters here; illegal placements sour public reputation quickly."
  },
  {
    id: "underpass_tokens",
    districtId: "neon_quarter",
    label: "Underpass Tokens",
    kind: "social",
    x: 63,
    z: -44,
    radius: 8,
    color: "#c084fc",
    demandTags: ["arcade", "night"],
    description: "Arcade crowds and after-hours customers make weird products feel normal.",
    riskNote: "Grey goods sell fast, but rival retaliation and heat rise faster."
  },
  {
    id: "cinema_smoke_line",
    districtId: "neon_quarter",
    label: "Cinema Smoke Line",
    kind: "market",
    x: 80,
    z: -64,
    radius: 6.4,
    color: "#fb7185",
    demandTags: ["night", "student"],
    description: "Late shows create impatient lines and impulse buys between screenings.",
    riskNote: "Crowds are profitable cover until customer complaints turn into inspections."
  },
  {
    id: "library_steps",
    districtId: "campus_strip",
    label: "Library Steps",
    kind: "landmark",
    x: -50,
    z: -21,
    radius: 6,
    color: "#38bdf8",
    demandTags: ["student", "utility"],
    description: "Study traffic rewards caffeine, snacks, chargers, and anything packaged like a life hack.",
    riskNote: "Campus security is complaint-sensitive and patrols are steady."
  },
  {
    id: "stadium_spill",
    districtId: "campus_strip",
    label: "Stadium Spill",
    kind: "market",
    x: -97,
    z: -73,
    radius: 7,
    color: "#22c55e",
    demandTags: ["student", "commuter", "gym"],
    description: "Event crowds spill past the gate and punish empty machines immediately.",
    riskNote: "Demand bursts are huge, but route access gets crowded and visible."
  },
  {
    id: "motel_deadend",
    districtId: "old_town",
    label: "Motel Dead End",
    kind: "route_choke",
    x: 51,
    z: 25,
    radius: 6.2,
    color: "#f97316",
    demandTags: ["night", "commuter"],
    description: "Tourists, clerks, and street contacts pass through a narrow motel lane.",
    riskNote: "Profitable if defended; bad escapes if a former partner sets a trap."
  },
  {
    id: "courthouse_shadow",
    districtId: "old_town",
    label: "Courthouse Shadow",
    kind: "landmark",
    x: 57,
    z: 33,
    radius: 6.5,
    color: "#f8fafc",
    demandTags: ["commuter", "office"],
    description: "Civic traffic wants safe, boring products in a place where everyone watches paperwork.",
    riskNote: "Legal machines thrive; bribes and contraband are punished hard."
  }
];

export const crimeContacts: CrimeContact[] = [
  {
    id: "laundry_lookout",
    districtId: "starter_suburb",
    label: "Coin-Op Lookout",
    kind: "lookout",
    action: "buy_tip",
    x: -16.5,
    z: -8.6,
    radius: 2.6,
    color: "#facc15",
    cost: 18,
    heatRisk: 0.8,
    description: "A local watcher sells inspection timing, rival route gossip, and camera blind spots."
  },
  {
    id: "dock_fixit",
    districtId: "industrial_yards",
    label: "Dockside Fixer",
    kind: "fixer",
    action: "arrange_bribe",
    x: -91,
    z: 51,
    radius: 3.1,
    color: "#fb923c",
    cost: 42,
    heatRisk: 2.2,
    description: "A forklift broker can cool one active inspection or smooth a dirty placement for cash."
  },
  {
    id: "neon_grey_supplier",
    districtId: "neon_quarter",
    label: "Neon Grey Supplier",
    kind: "grey_supplier",
    action: "source_contraband",
    x: 101,
    z: -77,
    radius: 3.4,
    color: "#e879f9",
    cost: 54,
    heatRisk: 4.2,
    productId: "glitch_gum",
    description: "After-hours courier selling fictional grey stock that moves fast and pulls serious heat."
  },
  {
    id: "courthouse_runner",
    districtId: "old_town",
    label: "Courthouse Runner",
    kind: "paperwork",
    action: "arrange_bribe",
    x: 99,
    z: 75,
    radius: 3,
    color: "#fbbf24",
    cost: 65,
    heatRisk: 1.8,
    description: "A paper runner can bury citations, but repeated favors create a visible law-pressure trail."
  }
];

export const districts: Record<string, District> = {
  starter_suburb: {
    id: "starter_suburb",
    name: "Cinderblock Row",
    description: "Low-rent starter blocks with forgiving demand and enough rivals to teach the route.",
    customerArchetypes: ["laundry regulars", "bus commuters", "cheap snack students"],
    riskFlavor: "low police pressure, small rival probes, forgiving landlords",
    bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 14 },
    heatTolerance: 35,
    rentMultiplier: 1,
    requiredContractsCompleted: 0,
    requiredOwnedMachines: 0,
    requiredStreetReputation: 0,
    scoutCost: 0,
    dominantTags: ["laundry", "commuter", "student"],
    unlockCost: 0,
    visualTheme: "brick storefronts and small service stops"
  },
  industrial_yards: {
    id: "industrial_yards",
    name: "Iron Yard",
    description: "Warehouse routes with safer cash flow, longer drives, and steady worker traffic.",
    customerArchetypes: ["shift workers", "drivers", "gym crews", "warehouse supervisors"],
    riskFlavor: "long routes, ambush-prone service roads, lower inspection density",
    bounds: { minX: -124, maxX: -18, minZ: -8, maxZ: 84 },
    heatTolerance: 48,
    rentMultiplier: 1.12,
    requiredContractsCompleted: 1,
    requiredOwnedMachines: 2,
    requiredStreetReputation: 1,
    scoutCost: 20,
    dominantTags: ["commuter", "gym", "utility"],
    unlockCost: 70,
    visualTheme: "freight depots, loading bays, and sodium lamps"
  },
  downtown_loop: {
    id: "downtown_loop",
    name: "Downtown Loop",
    description: "High-traffic transit and office stops with more police attention and higher rent.",
    customerArchetypes: ["office workers", "transit crowds", "premium snack buyers"],
    riskFlavor: "strict inspections, corporate legal pressure, expensive placement rights",
    bounds: { minX: 18, maxX: 124, minZ: -12, maxZ: 52 },
    heatTolerance: 28,
    rentMultiplier: 1.55,
    requiredContractsCompleted: 2,
    requiredOwnedMachines: 3,
    requiredStreetReputation: 2,
    scoutCost: 45,
    dominantTags: ["commuter", "gym", "office"],
    unlockCost: 160,
    visualTheme: "glass fronts, bus shelters, and compact plazas"
  },
  neon_quarter: {
    id: "neon_quarter",
    name: "Neon Quarter",
    description: "Late-night arcades and market lanes where demand is rich but pressure climbs fast.",
    customerArchetypes: ["nightlife crowd", "arcade regulars", "after-hours contacts"],
    riskFlavor: "high grey demand, fast rival retaliation, volatile street reputation",
    bounds: { minX: 4, maxX: 124, minZ: -90, maxZ: -18 },
    heatTolerance: 24,
    rentMultiplier: 1.42,
    requiredContractsCompleted: 2,
    requiredOwnedMachines: 3,
    requiredStreetReputation: 3,
    scoutCost: 55,
    dominantTags: ["arcade", "night", "student"],
    unlockCost: 180,
    visualTheme: "arcade fronts, food stalls, and glowing side streets"
  },
  campus_strip: {
    id: "campus_strip",
    name: "Lockjaw Campus",
    description: "Dorms, library steps, and security booths with steady snack demand and strict patrols.",
    customerArchetypes: ["students", "campus staff", "late study groups"],
    riskFlavor: "steady demand, strict patrols, complaint-sensitive placements",
    bounds: { minX: -124, maxX: -42, minZ: -90, maxZ: -14 },
    heatTolerance: 26,
    rentMultiplier: 1.28,
    requiredContractsCompleted: 3,
    requiredOwnedMachines: 4,
    requiredStreetReputation: 2,
    scoutCost: 50,
    dominantTags: ["student", "commuter", "gym"],
    unlockCost: 175,
    visualTheme: "campus glass, dorm laundry, and security blue lights"
  },
  old_town: {
    id: "old_town",
    name: "Old Town Cut",
    description: "Motels, civic stonework, and dead-end alleys where rival pressure is baked into the rent.",
    customerArchetypes: ["tourists", "court clerks", "motel regulars", "street contacts"],
    riskFlavor: "dead-end chases, former-partner traps, profitable but unstable stops",
    bounds: { minX: 42, maxX: 124, minZ: 18, maxZ: 90 },
    heatTolerance: 22,
    rentMultiplier: 1.35,
    requiredContractsCompleted: 4,
    requiredOwnedMachines: 5,
    requiredStreetReputation: 4,
    scoutCost: 65,
    dominantTags: ["night", "arcade", "commuter"],
    unlockCost: 220,
    visualTheme: "old brick, motel neon, courthouse lights, and tight alleys"
  }
};

export const locations: Record<string, Location> = {
  garage: {
    id: "garage",
    districtId: "starter_suburb",
    name: "Storage Garage",
    kind: "garage",
    position: { x: -9, z: 7 },
    footTraffic: 0,
    safety: 0.8,
    policePresence: 0.1,
    rentCost: 0,
    placementCost: 0,
    rivalPressure: 0,
    demandTags: []
  },
  supplier: {
    id: "supplier",
    districtId: "starter_suburb",
    name: "Backdoor Supplier",
    kind: "supplier",
    position: { x: 8, z: 7 },
    footTraffic: 0,
    safety: 0.65,
    policePresence: 0.12,
    rentCost: 0,
    placementCost: 0,
    rivalPressure: 0,
    demandTags: []
  },
  laundromat: {
    id: "laundromat",
    districtId: "starter_suburb",
    name: "Foam & Fold Laundromat",
    kind: "laundromat",
    position: { x: -5, z: -5 },
    footTraffic: 1.15,
    safety: 0.8,
    policePresence: 0.12,
    rentCost: 12,
    placementCost: 0,
    rivalPressure: 0.1,
    demandTags: ["laundry", "student"]
  },
  gym: {
    id: "gym",
    districtId: "starter_suburb",
    name: "Iron Habit Gym",
    kind: "gym",
    position: { x: 4, z: -6 },
    footTraffic: 1.25,
    safety: 0.72,
    policePresence: 0.18,
    rentCost: 18,
    placementCost: 95,
    rivalPressure: 0.18,
    demandTags: ["gym", "commuter"]
  },
  arcade: {
    id: "arcade",
    districtId: "starter_suburb",
    name: "Pixel Palace Arcade",
    kind: "arcade",
    position: { x: 9, z: -1 },
    footTraffic: 1.4,
    safety: 0.52,
    policePresence: 0.16,
    rentCost: 22,
    placementCost: 145,
    rivalPressure: 0.24,
    demandTags: ["arcade", "student", "night"]
  },
  transit: {
    id: "transit",
    districtId: "starter_suburb",
    name: "South Loop Bus Stop",
    kind: "transit",
    position: { x: -10, z: -1 },
    footTraffic: 1.55,
    safety: 0.58,
    policePresence: 0.32,
    rentCost: 28,
    placementCost: 125,
    rivalPressure: 0.35,
    demandTags: ["commuter"]
  },
  rival_corner: {
    id: "rival_corner",
    districtId: "starter_suburb",
    name: "Redline Corner",
    kind: "corner",
    position: { x: 1, z: 3 },
    footTraffic: 1.05,
    safety: 0.46,
    policePresence: 0.14,
    rentCost: 0,
    placementCost: 0,
    rivalPressure: 0.65,
    demandTags: ["commuter", "night"]
  },
  freight_depot: {
    id: "freight_depot",
    districtId: "industrial_yards",
    name: "Freight Depot Breakroom",
    kind: "transit",
    position: { x: -30, z: -2 },
    footTraffic: 1.32,
    safety: 0.62,
    policePresence: 0.2,
    rentCost: 24,
    placementCost: 135,
    rivalPressure: 0.28,
    demandTags: ["commuter", "utility"]
  },
  warehouse_club: {
    id: "warehouse_club",
    districtId: "industrial_yards",
    name: "Warehouse Fight Club",
    kind: "gym",
    position: { x: -31, z: 9 },
    footTraffic: 1.48,
    safety: 0.42,
    policePresence: 0.1,
    rentCost: 34,
    placementCost: 160,
    rivalPressure: 0.42,
    demandTags: ["gym", "night", "utility"]
  },
  dock_laundry: {
    id: "dock_laundry",
    districtId: "industrial_yards",
    name: "Dockside Wash",
    kind: "laundromat",
    position: { x: -24, z: 18 },
    footTraffic: 1.22,
    safety: 0.5,
    policePresence: 0.16,
    rentCost: 26,
    placementCost: 145,
    rivalPressure: 0.34,
    demandTags: ["laundry", "commuter"]
  },
  metro_concourse: {
    id: "metro_concourse",
    districtId: "downtown_loop",
    name: "Glassline Metro",
    kind: "transit",
    position: { x: 27, z: -7 },
    footTraffic: 1.95,
    safety: 0.64,
    policePresence: 0.42,
    rentCost: 46,
    placementCost: 245,
    rivalPressure: 0.38,
    demandTags: ["commuter", "office"]
  },
  civic_plaza: {
    id: "civic_plaza",
    districtId: "downtown_loop",
    name: "Civic Plaza Steps",
    kind: "corner",
    position: { x: 27, z: 5 },
    footTraffic: 1.72,
    safety: 0.7,
    policePresence: 0.5,
    rentCost: 42,
    placementCost: 230,
    rivalPressure: 0.3,
    demandTags: ["commuter", "student", "office"]
  },
  executive_gym: {
    id: "executive_gym",
    districtId: "downtown_loop",
    name: "Executive Fitness",
    kind: "gym",
    position: { x: 21, z: 11 },
    footTraffic: 1.55,
    safety: 0.78,
    policePresence: 0.36,
    rentCost: 48,
    placementCost: 260,
    rivalPressure: 0.26,
    demandTags: ["gym", "office", "commuter"]
  },
  midnight_arcade: {
    id: "midnight_arcade",
    districtId: "neon_quarter",
    name: "Midnight Token Arcade",
    kind: "arcade",
    position: { x: 8, z: -25 },
    footTraffic: 1.84,
    safety: 0.46,
    policePresence: 0.18,
    rentCost: 38,
    placementCost: 215,
    rivalPressure: 0.48,
    demandTags: ["arcade", "night", "student"]
  },
  karaoke_corner: {
    id: "karaoke_corner",
    districtId: "neon_quarter",
    name: "Karaoke Corner",
    kind: "corner",
    position: { x: 18, z: -24 },
    footTraffic: 1.62,
    safety: 0.5,
    policePresence: 0.22,
    rentCost: 32,
    placementCost: 195,
    rivalPressure: 0.44,
    demandTags: ["night", "student", "commuter"]
  },
  lantern_market: {
    id: "lantern_market",
    districtId: "neon_quarter",
    name: "Lantern Market",
    kind: "arcade",
    position: { x: 29, z: -24 },
    footTraffic: 1.76,
    safety: 0.44,
    policePresence: 0.2,
    rentCost: 36,
    placementCost: 225,
    rivalPressure: 0.5,
    demandTags: ["arcade", "night", "commuter"]
  },
  dorm_laundry: {
    id: "dorm_laundry",
    districtId: "campus_strip",
    name: "Dorm Wash Basement",
    kind: "laundromat",
    position: { x: -55, z: -32 },
    footTraffic: 1.36,
    safety: 0.62,
    policePresence: 0.22,
    rentCost: 30,
    placementCost: 155,
    rivalPressure: 0.26,
    demandTags: ["laundry", "student"]
  },
  campus_quad: {
    id: "campus_quad",
    districtId: "campus_strip",
    name: "Library Quad Steps",
    kind: "corner",
    position: { x: -50, z: -24 },
    footTraffic: 1.68,
    safety: 0.68,
    policePresence: 0.38,
    rentCost: 38,
    placementCost: 190,
    rivalPressure: 0.32,
    demandTags: ["student", "commuter"]
  },
  rec_center: {
    id: "rec_center",
    districtId: "campus_strip",
    name: "Lockjaw Rec Center",
    kind: "gym",
    position: { x: -45, z: -32 },
    footTraffic: 1.48,
    safety: 0.64,
    policePresence: 0.32,
    rentCost: 36,
    placementCost: 180,
    rivalPressure: 0.28,
    demandTags: ["gym", "student"]
  },
  motel_cut: {
    id: "motel_cut",
    districtId: "old_town",
    name: "Last Light Motel",
    kind: "corner",
    position: { x: 50, z: 22 },
    footTraffic: 1.26,
    safety: 0.44,
    policePresence: 0.2,
    rentCost: 34,
    placementCost: 165,
    rivalPressure: 0.46,
    demandTags: ["night", "commuter"]
  },
  courthouse_steps: {
    id: "courthouse_steps",
    districtId: "old_town",
    name: "Civic Annex Steps",
    kind: "transit",
    position: { x: 55, z: 31 },
    footTraffic: 1.42,
    safety: 0.58,
    policePresence: 0.48,
    rentCost: 42,
    placementCost: 205,
    rivalPressure: 0.36,
    demandTags: ["commuter", "office"]
  },
  ghost_arcade: {
    id: "ghost_arcade",
    districtId: "old_town",
    name: "Ghost Cabinet Arcade",
    kind: "arcade",
    position: { x: 46, z: 36 },
    footTraffic: 1.55,
    safety: 0.36,
    policePresence: 0.22,
    rentCost: 32,
    placementCost: 195,
    rivalPressure: 0.52,
    demandTags: ["arcade", "night"]
  },
  refinery_breakroom: {
    id: "refinery_breakroom",
    districtId: "industrial_yards",
    name: "Refinery Breakroom",
    kind: "transit",
    position: { x: -101, z: 37 },
    footTraffic: 1.38,
    safety: 0.56,
    policePresence: 0.16,
    rentCost: 32,
    placementCost: 185,
    rivalPressure: 0.34,
    demandTags: ["commuter", "utility"]
  },
  night_loading_bay: {
    id: "night_loading_bay",
    districtId: "industrial_yards",
    name: "Night Loading Bay",
    kind: "corner",
    position: { x: -88, z: 59 },
    footTraffic: 1.44,
    safety: 0.4,
    policePresence: 0.12,
    rentCost: 35,
    placementCost: 205,
    rivalPressure: 0.5,
    demandTags: ["night", "utility"]
  },
  truck_stop: {
    id: "truck_stop",
    districtId: "industrial_yards",
    name: "Last Mile Truck Stop",
    kind: "transit",
    position: { x: -108, z: -15 },
    footTraffic: 1.5,
    safety: 0.5,
    policePresence: 0.2,
    rentCost: 36,
    placementCost: 210,
    rivalPressure: 0.36,
    demandTags: ["commuter", "utility", "meal"]
  },
  hospital_station: {
    id: "hospital_station",
    districtId: "downtown_loop",
    name: "County Hospital Station",
    kind: "transit",
    position: { x: 82, z: 3 },
    footTraffic: 1.82,
    safety: 0.74,
    policePresence: 0.46,
    rentCost: 54,
    placementCost: 290,
    rivalPressure: 0.24,
    demandTags: ["commuter", "office", "utility"]
  },
  skybridge_kiosk: {
    id: "skybridge_kiosk",
    districtId: "downtown_loop",
    name: "Skybridge Kiosk",
    kind: "corner",
    position: { x: 86, z: 25 },
    footTraffic: 1.9,
    safety: 0.68,
    policePresence: 0.4,
    rentCost: 56,
    placementCost: 310,
    rivalPressure: 0.32,
    demandTags: ["commuter", "office"]
  },
  corporate_arcade: {
    id: "corporate_arcade",
    districtId: "downtown_loop",
    name: "Corporate Arcade Lounge",
    kind: "arcade",
    position: { x: 99, z: 9 },
    footTraffic: 1.72,
    safety: 0.6,
    policePresence: 0.36,
    rentCost: 52,
    placementCost: 300,
    rivalPressure: 0.4,
    demandTags: ["arcade", "office", "night"]
  },
  night_bazaar: {
    id: "night_bazaar",
    districtId: "neon_quarter",
    name: "Underpass Night Bazaar",
    kind: "arcade",
    position: { x: 64, z: -42 },
    footTraffic: 1.88,
    safety: 0.38,
    policePresence: 0.2,
    rentCost: 44,
    placementCost: 255,
    rivalPressure: 0.58,
    demandTags: ["arcade", "night", "commuter"]
  },
  cinema_row: {
    id: "cinema_row",
    districtId: "neon_quarter",
    name: "Cinema Row",
    kind: "corner",
    position: { x: 80, z: -67 },
    footTraffic: 1.7,
    safety: 0.46,
    policePresence: 0.18,
    rentCost: 42,
    placementCost: 245,
    rivalPressure: 0.48,
    demandTags: ["night", "student"]
  },
  tower_arcade: {
    id: "tower_arcade",
    districtId: "neon_quarter",
    name: "Tower Arcade Annex",
    kind: "arcade",
    position: { x: 94, z: -54 },
    footTraffic: 1.8,
    safety: 0.42,
    policePresence: 0.24,
    rentCost: 48,
    placementCost: 275,
    rivalPressure: 0.56,
    demandTags: ["arcade", "night"]
  },
  science_hall: {
    id: "science_hall",
    districtId: "campus_strip",
    name: "Science Hall Machines",
    kind: "corner",
    position: { x: -94, z: -39 },
    footTraffic: 1.58,
    safety: 0.68,
    policePresence: 0.34,
    rentCost: 40,
    placementCost: 210,
    rivalPressure: 0.28,
    demandTags: ["student", "utility"]
  },
  stadium_gate: {
    id: "stadium_gate",
    districtId: "campus_strip",
    name: "Stadium Gate",
    kind: "transit",
    position: { x: -96, z: -75 },
    footTraffic: 1.78,
    safety: 0.58,
    policePresence: 0.32,
    rentCost: 46,
    placementCost: 240,
    rivalPressure: 0.36,
    demandTags: ["student", "commuter", "gym"]
  },
  print_lab: {
    id: "print_lab",
    districtId: "campus_strip",
    name: "Print Lab Lounge",
    kind: "laundromat",
    position: { x: -80, z: -60 },
    footTraffic: 1.42,
    safety: 0.7,
    policePresence: 0.3,
    rentCost: 38,
    placementCost: 205,
    rivalPressure: 0.24,
    demandTags: ["student", "utility"]
  },
  county_gym: {
    id: "county_gym",
    districtId: "old_town",
    name: "County Gym",
    kind: "gym",
    position: { x: 73, z: 60.5 },
    footTraffic: 1.38,
    safety: 0.48,
    policePresence: 0.26,
    rentCost: 38,
    placementCost: 215,
    rivalPressure: 0.4,
    demandTags: ["gym", "commuter"]
  },
  chapel_market: {
    id: "chapel_market",
    districtId: "old_town",
    name: "Chapel Market",
    kind: "corner",
    position: { x: 79, z: 64 },
    footTraffic: 1.46,
    safety: 0.5,
    policePresence: 0.3,
    rentCost: 40,
    placementCost: 225,
    rivalPressure: 0.44,
    demandTags: ["commuter", "night"]
  },
  canal_arcade: {
    id: "canal_arcade",
    districtId: "old_town",
    name: "Canal Cabinet Arcade",
    kind: "arcade",
    position: { x: 96, z: 70 },
    footTraffic: 1.62,
    safety: 0.4,
    policePresence: 0.22,
    rentCost: 42,
    placementCost: 245,
    rivalPressure: 0.54,
    demandTags: ["arcade", "night"]
  }
};

export const worldRoads: WorldRoad[] = [
  { id: "main_avenue", districtId: "starter_suburb", x: 0, z: 0, width: 88, depth: 4.8 },
  { id: "central_cross", districtId: "starter_suburb", x: 0, z: 0, width: 4.8, depth: 68 },
  { id: "west_yard_spur", districtId: "industrial_yards", x: -27, z: 8, width: 4.6, depth: 34 },
  { id: "east_loop_spur", districtId: "downtown_loop", x: 26, z: 2, width: 4.6, depth: 34 },
  { id: "neon_lane", districtId: "neon_quarter", x: 18, z: -22, width: 36, depth: 4.6 },
  { id: "north_service", districtId: "industrial_yards", x: -24, z: 18, width: 18, depth: 4.4 },
  { id: "campus_connector", districtId: "campus_strip", x: -34, z: -24, width: 28, depth: 4.4 },
  { id: "campus_walk", districtId: "campus_strip", x: -50, z: -28, width: 4.4, depth: 28 },
  { id: "campus_row", districtId: "campus_strip", x: -50, z: -32, width: 24, depth: 4.4 },
  { id: "old_town_connector", districtId: "old_town", x: 44, z: 22, width: 28, depth: 4.4 },
  { id: "old_town_cut", districtId: "old_town", x: 51, z: 30, width: 4.4, depth: 26 },
  { id: "courthouse_row", districtId: "old_town", x: 50, z: 36, width: 24, depth: 4.4 },
  { id: "west_outer_artery", districtId: "industrial_yards", x: -72, z: 0, width: 4.8, depth: 112 },
  { id: "east_outer_artery", districtId: "downtown_loop", x: 70, z: 0, width: 4.8, depth: 112 },
  { id: "north_ring", districtId: "old_town", x: -1, z: 50, width: 146, depth: 4.6 },
  { id: "south_ring", districtId: "neon_quarter", x: -1, z: -52, width: 146, depth: 4.6 },
  { id: "industrial_outer_service", districtId: "industrial_yards", x: -54, z: 18, width: 36, depth: 4.4 },
  { id: "neon_service_cut", districtId: "neon_quarter", x: 44, z: -22, width: 4.6, depth: 60 },
  { id: "old_town_outer_row", districtId: "old_town", x: 60, z: 42, width: 34, depth: 4.4 },
  { id: "campus_outer_walk", districtId: "campus_strip", x: -62, z: -31, width: 4.4, depth: 42 },
  { id: "west_far_artery", districtId: "industrial_yards", x: -112, z: 0, width: 4.8, depth: 160 },
  { id: "east_far_artery", districtId: "downtown_loop", x: 112, z: 0, width: 4.8, depth: 160 },
  { id: "north_far_ring", districtId: "old_town", x: 0, z: 82, width: 224, depth: 4.8 },
  { id: "south_far_ring", districtId: "neon_quarter", x: 0, z: -82, width: 224, depth: 4.8 },
  { id: "west_expansion_connector", districtId: "industrial_yards", x: -92, z: 0, width: 44, depth: 4.6 },
  { id: "east_expansion_connector", districtId: "downtown_loop", x: 91, z: 0, width: 46, depth: 4.6 },
  { id: "north_expansion_connector", districtId: "old_town", x: 0, z: 66, width: 4.6, depth: 36 },
  { id: "south_expansion_connector", districtId: "neon_quarter", x: 0, z: -67, width: 4.6, depth: 34 },
  { id: "industrial_far_spine", districtId: "industrial_yards", x: -92, z: 40, width: 4.4, depth: 84 },
  { id: "industrial_refinery_row", districtId: "industrial_yards", x: -94, z: 40, width: 44, depth: 4.4 },
  { id: "industrial_night_row", districtId: "industrial_yards", x: -94, z: 64, width: 44, depth: 4.4 },
  { id: "campus_west_row", districtId: "campus_strip", x: -72, z: -44, width: 44, depth: 4.4 },
  { id: "campus_south_spine", districtId: "campus_strip", x: -84, z: -60, width: 4.4, depth: 44 },
  { id: "campus_south_row", districtId: "campus_strip", x: -86, z: -72, width: 56, depth: 4.4 },
  { id: "financial_spine", districtId: "downtown_loop", x: 94, z: 14, width: 4.4, depth: 32 },
  { id: "financial_row", districtId: "downtown_loop", x: 92, z: 28, width: 44, depth: 4.4 },
  { id: "hospital_row", districtId: "downtown_loop", x: 82, z: 0, width: 34, depth: 4.4 },
  { id: "neon_far_spine", districtId: "neon_quarter", x: 88, z: -52, width: 4.4, depth: 60 },
  { id: "neon_market_cut", districtId: "neon_quarter", x: 66, z: -44, width: 48, depth: 4.4 },
  { id: "neon_south_row", districtId: "neon_quarter", x: 66, z: -70, width: 92, depth: 4.4 },
  { id: "old_town_north_spine", districtId: "old_town", x: 76, z: 55, width: 4.4, depth: 30 },
  { id: "old_town_north_row", districtId: "old_town", x: 86, z: 68, width: 56, depth: 4.4 },
  { id: "old_town_canal_row", districtId: "old_town", x: 96, z: 82, width: 36, depth: 4.4 }
];

export const worldBuildings: WorldBuilding[] = [
  { districtId: "starter_suburb", locationId: "garage", x: -9, z: 8.8, width: 5.5, depth: 3.5, height: 3.2, style: "garage", signText: "STORAGE" },
  { districtId: "starter_suburb", locationId: "supplier", x: 8.4, z: 8.7, width: 4.8, depth: 3.2, height: 3.2, style: "supplier", signText: "SUPPLY" },
  { districtId: "starter_suburb", locationId: "laundromat", x: -5.65, z: -6.85, width: 5.1, depth: 2.9, height: 3.2, style: "laundromat", signText: "FOAM & FOLD" },
  { districtId: "starter_suburb", locationId: "gym", x: 5.65, z: -7.9, width: 5.3, depth: 2.8, height: 3.2, style: "gym", signText: "IRON HABIT" },
  { districtId: "starter_suburb", locationId: "arcade", x: 9.4, z: -5.9, width: 4.3, depth: 3.3, height: 3.6, style: "arcade", signText: "PIXEL" },
  { districtId: "starter_suburb", locationId: "transit", x: -11.8, z: -5.4, width: 3.4, depth: 2.8, height: 3.2, style: "transit", signText: "BUS STOP" },
  { districtId: "starter_suburb", locationId: "rival_corner", x: 5.25, z: 4.8, width: 4.2, depth: 3.2, height: 3.2, style: "rival", signText: "REDLINE" },
  { districtId: "starter_suburb", x: -17.2, z: 6.5, width: 6.1, depth: 3.2, height: 3.2, style: "laundromat", signText: "SOAP ROW" },
  { districtId: "starter_suburb", x: -17.0, z: -6.3, width: 5.4, depth: 3.1, height: 3.3, style: "garage", signText: "LOCKUPS" },
  { districtId: "starter_suburb", x: 16.0, z: 6.4, width: 5.8, depth: 3.4, height: 3.7, style: "supplier", signText: "MARKET" },
  { districtId: "starter_suburb", x: 16.8, z: -6.2, width: 5.1, depth: 3.0, height: 3.2, style: "transit", signText: "DINER" },
  { districtId: "industrial_yards", locationId: "freight_depot", x: -33.2, z: -5.6, width: 5.0, depth: 3.2, height: 3.5, style: "transit", signText: "FREIGHT" },
  { districtId: "industrial_yards", locationId: "warehouse_club", x: -34.2, z: 9.4, width: 5.8, depth: 3.7, height: 3.8, style: "gym", signText: "FIGHT CLUB" },
  { districtId: "industrial_yards", locationId: "dock_laundry", x: -20.8, z: 22.6, width: 5.2, depth: 3.3, height: 3.2, style: "laundromat", signText: "DOCK WASH" },
  { districtId: "industrial_yards", x: -38.3, z: 6.1, width: 5.6, depth: 4.1, height: 3.4, style: "supplier", signText: "COLD STORE" },
  { districtId: "industrial_yards", x: -62.0, z: 13.1, width: 6.2, depth: 3.2, height: 4.1, style: "supplier", signText: "DEPOT 8" },
  { districtId: "industrial_yards", x: -62.5, z: 23.7, width: 6.8, depth: 3.4, height: 4.6, style: "garage", signText: "BAY 12" },
  { districtId: "industrial_yards", x: -80.0, z: 9.5, width: 5.2, depth: 5.0, height: 4.2, style: "supplier", signText: "FORKLIFT" },
  { districtId: "industrial_yards", x: -81.0, z: -17.5, width: 5.5, depth: 4.4, height: 4.8, style: "garage", signText: "SCRAP" },
  { districtId: "downtown_loop", locationId: "metro_concourse", x: 31.0, z: -7.4, width: 4.3, depth: 5.4, height: 5.2, style: "transit", signText: "METRO" },
  { districtId: "downtown_loop", locationId: "civic_plaza", x: 31.2, z: 5.2, width: 4.6, depth: 4.2, height: 4.0, style: "rival", signText: "CIVIC" },
  { districtId: "downtown_loop", locationId: "executive_gym", x: 20.5, z: 14.0, width: 5.7, depth: 3.4, height: 4.4, style: "gym", signText: "EXEC FIT" },
  { districtId: "downtown_loop", x: 36.0, z: 5.6, width: 4.4, depth: 3.8, height: 8.8, style: "supplier", signText: "TOWER" },
  { districtId: "downtown_loop", x: 59.8, z: 8.0, width: 6.2, depth: 4.0, height: 10.4, style: "transit", signText: "GLASS" },
  { districtId: "downtown_loop", x: 60.5, z: -8.2, width: 5.8, depth: 4.0, height: 9.4, style: "gym", signText: "SUITES" },
  { districtId: "downtown_loop", x: 77.0, z: 7.0, width: 5.0, depth: 4.4, height: 11.2, style: "supplier", signText: "ARCADE HQ" },
  { districtId: "downtown_loop", x: 77.5, z: -12.0, width: 5.4, depth: 4.6, height: 10.2, style: "transit", signText: "OFFICES" },
  { districtId: "neon_quarter", locationId: "midnight_arcade", x: 8.1, z: -27.8, width: 5.8, depth: 3.4, height: 4.0, style: "arcade", signText: "MIDNIGHT" },
  { districtId: "neon_quarter", locationId: "karaoke_corner", x: 18.0, z: -27.4, width: 5.1, depth: 3.1, height: 3.6, style: "rival", signText: "KARAOKE" },
  { districtId: "neon_quarter", locationId: "lantern_market", x: 31.6, z: -27.4, width: 4.7, depth: 3.2, height: 4.0, style: "arcade", signText: "LANTERN" },
  { districtId: "neon_quarter", x: 5.0, z: -17.2, width: 4.2, depth: 3.2, height: 3.2, style: "laundromat", signText: "NIGHT WASH" },
  { districtId: "neon_quarter", x: 12.0, z: -44.0, width: 6.2, depth: 4.0, height: 4.5, style: "arcade", signText: "CABINET" },
  { districtId: "neon_quarter", x: 28.0, z: -44.0, width: 6.6, depth: 4.0, height: 5.1, style: "rival", signText: "NOODLES" },
  { districtId: "neon_quarter", x: 54.0, z: -34.0, width: 5.4, depth: 4.6, height: 7.4, style: "arcade", signText: "NEON" },
  { districtId: "neon_quarter", x: 54.0, z: -58.0, width: 6.0, depth: 4.5, height: 6.8, style: "supplier", signText: "MARKET" },
  { districtId: "campus_strip", locationId: "dorm_laundry", x: -55.0, z: -37.2, width: 4.8, depth: 3.3, height: 3.6, style: "laundromat", signText: "DORM WASH" },
  { districtId: "campus_strip", locationId: "campus_quad", x: -56.0, z: -24.0, width: 5.4, depth: 3.6, height: 4.8, style: "transit", signText: "LIBRARY" },
  { districtId: "campus_strip", locationId: "rec_center", x: -43.8, z: -37.1, width: 5.1, depth: 3.2, height: 3.9, style: "gym", signText: "REC CTR" },
  { districtId: "campus_strip", x: -57.8, z: -17.4, width: 3.8, depth: 4.2, height: 3.2, style: "rival", signText: "SECURITY" },
  { districtId: "campus_strip", x: -84.0, z: -31.0, width: 6.0, depth: 4.8, height: 7.2, style: "transit", signText: "DORMS" },
  { districtId: "campus_strip", x: -80.0, z: -34.0, width: 5.8, depth: 4.2, height: 4.1, style: "laundromat", signText: "BIKES" },
  { districtId: "campus_strip", x: -66.2, z: -7.2, width: 5.6, depth: 4.2, height: 6.6, style: "gym", signText: "STUDY" },
  { districtId: "old_town", locationId: "motel_cut", x: 50.0, z: 15.0, width: 5.0, depth: 3.0, height: 3.2, style: "rival", signText: "MOTEL" },
  { districtId: "old_town", locationId: "courthouse_steps", x: 57.8, z: 29.0, width: 4.8, depth: 2.8, height: 4.4, style: "transit", signText: "ANNEX" },
  { districtId: "old_town", locationId: "ghost_arcade", x: 34.5, z: 36.2, width: 5.2, depth: 3.6, height: 3.5, style: "arcade", signText: "GHOST" },
  { districtId: "old_town", x: 58.6, z: 27.2, width: 3.4, depth: 4.2, height: 3.4, style: "laundromat", signText: "HOT WASH" },
  { districtId: "old_town", x: 63.0, z: 30.0, width: 5.0, depth: 4.0, height: 4.2, style: "rival", signText: "PAWN" },
  { districtId: "old_town", x: 76.5, z: 35.0, width: 5.0, depth: 4.0, height: 6.1, style: "supplier", signText: "PRINT" },
  { districtId: "old_town", x: 62.0, z: 46.0, width: 5.0, depth: 3.0, height: 6.3, style: "transit", signText: "HOTEL" },
  { districtId: "old_town", x: 82.0, z: 22.0, width: 5.4, depth: 4.0, height: 4.4, style: "arcade", signText: "BILLIARDS" },
  { districtId: "industrial_yards", locationId: "refinery_breakroom", x: -101.0, z: 34.5, width: 6.0, depth: 3.4, height: 4.6, style: "transit", signText: "REFINERY" },
  { districtId: "industrial_yards", locationId: "night_loading_bay", x: -85.0, z: 58.5, width: 6.0, depth: 4.2, height: 5.0, style: "rival", signText: "NIGHT BAY" },
  { districtId: "industrial_yards", locationId: "truck_stop", x: -104.0, z: -15.0, width: 5.6, depth: 4.8, height: 4.2, style: "transit", signText: "TRUCK STOP" },
  { districtId: "industrial_yards", x: -102.5, z: 45.6, width: 6.4, depth: 3.6, height: 5.8, style: "supplier", signText: "PIPEWORKS" },
  { districtId: "industrial_yards", x: -84.5, z: 34.2, width: 7.2, depth: 4.0, height: 4.8, style: "garage", signText: "CRANE LOT" },
  { districtId: "industrial_yards", x: -103.0, z: 69.2, width: 6.8, depth: 4.4, height: 6.2, style: "supplier", signText: "COLD CHAIN" },
  { districtId: "industrial_yards", x: -84.0, z: 69.4, width: 7.2, depth: 4.2, height: 5.4, style: "garage", signText: "BAY 33" },
  { districtId: "industrial_yards", x: -104.0, z: -25.5, width: 6.2, depth: 4.6, height: 5.2, style: "supplier", signText: "FUEL DESK" },
  { districtId: "downtown_loop", locationId: "hospital_station", x: 82.0, z: 5.6, width: 6.2, depth: 4.0, height: 7.6, style: "transit", signText: "HOSPITAL" },
  { districtId: "downtown_loop", locationId: "skybridge_kiosk", x: 86.0, z: 23.0, width: 6.0, depth: 3.6, height: 8.4, style: "transit", signText: "SKYBRIDGE" },
  { districtId: "downtown_loop", locationId: "corporate_arcade", x: 102.5, z: 9.0, width: 5.8, depth: 4.8, height: 10.8, style: "arcade", signText: "LOUNGE" },
  { districtId: "downtown_loop", x: 83.0, z: -6.4, width: 6.2, depth: 3.6, height: 9.4, style: "supplier", signText: "MED SUPPLY" },
  { districtId: "downtown_loop", x: 102.0, z: 32.8, width: 6.6, depth: 4.4, height: 15.4, style: "supplier", signText: "FINANCE" },
  { districtId: "downtown_loop", x: 106.0, z: 23.2, width: 5.4, depth: 4.2, height: 13.2, style: "gym", signText: "ROOFTOP FIT" },
  { districtId: "downtown_loop", x: 79.0, z: 23.0, width: 5.8, depth: 3.8, height: 12.2, style: "transit", signText: "COURT WALK" },
  { districtId: "neon_quarter", locationId: "night_bazaar", x: 64.0, z: -39.5, width: 6.2, depth: 4.0, height: 5.2, style: "arcade", signText: "BAZAAR" },
  { districtId: "neon_quarter", locationId: "cinema_row", x: 80.0, z: -64.5, width: 6.6, depth: 4.0, height: 6.8, style: "rival", signText: "CINEMA" },
  { districtId: "neon_quarter", locationId: "tower_arcade", x: 97.5, z: -54.0, width: 5.8, depth: 4.4, height: 9.6, style: "arcade", signText: "TOWER" },
  { districtId: "neon_quarter", x: 56.0, z: -39.6, width: 5.8, depth: 3.8, height: 5.6, style: "laundromat", signText: "24H WASH" },
  { districtId: "neon_quarter", x: 78.5, z: -39.8, width: 6.0, depth: 4.0, height: 7.2, style: "supplier", signText: "VAPOR" },
  { districtId: "neon_quarter", x: 78.0, z: -75.8, width: 6.4, depth: 4.2, height: 6.4, style: "arcade", signText: "LASER" },
  { districtId: "neon_quarter", x: 101.0, z: -75.6, width: 6.2, depth: 4.0, height: 8.6, style: "rival", signText: "AFTERHOURS" },
  { districtId: "campus_strip", locationId: "science_hall", x: -94.0, z: -38.5, width: 5.8, depth: 4.0, height: 6.4, style: "transit", signText: "SCIENCE" },
  { districtId: "campus_strip", locationId: "stadium_gate", x: -96.0, z: -76.5, width: 6.6, depth: 4.0, height: 5.8, style: "transit", signText: "STADIUM" },
  { districtId: "campus_strip", locationId: "print_lab", x: -78.0, z: -60.0, width: 5.2, depth: 4.2, height: 4.4, style: "laundromat", signText: "PRINT LAB" },
  { districtId: "campus_strip", x: -96.0, z: -48.5, width: 6.0, depth: 4.2, height: 7.6, style: "gym", signText: "FIELDHOUSE" },
  { districtId: "campus_strip", x: -96.0, z: -66.0, width: 5.8, depth: 4.6, height: 6.8, style: "supplier", signText: "BOOKS" },
  { districtId: "campus_strip", x: -73.0, z: -66.2, width: 5.4, depth: 4.2, height: 5.2, style: "arcade", signText: "LAN ROOM" },
  { districtId: "campus_strip", x: -104.0, z: -76.8, width: 6.4, depth: 4.2, height: 8.4, style: "transit", signText: "ARENA BUS" },
  { districtId: "old_town", locationId: "county_gym", x: 70.0, z: 60.5, width: 5.2, depth: 4.4, height: 4.6, style: "gym", signText: "COUNTY GYM" },
  { districtId: "old_town", locationId: "chapel_market", x: 82.0, z: 62.0, width: 5.0, depth: 4.2, height: 4.0, style: "rival", signText: "CHAPEL" },
  { districtId: "old_town", locationId: "canal_arcade", x: 96.0, z: 73.0, width: 6.0, depth: 4.0, height: 5.8, style: "arcade", signText: "CANAL" },
  { districtId: "old_town", x: 68.0, z: 59.5, width: 5.2, depth: 4.4, height: 5.4, style: "rival", signText: "BAIL BONDS" },
  { districtId: "old_town", x: 88.5, z: 62.0, width: 4.8, depth: 4.0, height: 6.2, style: "laundromat", signText: "SOAPY" },
  { districtId: "old_town", x: 106.0, z: 73.2, width: 5.8, depth: 4.2, height: 7.4, style: "supplier", signText: "ANTIQUES" },
  { districtId: "old_town", x: 102.0, z: 87.6, width: 6.0, depth: 4.4, height: 6.8, style: "transit", signText: "CANAL STOP" }
];

export const worldInteriors: WorldInterior[] = [
  {
    id: "garage_interior",
    districtId: "starter_suburb",
    locationId: "garage",
    label: "Storage Garage",
    style: "garage",
    openSide: "south",
    x: -9,
    z: 8.8,
    width: 5.5,
    depth: 3.5
  },
  {
    id: "supplier_interior",
    districtId: "starter_suburb",
    locationId: "supplier",
    label: "Backdoor Supplier",
    style: "supplier",
    openSide: "south",
    x: 8.4,
    z: 8.7,
    width: 4.8,
    depth: 3.2
  },
  {
    id: "laundromat_interior",
    districtId: "starter_suburb",
    locationId: "laundromat",
    label: "Foam & Fold",
    style: "laundromat",
    openSide: "north",
    x: -5.65,
    z: -6.85,
    width: 5.1,
    depth: 2.9
  }
];

export const machinePlacementAnchors: Record<string, MachinePlacementAnchor> = {
  laundromat: { x: -5.65, z: -4.95, rotationY: Math.PI },
  gym: { x: 5.65, z: -6.05, rotationY: Math.PI },
  arcade: { x: 9.4, z: -3.35, rotationY: Math.PI },
  transit: { x: -9.72, z: -4.65, rotationY: -Math.PI / 2 },
  rival_corner: { x: 2.85, z: 3.2, rotationY: Math.PI / 2 },
  freight_depot: { x: -29.65, z: -5.45, rotationY: -Math.PI / 2 },
  warehouse_club: { x: -29.65, z: 9.4, rotationY: -Math.PI / 2 },
  dock_laundry: { x: -20.8, z: 20.65, rotationY: 0 },
  metro_concourse: { x: 28.65, z: -7.4, rotationY: Math.PI / 2 },
  civic_plaza: { x: 28.75, z: 5.2, rotationY: Math.PI / 2 },
  executive_gym: { x: 20.8, z: 11.45, rotationY: 0 },
  midnight_arcade: { x: 8.1, z: -24.85, rotationY: Math.PI },
  karaoke_corner: { x: 18.0, z: -24.55, rotationY: Math.PI },
  lantern_market: { x: 28.85, z: -24.1, rotationY: Math.PI / 2 },
  dorm_laundry: { x: -55.0, z: -34.95, rotationY: Math.PI },
  campus_quad: { x: -52.75, z: -24.0, rotationY: -Math.PI / 2 },
  rec_center: { x: -43.8, z: -34.75, rotationY: Math.PI },
  motel_cut: { x: 50.0, z: 17.2, rotationY: Math.PI },
  courthouse_steps: { x: 55.2, z: 29.0, rotationY: Math.PI / 2 },
  ghost_arcade: { x: 46.0, z: 35.7, rotationY: 0 },
  refinery_breakroom: { x: -101.0, z: 36.45, rotationY: Math.PI },
  night_loading_bay: { x: -88.2, z: 58.5, rotationY: Math.PI / 2 },
  truck_stop: { x: -107.1, z: -15.0, rotationY: Math.PI / 2 },
  hospital_station: { x: 82.0, z: 3.25, rotationY: 0 },
  skybridge_kiosk: { x: 86.0, z: 25.15, rotationY: Math.PI },
  corporate_arcade: { x: 99.35, z: 9.0, rotationY: Math.PI / 2 },
  night_bazaar: { x: 64.0, z: -41.85, rotationY: 0 },
  cinema_row: { x: 80.0, z: -66.85, rotationY: 0 },
  tower_arcade: { x: 94.35, z: -54.0, rotationY: Math.PI / 2 },
  science_hall: { x: -94.0, z: -40.85, rotationY: 0 },
  stadium_gate: { x: -96.0, z: -74.2, rotationY: Math.PI },
  print_lab: { x: -80.85, z: -60.0, rotationY: Math.PI / 2 },
  county_gym: { x: 72.9, z: 60.5, rotationY: -Math.PI / 2 },
  chapel_market: { x: 79.25, z: 62.0, rotationY: Math.PI / 2 },
  canal_arcade: { x: 96.0, z: 70.7, rotationY: 0 }
};

export const districtLabels: DistrictLabel[] = [
  { districtId: "starter_suburb", x: -1.2, z: 10.8, color: "#2dd4bf" },
  { districtId: "industrial_yards", x: -96.0, z: 64.0, color: "#f59e0b" },
  { districtId: "downtown_loop", x: 92.0, z: 31.5, color: "#38bdf8" },
  { districtId: "neon_quarter", x: 74.0, z: -70.0, color: "#e879f9" },
  { districtId: "campus_strip", x: -92.0, z: -72.0, color: "#a7f3d0" },
  { districtId: "old_town", x: 88.0, z: 82.0, color: "#fca5a5" }
];

export const districtVisualProfiles: Record<string, DistrictVisualProfile> = {
  starter_suburb: {
    accentColor: "#2dd4bf",
    curbColor: "#164e63",
    laneColor: "#e2e8f0",
    lightColor: "#fef3c7"
  },
  industrial_yards: {
    accentColor: "#f59e0b",
    curbColor: "#78350f",
    laneColor: "#fcd34d",
    lightColor: "#fed7aa"
  },
  downtown_loop: {
    accentColor: "#38bdf8",
    curbColor: "#1d4ed8",
    laneColor: "#bfdbfe",
    lightColor: "#dbeafe"
  },
  neon_quarter: {
    accentColor: "#e879f9",
    curbColor: "#86198f",
    laneColor: "#f0abfc",
    lightColor: "#f5d0fe"
  },
  campus_strip: {
    accentColor: "#a7f3d0",
    curbColor: "#047857",
    laneColor: "#d1fae5",
    lightColor: "#ccfbf1"
  },
  old_town: {
    accentColor: "#fca5a5",
    curbColor: "#991b1b",
    laneColor: "#fecaca",
    lightColor: "#fee2e2"
  }
};

export const cityBackdropBuildings: CityBackdropBuilding[] = [
  { districtId: "starter_suburb", x: -19, z: -13, width: 4.2, depth: 3.2, height: 6.2, color: "#475569", lit: 0.35 },
  { districtId: "starter_suburb", x: -14, z: 17, width: 3.8, depth: 4.1, height: 5.4, color: "#334155", lit: 0.28 },
  { districtId: "starter_suburb", x: 14, z: 14, width: 4.8, depth: 3.8, height: 6.8, color: "#1e293b", lit: 0.44 },
  { districtId: "industrial_yards", x: -42, z: 8, width: 5.2, depth: 5.6, height: 5.8, color: "#3f3f46", lit: 0.18 },
  { districtId: "industrial_yards", x: -39, z: 22, width: 4.8, depth: 6.2, height: 7.4, color: "#52525b", lit: 0.22 },
  { districtId: "industrial_yards", x: -20, z: 27, width: 6.2, depth: 4.8, height: 6.6, color: "#334155", lit: 0.2 },
  { districtId: "downtown_loop", x: 18, z: -15, width: 4.2, depth: 4.4, height: 13.2, color: "#164e63", lit: 0.62 },
  { districtId: "downtown_loop", x: 23, z: 19, width: 4.4, depth: 5.2, height: 11.4, color: "#1e3a8a", lit: 0.58 },
  { districtId: "downtown_loop", x: 34, z: 20, width: 5.8, depth: 4.4, height: 16.2, color: "#0f172a", lit: 0.72 },
  { districtId: "downtown_loop", x: 40, z: -8, width: 4.6, depth: 5.4, height: 12.8, color: "#075985", lit: 0.64 },
  { districtId: "neon_quarter", x: 4, z: -37, width: 4.8, depth: 3.8, height: 7.2, color: "#4c1d95", lit: 0.76 },
  { districtId: "neon_quarter", x: 17, z: -39, width: 5.2, depth: 3.8, height: 8.8, color: "#581c87", lit: 0.82 },
  { districtId: "neon_quarter", x: 32, z: -34, width: 4.4, depth: 5.2, height: 7.8, color: "#701a75", lit: 0.78 },
  { districtId: "campus_strip", x: -59, z: -31, width: 3.8, depth: 5.4, height: 8.6, color: "#134e4a", lit: 0.42 },
  { districtId: "campus_strip", x: -49, z: -40, width: 5.2, depth: 4.2, height: 9.8, color: "#0f766e", lit: 0.5 },
  { districtId: "campus_strip", x: -41, z: -25, width: 4.2, depth: 4.8, height: 7.4, color: "#155e75", lit: 0.38 },
  { districtId: "old_town", x: 43, z: 27, width: 4.4, depth: 4.8, height: 7.2, color: "#7f1d1d", lit: 0.4 },
  { districtId: "old_town", x: 51, z: 44, width: 5.8, depth: 3.6, height: 6.8, color: "#450a0a", lit: 0.5 },
  { districtId: "old_town", x: 60, z: 34, width: 3.8, depth: 5.4, height: 8.2, color: "#991b1b", lit: 0.46 },
  { districtId: "industrial_yards", x: -76, z: -24, width: 6.2, depth: 5.8, height: 9.4, color: "#27272a", lit: 0.18 },
  { districtId: "industrial_yards", x: -78, z: 32, width: 7.0, depth: 5.2, height: 8.8, color: "#3f3f46", lit: 0.2 },
  { districtId: "campus_strip", x: -68, z: -45, width: 5.4, depth: 4.8, height: 10.4, color: "#115e59", lit: 0.44 },
  { districtId: "neon_quarter", x: 42, z: -49, width: 5.8, depth: 4.6, height: 9.2, color: "#831843", lit: 0.84 },
  { districtId: "neon_quarter", x: 66, z: -36, width: 4.6, depth: 5.2, height: 10.8, color: "#581c87", lit: 0.74 },
  { districtId: "downtown_loop", x: 72, z: 14, width: 5.4, depth: 5.8, height: 15.4, color: "#0e7490", lit: 0.66 },
  { districtId: "downtown_loop", x: 74, z: -18, width: 4.8, depth: 5.2, height: 13.8, color: "#1d4ed8", lit: 0.62 },
  { districtId: "old_town", x: 74, z: 46, width: 5.6, depth: 4.8, height: 7.8, color: "#7f1d1d", lit: 0.48 },
  { districtId: "old_town", x: 34, z: 54, width: 4.4, depth: 5.4, height: 8.6, color: "#450a0a", lit: 0.42 },
  { districtId: "downtown_loop", x: 52, z: 18, width: 5.6, depth: 5.2, height: 18.6, color: "#082f49", lit: 0.7 },
  { districtId: "downtown_loop", x: 64, z: 24, width: 6.4, depth: 5.4, height: 20.4, color: "#0c4a6e", lit: 0.74 },
  { districtId: "downtown_loop", x: 84, z: 2, width: 5.6, depth: 6.0, height: 17.8, color: "#1e40af", lit: 0.64 },
  { districtId: "downtown_loop", x: 84, z: -28, width: 5.2, depth: 5.8, height: 16.4, color: "#1d4ed8", lit: 0.61 },
  { districtId: "neon_quarter", x: 42, z: -60, width: 6.8, depth: 3.8, height: 13.8, color: "#701a75", lit: 0.84 },
  { districtId: "neon_quarter", x: 70, z: -58, width: 5.4, depth: 4.2, height: 14.6, color: "#9d174d", lit: 0.8 },
  { districtId: "neon_quarter", x: 84, z: -42, width: 5.4, depth: 4.6, height: 12.4, color: "#581c87", lit: 0.76 },
  { districtId: "campus_strip", x: -86, z: -20, width: 5.6, depth: 5.2, height: 13.2, color: "#0f766e", lit: 0.46 },
  { districtId: "campus_strip", x: -72, z: -56, width: 5.8, depth: 4.0, height: 12.2, color: "#155e75", lit: 0.42 },
  { districtId: "industrial_yards", x: -86, z: 4, width: 5.4, depth: 6.0, height: 12.8, color: "#27272a", lit: 0.18 },
  { districtId: "industrial_yards", x: -52, z: 34, width: 7.2, depth: 5.2, height: 11.6, color: "#3f3f46", lit: 0.22 },
  { districtId: "old_town", x: 84, z: 50, width: 5.6, depth: 4.0, height: 11.8, color: "#7f1d1d", lit: 0.5 },
  { districtId: "old_town", x: 44, z: 58, width: 5.2, depth: 4.4, height: 10.8, color: "#450a0a", lit: 0.44 },
  { districtId: "industrial_yards", x: -118, z: 36, width: 7.6, depth: 6.2, height: 13.2, color: "#27272a", lit: 0.16 },
  { districtId: "industrial_yards", x: -116, z: 62, width: 8.2, depth: 5.8, height: 12.6, color: "#3f3f46", lit: 0.18 },
  { districtId: "industrial_yards", x: -88, z: 76, width: 7.4, depth: 5.0, height: 10.8, color: "#52525b", lit: 0.22 },
  { districtId: "industrial_yards", x: -78, z: 52, width: 7.2, depth: 5.6, height: 9.6, color: "#334155", lit: 0.2 },
  { districtId: "downtown_loop", x: 90, z: 38, width: 6.0, depth: 5.4, height: 22.0, color: "#082f49", lit: 0.72 },
  { districtId: "downtown_loop", x: 106, z: 36, width: 6.4, depth: 5.8, height: 24.4, color: "#0c4a6e", lit: 0.76 },
  { districtId: "downtown_loop", x: 118, z: 16, width: 5.8, depth: 6.0, height: 18.6, color: "#1e40af", lit: 0.66 },
  { districtId: "downtown_loop", x: 88, z: -10, width: 5.6, depth: 5.2, height: 17.2, color: "#075985", lit: 0.64 },
  { districtId: "neon_quarter", x: 58, z: -56, width: 6.4, depth: 4.8, height: 11.4, color: "#701a75", lit: 0.84 },
  { districtId: "neon_quarter", x: 74, z: -56, width: 5.8, depth: 5.0, height: 12.8, color: "#831843", lit: 0.82 },
  { districtId: "neon_quarter", x: 92, z: -86, width: 6.2, depth: 4.2, height: 15.6, color: "#9d174d", lit: 0.78 },
  { districtId: "neon_quarter", x: 112, z: -62, width: 5.8, depth: 5.2, height: 14.2, color: "#581c87", lit: 0.76 },
  { districtId: "campus_strip", x: -110, z: -70, width: 6.4, depth: 5.0, height: 10.4, color: "#0f766e", lit: 0.44 },
  { districtId: "campus_strip", x: -98, z: -84, width: 5.8, depth: 4.8, height: 11.8, color: "#155e75", lit: 0.42 },
  { districtId: "campus_strip", x: -74, z: -82, width: 5.6, depth: 5.2, height: 9.8, color: "#134e4a", lit: 0.4 },
  { districtId: "campus_strip", x: -64, z: -56, width: 5.2, depth: 5.0, height: 8.8, color: "#115e59", lit: 0.46 },
  { districtId: "old_town", x: 72, z: 74, width: 5.4, depth: 4.8, height: 9.4, color: "#7f1d1d", lit: 0.46 },
  { districtId: "old_town", x: 88, z: 88, width: 6.2, depth: 4.4, height: 10.2, color: "#450a0a", lit: 0.42 },
  { districtId: "old_town", x: 112, z: 70, width: 5.8, depth: 5.0, height: 8.6, color: "#991b1b", lit: 0.48 },
  { districtId: "old_town", x: 116, z: 84, width: 5.4, depth: 4.2, height: 9.2, color: "#7f1d1d", lit: 0.44 }
];

export const worldDecorations: WorldDecoration[] = [
  { id: "starter_light_west_main", districtId: "starter_suburb", kind: "streetlight", x: -13.4, z: -3.45, rotationY: 0, scale: 1.05, color: "#fef3c7" },
  { id: "starter_light_east_main", districtId: "starter_suburb", kind: "streetlight", x: 13.8, z: 3.45, rotationY: Math.PI, scale: 1.05, color: "#fef3c7" },
  { id: "starter_planter_laundromat", districtId: "starter_suburb", kind: "planter", x: -8.9, z: -4.05, rotationY: 0.1, scale: 0.9, color: "#22c55e" },
  { id: "starter_planter_gym", districtId: "starter_suburb", kind: "planter", x: 4.0, z: -4.1, rotationY: -0.2, scale: 0.86, color: "#84cc16" },
  { id: "starter_dumpster_storage", districtId: "starter_suburb", kind: "dumpster", x: -13.4, z: 8.2, rotationY: Math.PI / 2, scale: 0.95, color: "#334155" },
  { id: "starter_bollards_corner", districtId: "starter_suburb", kind: "bollard", x: 2.8, z: 2.65, rotationY: 0, scale: 1.0, color: "#facc15" },
  { id: "starter_billboard_market", districtId: "starter_suburb", kind: "billboard", x: 19.7, z: 2.9, rotationY: Math.PI, scale: 1.15, color: "#2dd4bf" },
  { id: "industrial_light_service", districtId: "industrial_yards", kind: "streetlight", x: -35.0, z: 14.4, rotationY: 0, scale: 1.1, color: "#fed7aa" },
  { id: "industrial_light_outer", districtId: "industrial_yards", kind: "streetlight", x: -67.5, z: 18.0, rotationY: -Math.PI / 2, scale: 1.18, color: "#fed7aa" },
  { id: "industrial_utility_cold_store", districtId: "industrial_yards", kind: "utility_box", x: -41.8, z: 3.7, rotationY: 0.1, scale: 1.0, color: "#64748b" },
  { id: "industrial_dumpster_scrap", districtId: "industrial_yards", kind: "dumpster", x: -84.6, z: -14.3, rotationY: -0.3, scale: 1.2, color: "#475569" },
  { id: "industrial_bollards_depot", districtId: "industrial_yards", kind: "bollard", x: -29.8, z: -3.1, rotationY: 0, scale: 1.15, color: "#f59e0b" },
  { id: "industrial_billboard_west", districtId: "industrial_yards", kind: "billboard", x: -65.0, z: 28.2, rotationY: Math.PI, scale: 1.2, color: "#f59e0b" },
  { id: "downtown_light_metro", districtId: "downtown_loop", kind: "streetlight", x: 28.9, z: -3.4, rotationY: 0, scale: 1.08, color: "#dbeafe" },
  { id: "downtown_light_plaza", districtId: "downtown_loop", kind: "streetlight", x: 28.9, z: 9.3, rotationY: Math.PI, scale: 1.08, color: "#dbeafe" },
  { id: "downtown_planter_civic", districtId: "downtown_loop", kind: "planter", x: 29.0, z: 7.7, rotationY: 0, scale: 1.0, color: "#38bdf8" },
  { id: "downtown_utility_tower", districtId: "downtown_loop", kind: "utility_box", x: 33.0, z: 3.2, rotationY: 0, scale: 0.92, color: "#475569" },
  { id: "downtown_billboard_outer", districtId: "downtown_loop", kind: "billboard", x: 64.6, z: -3.0, rotationY: Math.PI / 2, scale: 1.25, color: "#38bdf8" },
  { id: "neon_light_midnight", districtId: "neon_quarter", kind: "streetlight", x: 8.0, z: -24.7, rotationY: Math.PI, scale: 1.02, color: "#f5d0fe" },
  { id: "neon_light_market", districtId: "neon_quarter", kind: "streetlight", x: 31.5, z: -24.7, rotationY: Math.PI, scale: 1.02, color: "#f5d0fe" },
  { id: "neon_billboard_south", districtId: "neon_quarter", kind: "billboard", x: 22.0, z: -46.6, rotationY: 0, scale: 1.28, color: "#e879f9" },
  { id: "neon_planter_lane", districtId: "neon_quarter", kind: "planter", x: 23.4, z: -25.4, rotationY: 0.2, scale: 0.9, color: "#a855f7" },
  { id: "neon_dumpster_noodles", districtId: "neon_quarter", kind: "dumpster", x: 31.5, z: -41.4, rotationY: Math.PI / 2, scale: 1.0, color: "#581c87" },
  { id: "campus_light_quad", districtId: "campus_strip", kind: "streetlight", x: -53.4, z: -21.0, rotationY: -Math.PI / 2, scale: 1.0, color: "#ccfbf1" },
  { id: "campus_light_row", districtId: "campus_strip", kind: "streetlight", x: -58.0, z: -34.8, rotationY: Math.PI, scale: 1.0, color: "#ccfbf1" },
  { id: "campus_planter_library", districtId: "campus_strip", kind: "planter", x: -53.6, z: -26.8, rotationY: -0.1, scale: 0.95, color: "#10b981" },
  { id: "campus_bollards_crosswalk", districtId: "campus_strip", kind: "bollard", x: -49.2, z: -27.2, rotationY: 0, scale: 1.2, color: "#a7f3d0" },
  { id: "campus_billboard_dorms", districtId: "campus_strip", kind: "billboard", x: -79.2, z: -24.5, rotationY: -Math.PI / 2, scale: 1.14, color: "#a7f3d0" },
  { id: "oldtown_light_motel", districtId: "old_town", kind: "streetlight", x: 47.0, z: 18.1, rotationY: 0, scale: 1.0, color: "#fee2e2" },
  { id: "oldtown_light_annex", districtId: "old_town", kind: "streetlight", x: 54.4, z: 30.2, rotationY: Math.PI / 2, scale: 1.0, color: "#fee2e2" },
  { id: "oldtown_dumpster_pawn", districtId: "old_town", kind: "dumpster", x: 68.9, z: 27.0, rotationY: -0.2, scale: 1.05, color: "#7f1d1d" },
  { id: "oldtown_utility_hotel", districtId: "old_town", kind: "utility_box", x: 64.9, z: 46.0, rotationY: 0.2, scale: 0.95, color: "#64748b" },
  { id: "oldtown_billboard_outer", districtId: "old_town", kind: "billboard", x: 80.0, z: 28.4, rotationY: Math.PI / 2, scale: 1.16, color: "#fca5a5" },
  { id: "starter_machine_light_laundromat", districtId: "starter_suburb", kind: "streetlight", x: -4.1, z: -4.1, rotationY: Math.PI, scale: 0.88, color: "#ccfbf1" },
  { id: "starter_machine_utility_laundromat", districtId: "starter_suburb", kind: "utility_box", x: -7.6, z: -4.15, rotationY: -0.12, scale: 0.82, color: "#14b8a6" },
  { id: "starter_machine_bollards_gym", districtId: "starter_suburb", kind: "bollard", x: 7.3, z: -4.3, rotationY: 0, scale: 0.9, color: "#fb923c" },
  { id: "starter_machine_light_arcade", districtId: "starter_suburb", kind: "streetlight", x: 10.9, z: -3.15, rotationY: Math.PI, scale: 0.84, color: "#f0abfc" },
  { id: "starter_machine_transit_box", districtId: "starter_suburb", kind: "utility_box", x: -8.85, z: -3.5, rotationY: Math.PI / 2, scale: 0.76, color: "#67e8f9" },
  { id: "industrial_machine_depot_bollards", districtId: "industrial_yards", kind: "bollard", x: -28.55, z: -4.0, rotationY: Math.PI / 2, scale: 0.95, color: "#f59e0b" },
  { id: "industrial_machine_club_light", districtId: "industrial_yards", kind: "streetlight", x: -28.2, z: 12.0, rotationY: -Math.PI / 2, scale: 0.95, color: "#fed7aa" },
  { id: "downtown_machine_metro_kiosk", districtId: "downtown_loop", kind: "utility_box", x: 27.7, z: -5.3, rotationY: Math.PI / 2, scale: 0.82, color: "#38bdf8" },
  { id: "downtown_machine_plaza_bollards", districtId: "downtown_loop", kind: "bollard", x: 27.6, z: 7.0, rotationY: Math.PI / 2, scale: 0.92, color: "#dbeafe" },
  { id: "neon_machine_midnight_billboard", districtId: "neon_quarter", kind: "billboard", x: 5.4, z: -24.4, rotationY: Math.PI / 2, scale: 0.92, color: "#e879f9" },
  { id: "neon_machine_lantern_light", districtId: "neon_quarter", kind: "streetlight", x: 27.2, z: -23.0, rotationY: Math.PI / 2, scale: 0.86, color: "#f5d0fe" },
  { id: "campus_machine_dorm_bollards", districtId: "campus_strip", kind: "bollard", x: -52.9, z: -33.8, rotationY: 0, scale: 0.88, color: "#a7f3d0" },
  { id: "campus_machine_quad_box", districtId: "campus_strip", kind: "utility_box", x: -51.0, z: -25.2, rotationY: -Math.PI / 2, scale: 0.78, color: "#10b981" },
  { id: "oldtown_machine_motel_light", districtId: "old_town", kind: "streetlight", x: 48.5, z: 17.7, rotationY: 0, scale: 0.9, color: "#fecaca" },
  { id: "oldtown_machine_courthouse_bollards", districtId: "old_town", kind: "bollard", x: 55.4, z: 31.0, rotationY: Math.PI / 2, scale: 0.86, color: "#fca5a5" },
  { id: "industrial_refinery_light", districtId: "industrial_yards", kind: "streetlight", x: -101.8, z: 37.3, rotationY: Math.PI, scale: 1.08, color: "#fed7aa" },
  { id: "industrial_refinery_utility", districtId: "industrial_yards", kind: "utility_box", x: -98.0, z: 37.4, rotationY: 0.1, scale: 0.98, color: "#64748b" },
  { id: "industrial_night_bay_bollards", districtId: "industrial_yards", kind: "bollard", x: -88.2, z: 61.4, rotationY: Math.PI / 2, scale: 1.05, color: "#f59e0b" },
  { id: "industrial_truck_billboard", districtId: "industrial_yards", kind: "billboard", x: -106.2, z: -8.4, rotationY: Math.PI / 2, scale: 1.24, color: "#f59e0b" },
  { id: "industrial_far_dumpster", districtId: "industrial_yards", kind: "dumpster", x: -84.8, z: 66.6, rotationY: -0.25, scale: 1.12, color: "#475569" },
  { id: "downtown_hospital_light", districtId: "downtown_loop", kind: "streetlight", x: 78.0, z: 3.0, rotationY: 0, scale: 1.05, color: "#dbeafe" },
  { id: "downtown_hospital_box", districtId: "downtown_loop", kind: "utility_box", x: 85.4, z: 3.2, rotationY: 0.2, scale: 0.9, color: "#38bdf8" },
  { id: "downtown_skybridge_planter", districtId: "downtown_loop", kind: "planter", x: 88.6, z: 25.2, rotationY: -0.15, scale: 0.94, color: "#38bdf8" },
  { id: "downtown_lounge_billboard", districtId: "downtown_loop", kind: "billboard", x: 98.6, z: 14.4, rotationY: Math.PI / 2, scale: 1.18, color: "#38bdf8" },
  { id: "downtown_finance_bollards", districtId: "downtown_loop", kind: "bollard", x: 95.8, z: 25.4, rotationY: 0, scale: 1.0, color: "#dbeafe" },
  { id: "neon_bazaar_light", districtId: "neon_quarter", kind: "streetlight", x: 61.2, z: -46.8, rotationY: Math.PI, scale: 1.02, color: "#f5d0fe" },
  { id: "neon_bazaar_planter", districtId: "neon_quarter", kind: "planter", x: 67.4, z: -46.5, rotationY: 0.2, scale: 0.88, color: "#a855f7" },
  { id: "neon_cinema_billboard", districtId: "neon_quarter", kind: "billboard", x: 84.2, z: -67.2, rotationY: -Math.PI / 2, scale: 1.22, color: "#e879f9" },
  { id: "neon_tower_light", districtId: "neon_quarter", kind: "streetlight", x: 93.4, z: -56.8, rotationY: Math.PI / 2, scale: 1.0, color: "#f5d0fe" },
  { id: "neon_south_dumpster", districtId: "neon_quarter", kind: "dumpster", x: 101.6, z: -72.6, rotationY: 0.2, scale: 1.08, color: "#581c87" },
  { id: "campus_science_light", districtId: "campus_strip", kind: "streetlight", x: -78.8, z: -46.5, rotationY: Math.PI, scale: 1.0, color: "#ccfbf1" },
  { id: "campus_science_planter", districtId: "campus_strip", kind: "planter", x: -73.2, z: -46.4, rotationY: -0.2, scale: 0.9, color: "#10b981" },
  { id: "campus_stadium_bollards", districtId: "campus_strip", kind: "bollard", x: -82.4, z: -75.6, rotationY: 0, scale: 1.08, color: "#a7f3d0" },
  { id: "campus_print_lab_box", districtId: "campus_strip", kind: "utility_box", x: -80.4, z: -62.8, rotationY: Math.PI / 2, scale: 0.84, color: "#10b981" },
  { id: "campus_arena_billboard", districtId: "campus_strip", kind: "billboard", x: -104.0, z: -70.2, rotationY: Math.PI, scale: 1.2, color: "#a7f3d0" },
  { id: "oldtown_county_light", districtId: "old_town", kind: "streetlight", x: 73.6, z: 52.4, rotationY: -Math.PI / 2, scale: 0.98, color: "#fee2e2" },
  { id: "oldtown_chapel_planter", districtId: "old_town", kind: "planter", x: 79.0, z: 61.2, rotationY: 0.2, scale: 0.88, color: "#fca5a5" },
  { id: "oldtown_canal_billboard", districtId: "old_town", kind: "billboard", x: 99.8, z: 70.4, rotationY: -Math.PI / 2, scale: 1.14, color: "#fca5a5" },
  { id: "oldtown_canal_dumpster", districtId: "old_town", kind: "dumpster", x: 108.8, z: 75.8, rotationY: -0.2, scale: 1.02, color: "#7f1d1d" },
  { id: "oldtown_north_utility", districtId: "old_town", kind: "utility_box", x: 76.8, z: 60.5, rotationY: 0.1, scale: 0.88, color: "#64748b" }
];

export const patrolZones: PatrolZone[] = [
  { id: "starter_bus_patrol", districtId: "starter_suburb", label: "Patrol watch", x: -10, z: -1, radius: 4.6, color: "#38bdf8" },
  { id: "downtown_inspection_grid", districtId: "downtown_loop", label: "Inspection grid", x: 27, z: 1, radius: 7.2, color: "#93c5fd" },
  { id: "campus_security_ring", districtId: "campus_strip", label: "Campus security", x: -50, z: -28, radius: 7.0, color: "#a7f3d0" },
  { id: "old_town_heat_box", districtId: "old_town", label: "Heat box", x: 53, z: 31, radius: 6.4, color: "#fca5a5" },
  { id: "industrial_refinery_watch", districtId: "industrial_yards", label: "Refinery watch", x: -96, z: 52, radius: 10.5, color: "#fed7aa" },
  { id: "downtown_financial_watch", districtId: "downtown_loop", label: "Financial watch", x: 94, z: 18, radius: 10.0, color: "#93c5fd" },
  { id: "neon_underpass_heat", districtId: "neon_quarter", label: "Underpass heat", x: 86, z: -58, radius: 10.5, color: "#f0abfc" },
  { id: "campus_stadium_security", districtId: "campus_strip", label: "Stadium security", x: -86, z: -68, radius: 10.5, color: "#a7f3d0" },
  { id: "oldtown_canal_watch", districtId: "old_town", label: "Canal watch", x: 86, z: 68, radius: 11.0, color: "#fca5a5" }
];

export const policePatrolPaths: PolicePatrolPath[] = [
  {
    id: "starter_bus_foot_patrol",
    districtId: "starter_suburb",
    zoneId: "starter_bus_patrol",
    color: "#38bdf8",
    speed: 0.38,
    phase: 0.4,
    path: [
      { x: -12.0, z: -4.4 },
      { x: -7.8, z: -4.4 },
      { x: -7.8, z: 1.2 },
      { x: -12.0, z: 1.2 }
    ]
  },
  {
    id: "downtown_plaza_foot_patrol",
    districtId: "downtown_loop",
    zoneId: "downtown_inspection_grid",
    color: "#93c5fd",
    speed: 0.34,
    phase: 5.6,
    path: [
      { x: 23.2, z: -4.2 },
      { x: 30.8, z: -4.2 },
      { x: 30.8, z: 6.2 },
      { x: 23.2, z: 6.2 }
    ]
  },
  {
    id: "campus_security_foot_patrol",
    districtId: "campus_strip",
    zoneId: "campus_security_ring",
    color: "#a7f3d0",
    speed: 0.32,
    phase: 2.8,
    path: [
      { x: -55.0, z: -32.6 },
      { x: -45.0, z: -32.6 },
      { x: -45.0, z: -23.4 },
      { x: -55.0, z: -23.4 }
    ]
  },
  {
    id: "old_town_annex_foot_patrol",
    districtId: "old_town",
    zoneId: "old_town_heat_box",
    color: "#fca5a5",
    speed: 0.3,
    phase: 8.2,
    path: [
      { x: 49.0, z: 27.2 },
      { x: 57.0, z: 27.2 },
      { x: 57.0, z: 34.8 },
      { x: 49.0, z: 34.8 }
    ]
  },
  {
    id: "industrial_refinery_foot_patrol",
    districtId: "industrial_yards",
    zoneId: "industrial_refinery_watch",
    color: "#fed7aa",
    speed: 0.3,
    phase: 3.2,
    path: [
      { x: -101.0, z: 45.2 },
      { x: -89.0, z: 45.2 },
      { x: -89.0, z: 58.8 },
      { x: -101.0, z: 58.8 }
    ]
  },
  {
    id: "downtown_financial_foot_patrol",
    districtId: "downtown_loop",
    zoneId: "downtown_financial_watch",
    color: "#93c5fd",
    speed: 0.34,
    phase: 6.8,
    path: [
      { x: 88.8, z: 10.5 },
      { x: 99.2, z: 10.5 },
      { x: 99.2, z: 25.5 },
      { x: 88.8, z: 25.5 }
    ]
  },
  {
    id: "neon_underpass_foot_patrol",
    districtId: "neon_quarter",
    zoneId: "neon_underpass_heat",
    color: "#f0abfc",
    speed: 0.36,
    phase: 4.8,
    path: [
      { x: 80.2, z: -66.0 },
      { x: 91.8, z: -66.0 },
      { x: 91.8, z: -50.2 },
      { x: 80.2, z: -50.2 }
    ]
  },
  {
    id: "campus_stadium_foot_patrol",
    districtId: "campus_strip",
    zoneId: "campus_stadium_security",
    color: "#a7f3d0",
    speed: 0.32,
    phase: 1.6,
    path: [
      { x: -93.0, z: -75.0 },
      { x: -79.0, z: -75.0 },
      { x: -79.0, z: -61.0 },
      { x: -93.0, z: -61.0 }
    ]
  },
  {
    id: "oldtown_canal_foot_patrol",
    districtId: "old_town",
    zoneId: "oldtown_canal_watch",
    color: "#fca5a5",
    speed: 0.31,
    phase: 7.4,
    path: [
      { x: 80.0, z: 61.5 },
      { x: 94.0, z: 61.5 },
      { x: 94.0, z: 74.5 },
      { x: 80.0, z: 74.5 }
    ]
  }
];

export const trafficLoops: TrafficLoop[] = [
  {
    id: "main_civilian_loop",
    districtId: "starter_suburb",
    kind: "civilian",
    color: "#64748b",
    speed: 8.5,
    phase: 0,
    path: [
      { x: -38, z: -1.2 },
      { x: 36, z: -1.2 },
      { x: 36, z: 1.2 },
      { x: -38, z: 1.2 }
    ]
  },
  {
    id: "delivery_van_loop",
    districtId: "industrial_yards",
    kind: "delivery",
    color: "#f59e0b",
    speed: 6.2,
    phase: 11,
    path: [
      { x: -28.7, z: -6 },
      { x: -28.7, z: 22 },
      { x: -25.4, z: 22 },
      { x: -25.4, z: -6 }
    ]
  },
  {
    id: "downtown_patrol_loop",
    districtId: "downtown_loop",
    kind: "police",
    color: "#60a5fa",
    speed: 5.8,
    phase: 23,
    path: [
      { x: 24.1, z: -10 },
      { x: 24.1, z: 14 },
      { x: 27.9, z: 14 },
      { x: 27.9, z: -10 }
    ]
  },
  {
    id: "campus_shuttle_loop",
    districtId: "campus_strip",
    kind: "civilian",
    color: "#22c55e",
    speed: 5.4,
    phase: 5,
    path: [
      { x: -58, z: -33.1 },
      { x: -42, z: -33.1 },
      { x: -42, z: -30.9 },
      { x: -58, z: -30.9 }
    ]
  },
  {
    id: "neon_taxi_loop",
    districtId: "neon_quarter",
    kind: "civilian",
    color: "#e879f9",
    speed: 7.2,
    phase: 17,
    path: [
      { x: 3, z: -23.2 },
      { x: 34, z: -23.2 },
      { x: 34, z: -20.9 },
      { x: 3, z: -20.9 }
    ]
  },
  {
    id: "old_town_black_car",
    districtId: "old_town",
    kind: "civilian",
    color: "#111827",
    speed: 5.2,
    phase: 31,
    path: [
      { x: 49.2, z: 19 },
      { x: 49.2, z: 40 },
      { x: 52.8, z: 40 },
      { x: 52.8, z: 19 }
    ]
  },
  {
    id: "outer_ring_traffic_loop",
    districtId: "downtown_loop",
    kind: "civilian",
    color: "#94a3b8",
    speed: 9.6,
    phase: 41,
    path: [
      { x: -72, z: 50 },
      { x: 70, z: 50 },
      { x: 70, z: -52 },
      { x: -72, z: -52 }
    ]
  },
  {
    id: "outer_ring_police_loop",
    districtId: "old_town",
    kind: "police",
    color: "#93c5fd",
    speed: 7.0,
    phase: 58,
    path: [
      { x: 71.2, z: -50 },
      { x: 71.2, z: 48 },
      { x: 68.8, z: 48 },
      { x: 68.8, z: -50 }
    ]
  },
  {
    id: "industrial_refinery_truck_loop",
    districtId: "industrial_yards",
    kind: "delivery",
    color: "#f59e0b",
    speed: 5.6,
    phase: 66,
    path: [
      { x: -112, z: 40 },
      { x: -92, z: 40 },
      { x: -92, z: 64 },
      { x: -112, z: 64 }
    ]
  },
  {
    id: "campus_stadium_shuttle_loop",
    districtId: "campus_strip",
    kind: "civilian",
    color: "#22c55e",
    speed: 5.8,
    phase: 74,
    path: [
      { x: -112, z: -82 },
      { x: -84, z: -82 },
      { x: -84, z: -72 },
      { x: -112, z: -72 }
    ]
  },
  {
    id: "downtown_financial_patrol_loop",
    districtId: "downtown_loop",
    kind: "police",
    color: "#60a5fa",
    speed: 6.0,
    phase: 82,
    path: [
      { x: 94, z: 0 },
      { x: 112, z: 0 },
      { x: 112, z: 28 },
      { x: 94, z: 28 }
    ]
  },
  {
    id: "neon_south_taxi_loop",
    districtId: "neon_quarter",
    kind: "civilian",
    color: "#e879f9",
    speed: 7.4,
    phase: 93,
    path: [
      { x: 88, z: -82 },
      { x: 112, z: -82 },
      { x: 112, z: -70 },
      { x: 88, z: -70 }
    ]
  }
];

export const defaultWorldMapLayout: WorldMapLayout = {
  backdropBuildings: cityBackdropBuildings,
  buildings: worldBuildings,
  decorations: worldDecorations,
  interiors: worldInteriors,
  patrolZones,
  policePatrolPaths,
  roads: worldRoads,
  trafficLoops
};
