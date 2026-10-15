import { loadSettings, saveSettings, updateSetting } from '../storage/settings';
import type { Settings, SettingsKey, SettingsStorage } from '../storage/settings';

function browserStorage(): SettingsStorage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

export function mountSettings(dialog: HTMLDialogElement, openButton: HTMLButtonElement,
  motionChanged: (reduced: boolean) => void = () => {}, opening: () => void = () => {},
  closed: () => void = () => openButton.focus(), preferencesChanged: (settings: Settings) => void = () => {}): () => void {
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const storage = browserStorage();
  let persistenceAvailable = storage !== undefined;
  let settings = loadSettings(storage, systemMotion.matches);
  const status = dialog.querySelector<HTMLElement>('[role="status"]');
  const apply = () => {
    const reduced = settings.reducedMotion || systemMotion.matches;
    document.documentElement.dataset.reducedMotion = String(reduced);
    document.documentElement.dataset.systemReducedMotion = String(systemMotion.matches);
    document.documentElement.dataset.storedReducedMotion = String(settings.reducedMotion);
    const explanation = dialog.querySelector<HTMLElement>('#motion-preference-note');
    if (explanation) explanation.textContent = systemMotion.matches
      ? 'System reduced motion is on. Arrows settle immediately; this switch cannot override the system preference.'
      : 'Settle arrows immediately. Turn off for full path movement when system reduced motion is also off.';
    preferencesChanged(settings);
    motionChanged(reduced);
    for (const input of dialog.querySelectorAll<HTMLInputElement>('input[data-setting]')) {
      const key = input.dataset.setting as SettingsKey;
      input.checked = settings[key];
    }
  };
  apply();
  systemMotion.addEventListener('change', apply, options);
  openButton.addEventListener('click', () => {
    opening();
    if (status) {
      status.textContent = persistenceAvailable ? 'Preferences are saved on this device.' : 'Storage is unavailable. Preferences will last only for this session.';
      status.dataset.error = String(!persistenceAvailable);
    }
    dialog.showModal();
  }, options);
  dialog.querySelector<HTMLButtonElement>('[data-close]')?.addEventListener('click', () => dialog.close(), options);
  dialog.addEventListener('close', closed, options);
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }, options);
  dialog.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const key = event.target.dataset.setting;
    if (key !== 'sound' && key !== 'haptics' && key !== 'reducedMotion') return;
    settings = updateSetting(settings, key, event.target.checked);
    apply();
    const saved = saveSettings(storage, settings);
    persistenceAvailable = saved;
    if (status) {
      status.textContent = saved ? 'Preferences saved on this device.' : 'Storage is unavailable. Preferences will last only for this session.';
      status.dataset.error = String(!saved);
    }
  }, options);
  return () => {
    controller.abort();
    if (dialog.open) dialog.close();
  };
}
