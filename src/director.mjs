// The main flow: song changes -> memory or (brief -> local ranking -> decision)
// -> apply at a safe moment. One `generation` per displayed song; work that
// finishes after the song changed still lands in that song's memory but never
// touches the player.

import { buildSongContext, cleanLines, songKeyOf } from './song-context.mjs';
import { BRIEF_SYSTEM, buildBriefUser, DECIDE_SYSTEM, buildDecideUser, TUNE_SYSTEM, buildTuneUser } from './prompts.mjs';
import { rankModes } from './ranker.mjs';
import { sanitizeParams, sanitizeEffects } from './params.mjs';
import { PROFILES } from './profiles.mjs';
import { chatJson, testConnection } from './llm.mjs';
import { addFeedback, briefPrint, describeItem, emptyTaste, normalizeTaste, similarExamples, tasteBias, tasteSummary } from './taste.mjs';
import { baseUrlFor, isLocalUrl, thinkingMethodFor, THINKING_OFF } from './providers.mjs';

const LYRICS_WAIT_MS = 5000;
const USER_CHANGE_GRACE_MS = 2000; // host-side switches right after a song change are not the user
const SAFE_POLL_MS = 200;
const RECENT_MAX = 6;
const CACHED_PRICE_RATIO = 0.1;
const SETTLE_MS = 8000; // a manual mode counts as taste once the user stays on it this long

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Is `pos` (seconds) a moment where switching will not cut a sung line? M0: a
 * switch is a hard cut with a 90-270 ms hitch, so only before the first line or
 * inside a real gap between lines. */
export const isSafeMoment = (lines, pos) => {
  const timed = lines.filter((line) => Number.isFinite(line.startTime) && Number.isFinite(line.endTime));
  if (timed.length === 0) return true;
  if (pos < timed[0].startTime - 0.4) return true;
  for (let i = 0; i < timed.length; i += 1) {
    const line = timed[i];
    const next = timed[i + 1];
    if (pos >= line.startTime - 0.2 && pos < line.endTime + 0.2) return false;
    if (next && pos >= line.endTime && pos < next.startTime) {
      return next.startTime - line.endTime >= 1.5 && next.startTime - pos >= 0.8;
    }
  }
  return pos >= timed[timed.length - 1].endTime + 0.2;
};

export const createDirector = ({ folium, host, store, settings, onChange }) => {
  const log = folium.log;
  let generation = 0;
  let disposed = false;
  let current = null; // per displayed song
  let lastLyrics = { key: null, lines: [] };
  let lastTheme = { theme: null, at: 0 };
  let totals = { calls: 0, input: 0, output: 0, cached: 0, cost: 0 };
  let recentModes = [];
  let busy = null; // promise of the decision in flight for `current`
  let next = null; // the next song in the queue, prepared in the background
  let taste = emptyTaste(); // M5: the user's feedback on past picks

  const emit = () => {
    try {
      onChange?.();
    } catch (error) {
      log.warn('面板刷新出错', { message: String(error?.message ?? error) });
    }
  };
  const setPhase = (target, phase, message = '') => {
    if (!target) return;
    target.phase = phase;
    target.message = message;
    if (target === current || target === next) emit();
  };

  const costOf = (usage) => {
    const values = settings();
    const fresh = Math.max(0, usage.input - usage.cached);
    return (fresh * values.priceIn + usage.cached * values.priceIn * CACHED_PRICE_RATIO + usage.output * values.priceOut) / 1e6;
  };

  const account = async (song, usage) => {
    const cost = costOf(usage);
    for (const target of [song?.usage, totals].filter(Boolean)) {
      target.calls += 1;
      target.input += usage.input;
      target.output += usage.output;
      target.cached += usage.cached;
      target.cost += cost;
    }
    await store.set('stats', totals).catch(() => {});
  };

  /* What the user configured, resolved: base URL, key, reasoning-off fields and
   * the remembered field quirks of this endpoint + model. */
  const endpoint = async () => {
    const values = settings();
    const baseUrl = baseUrlFor(values);
    if (!baseUrl) throw Object.assign(new Error('还没有选择服务商（设置 → 模组 → AI 歌词动画导演 Plus）'), { code: 'no-config' });
    if (!values.model) throw Object.assign(new Error('还没有填写模型名（可以先点“测试连接”看看有哪些）'), { code: 'no-config' });
    const apiKey = (await folium.secrets.get('apiKey')) ?? '';
    if (!apiKey && !isLocalUrl(baseUrl)) throw Object.assign(new Error('还没有填写 API 密钥（设置 → 模组 → AI 歌词动画导演 Plus）'), { code: 'no-key' });
    const method = thinkingMethodFor({ method: values.thinking, provider: values.provider, url: baseUrl });
    const compatKey = `compat:${baseUrl}|${values.model}`;
    return {
      fetch: (url, init) => folium.net.fetch(url, init),
      baseUrl,
      apiKey,
      model: values.model,
      temperature: values.temperature,
      thinkingFields: THINKING_OFF[method] ?? {},
      compatKey,
      compat: (await store.get(compatKey)) ?? {},
    };
  };

  const rememberCompat = async (config, compat) => {
    if (JSON.stringify(compat) !== JSON.stringify(config.compat)) await store.set(config.compatKey, compat).catch(() => {});
  };

  const callModel = async (target, system, user) => {
    const config = await endpoint();
    const result = await chatJson({ ...config, system, user });
    await rememberCompat(config, result.compat);
    if (result.thought) target.thought = true;
    await account(target, result.usage);
    return result;
  };

  /* Lyrics for `song`: the `lyrics.loaded` event when it came (or comes within
   * LYRICS_WAIT_MS), else the lines on screen, else the online source through
   * the public `omni.getLyrics`. The event alone is not enough: when the mod
   * starts (or is set up) mid-song, that event has already gone by. */
  const lyricsFor = async (song, key, gen) => {
    const until = performance.now() + LYRICS_WAIT_MS;
    while (performance.now() < until) {
      if (gen !== generation || disposed) return null;
      if (lastLyrics.key === key) return lastLyrics.lines;
      await sleep(150);
    }
    if (lastLyrics.key === key) return lastLyrics.lines;
    if (songKeyOf(folium.playback.getState().song) === key) {
      const onScreen = folium.lyrics.getLines();
      if (onScreen.length > 0) return onScreen;
    }
    if (song?.ref && typeof folium.omni?.getLyrics === 'function') {
      try {
        const fetched = await folium.omni.getLyrics(song);
        if (fetched.lines.length > 0) return fetched.lines;
      } catch (error) {
        log.info('在线歌词也拿不到，按无歌词处理', { message: String(error?.code ?? error?.message ?? error) });
      }
    }
    return [];
  };

  // ------------------------------------------------------------ taste (M5)

  const nameOf = (mode) => PROFILES[mode]?.name ?? mode;

  const summaryText = () => {
    const { liked, disliked } = tasteSummary(taste);
    const parts = [];
    if (liked.length) parts.push(`常主动选 ${liked.map((item) => nameOf(item.mode)).join('、')}`);
    if (disliked.length) parts.push(`常否掉 ${disliked.map((item) => nameOf(item.mode)).join('、')}`);
    return parts.join('；');
  };

  /* Feedback on the song `target` shows. Only once it has a brief to compare
   * later songs with; nothing is kept when the user turned learning off. */
  const remember = async (target, kind, { from = null, to = null } = {}) => {
    if (!settings().learnTaste || !target?.brief || !target.key) return false;
    taste = addFeedback(taste, { k: target.key, t: target.song?.title ?? '', ...briefPrint(target.brief), kind, from, to });
    await store.set('taste', taste).catch(() => {});
    emit();
    return true;
  };

  /* The AI's own pick for the song on screen, if what shows came from it. */
  const aiPickOf = (target) => (target?.decision && !['user-memory'].includes(target.decidedBy) ? target.decision.mode : null);

  /* Manual switches settle before they count, so flicking through modes is not taste. */
  let settleTimer = null;
  const settleSwitch = async (target) => {
    clearTimeout(settleTimer);
    settleTimer = null;
    if (!target?.userMode || target.tasteRecorded === target.userMode) return;
    const from = aiPickOf(target);
    if (from === target.userMode) return; // looked around and came back
    target.tasteRecorded = target.userMode;
    await remember(target, 'switch', { from, to: target.userMode });
    if (target === current && host.currentMode() === target.userMode) await tuneManual(target, target.userMode);
  };

  /* The user picked `mode` by hand: the AI fills in its parameters (and beat
   * effects) for this song from the brief, one step-2-sized call; they go out
   * at a safe moment and are remembered with the user's choice. */
  const tuneManual = async (target, mode) => {
    const values = settings();
    if (!values.applyParams || !target?.brief || !PROFILES[mode]) return null;
    const effects = beatFxOn() ? host.listBeatEffects(mode) : [];
    if (Object.keys(PROFILES[mode].knobs ?? {}).length === 0 && effects.length === 0) return null;
    const gen = generation;
    setPhase(target, 'tuning', `正在按这首歌给 ${nameOf(mode)} 调参数`);
    try {
      const { json } = await callModel(target, TUNE_SYSTEM, buildTuneUser({
        brief: target.brief,
        title: target.song.title,
        artist: target.song.artist,
        mode,
        effects,
        userHint: values.userHint,
      }));
      if (target.userMode !== mode) return null; // switched again meanwhile
      const tuned = {
        mode,
        params: sanitizeParams(mode, json?.params),
        fx: beatFxOn() ? sanitizeEffects(json?.effects, effects) : {},
        reason: typeof json?.reason === 'string' ? json.reason : '',
      };
      target.tuned = tuned;
      if (values.remember) await store.saveUserChoice(target.key, mode, tuned).catch(() => {});
      if (gen === generation) await applyWhenSafe(gen, target, tuned, 'user', { manual: true });
      setPhase(target, 'user', `你换成了 ${nameOf(mode)}，AI 已按这首歌调好参数`);
      return tuned;
    } catch (error) {
      log.warn('手动换模式后调参数失败', { message: String(error?.message ?? error) });
      setPhase(target, 'user', `你换成了 ${nameOf(mode)}（没能调参数：${String(error?.message ?? error)}）`);
      return null;
    }
  };

  /* Choices made by hand before M5 (song memory with both a pick and a user mode). */
  const importPastChoices = async () => {
    for (const key of (await store.keys()).slice().reverse()) {
      const entry = await store.getSong(key);
      if (!entry?.u?.mode || !entry.b) continue;
      const from = entry.d?.mode && entry.d.mode !== entry.u.mode ? entry.d.mode : null;
      taste = addFeedback(taste, { k: key, t: '', ...briefPrint(entry.b), kind: 'switch', from, to: entry.u.mode, at: entry.u.at });
    }
    await store.set('taste', taste).catch(() => {});
  };

  /* The local ranking of a remembered song, for the panel: no AI call. */
  const rankForPanel = (brief) => {
    if (!brief) return null;
    const bias = settings().learnTaste && taste.items.length > 0 ? tasteBias(taste, briefPrint(brief)) : {};
    return rankModes(brief, host.listModes().map((mode) => mode.id), bias).ranked;
  };

  // ------------------------------------------------------------ applying

  const ensureSnapshot = async () => {
    const existing = await store.get('snapshot');
    const saved = host.snapshot();
    if (!existing) {
      if (saved) await store.set('snapshot', saved);
    } else if (!existing.effects && saved?.effects) {
      // Snapshots from before 0.5.0 never touched 智能动感; add it before the first effect write.
      await store.set('snapshot', { ...existing, effects: saved.effects });
    }
  };

  /* The AI sets beat effects only while 智能动感 plays and the user allows it. */
  const beatFxOn = () => settings().beatFx && ['on', 'cached'].includes(host.beatMode());

  const applyNow = async (decision) => {
    await ensureSnapshot();
    const switched = host.setMode(decision.mode);
    let written = {};
    let notes = [];
    if (settings().applyParams && decision.params && Object.keys(decision.params).length > 0) {
      ({ written, notes } = host.setParams(decision.mode, decision.params));
    }
    let fx = {};
    if (beatFxOn() && decision.fx && Object.keys(decision.fx).length > 0) fx = host.setEffects(decision.mode, decision.fx);
    recentModes = [decision.mode, ...recentModes.filter((mode) => mode !== decision.mode)].slice(0, RECENT_MAX);
    await store.set('recent', recentModes).catch(() => {});
    return { switched, written, notes, fx };
  };

  /* Waits for a moment that will not cut a sung line, then applies. Nothing to
   * wait for when the player already shows this choice, or while it is paused
   * (a switch on a still frame interrupts nothing). */
  const applyWhenSafe = async (gen, target, decision, phaseDone, { manual = false } = {}) => {
    const lines = cleanLines(target.lines ?? (lastLyrics.key === target.key ? lastLyrics.lines : folium.lyrics.getLines()));
    let waited = false;
    for (;;) {
      if (gen !== generation || disposed || (target.userOverrode && !manual)) return false;
      if (manual && host.currentMode() !== decision.mode) return false; // the user moved on
      const { position, song, state } = folium.playback.getState();
      if (!song) return false;
      if (host.shows(decision.mode, settings().applyParams ? decision.params : null, beatFxOn() ? decision.fx : null)) break;
      if (state !== 'playing' || isSafeMoment(lines, position)) break;
      if (!waited) {
        waited = true;
        setPhase(target, 'waiting-gap', '等歌词空隙再切换，避免唱到一半换画面');
      }
      await sleep(SAFE_POLL_MS);
    }
    const result = await applyNow(decision);
    target.applied = { mode: decision.mode, ...result };
    setPhase(target, phaseDone);
    return true;
  };

  // ------------------------------------------------------------ deciding

  /*
   * brief (cached per song) -> local ranking -> decision, for any song: the one
   * on screen or the next one in the queue. `job` collects phase, usage and what
   * was found, for the panel; nothing here touches the player.
   */
  const think = async (job, { song, key, lines, durationSeconds, theme, entry, force = false, rebrief = false, persist = true, recent = recentModes, avoid = null }) => {
    const values = settings();
    let brief = !rebrief ? entry.b : null;
    if (!brief) {
      setPhase(job, 'briefing', '正在理解这首歌（第 1 步）');
      const context = buildSongContext({ song, lines, durationSeconds, theme });
      const { json } = await callModel(job, BRIEF_SYSTEM, buildBriefUser(context));
      brief = store.compactBrief(json);
      job.instrumental = context.instrumental;
      // A brief written without lyrics is a guess; keep it for this play only.
      if (persist && !context.instrumental) await store.saveBrief(key, brief);
    }
    job.brief = brief;

    // The evaluation scores the general judgement, so it leaves the user's taste out.
    const useTaste = persist && values.learnTaste && taste.items.length > 0;
    const print = briefPrint(brief);
    const modes = host.listModes().filter((mode) => mode.id !== avoid);
    const { ranked, unprofiled, decisive } = rankModes(brief, modes.map((mode) => mode.id), useTaste ? tasteBias(taste, print) : {});
    job.ranked = ranked;
    const examples = useTaste ? similarExamples(taste, print, key) : [];
    job.tasteUsed = examples.length;
    const top = ranked.slice(0, 3);
    if (top.length === 0) throw new Error('没有可用的内置模式');

    let decision;
    if (values.economy && decisive && !force && !avoid) {
      decision = { mode: top[0].id, params: {}, reason: '本地打分明显领先，省去第 2 步', confidence: brief.confidence };
    } else {
      setPhase(job, 'deciding', '正在挑选模式（第 2 步）');
      const effects = beatFxOn()
        ? Object.fromEntries(top.map((item) => [item.id, host.listBeatEffects(item.id)]).filter(([, ids]) => ids.length > 0))
        : {};
      const others = [
        ...ranked.slice(3).map((item) => ({ id: item.id, label: PROFILES[item.id].name })),
        ...unprofiled.map((id) => ({ id, label: modes.find((mode) => mode.id === id)?.label ?? id })),
      ];
      const { json } = await callModel(job, DECIDE_SYSTEM, buildDecideUser({
        brief,
        title: song.title,
        artist: song.artist,
        candidates: top,
        others,
        previous: force ? null : (entry.d ?? null),
        recentModes: recent.filter((mode) => modes.some((item) => item.id === mode)),
        userHint: values.userHint,
        effects,
        taste: useTaste ? { summary: summaryText(), examples: examples.map((item) => describeItem(item, nameOf)) } : null,
        avoid: avoid ? `${avoid}（${nameOf(avoid)}）` : null,
      }));
      const validMode = modes.some((mode) => mode.id === json?.mode) ? json.mode : null;
      if (!validMode) log.warn(`AI 选了不存在的模式「${json?.mode}」，改用本地第一名`);
      const mode = validMode ?? top[0].id;
      decision = {
        mode,
        params: sanitizeParams(mode, json?.params),
        fx: beatFxOn() ? sanitizeEffects(json?.effects, host.listBeatEffects(mode)) : {},
        reason: typeof json?.reason === 'string' ? json.reason : '',
        confidence: Number(json?.confidence) || 0,
      };
    }
    decision.top = top.map((item) => ({ id: item.id, score: item.score }));
    job.decision = decision;
    // Instrumental tracks are not remembered: one guess should not stick forever.
    if (persist && values.remember && !job.instrumental) await store.saveDecision(key, decision);
    return decision;
  };

  const decide = async (gen, { force = false, rebrief = false, avoid = null } = {}) => {
    const target = current;
    const { song, key } = target;
    const entry = (await store.getSong(key)) ?? {};
    const lines = await lyricsFor(song, key, gen);
    if (lines === null) return;
    target.lines = lines;
    const decision = await think(target, {
      song,
      key,
      lines,
      durationSeconds: folium.playback.getState().duration,
      theme: lastTheme.at >= target.startedAt ? lastTheme.theme : null,
      entry,
      force,
      rebrief,
      avoid,
    });
    if (gen !== generation) return; // the answer went to memory; the player has moved on
    target.decidedBy = 'ai';
    await applyWhenSafe(gen, target, decision, 'applied');
    folium.ui.toast(`AI 导演：${PROFILES[decision.mode]?.name ?? decision.mode}${decision.reason ? `——${decision.reason}` : ''}`);
    prepareNext();
  };

  // ------------------------------------------------------------ the next song

  /* The song that plays after this one, as the queue and repeat mode say. */
  const nextSong = () => {
    const playback = folium.playback;
    if (typeof playback?.getQueue !== 'function') return null;
    const queue = playback.getQueue({ limit: 1 });
    if (queue.kind === 'stage' || queue.currentIndex < 0 || queue.length === 0) return null;
    const loop = playback.getLoopMode?.() ?? 'off';
    if (loop === 'one') return null;
    let index = queue.currentIndex + 1;
    if (index >= queue.length) {
      if (loop !== 'all') return null;
      index = 0;
    }
    return playback.getQueue({ offset: index, limit: 1 }).items.find((item) => item.index === index)?.song ?? null;
  };

  let prepareTimer = null;
  /* Debounced: queue edits and song changes arrive in bursts. */
  const prepareNext = (delayMs = 1500) => {
    clearTimeout(prepareTimer);
    prepareTimer = setTimeout(() => { prepare().catch(() => {}); }, delayMs);
  };

  /*
   * Decides the next song while this one plays and writes it to memory only, so
   * the switch happens at the very start of that song (M1 field test: without
   * it, a new song showed the previous song's mode for 10-20 s).
   */
  const prepare = async () => {
    if (disposed) return;
    const values = settings();
    if (!values.prefetch || !values.autoDecide || !values.remember) {
      next = null;
      emit();
      return;
    }
    // Only once the song on screen is settled: never two jobs for the player at once.
    if (!current || busy || !['applied', 'remembered', 'user-memory', 'user', 'idle'].includes(current.phase)) return;
    const song = nextSong();
    const key = songKeyOf(song);
    if (!song || key === current.key) {
      next = null;
      emit();
      return;
    }
    if (next?.key === key && (next.promise || ['ready', 'remembered'].includes(next.phase))) return;
    const job = {
      song,
      key,
      phase: 'idle',
      message: '',
      usage: { calls: 0, input: 0, output: 0, cached: 0, cost: 0 },
      promise: null,
    };
    next = job;
    const entry = (await store.getSong(key)) ?? {};
    if (entry.d || entry.u) {
      job.decision = entry.u ? { mode: entry.u.mode, params: entry.u.params ?? {}, fx: entry.u.fx ?? {}, reason: '你之前手动选的模式' } : entry.d;
      setPhase(job, 'remembered', '已经记住了，切过去会直接套用');
      return;
    }
    job.promise = (async () => {
      setPhase(job, 'fetching', '正在获取歌词');
      let lyrics;
      try {
        lyrics = await folium.omni.getLyrics(song);
      } catch (error) {
        setPhase(job, 'skipped', error?.code === 'unsupported' ? '本地歌曲拿不到歌词，播放时再决定' : '拿不到歌词，播放时再决定');
        return;
      }
      if (lyrics.isPureMusic || lyrics.lines.length === 0) {
        setPhase(job, 'skipped', '纯音乐或没有歌词，播放时再决定');
        return;
      }
      const lines = lyrics.lines;
      await think(job, {
        song,
        key,
        lines,
        durationSeconds: lines[lines.length - 1]?.endTime ?? 0,
        theme: null,
        entry,
      });
      setPhase(job, 'ready', '已准备好，切过去会直接套用');
    })()
      .catch((error) => {
        log.warn('提前准备下一首失败', { message: String(error?.message ?? error) });
        setPhase(job, 'error', String(error?.message ?? error));
      })
      .finally(() => {
        job.promise = null;
        emit();
      });
    await job.promise;
  };

  const run = (gen, options) => {
    busy = decide(gen, options)
      .catch((error) => {
        log.warn('决策失败', { message: String(error?.message ?? error) });
        if (gen !== generation) return;
        setPhase(current, ['no-key', 'no-config'].includes(error?.code) ? error.code : 'error', String(error?.message ?? error));
      })
      .finally(() => { busy = null; });
    return busy;
  };

  // ------------------------------------------------------------ events

  const onSong = async (song) => {
    if (settleTimer) settleSwitch(current).catch(() => {}); // the song ends before the switch settled: it still counts
    generation += 1;
    const gen = generation;
    const key = songKeyOf(song);
    current = song ? {
      song,
      key,
      startedAt: performance.now(),
      phase: 'idle',
      message: '',
      usage: { calls: 0, input: 0, output: 0, cached: 0, cost: 0 },
      userOverrode: false,
    } : null;
    if (!current) return emit();
    if (!host.available()) return setPhase(current, 'error', '宿主内部接口不可用：确认模组 folia 版本范围与当前 Folia 匹配');

    // The next-song job may be working on this very song: wait for it rather than pay twice.
    if (next?.key === key && next.promise) {
      setPhase(current, 'waiting-prepare', '这首歌正在提前准备中，马上好');
      await next.promise;
      if (gen !== generation) return;
    }
    const entry = await store.getSong(key);
    if (gen !== generation) return;
    current.brief = entry?.b ?? null;
    current.ranked = rankForPanel(current.brief);
    if (entry?.u && settings().remember) {
      current.decision = { mode: entry.u.mode, params: entry.u.params ?? {}, fx: entry.u.fx ?? {}, reason: '你之前为这首歌手动选的模式', confidence: 1 };
      current.decidedBy = 'user-memory';
      await applyWhenSafe(gen, current, current.decision, 'user-memory');
      prepareNext();
      return;
    }
    if (entry?.d && settings().remember) {
      current.decision = entry.d;
      current.decidedBy = 'memory';
      current.prepared = next?.key === key && next.phase === 'ready';
      await applyWhenSafe(gen, current, entry.d, 'remembered');
      prepareNext();
      return;
    }
    if (!settings().autoDecide) return setPhase(current, 'idle', '自动决策已关闭');
    setPhase(current, 'waiting-lyrics', '等歌词加载');
    run(gen, {});
  };

  const onModeChanged = (mode) => {
    if (!current || host.isOwnWrite()) return;
    if (performance.now() - current.startedAt < USER_CHANGE_GRACE_MS) return;
    current.userOverrode = true;
    current.userMode = mode;
    if (settings().remember) store.saveUserChoice(current.key, mode).catch(() => {});
    setPhase(current, 'user', `你手动换成了 ${PROFILES[mode]?.name ?? mode}，本首不再自动切换`);
    prepareNext();
    const target = current;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { settleSwitch(target).catch(() => {}); }, SETTLE_MS);
  };

  return {
    /** What the developer-only evaluator (src/evaluate.mjs) runs on. */
    forEvaluation: () => ({ think, endpoint, emit, isDisposed: () => disposed }),
    start: async () => {
      totals = { ...totals, ...((await store.get('stats')) ?? {}) };
      recentModes = (await store.get('recent')) ?? [];
      const storedTaste = await store.get('taste');
      taste = normalizeTaste(storedTaste);
      if (storedTaste === undefined || storedTaste === null) await importPastChoices().catch(() => {});
      const lines = folium.lyrics.getLines();
      const { song } = folium.playback.getState();
      if (song && lines.length > 0) lastLyrics = { key: songKeyOf(song), lines };
      await onSong(song);
    },
    onSongChanged: (song) => onSong(song).catch((error) => log.warn('换歌处理出错', { message: String(error?.message ?? error) })),
    onLyricsLoaded: (song, lines) => { lastLyrics = { key: songKeyOf(song), lines: lines ?? [] }; },
    onThemeChanged: (theme) => { lastTheme = { theme, at: performance.now() }; },
    onModeChanged,
    /** The queue or repeat mode changed: the next song may be another one now. */
    onQueueChanged: () => prepareNext(),
    /** A key or a setting was just saved: pick up where missing setup stopped this song. */
    onSetupChanged: () => {
      if (['no-key', 'no-config'].includes(current?.phase) && !busy) run(generation, {});
    },
    /** "测试连接": model list + one tiny call, with the settings as they are now. */
    testConnection: async () => {
      const config = await endpoint().catch((error) => {
        if (error?.code === 'no-config' && !settings().model && baseUrlFor(settings())) return null;
        throw error;
      });
      const values = settings();
      const report = await testConnection(config ?? {
        fetch: (url, init) => folium.net.fetch(url, init),
        baseUrl: baseUrlFor(values),
        apiKey: (await folium.secrets.get('apiKey')) ?? '',
        model: '',
      });
      if (config && report.chat) await rememberCompat(config, report.chat.compat);
      return report;
    },
    /** Commands. `force` ignores the remembered pick; `rebrief` redoes step 1 too. */
    decideNow: async ({ force = false, rebrief = false, avoid = null } = {}) => {
      if (!current) return '现在没有在播放的歌';
      if (busy) return '正在决策中，请稍候';
      // "Pick again" on the AI's own pick, without saying why: a weak no.
      if (force && !rebrief && !avoid && aiPickOf(current)) await remember(current, 'redo', { from: aiPickOf(current) });
      if (force) {
        await store.forgetDecision(current.key);
        current.userOverrode = false;
      } else {
        const entry = await store.getSong(current.key);
        if (entry?.d) {
          await applyWhenSafe(generation, current, entry.d, 'remembered');
          return '已套用记住的选择';
        }
      }
      await run(generation, { force, rebrief, avoid });
      return current.phase === 'applied' ? '已完成' : current.message || current.phase;
    },
    /** 👍 / 👎 on what shows now. 👎 also picks another mode for this song right away. */
    feedback: async (verdict) => {
      if (!current?.decision) return '这首歌还没有选择';
      if (busy) return '正在决策中，请稍候';
      const mode = current.userMode ?? current.decision.mode;
      if (verdict === 'up') {
        current.liked = mode;
        return (await remember(current, 'up', { to: mode })) ? `已记下：${nameOf(mode)} 适合这类歌` : '没有记下（口味学习已关闭，或这首歌还没有简报）';
      }
      await remember(current, 'down', { from: mode });
      await store.forgetDecision(current.key);
      current.userOverrode = false;
      current.userMode = null;
      await run(generation, { force: true, avoid: mode });
      return current.phase === 'applied' ? `已换成 ${nameOf(current.decision.mode)}` : current.message || current.phase;
    },
    /** The user picked `mode` in the panel: it shows at once, becomes this song's choice and a taste record. */
    chooseMode: async (mode) => {
      if (!current) return '现在没有在播放的歌';
      if (busy) return '正在决策中，请稍候';
      if (!host.listModes().some((item) => item.id === mode)) return `现在没有这个模式：${mode}`;
      const target = current;
      const from = aiPickOf(target);
      await ensureSnapshot();
      host.setMode(mode); // marked as our own write, so onModeChanged does not count it twice
      clearTimeout(settleTimer);
      settleTimer = null;
      target.userOverrode = true;
      target.userMode = mode;
      target.tasteRecorded = mode;
      if (settings().remember) await store.saveUserChoice(target.key, mode).catch(() => {});
      if (from !== mode) await remember(target, 'switch', { from, to: mode });
      setPhase(target, 'user', `你换成了 ${nameOf(mode)}，本首不再自动切换`);
      prepareNext();
      busy = tuneManual(target, mode).finally(() => { busy = null; });
      const tuned = await busy;
      const notes = [];
      if (tuned) notes.push('AI 已按这首歌调好参数');
      if (from && from !== mode && settings().learnTaste) notes.push('已记进口味');
      return `已换成 ${nameOf(mode)}${notes.length ? `，${notes.join('，')}` : ''}`;
    },
    getTaste: () => ({ items: taste.items, summary: summaryText() }),
    clearTaste: async () => {
      taste = emptyTaste();
      await store.set('taste', taste);
      emit();
      return '已清除口味记录';
    },
    restore: async () => {
      const saved = await store.get('snapshot');
      if (!saved) return '还没有改动过你的设置';
      host.restore(saved);
      await store.set('snapshot', null);
      if (current) current.userOverrode = true; // do not switch again for this song
      return '已恢复原来的模式与参数';
    },
    getState: () => ({ current, next, totals, recentModes, beat: host.beatMode() }),
    dispose: () => { disposed = true; generation += 1; clearTimeout(prepareTimer); clearTimeout(settleTimer); },
  };
};
