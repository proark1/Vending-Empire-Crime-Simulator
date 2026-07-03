// Maps event-log message text to the voice cue it should trigger. This couples
// voice barks to human-readable reducer log() strings, so a wording change in the
// reducer can silently break a bark — voiceEventPatterns.test.ts guards against
// that drift by asserting representative messages still resolve to their trigger.
export const VOICE_EVENT_PATTERNS: Array<{ test: RegExp; trigger: string }> = [
  { test: /inspection notice/i, trigger: "voice.inspector_notice" },
  { test: /permit lapsed into a challenge/i, trigger: "voice.lawyer_notice" },
  { test: /bought time with local paperwork/i, trigger: "voice.fixer_tip" },
  { test: /supplier market shifted/i, trigger: "voice.supplier_offer" },
  { test: /rent was short/i, trigger: "voice.landlord_pressure" },
  { test: /expansion cell/i, trigger: "voice.rival_boss_threat" },
  { test: /route ambush/i, trigger: "voice.driver_warning" },
  { test: /tipped off/i, trigger: "voice.informant_tip" },
  { test: /joined the route crew/i, trigger: "voice.guard_contact" },
  { test: /delivered to the garage/i, trigger: "voice.mechanic_unlock" }
];

// Resolve the voice trigger (if any) for an event-log message.
export function voiceTriggerForMessage(message: string): string | null {
  return VOICE_EVENT_PATTERNS.find((entry) => entry.test.test(message))?.trigger ?? null;
}
