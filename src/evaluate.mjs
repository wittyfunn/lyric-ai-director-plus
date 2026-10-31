// Developer tool: runs the real pipeline over EVAL_SET and scores it against the
// people's labels (M2). Only `node dev/build.mjs --dev` bundles this module; the
// release build swaps it for `createEvaluator = null`, so users get neither the
// song list nor the code.

import { EVAL_SET, EVAL_SET_VERSION } from './eval-set.mjs';
import { PROFILE_VERSION } from './profiles.mjs';
import { baseUrlFor } from './providers.mjs';

const EVAL_BRIEF_CACHE = 1; // bump when the brief prompt changes

/** `think`, `endpoint`, `emit` and `isDisposed` come from the director (director.forEvaluation()). */
export const createEvaluator = ({ folium, store, settings, think, endpoint, emit, isDisposed }) => {
  /*
   * Runs the real pipeline over EVAL_SET and scores it against the people's
   * labels. Nothing touches the player or the per-song memory, and "recently
   * used" is left out so the order of the set cannot sway the picks. Briefs are
   * cached under `evalBriefs`, so a rerun after changing profiles or the ranking
   * pays for step 2 only; `rebrief` pays for both again.
   */
  let evalRun = null;

  const normalize = (text) => String(text ?? '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  /* Search hits that plausibly are this song, best first: exact title, then the
   * listed artist first in the credits (the M2 baseline matched a remix of
   * "Made in China" by another artist and got no lyrics). */
  const findEvalSongs = async (item) => {
    const page = await folium.omni.searchSongs(`${item.title} ${item.artist}`, { limit: 8 });
    const title = normalize(item.title);
    const artists = item.artist.split(/\s+/).map(normalize).filter(Boolean);
    const score = (song) => {
      const found = normalize(song.title);
      const credits = normalize(song.artist);
      const titleScore = found === title ? 2 : (found.includes(title) || title.includes(found) ? 1 : 0);
      const artistScore = artists.some((artist) => credits.includes(artist)) ? 1 : 0;
      return titleScore + artistScore + (credits.startsWith(artists[0] ?? '\u0000') ? 0.5 : 0);
    };
    return [...page.items].filter((song) => score(song) >= 2).sort((a, b) => score(b) - score(a)).slice(0, 3);
  };

  const summarize = (run) => {
    const scored = run.rows.filter((row) => !row.error);
    const rateOf = (rows, key) => (rows.length ? Math.round((rows.filter((row) => row[key]).length / rows.length) * 100) : 0);
    const used = {};
    for (const row of scored) used[row.decision.mode] = (used[row.decision.mode] ?? 0) + 1;
    const holdout = scored.filter((row) => row.holdout);
    const tuned = scored.filter((row) => !row.holdout);
    return {
      songs: run.rows.length,
      scored: scored.length,
      failed: run.rows.length - scored.length,
      aiHit: rateOf(scored, 'hit'),
      localTop1: rateOf(scored, 'top1'),
      localTop3: rateOf(scored, 'top3'),
      tuned: { songs: tuned.length, aiHit: rateOf(tuned, 'hit'), localTop1: rateOf(tuned, 'top1'), localTop3: rateOf(tuned, 'top3') },
      holdout: { songs: holdout.length, aiHit: rateOf(holdout, 'hit'), localTop1: rateOf(holdout, 'top1'), localTop3: rateOf(holdout, 'top3') },
      distinctModes: Object.keys(used).length,
      modeUse: used,
      usage: run.usage,
    };
  };

  const evaluate = async ({ rebrief = false } = {}) => {
    if (evalRun?.running) return '评测正在进行中';
    if (typeof folium.omni?.searchSongs !== 'function') return '这个版本的 Folia 没有在线音源接口，无法评测';
    await endpoint(); // fail early on missing setup
    const stored = (await store.get('evalBriefs')) ?? {};
    // Briefs depend on the brief prompt, not on the labels: relabelling keeps them.
    const cache = stored.version === EVAL_BRIEF_CACHE ? stored.briefs ?? {} : {};
    // A brief written without lyrics may only mean the lyrics were not found: try again.
    for (const row of (await store.get('evalLast'))?.rows ?? []) {
      if (row.instrumental) delete cache[`${row.title}|${row.artist}`];
    }
    const values = settings();
    const run = {
      running: true,
      done: 0,
      total: EVAL_SET.length,
      rows: [],
      startedAt: Date.now(),
      model: values.model,
      endpoint: baseUrlFor(values).replace(/^https?:\/\//, '').split('/')[0],
      usage: { calls: 0, input: 0, output: 0, cached: 0, cost: 0 },
    };
    evalRun = run;
    emit();
    for (const item of EVAL_SET) {
      if (isDisposed()) break;
      const id = `${item.title}|${item.artist}`;
      const row = { title: item.title, artist: item.artist, accept: item.accept, note: item.note, holdout: Boolean(item.holdout) };
      try {
        const candidates = await findEvalSongs(item);
        if (candidates.length === 0) throw new Error('在线音源里找不到这首歌');
        const brief = rebrief ? null : cache[id] ?? null;
        // The first candidate that has lyrics (or says it is instrumental); else the best one.
        let song = candidates[0];
        let lines = [];
        if (!brief) {
          for (const candidate of candidates) {
            const lyrics = await folium.omni.getLyrics(candidate).catch(() => ({ lines: [], isPureMusic: false }));
            if (lyrics.lines.length > 0 || lyrics.isPureMusic) {
              song = candidate;
              lines = lyrics.lines;
              break;
            }
          }
        }
        row.found = `${song.title} - ${song.artist}`;
        const job = { phase: 'idle', message: '', usage: run.usage };
        const decision = await think(job, {
          song,
          key: `eval:${id}`,
          lines,
          durationSeconds: lines[lines.length - 1]?.endTime ?? 0,
          theme: null,
          entry: { b: brief },
          persist: false,
          recent: [],
        });
        row.brief = job.brief;
        row.instrumental = Boolean(job.instrumental);
        if (!job.instrumental) cache[id] = job.brief; // cached briefs all came from lyrics
        row.top = job.ranked.slice(0, 5).map((item) => ({ id: item.id, score: item.score }));
        row.decision = { mode: decision.mode, reason: decision.reason, confidence: decision.confidence, params: decision.params, fx: decision.fx };
        row.hit = item.accept.includes(decision.mode);
        row.top1 = item.accept.includes(job.ranked[0]?.id);
        row.top3 = job.ranked.slice(0, 3).some((candidate) => item.accept.includes(candidate.id));
        // No lyrics for a song with lyrics means the search matched a cover or a
        // backing track: a data problem, not a wrong pick, so it is not scored.
        if (row.instrumental && !item.instrumental) row.error = `没拿到歌词，可能匹配到了翻唱或伴奏（${row.found}）`;
      } catch (error) {
        row.error = String(error?.message ?? error);
      }
      run.rows.push(row);
      run.done += 1;
      emit();
    }
    await store.set('evalBriefs', { version: EVAL_BRIEF_CACHE, briefs: cache });
    run.running = false;
    run.summary = summarize(run);
    await store.set('evalLast', evalReport(run));
    emit();
    const s = run.summary;
    return `评测完成：AI 命中 ${s.aiHit}%，本地第一名 ${s.localTop1}%，本地前三 ${s.localTop3}%（${s.scored}/${s.songs} 首有效）`;
  };

  /** The exportable form: everything needed to rescore the ranking offline. */
  const evalReport = (run) => ({
    setVersion: EVAL_SET_VERSION,
    profileVersion: PROFILE_VERSION,
    at: new Date(run.startedAt).toISOString(),
    model: run.model,
    endpoint: run.endpoint,
    summary: run.summary ?? summarize(run),
    rows: run.rows,
  });

  return {
    evaluate,
    getRun: () => evalRun,
    getReport: async () => (evalRun && !evalRun.running ? evalReport(evalRun) : (await store.get('evalLast')) ?? null),
  };
};
