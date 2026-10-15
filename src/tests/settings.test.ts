import { describe, expect, it } from 'vitest';
import { decodeSettings, defaultSettings, loadSettings, saveSettings, SETTINGS_KEY, updateSetting } from '../storage/settings';
import type { SettingsStorage } from '../storage/settings';

describe('persisted device preferences', () => {
  it('uses the system motion preference only as the first-run default', () => {
    expect(decodeSettings(null, true)).toEqual({ sound: true, haptics: true, reducedMotion: true });
    expect(decodeSettings(JSON.stringify({ version: 1, settings: { reducedMotion: false } }), true).reducedMotion).toBe(false);
  });

  it.each(['{broken', 'null', '[]', 'true', '{"version":2,"settings":{"sound":false}}'])('recovers safely from corrupted or unsupported data: %s', (raw) => {
    expect(decodeSettings(raw)).toEqual(defaultSettings());
  });

  it('restores valid fields without coercing invalid field types', () => {
    expect(decodeSettings('{"version":1,"settings":{"sound":false,"haptics":"false","reducedMotion":0}}', true)).toEqual({ sound: false, haptics: true, reducedMotion: true });
  });

  it('updates one preference without mutating the previous snapshot', () => {
    const before = Object.freeze(defaultSettings());
    expect(updateSetting(before, 'haptics', false)).toEqual({ sound: true, haptics: false, reducedMotion: false });
    expect(before.haptics).toBe(true);
  });

  it('writes versioned data and restores all three choices after a reload', () => {
    const values = new Map<string, string>();
    const storage: SettingsStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
    };
    const settings = { sound: false, haptics: false, reducedMotion: true };
    expect(saveSettings(storage, settings)).toBe(true);
    expect(values.has(SETTINGS_KEY)).toBe(true);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('survives unavailable, denied, or full storage without claiming a successful save', () => {
    const storage: SettingsStorage = {
      getItem: () => { throw new Error('Denied'); },
      setItem: () => { throw new Error('Quota exceeded'); },
    };
    expect(loadSettings(storage, true)).toEqual(defaultSettings(true));
    expect(saveSettings(storage, defaultSettings())).toBe(false);
    expect(loadSettings(undefined)).toEqual(defaultSettings());
    expect(saveSettings(undefined, defaultSettings())).toBe(false);
  });
});
