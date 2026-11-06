// The only file that touches the host's lyric display: the live mode list, and
// reading and writing the lyric animation mode, its tuning and its 智能动感 beat
// effects, all through Folium 1.8's public `folium.visualizer` (no internals).
// Writes need `visualizer.mode` / `.tuning` / `.beatEffects`; the host limits
// each kind to one counted write a second and 20 a minute, so the director
// writes once per song and `restore` waits between modes.

import { MODE_PARAMS, BEAT_EFFECTS, EFFECT_DEFAULT, gatesFor, gateSatisfied, isInertValue, sanitizeParams, sanitizeEffects } from './params.mjs';

const WRITE_GAP_MS = 1100;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const refusal = (result) => (result.reason === 'rate-limited' ? '写得太频繁，被 Folia 限流' : `Folia 没有接受（${result.reason}）`);

export const createHostAdapter = (folium) => {
  /* Older hosts have no `folium.visualizer`; the export window throws on every call. */
  const vis = () => ((folium.host?.folium?.minor ?? 0) >= 8 ? folium.visualizer ?? null : null);
  const read = (fn, fallback) => {
    try {
      const v = vis();
      return v ? fn(v) : fallback;
    } catch {
      return fallback;
    }
  };

  const available = () => Boolean(vis());
  const modeInfos = () => read((v) => v.listModes(), []);
  const infoOf = (mode) => modeInfos().find((info) => info.id === mode) ?? null;

  /** Builtin modes plus any a mod contributed, in the order of the mode picker. */
  const listModes = () => modeInfos().map((info) => ({ id: info.id, label: info.label || info.id }));
  const currentMode = () => read((v) => v.getMode(), null);
  const readTuning = (mode) => read((v) => v.getTuning(mode), null);

  const setMode = (mode) => {
    const v = vis();
    if (!v) throw new Error('需要 Folia 的 Folium 1.8（folium.visualizer）');
    if (v.getMode() === mode) return false;
    const result = v.setMode(mode);
    if (!result.ok) throw new Error(`切换模式失败：${refusal(result)}`);
    return true;
  };

  /* Only keys the host lets mods write, in the type it expects: a wrong type or
   * an unlisted choice makes it refuse the whole write. */
  const fitToHost = (mode, patch) => {
    const keys = infoOf(mode)?.tuning ?? {};
    return Object.fromEntries(Object.entries(patch).filter(([key, value]) => {
      const info = keys[key];
      if (info?.type === 'number') return typeof value === 'number' && Number.isFinite(value);
      if (info?.type === 'boolean') return typeof value === 'boolean';
      if (info?.type === 'choice') return info.options.includes(value);
      return false;
    }));
  };

  /**
   * Writes a sanitized patch for `mode`, opening the switch a value depends on
   * (M0: a value behind a closed switch changes nothing on screen). A switch the
   * patch itself sets to the blocking value wins, and the gated value is left
   * out. Returns what the host kept (clamped, on its steps) and notes.
   */
  const setParams = (mode, rawParams) => {
    const v = vis();
    const spec = MODE_PARAMS[mode];
    if (!v || !spec) return { written: {}, notes: [] };
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
    const fitted = fitToHost(mode, patch);
    for (const key of Object.keys(patch)) if (!(key in fitted)) notes.push(`${key} 不在 Folia 开放给模组的参数里，跳过`);
    if (Object.keys(fitted).length === 0) return { written: {}, notes };
    const result = v.setTuning(mode, fitted);
    if (!result.ok) return { written: {}, notes: [...notes, `参数没写进去：${refusal(result)}`] };
    const written = {};
    for (const key of Object.keys(fitted)) if (key in result.tuning) written[key] = result.tuning[key];
    return { written, notes };
  };

  // ------------------------------------------------------------ 智能动感

  const beatState = () => read((v) => v.getBeatEffects(), null);

  /** 'off' | 'cached' | 'on', or null when this Folia has no public 智能动感. */
  const beatMode = () => beatState()?.smartBeat ?? null;

  /** Ids of the beat effects `mode` offers and we can describe. */
  const listBeatEffects = (mode) => (infoOf(mode)?.beatEffects ?? []).map((effect) => effect.id).filter((id) => BEAT_EFFECTS[id]);

  const effectState = (id) => {
    const effect = beatState()?.effects.find((item) => item.id === id);
    return { on: effect?.on ?? EFFECT_DEFAULT.on, strength: effect?.strength ?? EFFECT_DEFAULT.strength };
  };

  /* An effect toggled mid-song rebuilds the scene (凝彩 clears its shots), so
   * this goes out with the mode switch, at the same safe moment. */
  const setEffects = (mode, rawEffects) => {
    const v = vis();
    if (!v) return {};
    const patch = {};
    for (const [id, value] of Object.entries(sanitizeEffects(rawEffects, listBeatEffects(mode)))) {
      const now = effectState(id);
      const next = { on: value.on, strength: value.strength ?? now.strength };
      if (next.on !== now.on || next.strength !== now.strength) patch[id] = next;
    }
    if (Object.keys(patch).length === 0) return {};
    const result = v.setBeatEffects(patch);
    if (!result.ok) return {};
    return Object.fromEntries(result.state.effects.filter((effect) => patch[effect.id]).map((effect) => [effect.id, { on: effect.on, strength: effect.strength }]));
  };

  // ------------------------------------------------------------ restore

  /** Mode, every tuning we may touch and the beat effects, for "restore what I had". */
  const snapshot = () => {
    if (!vis()) return null;
    const tunings = {};
    for (const info of modeInfos()) {
      if (MODE_PARAMS[info.id] && Object.keys(info.tuning ?? {}).length > 0) tunings[info.id] = readTuning(info.id);
    }
    const effects = Object.fromEntries((beatState()?.effects ?? [])
      .filter((effect) => BEAT_EFFECTS[effect.id])
      .map((effect) => [effect.id, { on: effect.on, strength: effect.strength }]));
    return { mode: currentMode(), tunings, effects };
  };

  /* One counted write a second per kind: modes are put back one at a time. */
  const restore = async (saved) => {
    const v = vis();
    if (!saved || !v) return false;
    for (const [mode, tuning] of Object.entries(saved.tunings ?? {})) {
      const now = readTuning(mode);
      if (!now) continue;
      const patch = fitToHost(mode, Object.fromEntries(Object.entries(tuning ?? {}).filter(([key, value]) => now[key] !== value)));
      if (Object.keys(patch).length === 0) continue;
      v.setTuning(mode, patch);
      await sleep(WRITE_GAP_MS);
    }
    const effects = Object.fromEntries(Object.entries(saved.effects ?? {}).filter(([id, value]) => {
      const now = effectState(id);
      return now.on !== value.on || now.strength !== value.strength;
    }));
    if (Object.keys(effects).length > 0) v.setBeatEffects(effects);
    if (saved.mode && infoOf(saved.mode)) setMode(saved.mode);
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
    /** A `visualizer.*Changed` origin that is this mod's own write. */
    isOwnWrite: (origin) => origin?.kind === 'mod' && origin.modId === folium.modId,
  };
};
