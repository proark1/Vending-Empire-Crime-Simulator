export type AudioCategory = "sound" | "music" | "voice";

export interface AudioAsset {
  category: AudioCategory;
  id: string;
  label: string;
  loop: boolean;
  sizeBytes?: number | null;
  url: string;
  volume: number;
}

export interface AudioCue {
  assetId: string;
  category: AudioCategory;
  cooldownMs: number;
  duckMusic: boolean;
  enabled: boolean;
  id: string;
  label: string;
  priority: number;
  speaker: string;
  subtitle: string;
  trigger: string;
}

export interface AudioMixerSettings {
  masterVolume: number;
  musicVolume: number;
  muted: boolean;
  soundVolume: number;
  voiceDucking: number;
  voiceVolume: number;
}

export interface AudioConfig {
  assets: AudioAsset[];
  cues: AudioCue[];
  mixer: AudioMixerSettings;
  version: 1;
}

export interface AudioValidationIssue {
  message: string;
  severity: "error" | "warning";
}

export const audioTriggerOptions: Array<{ category: AudioCategory; label: string; trigger: string }> = [
  { category: "music", trigger: "music.ambient", label: "Ambient loop" },
  { category: "music", trigger: "music.heat", label: "High heat loop" },
  { category: "music", trigger: "music.conflict", label: "Conflict loop" },
  { category: "sound", trigger: "feedback.cash", label: "Cash collected" },
  { category: "sound", trigger: "feedback.pickup", label: "Picked up crate" },
  { category: "sound", trigger: "feedback.store", label: "Stored crate" },
  { category: "sound", trigger: "feedback.stock", label: "Stocked machine" },
  { category: "sound", trigger: "feedback.vehicle", label: "Vehicle cargo" },
  { category: "sound", trigger: "feedback.route", label: "Route guidance" },
  { category: "sound", trigger: "feedback.fleet", label: "Fleet service" },
  { category: "sound", trigger: "feedback.repair", label: "Machine repaired" },
  { category: "sound", trigger: "feedback.upgrade", label: "Upgrade installed" },
  { category: "sound", trigger: "feedback.install", label: "Machine placed" },
  { category: "sound", trigger: "feedback.sabotage", label: "Sabotage" },
  { category: "sound", trigger: "feedback.fight", label: "Fight" },
  { category: "sound", trigger: "feedback.melee", label: "Melee conflict" },
  { category: "sound", trigger: "feedback.escape", label: "Escape" },
  { category: "sound", trigger: "feedback.lockdown", label: "Remote lockdown" },
  { category: "sound", trigger: "feedback.scout", label: "District scouted" },
  { category: "sound", trigger: "feedback.district", label: "District unlocked" },
  { category: "sound", trigger: "event.good", label: "Good event" },
  { category: "sound", trigger: "event.warning", label: "Warning event" },
  { category: "sound", trigger: "event.danger", label: "Danger event" },
  { category: "sound", trigger: "event.neutral", label: "Neutral event" },
  { category: "sound", trigger: "event.festival", label: "Festival event" },
  { category: "sound", trigger: "event.weather", label: "Weather shift" },
  { category: "sound", trigger: "event.shortage", label: "Supply shortage" },
  { category: "sound", trigger: "event.trend", label: "Demand trend" },
  { category: "voice", trigger: "voice.district_entry", label: "District entry voice" },
  { category: "voice", trigger: "voice.heat_warning", label: "Heat warning voice" },
  { category: "voice", trigger: "voice.rival_attack", label: "Rival attack voice" },
  { category: "voice", trigger: "voice.mission_complete", label: "Mission complete voice" },
  { category: "voice", trigger: "voice.supplier_offer", label: "Supplier offer voice" },
  { category: "voice", trigger: "voice.fixer_tip", label: "Fixer tip voice" },
  { category: "voice", trigger: "voice.landlord_pressure", label: "Landlord pressure voice" },
  { category: "voice", trigger: "voice.rival_boss_threat", label: "Rival boss threat voice" },
  { category: "voice", trigger: "voice.mechanic_unlock", label: "Mechanic unlock voice" },
  { category: "voice", trigger: "voice.driver_warning", label: "Driver warning voice" },
  { category: "voice", trigger: "voice.guard_contact", label: "Guard contact voice" },
  { category: "voice", trigger: "voice.inspector_notice", label: "Inspector notice voice" },
  { category: "voice", trigger: "voice.lawyer_notice", label: "Lawyer notice voice" },
  { category: "voice", trigger: "voice.informant_tip", label: "Informant tip voice" }
];

const defaultMixer: AudioMixerSettings = {
  masterVolume: 0.8,
  musicVolume: 0.65,
  muted: false,
  soundVolume: 0.8,
  voiceDucking: 0.45,
  voiceVolume: 0.9
};

const defaultAudioAssets: AudioAsset[] = [
  { id: "synth_music_city_bed", category: "music", label: "Procedural city bed", loop: true, sizeBytes: 0, url: "synth://music/city_bed", volume: 0.7 },
  { id: "synth_music_heat", category: "music", label: "Procedural heat bed", loop: true, sizeBytes: 0, url: "synth://music/heat", volume: 0.78 },
  { id: "synth_music_conflict", category: "music", label: "Procedural conflict pulse", loop: true, sizeBytes: 0, url: "synth://music/conflict", volume: 0.84 },
  { id: "synth_sound_cash", category: "sound", label: "Register chime", loop: false, sizeBytes: 0, url: "synth://sound/cash", volume: 0.85 },
  { id: "synth_sound_crate", category: "sound", label: "Crate handling", loop: false, sizeBytes: 0, url: "synth://sound/crate", volume: 0.8 },
  { id: "synth_sound_tools", category: "sound", label: "Tool burst", loop: false, sizeBytes: 0, url: "synth://sound/tools", volume: 0.78 },
  { id: "synth_sound_route_ping", category: "sound", label: "Route planner ping", loop: false, sizeBytes: 0, url: "synth://sound/route_ping", volume: 0.78 },
  { id: "synth_sound_vehicle_roll", category: "sound", label: "Vehicle cargo roll", loop: false, sizeBytes: 0, url: "synth://sound/vehicle_roll", volume: 0.8 },
  { id: "synth_sound_service_rattle", category: "sound", label: "Service rattle", loop: false, sizeBytes: 0, url: "synth://sound/service_rattle", volume: 0.78 },
  { id: "synth_sound_event_crowd", category: "sound", label: "District crowd swell", loop: false, sizeBytes: 0, url: "synth://sound/event_crowd", volume: 0.72 },
  { id: "synth_sound_weather_shift", category: "sound", label: "Weather shift", loop: false, sizeBytes: 0, url: "synth://sound/weather_shift", volume: 0.72 },
  { id: "synth_sound_shortage_tick", category: "sound", label: "Shortage tick", loop: false, sizeBytes: 0, url: "synth://sound/shortage_tick", volume: 0.75 },
  { id: "synth_sound_conflict", category: "sound", label: "Conflict hit", loop: false, sizeBytes: 0, url: "synth://sound/conflict", volume: 0.86 },
  { id: "synth_sound_alert", category: "sound", label: "System alert", loop: false, sizeBytes: 0, url: "synth://sound/alert", volume: 0.82 },
  { id: "synth_voice_radio", category: "voice", label: "Radio voice pulse", loop: false, sizeBytes: 0, url: "synth://voice/radio", volume: 0.72 }
];

const defaultCueAssetByTrigger: Record<string, string> = {
  "music.ambient": "synth_music_city_bed",
  "music.heat": "synth_music_heat",
  "music.conflict": "synth_music_conflict",
  "feedback.cash": "synth_sound_cash",
  "feedback.pickup": "synth_sound_crate",
  "feedback.store": "synth_sound_crate",
  "feedback.stock": "synth_sound_crate",
  "feedback.vehicle": "synth_sound_vehicle_roll",
  "feedback.route": "synth_sound_route_ping",
  "feedback.fleet": "synth_sound_service_rattle",
  "feedback.repair": "synth_sound_service_rattle",
  "feedback.upgrade": "synth_sound_tools",
  "feedback.install": "synth_sound_tools",
  "feedback.sabotage": "synth_sound_conflict",
  "feedback.fight": "synth_sound_conflict",
  "feedback.melee": "synth_sound_conflict",
  "feedback.escape": "synth_sound_tools",
  "feedback.lockdown": "synth_sound_alert",
  "feedback.scout": "synth_sound_route_ping",
  "feedback.district": "synth_sound_alert",
  "event.good": "synth_sound_cash",
  "event.warning": "synth_sound_alert",
  "event.danger": "synth_sound_conflict",
  "event.neutral": "synth_sound_route_ping",
  "event.festival": "synth_sound_event_crowd",
  "event.weather": "synth_sound_weather_shift",
  "event.shortage": "synth_sound_shortage_tick",
  "event.trend": "synth_sound_cash"
};

function defaultAudioCues(): AudioCue[] {
  return audioTriggerOptions.map((option, index) => {
    const assetId = defaultCueAssetByTrigger[option.trigger] ?? (option.category === "voice" ? "synth_voice_radio" : "synth_sound_alert");
    return {
      assetId,
      category: option.category,
      cooldownMs: option.category === "music" ? 0 : option.category === "voice" ? 2500 : 120,
      duckMusic: option.category === "voice",
      enabled: true,
      id: `default_${option.trigger.replace(/[^a-z0-9]+/g, "_")}_${index}`,
      label: option.label,
      priority: option.category === "music" ? 10 : option.category === "voice" ? 6 : 4,
      speaker: option.category === "voice" ? "Radio" : "",
      subtitle: option.category === "voice" ? option.label : "",
      trigger: option.trigger
    };
  });
}

function cloneConfig(config: AudioConfig): AudioConfig {
  return JSON.parse(JSON.stringify(config)) as AudioConfig;
}

function clamp(value: unknown, fallback: number, min = 0, max = 1): number {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function categoryValue(value: unknown, fallback: AudioCategory): AudioCategory {
  return value === "sound" || value === "music" || value === "voice" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function integerValue(value: unknown, fallback: number, min: number, max: number): number {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function idFromLabel(label: string, fallback: string): string {
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return id || fallback;
}

export function createDefaultAudioConfig(): AudioConfig {
  return cloneConfig({
    assets: defaultAudioAssets,
    cues: defaultAudioCues(),
    mixer: defaultMixer,
    version: 1
  });
}

export function normalizeAudioConfig(candidate: unknown): AudioConfig {
  const input = typeof candidate === "object" && candidate !== null ? candidate as Partial<AudioConfig> : {};
  const mixerInput = typeof input.mixer === "object" && input.mixer !== null ? input.mixer as Partial<AudioMixerSettings> : {};
  const assetsInput = Array.isArray(input.assets) ? input.assets : [];
  const cuesInput = Array.isArray(input.cues) ? input.cues : [];

  const assets = assetsInput.map((assetInput, index) => {
    const asset = typeof assetInput === "object" && assetInput !== null ? assetInput as Partial<AudioAsset> : {};
    const label = stringValue(asset.label, `Asset ${index + 1}`);
    const category = categoryValue(asset.category, "sound");
    return {
      category,
      id: stringValue(asset.id, idFromLabel(label, `asset_${index + 1}`)),
      label,
      loop: booleanValue(asset.loop, category === "music"),
      sizeBytes: typeof asset.sizeBytes === "number" && Number.isFinite(asset.sizeBytes) ? Math.max(0, Math.round(asset.sizeBytes)) : null,
      url: stringValue(asset.url),
      volume: clamp(asset.volume, 0.8)
    };
  });
  const assetIds = new Set(assets.map((asset) => asset.id));
  for (const defaultAsset of defaultAudioAssets) {
    if (!assetIds.has(defaultAsset.id)) {
      assets.push({ ...defaultAsset, sizeBytes: defaultAsset.sizeBytes ?? null });
      assetIds.add(defaultAsset.id);
    }
  }

  const cues = cuesInput.map((cueInput, index) => {
    const cue = typeof cueInput === "object" && cueInput !== null ? cueInput as Partial<AudioCue> : {};
    const trigger = stringValue(cue.trigger, audioTriggerOptions[index % audioTriggerOptions.length]?.trigger ?? "feedback.cash");
    const triggerMeta = audioTriggerOptions.find((option) => option.trigger === trigger);
    const category = categoryValue(cue.category, triggerMeta?.category ?? "sound");
    const label = stringValue(cue.label, triggerMeta?.label ?? `Cue ${index + 1}`);
    return {
      assetId: stringValue(cue.assetId),
      category,
      cooldownMs: integerValue(cue.cooldownMs, 0, 0, 300000),
      duckMusic: booleanValue(cue.duckMusic, category === "voice"),
      enabled: booleanValue(cue.enabled, true),
      id: stringValue(cue.id, idFromLabel(label, `cue_${index + 1}`)),
      label,
      priority: integerValue(cue.priority, 0, -100, 100),
      speaker: stringValue(cue.speaker),
      subtitle: stringValue(cue.subtitle),
      trigger
    };
  });
  const cueTriggers = new Set(cues.map((cue) => cue.trigger));
  for (const defaultCue of defaultAudioCues()) {
    if (!cueTriggers.has(defaultCue.trigger)) {
      cues.push({ ...defaultCue });
      cueTriggers.add(defaultCue.trigger);
    }
  }

  return {
    assets,
    cues,
    mixer: {
      masterVolume: clamp(mixerInput.masterVolume, defaultMixer.masterVolume),
      musicVolume: clamp(mixerInput.musicVolume, defaultMixer.musicVolume),
      muted: booleanValue(mixerInput.muted, defaultMixer.muted),
      soundVolume: clamp(mixerInput.soundVolume, defaultMixer.soundVolume),
      voiceDucking: clamp(mixerInput.voiceDucking, defaultMixer.voiceDucking),
      voiceVolume: clamp(mixerInput.voiceVolume, defaultMixer.voiceVolume)
    },
    version: 1
  };
}

export function validateAudioConfig(config: AudioConfig): AudioValidationIssue[] {
  const issues: AudioValidationIssue[] = [];
  const assetIds = new Set<string>();
  const cueIds = new Set<string>();

  for (const asset of config.assets) {
    if (!asset.id) {
      issues.push({ severity: "error", message: "An audio asset is missing an id." });
    } else if (assetIds.has(asset.id)) {
      issues.push({ severity: "error", message: `Audio asset id "${asset.id}" is duplicated.` });
    }
    assetIds.add(asset.id);

    if (!asset.label) {
      issues.push({ severity: "warning", message: `Audio asset "${asset.id || "unknown"}" is missing a label.` });
    }

    if (!asset.url) {
      issues.push({ severity: "error", message: `Audio asset "${asset.id || asset.label}" is missing a URL.` });
    }
  }

  for (const cue of config.cues) {
    if (!cue.id) {
      issues.push({ severity: "error", message: "An audio cue is missing an id." });
    } else if (cueIds.has(cue.id)) {
      issues.push({ severity: "error", message: `Audio cue id "${cue.id}" is duplicated.` });
    }
    cueIds.add(cue.id);

    if (!cue.trigger) {
      issues.push({ severity: "error", message: `Audio cue "${cue.id || cue.label}" is missing a trigger.` });
    }

    if (cue.enabled && !cue.assetId) {
      issues.push({ severity: "warning", message: `Audio cue "${cue.label || cue.id}" has no asset and will use procedural fallback when available.` });
    } else if (cue.assetId && !assetIds.has(cue.assetId)) {
      issues.push({ severity: "error", message: `Audio cue "${cue.label || cue.id}" references missing asset "${cue.assetId}".` });
    }

    const asset = config.assets.find((candidate) => candidate.id === cue.assetId);
    if (asset && asset.category !== cue.category) {
      issues.push({ severity: "warning", message: `Audio cue "${cue.label || cue.id}" is ${cue.category}, but its asset is ${asset.category}.` });
    }
  }

  return issues;
}
