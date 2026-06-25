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

export interface AudioProviderSettings {
  apiKey: string;
  defaultModelId: string;
  hasApiKey: boolean;
  provider: "elevenlabs";
  voiceProfiles: ElevenLabsVoiceProfile[];
}

export interface AudioProviderValidationIssue {
  message: string;
  severity: "error" | "warning";
}

const defaultModelId = "eleven_multilingual_v2";

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
    hasApiKey: false,
    provider: "elevenlabs",
    voiceProfiles: []
  };
}

export function normalizeAudioProviderSettings(candidate: unknown): AudioProviderSettings {
  const input = typeof candidate === "object" && candidate !== null ? candidate as Partial<AudioProviderSettings> : {};
  const profilesInput = Array.isArray(input.voiceProfiles) ? input.voiceProfiles : [];
  const defaultModel = stringValue(input.defaultModelId, defaultModelId);

  return {
    apiKey: stringValue(input.apiKey),
    defaultModelId: defaultModel,
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

  return issues;
}
