// Per-song memory in the mod's data file (1 MB cap). Brief and decision are
// kept apart so a decision can be redone without paying for the brief again.

const SONG_PREFIX = 'song:';
const INDEX_KEY = 'index';
const MAX_SONGS = 600;
const REASON_MAX = 60;

/* The brief as stored: only what the prompts and the panel read back. */
const compactBrief = (brief) => ({
  summary: String(brief?.summary ?? '').slice(0, 80),
  mood: (brief?.mood ?? []).slice(0, 4),
  tags: (brief?.tags ?? []).slice(0, 6),
  arc: String(brief?.arc ?? '').slice(0, 60),
  contrast: String(brief?.contrast ?? '').slice(0, 60),
  imagery: (brief?.imagery ?? []).slice(0, 4),
  energy: brief?.energy ?? null,
  visual: brief?.visual ?? null,
  known: Boolean(brief?.known),
  confidence: Number(brief?.confidence) || 0,
});

export const createStore = (storage, log) => {
  let index = null; // song keys, most recent first

  const loadIndex = async () => {
    if (index) return index;
    const stored = await storage.get(INDEX_KEY);
    index = Array.isArray(stored) ? stored : [];
    return index;
  };

  /* A write past the 1 MB cap fails; drop the oldest third once and retry. */
  const safeSet = async (key, value) => {
    try {
      await storage.set(key, value);
    } catch (error) {
      log.warn('写入数据文件失败，清理最旧的三分之一记忆后重试', { message: String(error?.message ?? error) });
      const keys = await loadIndex();
      const drop = keys.splice(Math.floor((keys.length * 2) / 3));
      await Promise.all(drop.map((songKey) => storage.delete(`${SONG_PREFIX}${songKey}`)));
      await storage.set(INDEX_KEY, keys);
      await storage.set(key, value);
    }
  };

  const touch = async (songKey) => {
    const keys = await loadIndex();
    const at = keys.indexOf(songKey);
    if (at !== -1) keys.splice(at, 1);
    keys.unshift(songKey);
    const evicted = keys.splice(MAX_SONGS);
    await Promise.all(evicted.map((key) => storage.delete(`${SONG_PREFIX}${key}`)));
    await safeSet(INDEX_KEY, keys);
  };

  const getSong = async (songKey) => (songKey ? (await storage.get(`${SONG_PREFIX}${songKey}`)) ?? null : null);

  const putSong = async (songKey, patch) => {
    const entry = { ...((await getSong(songKey)) ?? {}), ...patch };
    await safeSet(`${SONG_PREFIX}${songKey}`, entry);
    await touch(songKey);
    return entry;
  };

  return {
    getSong,
    saveBrief: (songKey, brief) => putSong(songKey, { b: compactBrief(brief), bAt: Date.now() }),
    saveDecision: (songKey, decision) => putSong(songKey, {
      d: {
        mode: decision.mode,
        params: decision.params ?? {},
        ...(decision.fx && Object.keys(decision.fx).length > 0 ? { fx: decision.fx } : {}),
        reason: String(decision.reason ?? '').slice(0, REASON_MAX),
        confidence: Number(decision.confidence) || 0,
        top: decision.top ?? [],
        at: Date.now(),
      },
    }),
    /* The user picked another mode while this song played: remembered as the
     * song's choice from now on, and as feedback for M5. */
    saveUserChoice: (songKey, mode, { params, fx } = {}) => putSong(songKey, {
      u: {
        mode,
        ...(params && Object.keys(params).length > 0 ? { params } : {}),
        ...(fx && Object.keys(fx).length > 0 ? { fx } : {}),
        at: Date.now(),
      },
    }),
    forgetDecision: async (songKey) => {
      const entry = await getSong(songKey);
      if (!entry) return;
      delete entry.d;
      delete entry.u;
      await safeSet(`${SONG_PREFIX}${songKey}`, entry);
    },
    count: async () => (await loadIndex()).length,
    /** Song keys, most recent first. */
    keys: async () => [...(await loadIndex())],
    get: (key) => storage.get(key),
    set: (key, value) => safeSet(key, value),
    compactBrief,
  };
};
