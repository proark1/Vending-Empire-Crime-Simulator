import type { Bounds2, District, Location } from "../core/types";

export type BuildingVisualStyle = "garage" | "supplier" | "laundromat" | "gym" | "arcade" | "transit" | "rival";

export interface WorldBuilding {
  depth: number;
  districtId: string;
  height: number;
  signText: string;
  style: BuildingVisualStyle;
  width: number;
  x: number;
  z: number;
}

export interface WorldRoad {
  depth: number;
  id: string;
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

export const worldBounds: Bounds2 = {
  minX: -44,
  maxX: 44,
  minZ: -34,
  maxZ: 34
};

export const districts: Record<string, District> = {
  starter_suburb: {
    id: "starter_suburb",
    name: "Cinderblock Row",
    description: "Low-rent starter blocks with forgiving demand and enough rivals to teach the route.",
    bounds: { minX: -14, maxX: 12, minZ: -10, maxZ: 12 },
    heatTolerance: 35,
    rentMultiplier: 1,
    dominantTags: ["laundry", "commuter", "student"],
    visualTheme: "brick storefronts and small service stops"
  },
  industrial_yards: {
    id: "industrial_yards",
    name: "Iron Yard",
    description: "Warehouse routes with safer cash flow, longer drives, and steady worker traffic.",
    bounds: { minX: -40, maxX: -18, minZ: -6, maxZ: 24 },
    heatTolerance: 48,
    rentMultiplier: 1.18,
    dominantTags: ["commuter", "gym", "utility"],
    visualTheme: "freight depots, loading bays, and sodium lamps"
  },
  downtown_loop: {
    id: "downtown_loop",
    name: "Downtown Loop",
    description: "High-traffic transit and office stops with more police attention and higher rent.",
    bounds: { minX: 18, maxX: 38, minZ: -10, maxZ: 16 },
    heatTolerance: 28,
    rentMultiplier: 1.55,
    dominantTags: ["commuter", "gym", "office"],
    visualTheme: "glass fronts, bus shelters, and compact plazas"
  },
  neon_quarter: {
    id: "neon_quarter",
    name: "Neon Quarter",
    description: "Late-night arcades and market lanes where demand is rich but pressure climbs fast.",
    bounds: { minX: 4, maxX: 34, minZ: -32, maxZ: -18 },
    heatTolerance: 24,
    rentMultiplier: 1.42,
    dominantTags: ["arcade", "night", "student"],
    visualTheme: "arcade fronts, food stalls, and glowing side streets"
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
    placementCost: 155,
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
    placementCost: 185,
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
    placementCost: 165,
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
  }
};

export const worldRoads: WorldRoad[] = [
  { id: "main_avenue", x: 0, z: 0, width: 88, depth: 4.8 },
  { id: "central_cross", x: 0, z: 0, width: 4.8, depth: 68 },
  { id: "west_yard_spur", x: -27, z: 8, width: 4.6, depth: 34 },
  { id: "east_loop_spur", x: 26, z: 2, width: 4.6, depth: 34 },
  { id: "neon_lane", x: 18, z: -22, width: 36, depth: 4.6 },
  { id: "north_service", x: -24, z: 18, width: 18, depth: 4.4 }
];

export const worldBuildings: WorldBuilding[] = [
  { districtId: "starter_suburb", x: -9, z: 8.8, width: 5.5, depth: 3.5, height: 2.6, style: "garage", signText: "STORAGE" },
  { districtId: "starter_suburb", x: 8.4, z: 8.7, width: 4.8, depth: 3.2, height: 2.4, style: "supplier", signText: "SUPPLY" },
  { districtId: "starter_suburb", x: -5.2, z: -7.2, width: 5.8, depth: 2.9, height: 2.8, style: "laundromat", signText: "FOAM & FOLD" },
  { districtId: "starter_suburb", x: 4.3, z: -8.1, width: 5.3, depth: 2.8, height: 3.1, style: "gym", signText: "IRON HABIT" },
  { districtId: "starter_suburb", x: 9.6, z: -2.8, width: 3.4, depth: 4.6, height: 3.6, style: "arcade", signText: "PIXEL" },
  { districtId: "starter_suburb", x: -11.6, z: -2.1, width: 2.8, depth: 5.3, height: 2.7, style: "transit", signText: "BUS STOP" },
  { districtId: "starter_suburb", x: 1.5, z: 4.7, width: 4.2, depth: 3.4, height: 2.5, style: "rival", signText: "REDLINE" },
  { districtId: "industrial_yards", x: -32.3, z: -2.2, width: 5.4, depth: 4.2, height: 3.5, style: "transit", signText: "FREIGHT" },
  { districtId: "industrial_yards", x: -33.4, z: 9.4, width: 5.8, depth: 3.7, height: 3.8, style: "gym", signText: "FIGHT CLUB" },
  { districtId: "industrial_yards", x: -24.2, z: 20.6, width: 5.2, depth: 3.3, height: 3.0, style: "laundromat", signText: "DOCK WASH" },
  { districtId: "industrial_yards", x: -38.3, z: 6.1, width: 5.6, depth: 4.1, height: 3.4, style: "supplier", signText: "COLD STORE" },
  { districtId: "downtown_loop", x: 30.2, z: -7.4, width: 4.3, depth: 5.4, height: 4.4, style: "transit", signText: "METRO" },
  { districtId: "downtown_loop", x: 30.4, z: 5.2, width: 4.6, depth: 4.2, height: 3.4, style: "rival", signText: "CIVIC" },
  { districtId: "downtown_loop", x: 20.9, z: 14.0, width: 5.7, depth: 3.4, height: 4.0, style: "gym", signText: "EXEC FIT" },
  { districtId: "downtown_loop", x: 36.0, z: 1.0, width: 4.4, depth: 5.1, height: 4.2, style: "supplier", signText: "TOWER" },
  { districtId: "neon_quarter", x: 8.1, z: -27.8, width: 5.8, depth: 3.4, height: 3.8, style: "arcade", signText: "MIDNIGHT" },
  { districtId: "neon_quarter", x: 18.0, z: -27.2, width: 5.1, depth: 3.1, height: 3.2, style: "rival", signText: "KARAOKE" },
  { districtId: "neon_quarter", x: 31.6, z: -24.1, width: 4.7, depth: 4.5, height: 3.6, style: "arcade", signText: "LANTERN" },
  { districtId: "neon_quarter", x: 3.7, z: -20.5, width: 4.2, depth: 4.6, height: 3.1, style: "laundromat", signText: "NIGHT WASH" }
];

export const machinePlacementAnchors: Record<string, MachinePlacementAnchor> = {
  laundromat: { x: -5.2, z: -5.15, rotationY: Math.PI },
  gym: { x: 4.25, z: -6.05, rotationY: Math.PI },
  arcade: { x: 8.75, z: 0.05, rotationY: Math.PI },
  transit: { x: -9.72, z: -1.1, rotationY: -Math.PI / 2 },
  rival_corner: { x: 1.35, z: 2.38, rotationY: 0 },
  freight_depot: { x: -28.65, z: -1.8, rotationY: -Math.PI / 2 },
  warehouse_club: { x: -29.65, z: 9.4, rotationY: -Math.PI / 2 },
  dock_laundry: { x: -24.2, z: 18.25, rotationY: 0 },
  metro_concourse: { x: 27.45, z: -7.4, rotationY: Math.PI / 2 },
  civic_plaza: { x: 27.5, z: 5.2, rotationY: Math.PI / 2 },
  executive_gym: { x: 20.8, z: 11.45, rotationY: 0 },
  midnight_arcade: { x: 8.1, z: -24.85, rotationY: Math.PI },
  karaoke_corner: { x: 18.0, z: -24.55, rotationY: Math.PI },
  lantern_market: { x: 28.85, z: -24.1, rotationY: Math.PI / 2 }
};

export const districtLabels: DistrictLabel[] = [
  { districtId: "starter_suburb", x: -1.2, z: 10.8, color: "#2dd4bf" },
  { districtId: "industrial_yards", x: -34.0, z: 18.8, color: "#f59e0b" },
  { districtId: "downtown_loop", x: 33.0, z: 13.0, color: "#38bdf8" },
  { districtId: "neon_quarter", x: 17.0, z: -30.0, color: "#e879f9" }
];
