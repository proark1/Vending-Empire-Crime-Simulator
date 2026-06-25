import type { AudioCategory } from "./audioConfig";

export interface ElevenLabsVoiceProfile {
  id: string;
  label: string;
  modelId: string;
  purpose: AudioCategory;
  similarityBoost: number;
  stability: number;
  style: number;
  useSpeakerBoost: boolean;
  voiceId: string;
}

export interface ElevenLabsGenerationPrompt {
  durationSeconds: number;
  enabled: boolean;
  id: string;
  label: string;
  negativePrompt: string;
  prompt: string;
  purpose: AudioCategory;
  trigger: string;
  voiceProfileId: string;
}

export interface AudioProviderSettings {
  apiKey: string;
  defaultModelId: string;
  generationPrompts: ElevenLabsGenerationPrompt[];
  hasApiKey: boolean;
  provider: "elevenlabs";
  voiceProfiles: ElevenLabsVoiceProfile[];
}

export interface AudioProviderValidationIssue {
  message: string;
  severity: "error" | "warning";
}

const defaultModelId = "eleven_multilingual_v2";

export const defaultElevenLabsGenerationPrompts: ElevenLabsGenerationPrompt[] = [
  {
    durationSeconds: 90,
    enabled: true,
    id: "music_ambient_city",
    label: "Ambient city loop",
    negativePrompt: "No vocals, no recognizable melody, no abrupt ending, no bright fantasy tone.",
    prompt: "Seamless dark city management game loop. Low analog synth drone, distant traffic, vending machine compressor hum, soft fluorescent buzz, restrained noir tension, steady and non-distracting.",
    purpose: "music",
    trigger: "music.ambient",
    voiceProfileId: ""
  },
  {
    durationSeconds: 75,
    enabled: true,
    id: "music_high_heat",
    label: "High heat loop",
    negativePrompt: "No vocals, no heroic theme, no comedy, no sudden stingers.",
    prompt: "Seamless tense stealth strategy loop. Pulsing muted synth bass, ticking percussion, distant sirens blurred into the background, pressure rising but still playable under UI sounds.",
    purpose: "music",
    trigger: "music.heat",
    voiceProfileId: ""
  },
  {
    durationSeconds: 60,
    enabled: true,
    id: "music_conflict",
    label: "Conflict loop",
    negativePrompt: "No vocals, no orchestral superhero sound, no clean pop drums.",
    prompt: "Seamless crime-sim conflict loop. Fast industrial percussion, distorted sub bass, short alarm-like synth pulses, gritty urban chase energy, intense but not overpowering.",
    purpose: "music",
    trigger: "music.conflict",
    voiceProfileId: ""
  },
  {
    durationSeconds: 2,
    enabled: true,
    id: "sfx_cash_collected",
    label: "Cash collected",
    negativePrompt: "No long tail, no voice, no casino jackpot.",
    prompt: "Short satisfying vending cashbox sound. Coins and folded bills drop into a metal tray, tiny register click, clean positive feedback, less than two seconds.",
    purpose: "sound",
    trigger: "feedback.cash",
    voiceProfileId: ""
  },
  {
    durationSeconds: 1,
    enabled: true,
    id: "sfx_crate_pickup",
    label: "Crate pickup",
    negativePrompt: "No cartoon bounce, no voice.",
    prompt: "Short heavy supply crate pickup. Cardboard scrape, plastic bottle rattle, quick low thump, practical warehouse feel.",
    purpose: "sound",
    trigger: "feedback.pickup",
    voiceProfileId: ""
  },
  {
    durationSeconds: 1,
    enabled: true,
    id: "sfx_crate_store",
    label: "Crate stored",
    negativePrompt: "No musical flourish, no voice.",
    prompt: "Short storage confirmation. Crate slides onto a garage shelf, muted metal rack clack, controlled and grounded.",
    purpose: "sound",
    trigger: "feedback.store",
    voiceProfileId: ""
  },
  {
    durationSeconds: 2,
    enabled: true,
    id: "sfx_machine_stocked",
    label: "Machine stocked",
    negativePrompt: "No long machinery loop, no voice.",
    prompt: "Short vending machine restock sound. Door latch opens, cans and snack packs slot into spirals, final lock click, crisp UI-readable ending.",
    purpose: "sound",
    trigger: "feedback.stock",
    voiceProfileId: ""
  },
  {
    durationSeconds: 2,
    enabled: true,
    id: "sfx_vehicle_cargo",
    label: "Vehicle cargo",
    negativePrompt: "No horn, no engine revving, no voice.",
    prompt: "Short van cargo transfer sound. Sliding door roll, crate thud on rubber mat, strap buckle snap, street delivery tone.",
    purpose: "sound",
    trigger: "feedback.vehicle",
    voiceProfileId: ""
  },
  {
    durationSeconds: 2,
    enabled: true,
    id: "sfx_repair",
    label: "Machine repaired",
    negativePrompt: "No magic sparkle, no voice.",
    prompt: "Short vending machine repair success. Screwdriver turns, panel clicks shut, tiny electrical chirp, durable mechanical finish.",
    purpose: "sound",
    trigger: "feedback.repair",
    voiceProfileId: ""
  },
  {
    durationSeconds: 2,
    enabled: true,
    id: "sfx_upgrade",
    label: "Upgrade installed",
    negativePrompt: "No sci-fi laser blast, no voice.",
    prompt: "Short hardware upgrade confirmation. Smart lock beep, cable snap-in, reinforced panel clunk, confident premium vending tech sound.",
    purpose: "sound",
    trigger: "feedback.upgrade",
    voiceProfileId: ""
  },
  {
    durationSeconds: 2,
    enabled: true,
    id: "sfx_machine_install",
    label: "Machine placed",
    negativePrompt: "No construction site ambience, no voice.",
    prompt: "Short vending machine placement. Hand truck wheels stop, heavy machine settles on tile, plug clicks in, low electrical hum starts.",
    purpose: "sound",
    trigger: "feedback.install",
    voiceProfileId: ""
  },
  {
    durationSeconds: 2,
    enabled: true,
    id: "sfx_sabotage",
    label: "Sabotage",
    negativePrompt: "No gore, no voice, no explosion.",
    prompt: "Short dirty sabotage hit. Metal kick, glass stress crack, loose coins scatter, harsh low impact, threatening street tone.",
    purpose: "sound",
    trigger: "feedback.sabotage",
    voiceProfileId: ""
  },
  {
    durationSeconds: 3,
    enabled: true,
    id: "sfx_fight",
    label: "Fight",
    negativePrompt: "No gore, no crowd chant, no voice.",
    prompt: "Brief offscreen scuffle. Jacket rustle, two blunt impacts, shoe scrape, distant trash can rattle, gritty but not graphic.",
    purpose: "sound",
    trigger: "feedback.fight",
    voiceProfileId: ""
  },
  {
    durationSeconds: 2,
    enabled: true,
    id: "sfx_melee",
    label: "Melee conflict",
    negativePrompt: "No gore, no weapons firing, no voice.",
    prompt: "Short close-quarters conflict cue. Fast shove, dull hit, metal shutter rattle, breathy impact energy without graphic detail.",
    purpose: "sound",
    trigger: "feedback.melee",
    voiceProfileId: ""
  },
  {
    durationSeconds: 3,
    enabled: true,
    id: "sfx_escape",
    label: "Escape",
    negativePrompt: "No police radio speech, no siren lead, no voice.",
    prompt: "Short escape success cue. Quick footsteps, van door slam, tire chirp, tense synth riser resolving into a clean getaway hit.",
    purpose: "sound",
    trigger: "feedback.escape",
    voiceProfileId: ""
  },
  {
    durationSeconds: 2,
    enabled: true,
    id: "sfx_lockdown",
    label: "Remote lockdown",
    negativePrompt: "No alarm loop, no voice.",
    prompt: "Short remote security lockdown. Digital chirp, magnetic lock snap, metal shutter drop, firm defensive confirmation.",
    purpose: "sound",
    trigger: "feedback.lockdown",
    voiceProfileId: ""
  },
  {
    durationSeconds: 2,
    enabled: true,
    id: "sfx_scout",
    label: "District scouted",
    negativePrompt: "No fantasy reveal, no voice.",
    prompt: "Short intel discovery cue. Paper map unfold, marker squeak, low data beep, subtle promising urban strategy sound.",
    purpose: "sound",
    trigger: "feedback.scout",
    voiceProfileId: ""
  },
  {
    durationSeconds: 2,
    enabled: true,
    id: "sfx_district_unlocked",
    label: "District unlocked",
    negativePrompt: "No triumphant orchestra, no voice.",
    prompt: "Short territory unlocked cue. Distant city swell, vending neon flicker on, cash drawer click, restrained victory in a crime management sim.",
    purpose: "sound",
    trigger: "feedback.district",
    voiceProfileId: ""
  },
  {
    durationSeconds: 1,
    enabled: true,
    id: "sfx_event_good",
    label: "Good event",
    negativePrompt: "No cartoon sparkle, no voice.",
    prompt: "Short positive notification. Clean double beep, small coin tick, warm analog synth accent, useful but not cute.",
    purpose: "sound",
    trigger: "event.good",
    voiceProfileId: ""
  },
  {
    durationSeconds: 1,
    enabled: true,
    id: "sfx_event_warning",
    label: "Warning event",
    negativePrompt: "No full alarm, no voice.",
    prompt: "Short warning notification. Muted two-note alert, faint fluorescent buzz, low tension pulse, readable under gameplay.",
    purpose: "sound",
    trigger: "event.warning",
    voiceProfileId: ""
  },
  {
    durationSeconds: 2,
    enabled: true,
    id: "sfx_event_danger",
    label: "Danger event",
    negativePrompt: "No siren loop, no voice, no explosion.",
    prompt: "Short danger notification. Harsh low synth hit, quick distorted alarm chirp, metal vibration tail, serious street threat.",
    purpose: "sound",
    trigger: "event.danger",
    voiceProfileId: ""
  },
  {
    durationSeconds: 1,
    enabled: true,
    id: "sfx_event_neutral",
    label: "Neutral event",
    negativePrompt: "No melody, no voice.",
    prompt: "Short neutral notification. Soft terminal tick, restrained vending machine beep, dry utility confirmation.",
    purpose: "sound",
    trigger: "event.neutral",
    voiceProfileId: ""
  },
  {
    durationSeconds: 4,
    enabled: true,
    id: "voice_district_entry",
    label: "District entry voice",
    negativePrompt: "No shouting, no parody accent, no overacting.",
    prompt: "New block, new rules. Keep the machines stocked and the locals paid.",
    purpose: "voice",
    trigger: "voice.district_entry",
    voiceProfileId: ""
  },
  {
    durationSeconds: 4,
    enabled: true,
    id: "voice_heat_warning",
    label: "Heat warning voice",
    negativePrompt: "No panic scream, no comedy.",
    prompt: "Heat is climbing. Kill the noise before inspectors start knocking.",
    purpose: "voice",
    trigger: "voice.heat_warning",
    voiceProfileId: ""
  },
  {
    durationSeconds: 4,
    enabled: true,
    id: "voice_rival_attack",
    label: "Rival attack voice",
    negativePrompt: "No gore, no exaggerated villain tone.",
    prompt: "Redline is moving on one of our machines. Get there now.",
    purpose: "voice",
    trigger: "voice.rival_attack",
    voiceProfileId: ""
  },
  {
    durationSeconds: 4,
    enabled: true,
    id: "voice_mission_complete",
    label: "Mission complete voice",
    negativePrompt: "No cheesy celebration, no announcer boom.",
    prompt: "That route is ours. Bank the win and prep the next block.",
    purpose: "voice",
    trigger: "voice.mission_complete",
    voiceProfileId: ""
  }
];

function clamp(value: unknown, fallback: number, min = 0, max = 1): number {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function purposeValue(value: unknown): AudioCategory {
  return value === "sound" || value === "music" || value === "voice" ? value : "voice";
}

function idFromLabel(label: string, fallback: string): string {
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return id || fallback;
}

export function createDefaultAudioProviderSettings(): AudioProviderSettings {
  return {
    apiKey: "",
    defaultModelId,
    generationPrompts: defaultElevenLabsGenerationPrompts.map((prompt) => ({ ...prompt })),
    hasApiKey: false,
    provider: "elevenlabs",
    voiceProfiles: []
  };
}

export function normalizeAudioProviderSettings(candidate: unknown): AudioProviderSettings {
  const input = typeof candidate === "object" && candidate !== null ? candidate as Partial<AudioProviderSettings> : {};
  const profilesInput = Array.isArray(input.voiceProfiles) ? input.voiceProfiles : [];
  const promptsInput = Array.isArray(input.generationPrompts) ? input.generationPrompts : defaultElevenLabsGenerationPrompts;
  const defaultModel = stringValue(input.defaultModelId, defaultModelId);

  return {
    apiKey: stringValue(input.apiKey),
    defaultModelId: defaultModel,
    generationPrompts: promptsInput.map((promptInput, index) => {
      const prompt = typeof promptInput === "object" && promptInput !== null ? promptInput as Partial<ElevenLabsGenerationPrompt> : {};
      const fallback = defaultElevenLabsGenerationPrompts[index];
      const label = stringValue(prompt.label, fallback?.label ?? `Prompt ${index + 1}`);
      return {
        durationSeconds: clamp(prompt.durationSeconds, fallback?.durationSeconds ?? 3, 0.5, 180),
        enabled: booleanValue(prompt.enabled, true),
        id: stringValue(prompt.id, idFromLabel(label, `prompt_${index + 1}`)),
        label,
        negativePrompt: stringValue(prompt.negativePrompt, fallback?.negativePrompt ?? ""),
        prompt: stringValue(prompt.prompt, fallback?.prompt ?? ""),
        purpose: purposeValue(prompt.purpose ?? fallback?.purpose),
        trigger: stringValue(prompt.trigger, fallback?.trigger ?? "feedback.cash"),
        voiceProfileId: stringValue(prompt.voiceProfileId)
      };
    }),
    hasApiKey: booleanValue(input.hasApiKey, Boolean(input.apiKey)),
    provider: "elevenlabs",
    voiceProfiles: profilesInput.map((profileInput, index) => {
      const profile = typeof profileInput === "object" && profileInput !== null ? profileInput as Partial<ElevenLabsVoiceProfile> : {};
      const label = stringValue(profile.label, `Voice ${index + 1}`);
      return {
        id: stringValue(profile.id, idFromLabel(label, `voice_${index + 1}`)),
        label,
        modelId: stringValue(profile.modelId, defaultModel),
        purpose: purposeValue(profile.purpose),
        similarityBoost: clamp(profile.similarityBoost, 0.75),
        stability: clamp(profile.stability, 0.45),
        style: clamp(profile.style, 0),
        useSpeakerBoost: booleanValue(profile.useSpeakerBoost, true),
        voiceId: stringValue(profile.voiceId)
      };
    })
  };
}

export function validateAudioProviderSettings(settings: AudioProviderSettings): AudioProviderValidationIssue[] {
  const issues: AudioProviderValidationIssue[] = [];
  const ids = new Set<string>();
  const promptIds = new Set<string>();
  const profileIds = new Set(settings.voiceProfiles.map((profile) => profile.id));

  if (!settings.apiKey && !settings.hasApiKey) {
    issues.push({ severity: "warning", message: "ElevenLabs API key is not set." });
  }

  if (!settings.defaultModelId) {
    issues.push({ severity: "warning", message: "ElevenLabs default model is not set." });
  }

  for (const profile of settings.voiceProfiles) {
    if (!profile.id) {
      issues.push({ severity: "error", message: "An ElevenLabs voice profile is missing an id." });
    } else if (ids.has(profile.id)) {
      issues.push({ severity: "error", message: `ElevenLabs voice profile id "${profile.id}" is duplicated.` });
    }
    ids.add(profile.id);

    if (!profile.voiceId) {
      issues.push({ severity: "warning", message: `ElevenLabs voice profile "${profile.label || profile.id}" is missing a voice id.` });
    }
  }

  for (const prompt of settings.generationPrompts) {
    if (!prompt.id) {
      issues.push({ severity: "error", message: "An ElevenLabs generation prompt is missing an id." });
    } else if (promptIds.has(prompt.id)) {
      issues.push({ severity: "error", message: `ElevenLabs generation prompt id "${prompt.id}" is duplicated.` });
    }
    promptIds.add(prompt.id);

    if (!prompt.trigger) {
      issues.push({ severity: "warning", message: `ElevenLabs prompt "${prompt.label || prompt.id}" is missing a trigger.` });
    }

    if (!prompt.prompt) {
      issues.push({ severity: "warning", message: `ElevenLabs prompt "${prompt.label || prompt.id}" has no prompt text.` });
    }

    if (prompt.voiceProfileId && !profileIds.has(prompt.voiceProfileId)) {
      issues.push({ severity: "warning", message: `ElevenLabs prompt "${prompt.label || prompt.id}" references missing voice profile "${prompt.voiceProfileId}".` });
    }
  }

  return issues;
}
