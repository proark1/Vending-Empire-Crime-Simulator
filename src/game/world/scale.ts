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
