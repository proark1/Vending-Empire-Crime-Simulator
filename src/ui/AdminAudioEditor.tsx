import { ChevronDown, ChevronRight, Copy, History, KeyRound, Mic2, Play, Plus, RotateCcw, Save, Trash2, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  audioTriggerOptions,
  createDefaultAudioConfig,
  normalizeAudioConfig,
  validateAudioConfig,
  type AudioAsset,
  type AudioCategory,
  type AudioConfig,
  type AudioCue,
  type AudioVoiceLine
} from "../game/content/audioConfig";
import {
  createDefaultAudioProviderSettings,
  defaultElevenLabsGenerationPrompts,
  defaultElevenLabsVoiceProfiles,
  normalizeAudioProviderSettings,
  recommendedElevenLabsVoiceProfileId,
  validateAudioProviderSettings,
  type AudioProviderSettings,
  type ElevenLabsGenerationPrompt,
  type ElevenLabsVoiceProfile
} from "../game/content/audioProvider";
import {
  generateAdminAudio,
  loadAdminAudioProviderSettings,
  loadRemoteAudioConfigRevisions,
  resetRemoteAudioConfig,
  restoreRemoteAudioConfigRevision,
  saveAdminAudioProviderSettings,
  saveRemoteAudioConfig,
  type AdminSession,
  type RemoteAudioConfigRevision
} from "../game/save/api";

interface AdminAudioEditorProps {
  initialConfig: AudioConfig;
  onReset: (config: AudioConfig) => void;
  onSave: (config: AudioConfig) => void;
  session: AdminSession;
}

const categoryLabels: Record<AudioCategory, string> = {
  music: "Music",
  sound: "Sound",
  voice: "Voice"
};

type CollapsibleSectionId = "voiceDesign" | "voiceText" | "generation" | "assets" | "cues";

interface GeneratedAudioInfo {
  playable: boolean;
  previewTitle: string;
  sizeBytes: number | null | undefined;
  status: "missing" | "ready" | "unavailable";
  statusLabel: string;
  url: string;
}

interface AssetPreviewInfo {
  playable: boolean;
  title: string;
}

function slug(value: string, fallback: string): string {
  const id = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return id || fallback;
}

function nextId(prefix: string, existingIds: string[]): string {
  let index = existingIds.length + 1;
  let id = `${prefix}_${index}`;
  while (existingIds.includes(id)) {
    index += 1;
    id = `${prefix}_${index}`;
  }
  return id;
}

function categoryVolume(config: AudioConfig, category: AudioCategory, asset: AudioAsset): number {
  if (config.mixer.muted) {
    return 0;
  }

  const channel = category === "music" ? config.mixer.musicVolume : category === "voice" ? config.mixer.voiceVolume : config.mixer.soundVolume;
  return Math.min(1, Math.max(0, config.mixer.masterVolume * channel * asset.volume));
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) {
    return "--";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function generatedAssetId(prompt: Pick<ElevenLabsGenerationPrompt, "id">): string {
  return `generated_${prompt.id}`;
}

function isGeneratedAudioUrl(url: string): boolean {
  return url.startsWith("/generated-audio/");
}

function isAudioSourcePlayable(url: string, sizeBytes: number | null | undefined): boolean {
  if (!url) {
    return false;
  }

  return !isGeneratedAudioUrl(url) || (typeof sizeBytes === "number" && sizeBytes > 0);
}

function generatedAudioInfo(config: AudioConfig, prompt: ElevenLabsGenerationPrompt): GeneratedAudioInfo {
  const asset = config.assets.find((candidate) => candidate.id === generatedAssetId(prompt));
  const promptUrl = prompt.generatedUrl || "";
  const promptSizeBytes = prompt.generatedSizeBytes;
  const assetUrl = asset?.url || "";
  const assetSizeBytes = asset?.sizeBytes;
  const useAssetFallback = !isAudioSourcePlayable(promptUrl, promptSizeBytes) && isAudioSourcePlayable(assetUrl, assetSizeBytes);
  const url = useAssetFallback ? assetUrl : promptUrl || assetUrl;
  const sizeBytes = useAssetFallback ? assetSizeBytes : promptSizeBytes ?? assetSizeBytes;
  const generatedUrl = isGeneratedAudioUrl(url);
  const playable = isAudioSourcePlayable(url, sizeBytes);
  const generatedAt = prompt.generatedAt ? ` · ${new Date(prompt.generatedAt).toLocaleString()}` : "";

  if (!url) {
    return {
      playable: false,
      previewTitle: "Generate audio before previewing this prompt.",
      sizeBytes,
      status: "unavailable",
      statusLabel: "Not generated",
      url: ""
    };
  }

  if (!playable) {
    return {
      playable: false,
      previewTitle: "The saved generated-audio file is missing. Regenerate this prompt to restore preview.",
      sizeBytes,
      status: "missing",
      statusLabel: "Missing file",
      url
    };
  }

  return {
    playable,
    previewTitle: `${formatBytes(sizeBytes)}${generatedAt}`,
    sizeBytes,
    status: "ready",
    statusLabel: generatedUrl ? `Ready · ${formatBytes(sizeBytes)}` : `Linked · ${formatBytes(sizeBytes)}`,
    url
  };
}

function assetPreviewInfo(asset: AudioAsset): AssetPreviewInfo {
  if (!asset.url) {
    return { playable: false, title: "Add an asset URL before previewing." };
  }

  if (asset.url.startsWith("synth://")) {
    return { playable: false, title: "Procedural synth assets play in-game and do not have a browser preview file." };
  }

  if (!isAudioSourcePlayable(asset.url, asset.sizeBytes)) {
    return { playable: false, title: "The saved generated-audio file is missing. Regenerate the prompt to restore preview." };
  }

  return { playable: true, title: "Preview audio" };
}

function voiceLineBank(cue: AudioCue): AudioVoiceLine[] {
  if (cue.lines?.length) {
    return cue.lines;
  }

  if (!cue.speaker && !cue.subtitle) {
    return [];
  }

  return [{
    id: `${cue.id || "cue"}_line_1`,
    speaker: cue.speaker,
    subtitle: cue.subtitle,
    weight: 1
  }];
}

function formatVoiceLineBank(cue: AudioCue): string {
  return voiceLineBank(cue)
    .map((line) => `${line.speaker ? `${line.speaker}: ` : ""}${line.subtitle}`.trim())
    .join("\n");
}

function parseVoiceLineBank(value: string, cue: AudioCue): AudioVoiceLine[] {
  const existingLines = voiceLineBank(cue);
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const separator = entry.indexOf(":");
      const existing = existingLines[index];
      const speaker = separator >= 0 ? entry.slice(0, separator).trim() : existing?.speaker ?? cue.speaker;
      const subtitle = separator >= 0 ? entry.slice(separator + 1).trim() : entry;
      return {
        assetId: existing?.assetId,
        id: existing?.id || `${cue.id || "cue"}_line_${index + 1}`,
        speaker,
        subtitle,
        weight: existing?.weight ?? 1
      };
    });
}

function primaryVoiceLinePatch(cue: AudioCue, patch: Partial<Pick<AudioVoiceLine, "speaker" | "subtitle">>): Partial<AudioCue> {
  const lines = voiceLineBank(cue);
  const firstLine = lines[0] ?? {
    id: `${cue.id || "cue"}_line_1`,
    speaker: cue.speaker,
    subtitle: cue.subtitle,
    weight: 1
  };
  const nextFirstLine = { ...firstLine, ...patch };
  return {
    ...patch,
    lines: [nextFirstLine, ...lines.slice(1)],
    speaker: nextFirstLine.speaker,
    subtitle: nextFirstLine.subtitle
  };
}

function configWithGeneratedAsset(config: AudioConfig, prompts: ElevenLabsGenerationPrompt[], asset: AudioAsset): AudioConfig {
  const sourcePrompt = prompts.find((prompt) => generatedAssetId(prompt) === asset.id);
  const nextAssets = config.assets.some((candidate) => candidate.id === asset.id)
    ? config.assets.map((candidate) => candidate.id === asset.id ? { ...candidate, ...asset } : candidate)
    : [...config.assets, asset];
  const hasCue = config.cues.some((cue) => cue.assetId === asset.id || cue.trigger === sourcePrompt?.trigger);
  const nextCues = config.cues.map((cue) => sourcePrompt?.trigger && cue.trigger === sourcePrompt.trigger
    ? {
      ...cue,
      assetId: asset.id,
      category: asset.category,
      duckMusic: asset.category === "voice",
      label: sourcePrompt.label,
      lines: asset.category === "voice"
        ? [{
          assetId: asset.id,
          id: `${cue.id || generatedAssetId(sourcePrompt)}_line_1`,
          speaker: cue.speaker,
          subtitle: sourcePrompt.prompt,
          weight: 1
        }]
        : cue.lines,
      subtitle: asset.category === "voice" ? sourcePrompt.prompt : cue.subtitle
    }
    : cue
  );

  return {
    ...config,
    assets: nextAssets,
    cues: hasCue || !sourcePrompt?.trigger
      ? nextCues
      : [
        ...nextCues,
        {
          assetId: asset.id,
          category: asset.category,
          cooldownMs: asset.category === "voice" ? 3500 : 0,
          duckMusic: asset.category === "voice",
          enabled: true,
          id: `cue_${asset.id}`,
          label: sourcePrompt.label,
          lines: asset.category === "voice"
            ? [{
              assetId: asset.id,
              id: `cue_${asset.id}_line_1`,
              speaker: "",
              subtitle: sourcePrompt.prompt,
              weight: 1
            }]
            : [],
          priority: asset.category === "voice" ? 10 : 0,
          speaker: "",
          subtitle: asset.category === "voice" ? sourcePrompt.prompt : "",
          trigger: sourcePrompt.trigger
        }
      ]
  };
}

function CollapsibleButton({ collapsed, label, meta, onClick }: { collapsed: boolean; label: string; meta: string; onClick: () => void }) {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  return (
    <button aria-expanded={!collapsed} className="admin-audio-section-toggle" onClick={onClick} type="button">
      <Icon size={15} aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        <small>{meta}</small>
      </span>
      <em>{collapsed ? "Open" : "Collapse"}</em>
    </button>
  );
}

export function AdminAudioEditor({ initialConfig, onReset, onSave, session }: AdminAudioEditorProps) {
  const [config, setConfig] = useState<AudioConfig>(() => normalizeAudioConfig(initialConfig));
  const [providerSettings, setProviderSettings] = useState<AudioProviderSettings>(() => createDefaultAudioProviderSettings());
  const [revisions, setRevisions] = useState<RemoteAudioConfigRevision[]>([]);
  const [providerSaving, setProviderSaving] = useState(false);
  const [generatingPromptId, setGeneratingPromptId] = useState<string | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<CollapsibleSectionId, boolean>>({
    assets: true,
    cues: true,
    generation: false,
    voiceDesign: false,
    voiceText: true
  });
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const previewTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setConfig(normalizeAudioConfig(initialConfig));
  }, [initialConfig]);

  const refreshRevisions = useCallback(() => {
    loadRemoteAudioConfigRevisions(session)
      .then(setRevisions)
      .catch((error) => setStatus(error instanceof Error ? error.message : "Audio history failed to load."));
  }, [session]);

  const refreshProviderSettings = useCallback(() => {
    loadAdminAudioProviderSettings(session)
      .then((response) => setProviderSettings(normalizeAudioProviderSettings(response.settings)))
      .catch((error) => setStatus(error instanceof Error ? error.message : "ElevenLabs settings failed to load."));
  }, [session]);

  useEffect(() => {
    refreshRevisions();
    refreshProviderSettings();
  }, [refreshProviderSettings, refreshRevisions]);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
      }
      previewRef.current?.pause();
    };
  }, []);

  const issues = useMemo(() => validateAudioConfig(config), [config]);
  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  const providerIssues = useMemo(() => validateAudioProviderSettings(providerSettings), [providerSettings]);
  const providerBlockingIssues = providerIssues.filter((issue) => issue.severity === "error");
  const voicePromptRows = useMemo(
    () => providerSettings.generationPrompts
      .map((prompt, index) => ({ index, prompt }))
      .filter(({ prompt }) => prompt.purpose === "voice"),
    [providerSettings.generationPrompts]
  );

  const setNormalizedConfig = useCallback((updater: (current: AudioConfig) => AudioConfig) => {
    setConfig((current) => normalizeAudioConfig(updater(current)));
  }, []);

  const setNormalizedProviderSettings = useCallback((updater: (current: AudioProviderSettings) => AudioProviderSettings) => {
    setProviderSettings((current) => normalizeAudioProviderSettings(updater(current)));
  }, []);

  const updateMixer = useCallback((key: keyof AudioConfig["mixer"], value: number | boolean) => {
    setNormalizedConfig((current) => ({
      ...current,
      mixer: {
        ...current.mixer,
        [key]: value
      }
    }));
  }, [setNormalizedConfig]);

  const updateAsset = useCallback((index: number, patch: Partial<AudioAsset>) => {
    setNormalizedConfig((current) => ({
      ...current,
      assets: current.assets.map((asset, assetIndex) => assetIndex === index ? { ...asset, ...patch } : asset)
    }));
  }, [setNormalizedConfig]);

  const updateCue = useCallback((index: number, patch: Partial<AudioCue>) => {
    setNormalizedConfig((current) => ({
      ...current,
      cues: current.cues.map((cue, cueIndex) => cueIndex === index ? { ...cue, ...patch } : cue)
    }));
  }, [setNormalizedConfig]);

  const updateProviderSettings = useCallback((patch: Partial<AudioProviderSettings>) => {
    setNormalizedProviderSettings((current) => ({
      ...current,
      ...patch
    }));
  }, [setNormalizedProviderSettings]);

  const updateVoiceProfile = useCallback((index: number, patch: Partial<ElevenLabsVoiceProfile>) => {
    setNormalizedProviderSettings((current) => ({
      ...current,
      voiceProfiles: current.voiceProfiles.map((profile, profileIndex) => profileIndex === index ? { ...profile, ...patch } : profile)
    }));
  }, [setNormalizedProviderSettings]);

  const updateGenerationPrompt = useCallback((index: number, patch: Partial<ElevenLabsGenerationPrompt>) => {
    setNormalizedProviderSettings((current) => ({
      ...current,
      generationPrompts: current.generationPrompts.map((prompt, promptIndex) => promptIndex === index ? { ...prompt, ...patch } : prompt)
    }));
  }, [setNormalizedProviderSettings]);

  const toggleSection = useCallback((section: CollapsibleSectionId) => {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section]
    }));
  }, []);

  const persistProviderSettings = useCallback((nextSettings: AudioProviderSettings, successMessage: string) => {
    const normalizedSettings = normalizeAudioProviderSettings(nextSettings);
    setProviderSettings(normalizedSettings);
    setProviderSaving(true);
    saveAdminAudioProviderSettings(session, normalizedSettings)
      .then((response) => {
        setProviderSettings(normalizeAudioProviderSettings(response.settings ?? normalizedSettings));
        setStatus(successMessage);
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "ElevenLabs settings save failed."))
      .finally(() => setProviderSaving(false));
  }, [session]);

  const handleAddAsset = useCallback(() => {
    setNormalizedConfig((current) => {
      const id = nextId("asset", current.assets.map((asset) => asset.id));
      return {
        ...current,
        assets: [
          ...current.assets,
          {
            category: "sound",
            id,
            label: "New Sound",
            loop: false,
            url: "",
            volume: 0.8
          }
        ]
      };
    });
  }, [setNormalizedConfig]);

  const handleAddCue = useCallback(() => {
    setNormalizedConfig((current) => {
      const trigger = audioTriggerOptions[0];
      const id = nextId("cue", current.cues.map((cue) => cue.id));
      return {
        ...current,
        cues: [
          ...current.cues,
          {
            assetId: current.assets.find((asset) => asset.category === trigger.category)?.id ?? "",
            category: trigger.category,
            cooldownMs: 0,
            duckMusic: trigger.category === "voice",
            enabled: true,
            id,
            label: trigger.label,
            priority: 0,
            speaker: "",
            subtitle: "",
            trigger: trigger.trigger
          }
        ]
      };
    });
  }, [setNormalizedConfig]);

  const handleAddVoiceProfile = useCallback(() => {
    setNormalizedProviderSettings((current) => {
      const id = nextId("voice", current.voiceProfiles.map((profile) => profile.id));
      return {
        ...current,
        voiceProfiles: [
          ...current.voiceProfiles,
          {
            designPrompt: "",
            id,
            label: "New Voice",
            modelId: current.defaultModelId,
            purpose: "voice",
            similarityBoost: 0.75,
            stability: 0.45,
            style: 0,
            useSpeakerBoost: true,
            voiceId: ""
          }
        ]
      };
    });
  }, [setNormalizedProviderSettings]);

  const handleResetVoiceProfiles = useCallback(() => {
    setNormalizedProviderSettings((current) => ({
      ...current,
      voiceProfiles: defaultElevenLabsVoiceProfiles.map((profile) => {
        const existing = current.voiceProfiles.find((candidate) => candidate.id === profile.id);
        return {
          ...profile,
          voiceId: existing?.voiceId ?? ""
        };
      })
    }));
  }, [setNormalizedProviderSettings]);

  const handleAddGenerationPrompt = useCallback(() => {
    const id = nextId("prompt", providerSettings.generationPrompts.map((prompt) => prompt.id));
    const nextSettings = normalizeAudioProviderSettings({
      ...providerSettings,
      generationPrompts: [
        ...providerSettings.generationPrompts,
        {
          durationSeconds: 3,
          enabled: true,
          id,
          label: "New Prompt",
          negativePrompt: "",
          prompt: "",
          purpose: "sound",
          trigger: "feedback.cash",
          voiceProfileId: ""
        }
      ]
    });
    setCollapsedSections((current) => ({ ...current, generation: false }));
    persistProviderSettings(nextSettings, "Added and saved a new generation prompt.");
  }, [persistProviderSettings, providerSettings]);

  const handleResetGenerationPrompts = useCallback(() => {
    setNormalizedProviderSettings((current) => ({
      ...current,
      generationPrompts: defaultElevenLabsGenerationPrompts.map((prompt) => ({ ...prompt }))
    }));
  }, [setNormalizedProviderSettings]);

  const handleAssignRecommendedVoiceProfiles = useCallback(() => {
    const nextSettings = normalizeAudioProviderSettings({
      ...providerSettings,
      generationPrompts: providerSettings.generationPrompts.map((prompt) => {
        if (prompt.purpose !== "voice") {
          return prompt;
        }

        const voiceProfileId = recommendedElevenLabsVoiceProfileId(prompt);
        return voiceProfileId ? { ...prompt, voiceProfileId } : prompt;
      })
    });

    setProviderSettings(nextSettings);
    setProviderSaving(true);
    saveAdminAudioProviderSettings(session, nextSettings)
      .then((response) => {
        setProviderSettings(normalizeAudioProviderSettings(response.settings ?? nextSettings));
        setStatus(`Assigned and saved recommended voice profiles r${response.revision ?? "--"}.`);
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Voice profile assignment save failed."))
      .finally(() => setProviderSaving(false));
  }, [providerSettings, session]);

  const handleDeleteAsset = useCallback((assetId: string) => {
    setNormalizedConfig((current) => ({
      ...current,
      assets: current.assets.filter((asset) => asset.id !== assetId),
      cues: current.cues.map((cue) => cue.assetId === assetId ? { ...cue, assetId: "" } : cue)
    }));
  }, [setNormalizedConfig]);

  const handleDeleteCue = useCallback((cueId: string) => {
    setNormalizedConfig((current) => ({
      ...current,
      cues: current.cues.filter((cue) => cue.id !== cueId)
    }));
  }, [setNormalizedConfig]);

  const handleDeleteVoiceProfile = useCallback((profileId: string) => {
    setNormalizedProviderSettings((current) => ({
      ...current,
      voiceProfiles: current.voiceProfiles.filter((profile) => profile.id !== profileId)
    }));
  }, [setNormalizedProviderSettings]);

  const handleDeleteGenerationPrompt = useCallback((promptId: string) => {
    const nextSettings = normalizeAudioProviderSettings({
      ...providerSettings,
      generationPrompts: providerSettings.generationPrompts.filter((prompt) => prompt.id !== promptId)
    });
    persistProviderSettings(nextSettings, "Deleted and saved the generation prompt.");
  }, [persistProviderSettings, providerSettings]);

  const handlePreview = useCallback((asset: AudioAsset) => {
    const availability = assetPreviewInfo(asset);
    if (!availability.playable) {
      setStatus(availability.title);
      return;
    }

    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    previewRef.current?.pause();

    const preview = new Audio(asset.url);
    preview.volume = categoryVolume(config, asset.category, asset);
    preview.loop = asset.loop;
    previewRef.current = preview;
    setPreviewingId(asset.id);
    setStatus("");
    void preview.play()
      .then(() => {
        previewTimerRef.current = window.setTimeout(() => {
          preview.pause();
          setPreviewingId(null);
        }, asset.loop ? 8000 : 12000);
      })
      .catch(() => {
        setPreviewingId(null);
        setStatus("Preview failed. Check the URL and browser audio permissions.");
      });
    preview.addEventListener("ended", () => setPreviewingId(null), { once: true });
  }, [config]);

  const handleCopyPrompt = useCallback((text: string) => {
    if (!navigator.clipboard) {
      setStatus("Clipboard is not available in this browser.");
      return;
    }

    void navigator.clipboard.writeText(text)
      .then(() => setStatus("Copied voice prompt text."))
      .catch(() => setStatus("Copy failed."));
  }, []);

  const handleGeneratePrompt = useCallback((promptIndex: number) => {
    const prompt = providerSettings.generationPrompts[promptIndex];
    if (!prompt) {
      return;
    }

    setGeneratingPromptId(prompt.id);
    setStatus(`Generating ${prompt.label}...`);
    const savedBeforeGeneration = normalizeAudioProviderSettings(providerSettings);
    let settingsForGeneration = savedBeforeGeneration;
    saveAdminAudioProviderSettings(session, savedBeforeGeneration)
      .then((savedResponse) => {
        const savedSettings = normalizeAudioProviderSettings(savedResponse.settings ?? savedBeforeGeneration);
        settingsForGeneration = savedSettings;
        setProviderSettings(savedSettings);
        const savedPrompt = savedSettings.generationPrompts[promptIndex] ?? prompt;
        setStatus(`Saved ElevenLabs settings. Generating ${savedPrompt.label}...`);
        return generateAdminAudio(session, savedSettings, savedPrompt);
      })
      .then((result) => {
        const nextSettings = normalizeAudioProviderSettings({
          ...settingsForGeneration,
          generationPrompts: settingsForGeneration.generationPrompts.map((candidate, index) => index === promptIndex ? result.prompt : candidate)
        });
        const nextConfig = normalizeAudioConfig(configWithGeneratedAsset(config, nextSettings.generationPrompts, result.asset));

        setProviderSettings(nextSettings);
        setConfig(nextConfig);
        return Promise.all([
          saveAdminAudioProviderSettings(session, nextSettings),
          saveRemoteAudioConfig(session, nextConfig)
        ]).then(([providerResponse, audioResponse]) => {
          setProviderSettings(normalizeAudioProviderSettings(providerResponse.settings ?? nextSettings));
          setConfig(nextConfig);
          onSave(nextConfig);
          refreshRevisions();
          setStatus(`Generated and saved ${result.prompt.label}: ${formatBytes(result.asset.sizeBytes)}. Audio r${audioResponse.revision}.`);
        });
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Audio generation failed."))
      .finally(() => setGeneratingPromptId(null));
  }, [config, onSave, providerSettings, refreshRevisions, session]);

  // Regenerate every enabled prompt that has no playable audio, one at a time.
  // Each generation persists its bytes server-side immediately; the config is
  // saved once at the end. Lets the operator re-populate audio after a deploy in
  // a single click instead of pressing Generate on every prompt.
  const handleGenerateAllMissing = useCallback(() => {
    let workingSettings = normalizeAudioProviderSettings(providerSettings);
    let workingConfig = normalizeAudioConfig(config);
    const targets = workingSettings.generationPrompts
      .map((prompt, index) => ({ index, prompt }))
      .filter(({ prompt }) => prompt.enabled && !generatedAudioInfo(workingConfig, prompt).playable);
    if (targets.length === 0) {
      setStatus("Every enabled prompt already has playable audio.");
      return;
    }

    setBulkGenerating(true);
    void (async () => {
      let done = 0;
      let failed = 0;
      try {
        const saved = await saveAdminAudioProviderSettings(session, workingSettings);
        workingSettings = normalizeAudioProviderSettings(saved.settings ?? workingSettings);
      } catch {
        // Keep going with the local snapshot if the pre-save fails.
      }
      for (const target of targets) {
        const prompt = workingSettings.generationPrompts[target.index];
        if (!prompt) {
          continue;
        }
        setGeneratingPromptId(prompt.id);
        setStatus(`Generating ${prompt.label} (${done + failed + 1}/${targets.length})...`);
        try {
          const result = await generateAdminAudio(session, workingSettings, prompt);
          workingSettings = normalizeAudioProviderSettings({
            ...workingSettings,
            generationPrompts: workingSettings.generationPrompts.map((candidate, index) => index === target.index ? result.prompt : candidate)
          });
          workingConfig = normalizeAudioConfig(configWithGeneratedAsset(workingConfig, workingSettings.generationPrompts, result.asset));
          setProviderSettings(workingSettings);
          setConfig(workingConfig);
          done += 1;
        } catch {
          failed += 1;
        }
      }
      setGeneratingPromptId(null);
      try {
        const [providerResponse, audioResponse] = await Promise.all([
          saveAdminAudioProviderSettings(session, workingSettings),
          saveRemoteAudioConfig(session, workingConfig)
        ]);
        setProviderSettings(normalizeAudioProviderSettings(providerResponse.settings ?? workingSettings));
        setConfig(workingConfig);
        onSave(workingConfig);
        refreshRevisions();
        setStatus(`Generated ${done}/${targets.length}${failed ? ` (${failed} failed — run again to retry)` : ""}. Saved audio r${audioResponse.revision}.`);
      } catch (error) {
        setStatus(error instanceof Error ? `Generated ${done}/${targets.length} but saving failed: ${error.message}` : "Saving generated audio failed.");
      } finally {
        setBulkGenerating(false);
      }
    })();
  }, [config, onSave, providerSettings, refreshRevisions, session]);

  const handleSave = useCallback(() => {
    const nextConfig = normalizeAudioConfig(config);
    const nextIssues = validateAudioConfig(nextConfig);
    if (nextIssues.some((issue) => issue.severity === "error")) {
      setStatus("Fix blocking audio validation issues before saving.");
      return;
    }

    setSaving(true);
    saveRemoteAudioConfig(session, nextConfig)
      .then((result) => {
        setConfig(nextConfig);
        onSave(nextConfig);
        setStatus(`Saved audio config r${result.revision}.`);
        refreshRevisions();
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Audio save failed."))
      .finally(() => setSaving(false));
  }, [config, onSave, refreshRevisions, session]);

  const handleSaveProvider = useCallback(() => {
    const nextSettings = normalizeAudioProviderSettings(providerSettings);
    const nextIssues = validateAudioProviderSettings(nextSettings);
    if (nextIssues.some((issue) => issue.severity === "error")) {
      setStatus("Fix blocking ElevenLabs validation issues before saving.");
      return;
    }

    setProviderSaving(true);
    saveAdminAudioProviderSettings(session, nextSettings)
      .then((response) => {
        setProviderSettings(normalizeAudioProviderSettings(response.settings));
        setStatus(`Saved ElevenLabs settings r${response.revision ?? "--"}.`);
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "ElevenLabs settings save failed."))
      .finally(() => setProviderSaving(false));
  }, [providerSettings, session]);

  const handleClearProviderKey = useCallback(() => {
    if (!window.confirm("Clear the saved ElevenLabs API key?")) {
      return;
    }

    const nextSettings = normalizeAudioProviderSettings({
      ...providerSettings,
      apiKey: "",
      hasApiKey: false
    });
    setProviderSaving(true);
    saveAdminAudioProviderSettings(session, nextSettings, { clearApiKey: true })
      .then((response) => {
        setProviderSettings(normalizeAudioProviderSettings(response.settings));
        setStatus("Cleared ElevenLabs API key.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "ElevenLabs API key clear failed."))
      .finally(() => setProviderSaving(false));
  }, [providerSettings, session]);

  const handleReset = useCallback(() => {
    if (!window.confirm("Reset the remote audio config to the authored default?")) {
      return;
    }

    setSaving(true);
    resetRemoteAudioConfig(session)
      .then(() => {
        const nextConfig = createDefaultAudioConfig();
        setConfig(nextConfig);
        onReset(nextConfig);
        setStatus("Audio config reset.");
        refreshRevisions();
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Audio reset failed."))
      .finally(() => setSaving(false));
  }, [onReset, refreshRevisions, session]);

  const handleRestore = useCallback((revision: RemoteAudioConfigRevision) => {
    setSaving(true);
    restoreRemoteAudioConfigRevision(session, revision.id)
      .then((response) => {
        const nextConfig = normalizeAudioConfig(response.config);
        setConfig(nextConfig);
        onSave(nextConfig);
        setStatus(`Restored audio config r${response.revision ?? revision.revision}.`);
        refreshRevisions();
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Audio restore failed."))
      .finally(() => setSaving(false));
  }, [onSave, refreshRevisions, session]);

  return (
    <section className="admin-audio-editor">
      <div className="admin-audio-main">
        <section className="admin-audio-panel">
          <div className="admin-audio-panel-heading">
            <h2>
              {config.mixer.muted ? <VolumeX size={17} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}
              Mixer
            </h2>
            <label className="admin-audio-muted">
              <input checked={config.mixer.muted} type="checkbox" onChange={(event) => updateMixer("muted", event.target.checked)} />
              Muted
            </label>
          </div>
          <div className="admin-mixer-grid">
            {([
              ["masterVolume", "Master"],
              ["soundVolume", "Sounds"],
              ["musicVolume", "Music"],
              ["voiceVolume", "Voices"],
              ["voiceDucking", "Voice ducking"]
            ] as const).map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  max="1"
                  min="0"
                  step="0.01"
                  type="range"
                  value={config.mixer[key]}
                  onChange={(event) => updateMixer(key, Number(event.target.value))}
                />
                <strong>{Math.round(config.mixer[key] * 100)}%</strong>
              </label>
            ))}
          </div>
        </section>

        <section className="admin-audio-panel">
          <div className="admin-audio-panel-heading">
            <h2>
              <KeyRound size={17} aria-hidden="true" />
              ElevenLabs
            </h2>
            <div className="admin-audio-heading-actions">
              <button disabled={providerSaving || providerBlockingIssues.length > 0} onClick={handleSaveProvider} type="button">
                <Save size={15} aria-hidden="true" />
                {providerSaving ? "Saving" : "Save Provider"}
              </button>
              <button disabled={providerSaving || (!providerSettings.hasApiKey && !providerSettings.apiKey)} onClick={handleClearProviderKey} type="button">
                <Trash2 size={15} aria-hidden="true" />
                Clear Key
              </button>
            </div>
          </div>

          <div className="admin-provider-grid">
            <label>
              API key
              <input
                autoComplete="off"
                placeholder={providerSettings.hasApiKey ? "Saved key on server" : "ElevenLabs API key"}
                type="password"
                value={providerSettings.apiKey}
                onChange={(event) => updateProviderSettings({ apiKey: event.target.value, hasApiKey: Boolean(event.target.value) || providerSettings.hasApiKey })}
              />
            </label>
            <label>
              Default model
              <input value={providerSettings.defaultModelId} onChange={(event) => updateProviderSettings({ defaultModelId: event.target.value })} />
            </label>
            <button onClick={handleAddVoiceProfile} type="button">
              <Plus size={15} aria-hidden="true" />
              Add Voice
            </button>
          </div>

          <div className="admin-audio-subheading collapsible">
            <CollapsibleButton
              collapsed={collapsedSections.voiceDesign}
              label="Voice Design Prompts"
              meta={`${providerSettings.voiceProfiles.length} voice profiles`}
              onClick={() => toggleSection("voiceDesign")}
            />
            <div className="admin-audio-heading-actions">
              <button onClick={handleResetVoiceProfiles} type="button">
                <RotateCcw size={14} aria-hidden="true" />
                Defaults
              </button>
            </div>
          </div>

          {!collapsedSections.voiceDesign && (
            <div className="admin-audio-table provider">
              {providerSettings.voiceProfiles.length === 0 ? (
                <p>No ElevenLabs voice profiles configured.</p>
              ) : (
                providerSettings.voiceProfiles.map((profile, index) => (
                  <div className="admin-audio-row provider" key={`${profile.id}-${index}`}>
                    <input aria-label="Voice profile id" value={profile.id} onChange={(event) => updateVoiceProfile(index, { id: slug(event.target.value, profile.id || `voice_${index + 1}`) })} />
                    <input aria-label="Voice profile label" value={profile.label} onChange={(event) => updateVoiceProfile(index, { label: event.target.value })} />
                    <textarea aria-label="ElevenLabs voice design prompt" value={profile.designPrompt} onChange={(event) => updateVoiceProfile(index, { designPrompt: event.target.value })} />
                    <input aria-label="ElevenLabs voice id" className="wide" placeholder="Voice ID" value={profile.voiceId} onChange={(event) => updateVoiceProfile(index, { voiceId: event.target.value })} />
                    <input aria-label="ElevenLabs model id" className="wide" value={profile.modelId} onChange={(event) => updateVoiceProfile(index, { modelId: event.target.value })} />
                    <input aria-label="Stability" max="1" min="0" step="0.05" type="number" value={profile.stability} onChange={(event) => updateVoiceProfile(index, { stability: Number(event.target.value) })} />
                    <input aria-label="Similarity boost" max="1" min="0" step="0.05" type="number" value={profile.similarityBoost} onChange={(event) => updateVoiceProfile(index, { similarityBoost: Number(event.target.value) })} />
                    <input aria-label="Style" max="1" min="0" step="0.05" type="number" value={profile.style} onChange={(event) => updateVoiceProfile(index, { style: Number(event.target.value) })} />
                    <label className="admin-audio-compact-check">
                      <input checked={profile.useSpeakerBoost} type="checkbox" onChange={(event) => updateVoiceProfile(index, { useSpeakerBoost: event.target.checked })} />
                      Boost
                    </label>
                    <button aria-label={`Copy ${profile.label || profile.id} voice design prompt`} onClick={() => handleCopyPrompt(profile.designPrompt)} title="Copy prompt" type="button">
                      <Copy size={14} aria-hidden="true" />
                    </button>
                    <button aria-label={`Delete ${profile.label || profile.id} voice profile`} className="danger" onClick={() => handleDeleteVoiceProfile(profile.id)} title="Delete voice profile" type="button">
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="admin-audio-subheading collapsible">
            <CollapsibleButton
              collapsed={collapsedSections.voiceText}
              label="Voice Text Prompts"
              meta={`${voicePromptRows.length} voice lines`}
              onClick={() => toggleSection("voiceText")}
            />
            <div className="admin-audio-heading-actions">
              <button disabled={providerSaving} onClick={handleAssignRecommendedVoiceProfiles} type="button">
                <Mic2 size={14} aria-hidden="true" />
                Assign Voices
              </button>
              <button onClick={handleResetGenerationPrompts} type="button">
                <RotateCcw size={14} aria-hidden="true" />
                Defaults
              </button>
            </div>
          </div>

          {!collapsedSections.voiceText && (
            <div className="admin-audio-table voice-prompts">
              {voicePromptRows.length === 0 ? (
                <p>No voice text prompts configured.</p>
              ) : (
                voicePromptRows.map(({ index, prompt }) => {
                  const generated = generatedAudioInfo(config, prompt);
                  return (
                    <div className="admin-audio-row voice-text" key={`voice-text-${prompt.id}-${index}`}>
                      <label className="admin-audio-compact-check">
                        <input checked={prompt.enabled} type="checkbox" onChange={(event) => updateGenerationPrompt(index, { enabled: event.target.checked })} />
                        On
                      </label>
                      <input aria-label="Voice prompt label" value={prompt.label} onChange={(event) => updateGenerationPrompt(index, { label: event.target.value })} />
                      <span className={`admin-audio-generated-status ${generated.status}`} title={generated.previewTitle}>{generated.statusLabel}</span>
                      <button aria-label={`Preview ${prompt.label}`} disabled={!generated.playable} onClick={() => handlePreview({ category: "voice", id: prompt.id, label: prompt.label, loop: false, sizeBytes: generated.sizeBytes, url: generated.url, volume: 1 })} title={generated.previewTitle} type="button">
                        <Play size={14} aria-hidden="true" />
                      </button>
                      <button disabled={bulkGenerating || Boolean(generatingPromptId)} onClick={() => handleGeneratePrompt(index)} type="button">
                        {generatingPromptId === prompt.id ? "Generating" : "Generate"}
                      </button>
                      <select aria-label="Voice prompt trigger" value={prompt.trigger} onChange={(event) => updateGenerationPrompt(index, { trigger: event.target.value })}>
                        {audioTriggerOptions.filter((option) => option.category === "voice").map((option) => (
                          <option key={option.trigger} value={option.trigger}>{option.label}</option>
                        ))}
                      </select>
                      <select aria-label="Voice prompt profile" value={prompt.voiceProfileId} onChange={(event) => updateGenerationPrompt(index, { voiceProfileId: event.target.value })}>
                        <option value="">No voice profile</option>
                        {providerSettings.voiceProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>{profile.label || profile.id}</option>
                        ))}
                      </select>
                      <textarea aria-label="Voice text prompt" value={prompt.prompt} onChange={(event) => updateGenerationPrompt(index, { prompt: event.target.value })} />
                      <textarea aria-label="Voice direction negative prompt" value={prompt.negativePrompt} onChange={(event) => updateGenerationPrompt(index, { negativePrompt: event.target.value })} />
                      <input aria-label="Voice duration" max="30" min="0.5" step="0.5" type="number" value={prompt.durationSeconds} onChange={(event) => updateGenerationPrompt(index, { durationSeconds: Number(event.target.value) })} />
                      <button aria-label={`Copy ${prompt.label} voice text`} onClick={() => handleCopyPrompt(prompt.prompt)} title="Copy prompt" type="button">
                        <Copy size={14} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          <div className="admin-audio-subheading collapsible">
            <CollapsibleButton
              collapsed={collapsedSections.generation}
              label="Generation Prompts"
              meta={`${providerSettings.generationPrompts.length} total prompts`}
              onClick={() => toggleSection("generation")}
            />
            <div className="admin-audio-heading-actions">
              <button disabled={bulkGenerating || Boolean(generatingPromptId)} onClick={handleGenerateAllMissing} type="button">
                {bulkGenerating ? "Generating all…" : "Generate all missing"}
              </button>
              <button onClick={handleResetGenerationPrompts} type="button">
                <RotateCcw size={14} aria-hidden="true" />
                Defaults
              </button>
              <button disabled={providerSaving} onClick={handleAddGenerationPrompt} type="button">
                <Plus size={14} aria-hidden="true" />
                Add Prompt
              </button>
            </div>
          </div>

          {!collapsedSections.generation && (
            <div className="admin-audio-table prompts">
              {providerSettings.generationPrompts.length === 0 ? (
                <p>No ElevenLabs prompts configured.</p>
              ) : (
                providerSettings.generationPrompts.map((prompt, index) => {
                  const generated = generatedAudioInfo(config, prompt);
                  return (
                    <div className="admin-audio-row prompt" key={`${prompt.id}-${index}`}>
                      <label className="admin-audio-compact-check">
                        <input checked={prompt.enabled} type="checkbox" onChange={(event) => updateGenerationPrompt(index, { enabled: event.target.checked })} />
                        On
                      </label>
                      <select value={prompt.purpose} onChange={(event) => updateGenerationPrompt(index, { purpose: event.target.value as AudioCategory })}>
                        {Object.entries(categoryLabels).map(([category, label]) => (
                          <option key={category} value={category}>{label}</option>
                        ))}
                      </select>
                      <input aria-label="Prompt label" value={prompt.label} onChange={(event) => updateGenerationPrompt(index, { label: event.target.value })} />
                      <span className={`admin-audio-generated-status ${generated.status}`} title={generated.previewTitle}>{generated.statusLabel}</span>
                      <button aria-label={`Preview ${prompt.label}`} disabled={!generated.playable} onClick={() => handlePreview({ category: prompt.purpose, id: prompt.id, label: prompt.label, loop: prompt.purpose === "music", sizeBytes: generated.sizeBytes, url: generated.url, volume: 1 })} title={generated.previewTitle} type="button">
                        <Play size={14} aria-hidden="true" />
                      </button>
                      <button disabled={bulkGenerating || Boolean(generatingPromptId)} onClick={() => handleGeneratePrompt(index)} type="button">
                        {generatingPromptId === prompt.id ? "Generating" : "Generate"}
                      </button>
                      <input aria-label="Prompt id" value={prompt.id} onChange={(event) => updateGenerationPrompt(index, { id: slug(event.target.value, prompt.id || `prompt_${index + 1}`) })} />
                      <select aria-label="Prompt trigger" value={prompt.trigger} onChange={(event) => updateGenerationPrompt(index, { trigger: event.target.value })}>
                        {audioTriggerOptions.map((option) => (
                          <option key={option.trigger} value={option.trigger}>{option.label}</option>
                        ))}
                      </select>
                      <textarea aria-label="ElevenLabs prompt" rows={2} value={prompt.prompt} onChange={(event) => updateGenerationPrompt(index, { prompt: event.target.value })} />
                      <textarea aria-label="ElevenLabs negative prompt" rows={2} value={prompt.negativePrompt} onChange={(event) => updateGenerationPrompt(index, { negativePrompt: event.target.value })} />
                      <select aria-label="Prompt voice profile" value={prompt.voiceProfileId} onChange={(event) => updateGenerationPrompt(index, { voiceProfileId: event.target.value })}>
                        <option value="">No voice profile</option>
                        {providerSettings.voiceProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>{profile.label || profile.id}</option>
                        ))}
                      </select>
                      <input aria-label="Prompt duration" max="180" min="0.5" step="0.5" type="number" value={prompt.durationSeconds} onChange={(event) => updateGenerationPrompt(index, { durationSeconds: Number(event.target.value) })} />
                      <button aria-label={`Delete ${prompt.label}`} className="danger" disabled={providerSaving} onClick={() => handleDeleteGenerationPrompt(prompt.id)} title="Delete prompt" type="button">
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>

        <section className="admin-audio-panel">
          <div className="admin-audio-panel-heading collapsible">
            <CollapsibleButton
              collapsed={collapsedSections.assets}
              label="Assets"
              meta={`${config.assets.length} files and fallbacks`}
              onClick={() => toggleSection("assets")}
            />
            <button onClick={handleAddAsset} type="button">
              <Plus size={15} aria-hidden="true" />
              Add Asset
            </button>
          </div>
          {!collapsedSections.assets && (
            <div className="admin-audio-table assets">
              {config.assets.length === 0 ? (
                <p>No audio assets configured.</p>
              ) : (
                config.assets.map((asset, index) => {
                  const previewInfo = assetPreviewInfo(asset);
                  return (
                    <div className="admin-audio-row" key={`${asset.id}-${index}`}>
                      <select value={asset.category} onChange={(event) => updateAsset(index, { category: event.target.value as AudioCategory, loop: event.target.value === "music" ? true : asset.loop })}>
                        {Object.entries(categoryLabels).map(([category, label]) => (
                          <option key={category} value={category}>{label}</option>
                        ))}
                      </select>
                      <input aria-label="Asset id" value={asset.id} onChange={(event) => updateAsset(index, { id: slug(event.target.value, asset.id || `asset_${index + 1}`) })} />
                      <input aria-label="Asset label" value={asset.label} onChange={(event) => updateAsset(index, { label: event.target.value })} />
                      <input aria-label="Asset URL" className="wide" placeholder="/audio/example.mp3" value={asset.url} onChange={(event) => updateAsset(index, { url: event.target.value })} />
                      <input aria-label="Asset volume" max="1" min="0" step="0.05" type="number" value={asset.volume} onChange={(event) => updateAsset(index, { volume: Number(event.target.value) })} />
                      <label className="admin-audio-compact-check">
                        <input checked={asset.loop} type="checkbox" onChange={(event) => updateAsset(index, { loop: event.target.checked })} />
                        Loop
                      </label>
                      <span className="admin-audio-file-size">{formatBytes(asset.sizeBytes)}</span>
                      <button aria-label={`Preview ${asset.label || asset.id}`} disabled={!previewInfo.playable} onClick={() => handlePreview(asset)} title={previewInfo.title} type="button">
                        <Play size={14} aria-hidden="true" />
                        {previewingId === asset.id ? "Playing" : "Preview"}
                      </button>
                      <button aria-label={`Delete ${asset.label || asset.id}`} className="danger" onClick={() => handleDeleteAsset(asset.id)} title="Delete asset" type="button">
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>

        <section className="admin-audio-panel">
          <div className="admin-audio-panel-heading collapsible">
            <CollapsibleButton
              collapsed={collapsedSections.cues}
              label="Cues"
              meta={`${config.cues.length} trigger mappings`}
              onClick={() => toggleSection("cues")}
            />
            <button onClick={handleAddCue} type="button">
              <Plus size={15} aria-hidden="true" />
              Add Cue
            </button>
          </div>
          {!collapsedSections.cues && (
            <div className="admin-audio-table cues">
              {config.cues.length === 0 ? (
                <p>No cue mappings configured.</p>
              ) : (
                config.cues.map((cue, index) => {
                  const triggerMeta = audioTriggerOptions.find((option) => option.trigger === cue.trigger);
                  const assets = config.assets.filter((asset) => asset.category === cue.category);
                  return (
                    <div className="admin-audio-row cue" key={`${cue.id}-${index}`}>
                      <label className="admin-audio-compact-check">
                        <input checked={cue.enabled} type="checkbox" onChange={(event) => updateCue(index, { enabled: event.target.checked })} />
                        On
                      </label>
                      <input aria-label="Cue id" value={cue.id} onChange={(event) => updateCue(index, { id: slug(event.target.value, cue.id || `cue_${index + 1}`) })} />
                      <input aria-label="Cue label" value={cue.label} onChange={(event) => updateCue(index, { label: event.target.value })} />
                      <select
                        className="wide"
                        value={cue.trigger}
                        onChange={(event) => {
                          const nextTrigger = audioTriggerOptions.find((option) => option.trigger === event.target.value) ?? audioTriggerOptions[0];
                          updateCue(index, {
                            category: nextTrigger.category,
                            duckMusic: nextTrigger.category === "voice" ? cue.duckMusic : false,
                            label: cue.label || nextTrigger.label,
                            trigger: nextTrigger.trigger
                          });
                        }}
                      >
                        {audioTriggerOptions.map((option) => (
                          <option key={option.trigger} value={option.trigger}>{option.label}</option>
                        ))}
                      </select>
                      <select value={cue.assetId} onChange={(event) => updateCue(index, { assetId: event.target.value })}>
                        <option value="">Fallback</option>
                        {assets.map((asset) => (
                          <option key={asset.id} value={asset.id}>{asset.label || asset.id}</option>
                        ))}
                      </select>
                      <input aria-label="Cue priority" type="number" value={cue.priority} onChange={(event) => updateCue(index, { priority: Number(event.target.value) })} />
                      <input aria-label="Cue cooldown" min="0" step="250" type="number" value={cue.cooldownMs} onChange={(event) => updateCue(index, { cooldownMs: Number(event.target.value) })} />
                      {cue.category === "voice" || triggerMeta?.category === "voice" ? (
                        <>
                          <input aria-label="Speaker" placeholder="Speaker" value={cue.speaker} onChange={(event) => updateCue(index, primaryVoiceLinePatch(cue, { speaker: event.target.value }))} />
                          <input aria-label="Subtitle" className="wide" placeholder="Subtitle" value={cue.subtitle} onChange={(event) => updateCue(index, primaryVoiceLinePatch(cue, { subtitle: event.target.value }))} />
                          <textarea
                            aria-label="Voice line bank"
                            className="wide"
                            placeholder="Speaker: Line variant"
                            rows={3}
                            value={formatVoiceLineBank(cue)}
                            onChange={(event) => {
                              const lines = parseVoiceLineBank(event.target.value, cue);
                              updateCue(index, {
                                lines,
                                speaker: lines[0]?.speaker ?? "",
                                subtitle: lines[0]?.subtitle ?? ""
                              });
                            }}
                          />
                          <label className="admin-audio-compact-check">
                            <input checked={cue.duckMusic} type="checkbox" onChange={(event) => updateCue(index, { duckMusic: event.target.checked })} />
                            Duck
                          </label>
                        </>
                      ) : null}
                      <button aria-label={`Delete ${cue.label || cue.id} cue`} className="danger" onClick={() => handleDeleteCue(cue.id)} title="Delete cue" type="button">
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>
      </div>

      <aside className="admin-audio-side">
        <div className="admin-audio-actions">
          <button disabled={saving || blockingIssues.length > 0} onClick={handleSave} type="button">
            <Save size={15} aria-hidden="true" />
            {saving ? "Saving" : "Save Audio"}
          </button>
          <button disabled={saving} onClick={handleReset} type="button">
            <RotateCcw size={15} aria-hidden="true" />
            Reset
          </button>
        </div>

        <div className="admin-validation">
          <h3>
            <Volume2 size={16} aria-hidden="true" />
            Audio Validation
          </h3>
          {issues.length === 0 ? (
            <p>No audio validation issues.</p>
          ) : (
            issues.slice(0, 9).map((issue, index) => (
              <p className={issue.severity} key={`${issue.message}-${index}`}>
                {issue.message}
              </p>
            ))
          )}
        </div>

        <div className="admin-validation">
          <h3>
            <KeyRound size={16} aria-hidden="true" />
            ElevenLabs Validation
          </h3>
          {providerIssues.length === 0 ? (
            <p>No ElevenLabs validation issues.</p>
          ) : (
            providerIssues.slice(0, 9).map((issue, index) => (
              <p className={issue.severity} key={`${issue.message}-${index}`}>
                {issue.message}
              </p>
            ))
          )}
        </div>

        <div className="admin-revisions">
          <h3>
            <History size={16} aria-hidden="true" />
            Audio History
            <button onClick={refreshRevisions} type="button">Refresh</button>
          </h3>
          {revisions.length === 0 ? (
            <p>No saved audio revisions yet.</p>
          ) : (
            revisions.slice(0, 8).map((revision) => (
              <button disabled={saving} key={revision.id} onClick={() => handleRestore(revision)} type="button">
                <span>r{revision.revision} {revision.action.replace("_", " ")}</span>
                <small>{new Date(revision.createdAt).toLocaleString()} · {revision.createdBy ?? "unknown"}</small>
              </button>
            ))
          )}
        </div>
        {status && <p className="admin-status">{status}</p>}
      </aside>
    </section>
  );
}
