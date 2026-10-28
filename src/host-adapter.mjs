// The only file that touches `folium.internals`: the live mode list, and reading
// and writing the lyric animation mode, its tuning and its 智能动感 beat effects. Folium 2 removes
// internals with no replacement (M0 checked the public API: there is none), so
// when that happens this file is what changes. Every access is feature-checked
// and degrades to "unavailable" instead of throwing into the player.

import { MODE_PARAMS, BEAT_EFFECTS, EFFECT_DEFAULT, tuningKeyOf, gatesFor, gateSatisfied, isInertValue, sanitizeParams, sanitizeEffects } from './params.mjs';

/* Reading `folium.internals` throws (rather than returning undefined) when the
 * host withholds it, and optional chaining does not catch a throwing getter. */
const internalsOf = (folium) => {
  try {
    return folium.internals ?? null;
  } catch {
    return null;
  }
};

export const createHostAdapter = (folium) => {
  const store = () => {
    const visualizerSettings = internalsOf(folium)?.stores?.visualizerSettings;
    return visualizerSettings && typeof visualizerSettings.getState === 'function' ? visualizerSettings : null;
  };

  /* Writes of our own, so a `visualizer.modeChanged` that follows can be told
   * apart from the user picking a mode (M0: the event carries no origin). */
  let ownWriteUntil = 0;
  const markOwnWrite = () => { ownWriteUntil = performance.now() + 800; };

  const available = () => Boolean(store());

  const registryEntries = () => {
    const registry = internalsOf(folium)?.visualizerRegistry ?? null;
    const entries = Array.isArray(registry) ? registry : (registry?.entries ?? []);
    return entries.filter((entry) => entry && typeof entry.mode === 'string');
  };

  /** The live registry: builtin modes plus any a mod contributed. */
  const listModes = () => registryEntries()
    .map((entry) => ({ id: entry.mode, label: entry.labelFallback || entry.mode }));

  // ------------------------------------------------------------ 智能动感

  const smartBeat = () => {
    const value = store()?.getState?.()?.smartBeat;
    return value && typeof value === 'object' ? value : null;
  };

  /** 'off' | 'cached' | 'on', or null when this Folia has no 智能动感. */
  const beatMode = () => {
    const state = store()?.getState?.();
    if (typeof state?.handleSetSmartBeat !== 'function') return null;
    const mode = state.smartBeat?.mode;
    return typeof mode === 'string' ? mode : null;
  };

  /** Ids of the beat effects `mode` offers and we can describe (retired ones left out). */
  const listBeatEffects = (mode) => {
    const entry = registryEntries().find((item) => item.mode === mode);
    return (Array.isArray(entry?.beatEffects) ? entry.beatEffects : [])
      .filter((effect) => effect && !effect.retired && typeof effect.id === 'string' && BEAT_EFFECTS[effect.id])
      .map((effect) => effect.id);
  };

  const effectState = (id) => {
    const value = smartBeat()?.effects?.[id];
    return {
      on: typeof value?.on === 'boolean' ? value.on : EFFECT_DEFAULT.on,
      strength: Number.isFinite(value?.strength) ? value.strength : EFFECT_DEFAULT.strength,
    };
  };

  /* An effect toggled mid-song rebuilds the scene (凝彩 clears its shots), so
   * this goes out with the mode switch, at the same safe moment. */
  const setEffects = (mode, rawEffects) => {
    const state = store()?.getState?.();
    if (typeof state?.handleSetSmartBeat !== 'function') return {};
    const wanted = sanitizeEffects(rawEffects, listBeatEffects(mode));
    const patch = {};
    for (const [id, value] of Object.entries(wanted)) {
      const now = effectState(id);
      const next = { on: value.on, strength: value.strength ?? now.strength };
      if (next.on !== now.on || next.strength !== now.strength) patch[id] = next;
    }
    if (Object.keys(patch).length === 0) return {};
    markOwnWrite();
    state.handleSetSmartBeat({ effects: patch });
    const written = {};
    for (const id of Object.keys(patch)) written[id] = effectState(id);
    return written;
  };

  const currentMode = () => {
    const mode = store()?.getState?.()?.visualizerMode;
    return typeof mode === 'string' ? mode : null;
  };

  const readTuning = (mode) => {
    const key = tuningKeyOf(mode);
    const value = key ? store()?.getState?.()?.[key] : null;
    return value && typeof value === 'object' ? value : null;
  };

  const setMode = (mode) => {
    const state = store()?.getState?.();
    if (typeof state?.handleSetVisualizerMode !== 'function') throw new Error('宿主没有提供切换模式的接口');
    if (state.visualizerMode === mode) return false;
    markOwnWrite();
    // notify:false keeps the host from showing its own "switched to" toast.
    state.handleSetVisualizerMode(mode, { notify: false });
    return true;
  };

  /**
   * Writes a sanitized patch for `mode`, opening the switch a value depends on
   * (M0: a value behind a closed switch changes nothing on screen). A switch the
   * patch itself sets to the blocking value wins, and the gated value is left
   * out. Returns what was written and what the host kept.
   */
  const setParams = (mode, rawParams) => {
    const spec = MODE_PARAMS[mode];
    const state = store()?.getState?.();
    const setter = spec?.setter ? state?.[spec.setter] : null;
    if (typeof setter !== 'function') return { written: {}, notes: [] };
    const patch = sanitizeParams(mode, rawParams);
    const current = readTuning(mode);
    const notes = [];
    for (const [key, value] of Object.entries({ ...patch })) {
      if (isInertValue(spec.params[key], value)) continue;
      for (const gate of gatesFor(mode, key)) {
        const merged = { ...(current ?? {}), ...patch };
        if (gateSatisfied(merged, gate)) continue;
        if (Object.prototype.hasOwnProperty.call(patch, gate.key)) {
          delete patch[key];
          notes.push(`${key} 被 ${gate.key} 挡住，未写入`);
          break;
        }
        patch[gate.key] = gate.setTo ?? gate.mustBe;
        notes.push(`${key} 需要 ${gate.key}，已一并打开`);
      }
    }
    if (Object.keys(patch).length === 0) return { written: {}, notes };
    markOwnWrite();
    setter(patch);
    const stored = readTuning(mode) ?? {};
    const written = {};
    for (const key of Object.keys(patch)) written[key] = key in stored ? stored[key] : patch[key];
    return { written, notes };
  };

  /** Mode and every tuning we may touch, for "restore what I had". */
  const snapshot = () => {
    const state = store()?.getState?.();
    if (!state) return null;
    const tunings = {};
    for (const mode of Object.keys(MODE_PARAMS)) {
      const tuning = readTuning(mode);
      if (!tuning) continue;
      const keep = {};
      for (const key of Object.keys(MODE_PARAMS[mode].params)) if (key in tuning) keep[key] = tuning[key];
      tunings[mode] = keep;
    }
    const effects = {};
    for (const id of Object.keys(BEAT_EFFECTS)) {
      const stored = state.smartBeat?.effects?.[id];
      if (stored) effects[id] = { on: stored.on, strength: stored.strength };
    }
    return { mode: state.visualizerMode, tunings, effects };
  };

  const restore = (saved) => {
    if (!saved) return false;
    const state = store()?.getState?.();
    if (!state) return false;
    for (const [mode, tuning] of Object.entries(saved.tunings ?? {})) {
      const setter = state[MODE_PARAMS[mode]?.setter];
      if (typeof setter === 'function' && Object.keys(tuning).length > 0) {
        markOwnWrite();
        setter(tuning);
      }
    }
    if (typeof state.handleSetSmartBeat === 'function' && saved.effects) {
      // Effects the user never set go back to Folia's default.
      const touched = Object.fromEntries(Object.keys(BEAT_EFFECTS)
        .filter((id) => state.smartBeat?.effects?.[id] || saved.effects[id])
        .map((id) => [id, saved.effects[id] ?? EFFECT_DEFAULT]));
      if (Object.keys(touched).length > 0) {
        markOwnWrite();
        state.handleSetSmartBeat({ effects: touched });
      }
    }
    if (saved.mode) setMode(saved.mode);
    return true;
  };

  /** True when `mode` is on and every value in `params` and `effects` (if given) is already set. */
  const shows = (mode, params, effects) => {
    if (currentMode() !== mode) return false;
    const fx = sanitizeEffects(effects ?? {}, listBeatEffects(mode));
    const fxShown = Object.entries(fx).every(([id, value]) => {
      const now = effectState(id);
      return now.on === value.on && (value.strength === undefined || now.strength === value.strength);
    });
    if (!fxShown) return false;
    const clean = sanitizeParams(mode, params ?? {});
    if (Object.keys(clean).length === 0) return true;
    const tuning = readTuning(mode);
    return Boolean(tuning) && Object.entries(clean).every(([key, value]) => tuning[key] === value);
  };

  return {
    available,
    shows,
    listModes,
    currentMode,
    readTuning,
    setMode,
    setParams,
    beatMode,
    listBeatEffects,
    effectState,
    setEffects,
    snapshot,
    restore,
    isOwnWrite: () => performance.now() < ownWriteUntil,
  };
};
