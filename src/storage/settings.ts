export interface Settings {
  readonly sound: boolean;
  readonly haptics: boolean;
  readonly reducedMotion: boolean;
}

export type SettingsKey = keyof Settings;
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const SETTINGS_KEY = 'flowline.settings.v1';

export function defaultSettings(systemReducedMotion = false): Settings {
  return { sound: true, haptics: true, reducedMotion: systemReducedMotion };
}

/** Restore valid fields independently; corrupted/future schemas use safe defaults. */
export function decodeSettings(raw: string | null, systemReducedMotion = false): Settings {
  const defaults = defaultSettings(systemReducedMotion);
  if (!raw) return defaults;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== 1 || !('settings' in parsed)) return defaults;
    const settings = parsed.settings;
    if (!settings || typeof settings !== 'object') return defaults;
    return {
      sound: 'sound' in settings && typeof settings.sound === 'boolean' ? settings.sound : defaults.sound,
      haptics: 'haptics' in settings && typeof settings.haptics === 'boolean' ? settings.haptics : defaults.haptics,
      reducedMotion: 'reducedMotion' in settings && typeof settings.reducedMotion === 'boolean' ? settings.reducedMotion : defaults.reducedMotion,
    };
  } catch {
    return defaults;
  }
}

export function loadSettings(storage: SettingsStorage | undefined, systemReducedMotion = false): Settings {
  try {
    return decodeSettings(storage?.getItem(SETTINGS_KEY) ?? null, systemReducedMotion);
  } catch {
    return defaultSettings(systemReducedMotion);
  }
}

export function updateSetting(settings: Settings, key: SettingsKey, value: boolean): Settings {
  return { ...settings, [key]: value };
}

export function saveSettings(storage: SettingsStorage | undefined, settings: Settings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, settings }));
    return true;
  } catch {
    return false;
  }
}
