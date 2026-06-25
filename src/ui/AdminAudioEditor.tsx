import { Copy, History, KeyRound, Mic2, Music, Play, Plus, RotateCcw, Save, Trash2, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  audioTriggerOptions,
  createDefaultAudioConfig,
  normalizeAudioConfig,
  validateAudioConfig,
  type AudioAsset,
  type AudioCategory,
  type AudioConfig,
  type AudioCue
} from "../game/content/audioConfig";
import {
  createDefaultAudioProviderSettings,
  defaultElevenLabsGenerationPrompts,
  normalizeAudioProviderSettings,
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
  if (!bytes) {
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

export function AdminAudioEditor({ initialConfig, onReset, onSave, session }: AdminAudioEditorProps) {
  const [config, setConfig] = useState<AudioConfig>(() => normalizeAudioConfig(initialConfig));
  const [providerSettings, setProviderSettings] = useState<AudioProviderSettings>(() => createDefaultAudioProviderSettings());
  const [revisions, setRevisions] = useState<RemoteAudioConfigRevision[]>([]);
  const [providerSaving, setProviderSaving] = useState(false);
  const [generatingPromptId, setGeneratingPromptId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [previewingId, setPreviewingId] = useState<string | null>(null);
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

  const handleAddGenerationPrompt = useCallback(() => {
    setNormalizedProviderSettings((current) => {
      const id = nextId("prompt", current.generationPrompts.map((prompt) => prompt.id));
      return {
        ...current,
        generationPrompts: [
          ...current.generationPrompts,
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
      };
    });
  }, [setNormalizedProviderSettings]);

  const handleResetGenerationPrompts = useCallback(() => {
    setNormalizedProviderSettings((current) => ({
      ...current,
      generationPrompts: defaultElevenLabsGenerationPrompts.map((prompt) => ({ ...prompt }))
    }));
  }, [setNormalizedProviderSettings]);

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
    setNormalizedProviderSettings((current) => ({
      ...current,
      generationPrompts: current.generationPrompts.filter((prompt) => prompt.id !== promptId)
    }));
  }, [setNormalizedProviderSettings]);

  const handlePreview = useCallback((asset: AudioAsset) => {
    if (!asset.url) {
      setStatus("Add an asset URL before previewing.");
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

  const upsertGeneratedAsset = useCallback((asset: AudioAsset) => {
    setNormalizedConfig((current) => {
      const sourcePrompt = providerSettings.generationPrompts.find((prompt) => `generated_${prompt.id}` === asset.id);
      const nextAssets = current.assets.some((candidate) => candidate.id === asset.id)
        ? current.assets.map((candidate) => candidate.id === asset.id ? { ...candidate, ...asset } : candidate)
        : [...current.assets, asset];
      const hasCue = current.cues.some((cue) => cue.assetId === asset.id || cue.trigger === sourcePrompt?.trigger);
      const nextCues = current.cues.map((cue) => sourcePrompt?.trigger && cue.trigger === sourcePrompt.trigger
        ? {
          ...cue,
          assetId: asset.id,
          category: asset.category,
          duckMusic: asset.category === "voice",
          label: sourcePrompt.label,
          subtitle: asset.category === "voice" ? sourcePrompt.prompt : cue.subtitle
        }
        : cue
      );

      return {
        ...current,
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
              priority: asset.category === "voice" ? 10 : 0,
              speaker: "",
              subtitle: asset.category === "voice" ? sourcePrompt.prompt : "",
              trigger: sourcePrompt.trigger
            }
          ]
      };
    });
  }, [providerSettings.generationPrompts, setNormalizedConfig]);

  const handleGeneratePrompt = useCallback((promptIndex: number) => {
    const prompt = providerSettings.generationPrompts[promptIndex];
    if (!prompt) {
      return;
    }

    setGeneratingPromptId(prompt.id);
    setStatus(`Generating ${prompt.label}...`);
    generateAdminAudio(session, providerSettings, prompt)
      .then((result) => {
        updateGenerationPrompt(promptIndex, result.prompt);
        upsertGeneratedAsset(result.asset);
        setStatus(`Generated ${result.prompt.label}: ${formatBytes(result.asset.sizeBytes)}. Save Audio to publish the asset/cue mapping.`);
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Audio generation failed."))
      .finally(() => setGeneratingPromptId(null));
  }, [providerSettings, session, updateGenerationPrompt, upsertGeneratedAsset]);

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
              Add Voice ID
            </button>
          </div>

          <div className="admin-audio-table provider">
            {providerSettings.voiceProfiles.length === 0 ? (
              <p>No ElevenLabs voice IDs configured.</p>
            ) : (
              providerSettings.voiceProfiles.map((profile, index) => (
                <div className="admin-audio-row provider" key={`${profile.id}-${index}`}>
                  <select value={profile.purpose} onChange={(event) => updateVoiceProfile(index, { purpose: event.target.value as AudioCategory })}>
                    {Object.entries(categoryLabels).map(([category, label]) => (
                      <option key={category} value={category}>{label}</option>
                    ))}
                  </select>
                  <input aria-label="Voice profile id" value={profile.id} onChange={(event) => updateVoiceProfile(index, { id: slug(event.target.value, profile.id || `voice_${index + 1}`) })} />
                  <input aria-label="Voice profile label" value={profile.label} onChange={(event) => updateVoiceProfile(index, { label: event.target.value })} />
                  <input aria-label="ElevenLabs voice id" className="wide" placeholder="Voice ID" value={profile.voiceId} onChange={(event) => updateVoiceProfile(index, { voiceId: event.target.value })} />
                  <input aria-label="ElevenLabs model id" className="wide" value={profile.modelId} onChange={(event) => updateVoiceProfile(index, { modelId: event.target.value })} />
                  <input aria-label="Stability" max="1" min="0" step="0.05" type="number" value={profile.stability} onChange={(event) => updateVoiceProfile(index, { stability: Number(event.target.value) })} />
                  <input aria-label="Similarity boost" max="1" min="0" step="0.05" type="number" value={profile.similarityBoost} onChange={(event) => updateVoiceProfile(index, { similarityBoost: Number(event.target.value) })} />
                  <input aria-label="Style" max="1" min="0" step="0.05" type="number" value={profile.style} onChange={(event) => updateVoiceProfile(index, { style: Number(event.target.value) })} />
                  <label className="admin-audio-compact-check">
                    <input checked={profile.useSpeakerBoost} type="checkbox" onChange={(event) => updateVoiceProfile(index, { useSpeakerBoost: event.target.checked })} />
                    Boost
                  </label>
                  <button className="danger" onClick={() => handleDeleteVoiceProfile(profile.id)} type="button">
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="admin-audio-subheading">
            <h3>Voice Text Prompts</h3>
            <div className="admin-audio-heading-actions">
              <button onClick={handleResetGenerationPrompts} type="button">
                <RotateCcw size={14} aria-hidden="true" />
                Defaults
              </button>
            </div>
          </div>

          <div className="admin-audio-table voice-prompts">
            {voicePromptRows.length === 0 ? (
              <p>No voice text prompts configured.</p>
            ) : (
              voicePromptRows.map(({ index, prompt }) => (
                <div className="admin-audio-row voice-text" key={`voice-text-${prompt.id}-${index}`}>
                  <label className="admin-audio-compact-check">
                    <input checked={prompt.enabled} type="checkbox" onChange={(event) => updateGenerationPrompt(index, { enabled: event.target.checked })} />
                    On
                  </label>
                  <input aria-label="Voice prompt label" value={prompt.label} onChange={(event) => updateGenerationPrompt(index, { label: event.target.value })} />
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
                  <span className="admin-audio-file-size">{formatBytes(prompt.generatedSizeBytes)}</span>
                  <button disabled={!prompt.generatedUrl} onClick={() => handlePreview({ category: "voice", id: prompt.id, label: prompt.label, loop: false, url: prompt.generatedUrl ?? "", volume: 1 })} type="button">
                    <Play size={14} aria-hidden="true" />
                  </button>
                  <button disabled={Boolean(generatingPromptId)} onClick={() => handleGeneratePrompt(index)} type="button">
                    {generatingPromptId === prompt.id ? "Generating" : "Generate"}
                  </button>
                  <button onClick={() => handleCopyPrompt(prompt.prompt)} type="button">
                    <Copy size={14} aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="admin-audio-subheading">
            <h3>Generation Prompts</h3>
            <div className="admin-audio-heading-actions">
              <button onClick={handleResetGenerationPrompts} type="button">
                <RotateCcw size={14} aria-hidden="true" />
                Defaults
              </button>
              <button onClick={handleAddGenerationPrompt} type="button">
                <Plus size={14} aria-hidden="true" />
                Add Prompt
              </button>
            </div>
          </div>

          <div className="admin-audio-table prompts">
            {providerSettings.generationPrompts.length === 0 ? (
              <p>No ElevenLabs prompts configured.</p>
            ) : (
              providerSettings.generationPrompts.map((prompt, index) => (
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
                  <input aria-label="Prompt id" value={prompt.id} onChange={(event) => updateGenerationPrompt(index, { id: slug(event.target.value, prompt.id || `prompt_${index + 1}`) })} />
                  <input aria-label="Prompt label" value={prompt.label} onChange={(event) => updateGenerationPrompt(index, { label: event.target.value })} />
                  <select aria-label="Prompt trigger" value={prompt.trigger} onChange={(event) => updateGenerationPrompt(index, { trigger: event.target.value })}>
                    {audioTriggerOptions.map((option) => (
                      <option key={option.trigger} value={option.trigger}>{option.label}</option>
                    ))}
                  </select>
                  <textarea aria-label="ElevenLabs prompt" value={prompt.prompt} onChange={(event) => updateGenerationPrompt(index, { prompt: event.target.value })} />
                  <textarea aria-label="ElevenLabs negative prompt" value={prompt.negativePrompt} onChange={(event) => updateGenerationPrompt(index, { negativePrompt: event.target.value })} />
                  <select aria-label="Prompt voice profile" value={prompt.voiceProfileId} onChange={(event) => updateGenerationPrompt(index, { voiceProfileId: event.target.value })}>
                    <option value="">No voice profile</option>
                    {providerSettings.voiceProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.label || profile.id}</option>
                    ))}
                  </select>
                  <input aria-label="Prompt duration" max="180" min="0.5" step="0.5" type="number" value={prompt.durationSeconds} onChange={(event) => updateGenerationPrompt(index, { durationSeconds: Number(event.target.value) })} />
                  <span className="admin-audio-file-size">{formatBytes(prompt.generatedSizeBytes)}</span>
                  <button disabled={!prompt.generatedUrl} onClick={() => handlePreview({ category: prompt.purpose, id: prompt.id, label: prompt.label, loop: prompt.purpose === "music", url: prompt.generatedUrl ?? "", volume: 1 })} type="button">
                    <Play size={14} aria-hidden="true" />
                  </button>
                  <button disabled={Boolean(generatingPromptId)} onClick={() => handleGeneratePrompt(index)} type="button">
                    {generatingPromptId === prompt.id ? "Generating" : "Generate"}
                  </button>
                  <button className="danger" onClick={() => handleDeleteGenerationPrompt(prompt.id)} type="button">
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="admin-audio-panel">
          <div className="admin-audio-panel-heading">
            <h2>
              <Music size={17} aria-hidden="true" />
              Assets
            </h2>
            <button onClick={handleAddAsset} type="button">
              <Plus size={15} aria-hidden="true" />
              Add Asset
            </button>
          </div>
          <div className="admin-audio-table assets">
            {config.assets.length === 0 ? (
              <p>No audio assets configured.</p>
            ) : (
              config.assets.map((asset, index) => (
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
                  <button onClick={() => handlePreview(asset)} type="button">
                    <Play size={14} aria-hidden="true" />
                    {previewingId === asset.id ? "Playing" : "Preview"}
                  </button>
                  <button className="danger" onClick={() => handleDeleteAsset(asset.id)} type="button">
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="admin-audio-panel">
          <div className="admin-audio-panel-heading">
            <h2>
              <Mic2 size={17} aria-hidden="true" />
              Cues
            </h2>
            <button onClick={handleAddCue} type="button">
              <Plus size={15} aria-hidden="true" />
              Add Cue
            </button>
          </div>
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
                        <input aria-label="Speaker" placeholder="Speaker" value={cue.speaker} onChange={(event) => updateCue(index, { speaker: event.target.value })} />
                        <input aria-label="Subtitle" className="wide" placeholder="Subtitle" value={cue.subtitle} onChange={(event) => updateCue(index, { subtitle: event.target.value })} />
                        <label className="admin-audio-compact-check">
                          <input checked={cue.duckMusic} type="checkbox" onChange={(event) => updateCue(index, { duckMusic: event.target.checked })} />
                          Duck
                        </label>
                      </>
                    ) : null}
                    <button className="danger" onClick={() => handleDeleteCue(cue.id)} type="button">
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
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
