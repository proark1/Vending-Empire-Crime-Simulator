export type ModelCategory = "vehicles" | "units" | "machines" | "buildings" | "props";

export interface ModelTransform {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

export interface ModelDefinition {
  category: ModelCategory;
  description: string;
  id: string;
  label: string;
}

export type ModelConfig = Record<string, ModelTransform>;

export const MODEL_CONFIG_KEY = "vendetta-vending.model-config.v1";
export const MODEL_CONFIG_UPDATED_EVENT = "vendetta-vending:model-config-updated";

const MODEL_CONFIG_VERSION = 1;

interface StoredModelConfig {
  config: ModelConfig;
  updatedAt: string;
  version: number;
}

export const modelCatalog: ModelDefinition[] = [
  { id: "vehicle.route_van", category: "vehicles", label: "Route van", description: "Player route vehicle used for stock runs." },
  { id: "vehicle.civilian", category: "vehicles", label: "Civilian car", description: "Ambient traffic sedan." },
  { id: "vehicle.delivery", category: "vehicles", label: "Delivery truck", description: "Ambient box truck and supply traffic." },
  { id: "vehicle.police", category: "vehicles", label: "Police cruiser", description: "Police traffic and patrol vehicle." },
  { id: "unit.player", category: "units", label: "Player human", description: "The player avatar. Human scale remains the world reference." },
  { id: "unit.customer", category: "units", label: "Customer", description: "Ambient customer characters." },
  { id: "unit.worker", category: "units", label: "Worker", description: "Crew and supplier worker characters." },
  { id: "unit.rival", category: "units", label: "Rival", description: "Rival crew and intruder characters." },
  { id: "unit.scout", category: "units", label: "Scout / officer", description: "Scouts, patrol officers, and watcher characters." },
  { id: "machine.vending", category: "machines", label: "Vending machine", description: "Installed machine cabinet." },
  { id: "machine.placement_pad", category: "machines", label: "Placement pad", description: "Available vending pad marker." },
  { id: "machine.storage_bay", category: "machines", label: "Storage bay", description: "Garage storage rack and stock staging." },
  { id: "stock.crate", category: "machines", label: "Stock crate", description: "Product crates carried, stored, or loaded." },
  { id: "building.storefront", category: "buildings", label: "Storefront building", description: "Playable city building shell." },
  { id: "building.backdrop", category: "buildings", label: "Backdrop building", description: "Distant non-playable skyline block." },
  { id: "prop.streetlight", category: "props", label: "Streetlight", description: "Sidewalk pole light." },
  { id: "prop.billboard", category: "props", label: "Billboard", description: "Street ad sign and frame." },
  { id: "prop.bollard", category: "props", label: "Bollard", description: "Short sidewalk blocker." },
  { id: "prop.dumpster", category: "props", label: "Dumpster", description: "Alley dumpster prop." },
  { id: "prop.planter", category: "props", label: "Planter", description: "Sidewalk plant box." },
  { id: "prop.utility_box", category: "props", label: "Utility box", description: "Street utility cabinet." }
];

export const defaultModelTransform: ModelTransform = {
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1
};

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function cloneTransform(transform: ModelTransform): ModelTransform {
  return { ...transform };
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeScale(value: unknown): number {
  return Math.min(5, Math.max(0.1, readNumber(value, 1)));
}

function normalizeOffset(value: unknown): number {
  return Math.min(20, Math.max(-20, readNumber(value, 0)));
}

function normalizeRotation(value: unknown): number {
  return readNumber(value, 0);
}

export function normalizeModelTransform(candidate: unknown): ModelTransform {
  const input = typeof candidate === "object" && candidate !== null ? candidate as Partial<ModelTransform> : {};
  return {
    offsetX: normalizeOffset(input.offsetX),
    offsetY: normalizeOffset(input.offsetY),
    offsetZ: normalizeOffset(input.offsetZ),
    rotationX: normalizeRotation(input.rotationX),
    rotationY: normalizeRotation(input.rotationY),
    rotationZ: normalizeRotation(input.rotationZ),
    scaleX: normalizeScale(input.scaleX),
    scaleY: normalizeScale(input.scaleY),
    scaleZ: normalizeScale(input.scaleZ)
  };
}

export function createDefaultModelConfig(): ModelConfig {
  return Object.fromEntries(modelCatalog.map((model) => [model.id, cloneTransform(defaultModelTransform)]));
}

export function normalizeModelConfig(candidate: unknown): ModelConfig {
  const input = typeof candidate === "object" && candidate !== null ? candidate as Partial<ModelConfig> : {};
  return Object.fromEntries(modelCatalog.map((model) => [model.id, normalizeModelTransform(input[model.id])]));
}

export function modelTransformFor(config: ModelConfig, modelId: string): ModelTransform {
  return normalizeModelTransform(config[modelId]);
}

export function loadModelConfig(): ModelConfig {
  if (!hasBrowserStorage()) {
    return createDefaultModelConfig();
  }

  const raw = window.localStorage.getItem(MODEL_CONFIG_KEY);
  if (!raw) {
    return createDefaultModelConfig();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredModelConfig> | ModelConfig;
    if (typeof parsed === "object" && parsed !== null && "config" in parsed && parsed.version === MODEL_CONFIG_VERSION) {
      return normalizeModelConfig(parsed.config);
    }

    return normalizeModelConfig(parsed);
  } catch {
    return createDefaultModelConfig();
  }
}

export function saveModelConfig(config: ModelConfig): void {
  if (!hasBrowserStorage()) {
    return;
  }

  const stored: StoredModelConfig = {
    config: normalizeModelConfig(config),
    updatedAt: new Date().toISOString(),
    version: MODEL_CONFIG_VERSION
  };
  window.localStorage.setItem(MODEL_CONFIG_KEY, JSON.stringify(stored));
  window.dispatchEvent(new CustomEvent(MODEL_CONFIG_UPDATED_EVENT));
}

export function clearModelConfig(): void {
  if (!hasBrowserStorage()) {
    return;
  }

  window.localStorage.removeItem(MODEL_CONFIG_KEY);
  window.dispatchEvent(new CustomEvent(MODEL_CONFIG_UPDATED_EVENT));
}

