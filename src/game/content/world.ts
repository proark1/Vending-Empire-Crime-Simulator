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
  minX: -90,
  maxX: 88,
  minZ: -64,
  maxZ: 62
};

export const districts: Record<string, District> = {
  starter_suburb: {
    id: "starter_suburb",
    name: "Cinderblock Row",
    description: "Low-rent starter blocks with forgiving demand and enough rivals to teach the route.",
    bounds: { minX: -14, maxX: 12, minZ: -10, maxZ: 12 },
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
    bounds: { minX: -40, maxX: -18, minZ: -6, maxZ: 24 },
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
    bounds: { minX: 18, maxX: 38, minZ: -10, maxZ: 16 },
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
    bounds: { minX: 4, maxX: 34, minZ: -32, maxZ: -18 },
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
    bounds: { minX: -58, maxX: -42, minZ: -38, maxZ: -14 },
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
    bounds: { minX: 42, maxX: 58, minZ: 18, maxZ: 42 },
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
  { id: "campus_outer_walk", districtId: "campus_strip", x: -62, z: -31, width: 4.4, depth: 42 }
];

export const worldBuildings: WorldBuilding[] = [
  { districtId: "starter_suburb", locationId: "garage", x: -9, z: 8.8, width: 5.5, depth: 3.5, height: 2.6, style: "garage", signText: "STORAGE" },
  { districtId: "starter_suburb", locationId: "supplier", x: 8.4, z: 8.7, width: 4.8, depth: 3.2, height: 2.4, style: "supplier", signText: "SUPPLY" },
  { districtId: "starter_suburb", locationId: "laundromat", x: -5.65, z: -6.85, width: 5.1, depth: 2.9, height: 2.8, style: "laundromat", signText: "FOAM & FOLD" },
  { districtId: "starter_suburb", locationId: "gym", x: 5.65, z: -7.9, width: 5.3, depth: 2.8, height: 3.1, style: "gym", signText: "IRON HABIT" },
  { districtId: "starter_suburb", locationId: "arcade", x: 9.4, z: -5.9, width: 4.3, depth: 3.3, height: 3.6, style: "arcade", signText: "PIXEL" },
  { districtId: "starter_suburb", locationId: "transit", x: -11.8, z: -5.4, width: 3.4, depth: 2.8, height: 2.7, style: "transit", signText: "BUS STOP" },
  { districtId: "starter_suburb", locationId: "rival_corner", x: 5.25, z: 4.8, width: 4.2, depth: 3.2, height: 2.5, style: "rival", signText: "REDLINE" },
  { districtId: "starter_suburb", x: -17.2, z: 6.5, width: 6.1, depth: 3.2, height: 3.1, style: "laundromat", signText: "SOAP ROW" },
  { districtId: "starter_suburb", x: -17.0, z: -6.3, width: 5.4, depth: 3.1, height: 3.3, style: "garage", signText: "LOCKUPS" },
  { districtId: "starter_suburb", x: 16.0, z: 6.4, width: 5.8, depth: 3.4, height: 3.7, style: "supplier", signText: "MARKET" },
  { districtId: "starter_suburb", x: 16.8, z: -6.2, width: 5.1, depth: 3.0, height: 3.0, style: "transit", signText: "DINER" },
  { districtId: "industrial_yards", locationId: "freight_depot", x: -33.2, z: -5.6, width: 5.0, depth: 3.2, height: 3.5, style: "transit", signText: "FREIGHT" },
  { districtId: "industrial_yards", locationId: "warehouse_club", x: -34.2, z: 9.4, width: 5.8, depth: 3.7, height: 3.8, style: "gym", signText: "FIGHT CLUB" },
  { districtId: "industrial_yards", locationId: "dock_laundry", x: -20.8, z: 22.6, width: 5.2, depth: 3.3, height: 3.0, style: "laundromat", signText: "DOCK WASH" },
  { districtId: "industrial_yards", x: -38.3, z: 6.1, width: 5.6, depth: 4.1, height: 3.4, style: "supplier", signText: "COLD STORE" },
  { districtId: "industrial_yards", x: -62.0, z: 13.1, width: 6.2, depth: 3.2, height: 4.1, style: "supplier", signText: "DEPOT 8" },
  { districtId: "industrial_yards", x: -62.5, z: 23.7, width: 6.8, depth: 3.4, height: 4.6, style: "garage", signText: "BAY 12" },
  { districtId: "industrial_yards", x: -80.0, z: 9.5, width: 5.2, depth: 5.0, height: 4.2, style: "supplier", signText: "FORKLIFT" },
  { districtId: "industrial_yards", x: -81.0, z: -17.5, width: 5.5, depth: 4.4, height: 4.8, style: "garage", signText: "SCRAP" },
  { districtId: "downtown_loop", locationId: "metro_concourse", x: 31.0, z: -7.4, width: 4.3, depth: 5.4, height: 5.2, style: "transit", signText: "METRO" },
  { districtId: "downtown_loop", locationId: "civic_plaza", x: 31.2, z: 5.2, width: 4.6, depth: 4.2, height: 4.0, style: "rival", signText: "CIVIC" },
  { districtId: "downtown_loop", locationId: "executive_gym", x: 20.5, z: 14.0, width: 5.7, depth: 3.4, height: 4.4, style: "gym", signText: "EXEC FIT" },
  { districtId: "downtown_loop", x: 36.0, z: 5.6, width: 4.4, depth: 3.8, height: 5.8, style: "supplier", signText: "TOWER" },
  { districtId: "downtown_loop", x: 59.8, z: 8.0, width: 6.2, depth: 4.0, height: 6.4, style: "transit", signText: "GLASS" },
  { districtId: "downtown_loop", x: 60.5, z: -8.2, width: 5.8, depth: 4.0, height: 5.6, style: "gym", signText: "SUITES" },
  { districtId: "downtown_loop", x: 77.0, z: 7.0, width: 5.0, depth: 4.4, height: 7.6, style: "supplier", signText: "ARCADE HQ" },
  { districtId: "downtown_loop", x: 77.5, z: -12.0, width: 5.4, depth: 4.6, height: 6.8, style: "transit", signText: "OFFICES" },
  { districtId: "neon_quarter", locationId: "midnight_arcade", x: 8.1, z: -27.8, width: 5.8, depth: 3.4, height: 4.0, style: "arcade", signText: "MIDNIGHT" },
  { districtId: "neon_quarter", locationId: "karaoke_corner", x: 18.0, z: -27.4, width: 5.1, depth: 3.1, height: 3.6, style: "rival", signText: "KARAOKE" },
  { districtId: "neon_quarter", locationId: "lantern_market", x: 31.6, z: -27.4, width: 4.7, depth: 3.2, height: 4.0, style: "arcade", signText: "LANTERN" },
  { districtId: "neon_quarter", x: 5.0, z: -17.2, width: 4.2, depth: 3.2, height: 3.1, style: "laundromat", signText: "NIGHT WASH" },
  { districtId: "neon_quarter", x: 12.0, z: -44.0, width: 6.2, depth: 4.0, height: 4.5, style: "arcade", signText: "CABINET" },
  { districtId: "neon_quarter", x: 28.0, z: -44.0, width: 6.6, depth: 4.0, height: 5.1, style: "rival", signText: "NOODLES" },
  { districtId: "neon_quarter", x: 54.0, z: -34.0, width: 5.4, depth: 4.6, height: 5.7, style: "arcade", signText: "NEON" },
  { districtId: "neon_quarter", x: 54.0, z: -58.0, width: 6.0, depth: 4.5, height: 5.2, style: "supplier", signText: "MARKET" },
  { districtId: "campus_strip", locationId: "dorm_laundry", x: -55.0, z: -37.2, width: 4.8, depth: 3.3, height: 3.6, style: "laundromat", signText: "DORM WASH" },
  { districtId: "campus_strip", locationId: "campus_quad", x: -56.0, z: -24.0, width: 5.4, depth: 3.6, height: 4.8, style: "transit", signText: "LIBRARY" },
  { districtId: "campus_strip", locationId: "rec_center", x: -43.8, z: -37.1, width: 5.1, depth: 3.2, height: 3.9, style: "gym", signText: "REC CTR" },
  { districtId: "campus_strip", x: -57.8, z: -17.4, width: 3.8, depth: 4.2, height: 3.1, style: "rival", signText: "SECURITY" },
  { districtId: "campus_strip", x: -84.0, z: -31.0, width: 6.0, depth: 4.8, height: 4.8, style: "transit", signText: "DORMS" },
  { districtId: "campus_strip", x: -84.0, z: -44.0, width: 5.8, depth: 4.2, height: 4.1, style: "laundromat", signText: "BIKES" },
  { districtId: "campus_strip", x: -66.2, z: -7.2, width: 5.6, depth: 4.2, height: 4.9, style: "gym", signText: "STUDY" },
  { districtId: "old_town", locationId: "motel_cut", x: 50.0, z: 15.0, width: 5.0, depth: 3.0, height: 3.2, style: "rival", signText: "MOTEL" },
  { districtId: "old_town", locationId: "courthouse_steps", x: 57.8, z: 29.0, width: 4.8, depth: 2.8, height: 4.4, style: "transit", signText: "ANNEX" },
  { districtId: "old_town", locationId: "ghost_arcade", x: 34.5, z: 36.2, width: 5.2, depth: 3.6, height: 3.5, style: "arcade", signText: "GHOST" },
  { districtId: "old_town", x: 58.6, z: 27.2, width: 3.4, depth: 4.2, height: 3.4, style: "laundromat", signText: "HOT WASH" },
  { districtId: "old_town", x: 63.0, z: 30.0, width: 5.0, depth: 4.0, height: 4.2, style: "rival", signText: "PAWN" },
  { districtId: "old_town", x: 76.5, z: 35.0, width: 5.0, depth: 4.0, height: 4.6, style: "supplier", signText: "PRINT" },
  { districtId: "old_town", x: 62.0, z: 46.0, width: 5.0, depth: 3.0, height: 4.0, style: "transit", signText: "HOTEL" },
  { districtId: "old_town", x: 82.0, z: 24.0, width: 5.4, depth: 4.0, height: 4.4, style: "arcade", signText: "BILLIARDS" }
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
  ghost_arcade: { x: 46.0, z: 35.7, rotationY: 0 }
};

export const districtLabels: DistrictLabel[] = [
  { districtId: "starter_suburb", x: -1.2, z: 10.8, color: "#2dd4bf" },
  { districtId: "industrial_yards", x: -34.0, z: 18.8, color: "#f59e0b" },
  { districtId: "downtown_loop", x: 33.0, z: 13.0, color: "#38bdf8" },
  { districtId: "neon_quarter", x: 17.0, z: -30.0, color: "#e879f9" },
  { districtId: "campus_strip", x: -53.5, z: -16.5, color: "#a7f3d0" },
  { districtId: "old_town", x: 52.0, z: 42.0, color: "#fca5a5" }
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
  { districtId: "old_town", x: 34, z: 54, width: 4.4, depth: 5.4, height: 8.6, color: "#450a0a", lit: 0.42 }
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
  { id: "oldtown_billboard_outer", districtId: "old_town", kind: "billboard", x: 80.0, z: 28.4, rotationY: Math.PI / 2, scale: 1.16, color: "#fca5a5" }
];

export const patrolZones: PatrolZone[] = [
  { id: "starter_bus_patrol", districtId: "starter_suburb", label: "Patrol watch", x: -10, z: -1, radius: 4.6, color: "#38bdf8" },
  { id: "downtown_inspection_grid", districtId: "downtown_loop", label: "Inspection grid", x: 27, z: 1, radius: 7.2, color: "#93c5fd" },
  { id: "campus_security_ring", districtId: "campus_strip", label: "Campus security", x: -50, z: -28, radius: 7.0, color: "#a7f3d0" },
  { id: "old_town_heat_box", districtId: "old_town", label: "Heat box", x: 53, z: 31, radius: 6.4, color: "#fca5a5" }
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
