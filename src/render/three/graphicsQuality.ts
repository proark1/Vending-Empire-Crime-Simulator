import type { WorldMapLayout } from "../../game/content/world";

export type GraphicsQuality = "low" | "medium" | "high";

export interface GraphicsRenderProfile {
  atmosphereParticles: number;
  chunkRadius: number;
  decorationLimit: number;
  detail: GraphicsQuality;
  enableLocalLights: boolean;
  enableShadows: boolean;
  lowPower: boolean;
  maxAmbientNpcs: number;
  maxBackdropBuildings: number;
  maxPatrolZones: number;
  maxPixelRatio: number;
  maxPolicePatrols: number;
  maxTrafficLoops: number;
  shadowMapSize: number;
}

export const graphicsQualityModes: GraphicsQuality[] = ["low", "medium", "high"];

export const graphicsQualityLabels: Record<GraphicsQuality, string> = {
  low: "Low",
  medium: "Medium",
  high: "High"
};

const graphicsQualityStorageKey = "vending-empire.graphics-quality";

export function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return value === "low" || value === "medium" || value === "high";
}

export function loadGraphicsQuality(): GraphicsQuality {
  if (typeof window === "undefined") {
    return "medium";
  }

  const stored = window.localStorage.getItem(graphicsQualityStorageKey);
  return isGraphicsQuality(stored) ? stored : "medium";
}

export function saveGraphicsQuality(quality: GraphicsQuality): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(graphicsQualityStorageKey, quality);
}

export function resolveGraphicsProfile(quality: GraphicsQuality, layout: WorldMapLayout): GraphicsRenderProfile {
  if (quality === "low") {
    return {
      atmosphereParticles: 70,
      chunkRadius: 1,
      decorationLimit: Math.ceil(layout.decorations.length * 0.45),
      detail: "low",
      enableLocalLights: false,
      enableShadows: false,
      lowPower: true,
      maxAmbientNpcs: 4,
      maxBackdropBuildings: Math.min(40, layout.backdropBuildings.length),
      maxPatrolZones: Math.min(2, layout.patrolZones.length),
      maxPixelRatio: 1,
      maxPolicePatrols: Math.min(1, layout.policePatrolPaths.length),
      maxTrafficLoops: Math.min(4, layout.trafficLoops.length),
      shadowMapSize: 0
    };
  }

  if (quality === "high") {
    return {
      atmosphereParticles: 280,
      chunkRadius: 3,
      decorationLimit: layout.decorations.length,
      detail: "high",
      enableLocalLights: true,
      enableShadows: true,
      lowPower: false,
      maxAmbientNpcs: 18,
      maxBackdropBuildings: layout.backdropBuildings.length,
      maxPatrolZones: layout.patrolZones.length,
      maxPixelRatio: 2,
      maxPolicePatrols: layout.policePatrolPaths.length,
      maxTrafficLoops: layout.trafficLoops.length,
      shadowMapSize: 2048
    };
  }

  return {
    atmosphereParticles: 160,
    chunkRadius: 2,
    decorationLimit: Math.ceil(layout.decorations.length * 0.8),
    detail: "medium",
    enableLocalLights: false,
    enableShadows: false,
    lowPower: false,
    maxAmbientNpcs: 12,
    maxBackdropBuildings: layout.backdropBuildings.length,
    maxPatrolZones: Math.min(3, layout.patrolZones.length),
    maxPixelRatio: 1.35,
    maxPolicePatrols: Math.min(2, layout.policePatrolPaths.length),
    maxTrafficLoops: Math.min(7, layout.trafficLoops.length),
    shadowMapSize: 0
  };
}
