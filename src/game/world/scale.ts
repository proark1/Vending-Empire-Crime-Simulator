export const WORLD_SCALE = {
  human: {
    height: 1.68,
    radius: 0.36
  },
  building: {
    minimumStorefrontHeight: 3.2,
    floorHeight: 2.8,
    door: {
      frameHeight: 2.2,
      frameWidth: 1.04,
      height: 2.05,
      width: 0.86
    },
    storefrontWindow: {
      frameHeight: 1.42,
      height: 1.22,
      sillHeight: 0.42
    },
    upperWindow: {
      frameHeight: 1.0,
      frameWidth: 0.82,
      height: 0.82,
      sillHeight: 0.08,
      width: 0.64
    }
  },
  road: {
    laneWidth: 3.1,
    minimumStreetWidth: 4.2,
    sidewalkWidth: 2
  },
  // Shared layout thresholds. The procedural generator and the map validator
  // both read these so they can never disagree about what "navigable" means.
  layout: {
    // Clear corridor required between two building footprints so a pedestrian
    // (radius 0.36, axis-separated sliding) can comfortably walk around them.
    minBuildingGap: 1.6,
    // Distance a building face must keep from the nearest sidewalk/road edge.
    minBuildingSetback: 0.6,
    // Setback band between the sidewalk and the front wall when placing lots.
    placementSetback: 0.8,
    // Walkable gap down the middle of a deep, back-to-back block.
    alleyWidth: 3,
    // Near-exact overlap clearance for final integrity checks. Far below the
    // snap grid (1e-3) so real crossings are caught, but above the float
    // round-trip noise of center+size geometry so it is not falsely flagged.
    finalOverlapClearance: 1e-4
  },
  vehicle: {
    bodyHeight: 0.92,
    clearance: 0.24,
    deliveryLength: 5.35,
    deliveryWidth: 2.05,
    height: 1.72,
    length: 4.35,
    policeLength: 4.55,
    policeWidth: 1.9,
    width: 1.82
  }
} as const;
