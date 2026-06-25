import type { GameEventTone } from "../game/core/types";
import {
  createDefaultAudioConfig,
  normalizeAudioConfig,
  type AudioAsset,
  type AudioCategory,
  type AudioConfig,
  type AudioCue
} from "../game/content/audioConfig";
import type { SceneFeedbackKind } from "../render/three/SceneTargets";

let audioContext: AudioContext | null = null;
let unlocked = false;
let ambienceGain: GainNode | null = null;
let ambienceOscillators: OscillatorNode[] = [];
let audioConfig: AudioConfig = createDefaultAudioConfig();
let currentMusicElement: HTMLAudioElement | null = null;
let currentMusicCueId: string | null = null;
let musicDuckedUntil = 0;
const activeOneShots = new Set<HTMLAudioElement>();
const lastCueTimes = new Map<string, number>();

function getContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) {
    return null;
  }

  audioContext ??= new AudioCtor();
  return audioContext;
}

export function unlockGameAudio(): void {
  const context = getContext();
  if (!context) {
    return;
  }

  unlocked = true;
  if (context.state === "suspended") {
    void context.resume();
  }
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function channelVolume(category: AudioCategory, assetVolume = 1): number {
  if (audioConfig.mixer.muted) {
    return 0;
  }

  const channel = category === "music"
    ? audioConfig.mixer.musicVolume
    : category === "voice"
      ? audioConfig.mixer.voiceVolume
      : audioConfig.mixer.soundVolume;
  return clampVolume(audioConfig.mixer.masterVolume * channel * assetVolume);
}

function updateCurrentMusicVolume(): void {
  if (!currentMusicElement) {
    return;
  }

  const cue = audioConfig.cues.find((candidate) => candidate.id === currentMusicCueId);
  const asset = cue ? audioConfig.assets.find((candidate) => candidate.id === cue.assetId) : null;
  const ducking = Date.now() < musicDuckedUntil ? audioConfig.mixer.voiceDucking : 1;
  currentMusicElement.volume = channelVolume("music", asset?.volume ?? 1) * ducking;
}

function configureElementVolume(element: HTMLAudioElement, category: AudioCategory, asset: AudioAsset): void {
  element.volume = channelVolume(category, asset.volume);
}

function findCue(trigger: string, category?: AudioCategory): AudioCue | null {
  const now = Date.now();
  const candidates = audioConfig.cues
    .filter((cue) => cue.enabled && cue.trigger === trigger && (!category || cue.category === category))
    .filter((cue) => {
      if (cue.category === "music") {
        return true;
      }
      const lastPlayed = lastCueTimes.get(cue.id) ?? 0;
      return cue.cooldownMs <= 0 || now - lastPlayed >= cue.cooldownMs;
    })
    .sort((a, b) => b.priority - a.priority);

  return candidates[0] ?? null;
}

function cueAsset(cue: AudioCue | null): AudioAsset | null {
  if (!cue?.assetId) {
    return null;
  }

  return audioConfig.assets.find((asset) => asset.id === cue.assetId) ?? null;
}

function stopCurrentMusic(): void {
  if (!currentMusicElement) {
    return;
  }

  currentMusicElement.pause();
  currentMusicElement.removeAttribute("src");
  currentMusicElement.load();
  currentMusicElement = null;
  currentMusicCueId = null;
}

function stopAmbience(): void {
  for (const oscillator of ambienceOscillators) {
    try {
      oscillator.stop();
    } catch {
      // Oscillator may already be stopped after a browser audio reset.
    }
  }
  ambienceOscillators = [];
  ambienceGain?.disconnect();
  ambienceGain = null;
}

function playAsset(cue: AudioCue, asset: AudioAsset): boolean {
  if (typeof Audio === "undefined" || !unlocked || !asset.url) {
    return false;
  }

  const category = asset.category;
  const element = new Audio(asset.url);
  element.loop = category === "music" ? true : asset.loop;
  configureElementVolume(element, category, asset);
  lastCueTimes.set(cue.id, Date.now());
  activeOneShots.add(element);
  const releaseElement = () => activeOneShots.delete(element);
  element.addEventListener("ended", releaseElement, { once: true });
  element.addEventListener("error", releaseElement, { once: true });

  if (category === "voice" && cue.duckMusic && currentMusicElement) {
    musicDuckedUntil = Date.now() + Math.max(1200, 800 + cue.cooldownMs);
    updateCurrentMusicVolume();
    const restoreMusic = () => {
      musicDuckedUntil = 0;
      updateCurrentMusicVolume();
    };
    element.addEventListener("ended", restoreMusic, { once: true });
    element.addEventListener("error", restoreMusic, { once: true });
  }

  void element.play().catch(() => {
    if (category === "voice") {
      musicDuckedUntil = 0;
      updateCurrentMusicVolume();
    }
  });
  return true;
}

function playConfiguredCue(trigger: string, fallback: () => void): void {
  const cue = findCue(trigger);
  const asset = cueAsset(cue);
  if (cue && asset && playAsset(cue, asset)) {
    return;
  }

  fallback();
}

function playMusicCue(trigger: string): boolean {
  const cue = findCue(trigger, "music");
  const asset = cueAsset(cue);
  if (!cue || !asset || !asset.url || typeof Audio === "undefined" || !unlocked) {
    return false;
  }

  stopAmbience();

  if (currentMusicCueId === cue.id && currentMusicElement) {
    updateCurrentMusicVolume();
    return true;
  }

  stopCurrentMusic();
  const element = new Audio(asset.url);
  element.loop = true;
  currentMusicElement = element;
  currentMusicCueId = cue.id;
  lastCueTimes.set(cue.id, Date.now());
  updateCurrentMusicVolume();
  void element.play().catch(() => {
    if (currentMusicElement === element) {
      stopCurrentMusic();
    }
  });
  return true;
}

function playFirstMusicCue(triggers: string[]): boolean {
  return triggers.some((trigger) => playMusicCue(trigger));
}

export function configureGameAudio(config: AudioConfig): void {
  audioConfig = normalizeAudioConfig(config);

  if (currentMusicCueId && !audioConfig.cues.some((cue) => cue.id === currentMusicCueId && cue.enabled)) {
    stopCurrentMusic();
  } else {
    updateCurrentMusicVolume();
  }
}

export function startGameAmbience(): void {
  const context = getContext();
  if (!context || !unlocked || ambienceGain) {
    return;
  }

  if (playMusicCue("music.ambient")) {
    return;
  }

  stopCurrentMusic();
  ambienceGain = context.createGain();
  ambienceGain.gain.setValueAtTime(0.018 * channelVolume("music"), context.currentTime);
  ambienceGain.connect(context.destination);

  const lowDrone = context.createOscillator();
  lowDrone.type = "sine";
  lowDrone.frequency.setValueAtTime(54, context.currentTime);
  lowDrone.connect(ambienceGain);
  lowDrone.start();

  const fluorescentBuzz = context.createOscillator();
  fluorescentBuzz.type = "triangle";
  fluorescentBuzz.frequency.setValueAtTime(118, context.currentTime);
  fluorescentBuzz.connect(ambienceGain);
  fluorescentBuzz.start();

  ambienceOscillators = [lowDrone, fluorescentBuzz];
}

export function updateGameAmbience(heat: number, conflictActive: boolean): void {
  const context = getContext();
  if (!context || !unlocked) {
    return;
  }

  const musicTriggers = conflictActive
    ? ["music.conflict", "music.heat", "music.ambient"]
    : heat >= 30
      ? ["music.heat", "music.ambient"]
      : ["music.ambient"];
  if (playFirstMusicCue(musicTriggers)) {
    return;
  }

  stopCurrentMusic();
  startGameAmbience();
  if (!ambienceGain) {
    return;
  }

  const targetGain = Math.min(0.055, 0.016 + heat * 0.0018 + (conflictActive ? 0.018 : 0)) * channelVolume("music");
  ambienceGain.gain.setTargetAtTime(targetGain, context.currentTime, 0.45);
  const [lowDrone, buzz] = ambienceOscillators;
  lowDrone?.frequency.setTargetAtTime(54 + Math.min(20, heat * 0.8), context.currentTime, 0.7);
  buzz?.frequency.setTargetAtTime(conflictActive ? 152 : 118, context.currentTime, 0.5);
}

function tone(frequency: number, start: number, duration: number, gain: number, type: OscillatorType = "sine"): void {
  const context = getContext();
  if (!context || !unlocked) {
    return;
  }

  const oscillator = context.createOscillator();
  const volume = context.createGain();
  const effectiveGain = gain * channelVolume("sound");
  if (effectiveGain <= 0.0001) {
    return;
  }
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(effectiveGain, start + 0.015);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(volume);
  volume.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

export function playFeedbackCue(kind: SceneFeedbackKind): void {
  const context = getContext();
  if (!context || !unlocked) {
    return;
  }

  playConfiguredCue(`feedback.${kind}`, () => {
    const now = context.currentTime;
    if (kind === "cash") {
      tone(880, now, 0.08, 0.035, "triangle");
      tone(1320, now + 0.07, 0.09, 0.026, "triangle");
      return;
    }

    if (kind === "pickup" || kind === "store" || kind === "stock" || kind === "vehicle") {
      tone(160, now, 0.06, 0.035, "square");
      tone(220, now + 0.06, 0.08, 0.025, "square");
      return;
    }

    if (kind === "repair" || kind === "upgrade" || kind === "lockdown") {
      tone(420, now, 0.05, 0.03, "sawtooth");
      tone(620, now + 0.05, 0.05, 0.026, "sawtooth");
      tone(920, now + 0.1, 0.07, 0.022, "triangle");
      return;
    }

    if (kind === "sabotage" || kind === "fight" || kind === "melee") {
      tone(92, now, 0.12, 0.04, "sawtooth");
      tone(58, now + 0.08, 0.1, 0.035, "square");
      return;
    }

    if (kind === "escape") {
      tone(220, now, 0.06, 0.032, "sawtooth");
      tone(330, now + 0.055, 0.08, 0.026, "sawtooth");
      tone(520, now + 0.12, 0.1, 0.02, "triangle");
      return;
    }

    tone(520, now, 0.06, 0.026, "triangle");
    tone(780, now + 0.055, 0.08, 0.022, "triangle");
  });
}

export function playEventCue(toneName: GameEventTone): void {
  const context = getContext();
  if (!context || !unlocked) {
    return;
  }

  playConfiguredCue(`event.${toneName}`, () => {
    const now = context.currentTime;
    if (toneName === "danger") {
      tone(120, now, 0.11, 0.042, "sawtooth");
      tone(90, now + 0.13, 0.12, 0.036, "sawtooth");
      return;
    }

    if (toneName === "warning") {
      tone(260, now, 0.08, 0.03, "triangle");
      tone(220, now + 0.09, 0.08, 0.024, "triangle");
      return;
    }

    if (toneName === "good") {
      tone(640, now, 0.07, 0.026, "triangle");
      tone(960, now + 0.07, 0.08, 0.02, "triangle");
    }
  });
}
