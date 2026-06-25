import { History, Mic2, Music, Play, Plus, RotateCcw, Save, Trash2, Volume2, VolumeX } from "lucide-react";
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
  loadRemoteAudioConfigRevisions,
  resetRemoteAudioConfig,
  restoreRemoteAudioConfigRevision,
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

export function AdminAudioEditor({ initialConfig, onReset, onSave, session }: AdminAudioEditorProps) {
  const [config, setConfig] = useState<AudioConfig>(() => normalizeAudioConfig(initialConfig));
  const [revisions, setRevisions] = useState<RemoteAudioConfigRevision[]>([]);
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

  useEffect(() => {
    refreshRevisions();
  }, [refreshRevisions]);

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

  const setNormalizedConfig = useCallback((updater: (current: AudioConfig) => AudioConfig) => {
    setConfig((current) => normalizeAudioConfig(updater(current)));
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
