// M5 taste learning: what the user told us about the AI's picks, and how it
// feeds back into the next ones. Pure functions over a small stored list.
//
// Signals, strongest first:
//   switch  the user changed the mode by hand (and kept it): `from` was wrong, `to` right
//   down    👎 on the pick: `from` was wrong
//   up      👍 on the pick: `to` was right
//   redo    "重新挑选" without saying why: a weak no to `from`
//
// Each item keeps the song's brief in short, so a later song can be compared
// with it: feedback on similar songs counts fully, on unlike songs only a little.

export const TASTE_VERSION = 1;
export const TASTE_MAX = 30;

const WEIGHTS = { switch: 1, down: 1, up: 0.5, redo: 0.4 };
const BIAS_PER_POINT = 0.05; // ranking points per unit of feedback on a very similar song
const BIAS_FLOOR = 0.3; // share of that kept for unlike songs
const BIAS_MIN = -0.15;
const BIAS_MAX = 0.12;
const SUMMARY_MIN = 1.5; // a single change is a song's taste, not the user's
const EXAMPLE_MIN_SIM = 0.5;

export const emptyTaste = () => ({ v: TASTE_VERSION, items: [] });

export const normalizeTaste = (stored) => (
  stored && stored.v === TASTE_VERSION && Array.isArray(stored.items) ? stored : emptyTaste()
);

const AXES = ['motion', 'density', 'warmth', 'space', 'story'];
const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

/** What of a brief a taste item keeps. */
export const briefPrint = (brief) => ({
  s: String(brief?.summary ?? '').slice(0, 24),
  g: (brief?.tags ?? []).slice(0, 4),
  v: AXES.map((axis) => Math.round(clamp01(brief?.visual?.[axis] ?? 0.5) * 100) / 100),
  e: Math.round(clamp01(brief?.energy?.overall ?? 0.5) * 100) / 100,
});

/** 0..1: how alike two songs are, by the visual axes, energy and shared tags. */
export const similarity = (a, b) => {
  if (!a?.v || !b?.v) return 0;
  let sum = 0;
  for (let i = 0; i < AXES.length; i += 1) sum += (a.v[i] - b.v[i]) ** 2;
  sum += (a.e - b.e) ** 2;
  const distance = Math.sqrt(sum / (AXES.length + 1)); // 0..1
  const tagsA = new Set(a.g ?? []);
  const tagsB = new Set(b.g ?? []);
  const union = new Set([...tagsA, ...tagsB]).size;
  const shared = [...tagsA].filter((tag) => tagsB.has(tag)).length;
  const jaccard = union > 0 ? shared / union : 0;
  return Math.max(0, Math.min(1, (1 - distance * 2.5) * 0.7 + jaccard * 0.3));
};

/** A new list with `item` added: one verdict per song (the latest), the newest TASTE_MAX kept. */
export const addFeedback = (taste, item) => {
  const items = normalizeTaste(taste).items.filter((old) => old.k !== item.k);
  items.push({ ...item, at: item.at ?? Date.now() });
  return { v: TASTE_VERSION, items: items.slice(-TASTE_MAX) };
};

/* +weight to the mode the user wanted, -weight to the one they did not. */
const credits = (item) => {
  const weight = WEIGHTS[item.kind] ?? 0;
  const out = [];
  if (item.to) out.push([item.to, weight]);
  if (item.from && item.from !== item.to) out.push([item.from, -weight]);
  return out;
};

/** mode -> net feedback over every item, e.g. { partita: 2, tilt: -1.4 }. */
export const modeScores = (taste) => {
  const scores = {};
  for (const item of normalizeTaste(taste).items) {
    for (const [mode, value] of credits(item)) scores[mode] = (scores[mode] ?? 0) + value;
  }
  return scores;
};

/** mode -> ranking adjustment for the song described by `print`. */
export const tasteBias = (taste, print) => {
  const bias = {};
  for (const item of normalizeTaste(taste).items) {
    const reach = BIAS_FLOOR + (1 - BIAS_FLOOR) * similarity(item, print);
    for (const [mode, value] of credits(item)) bias[mode] = (bias[mode] ?? 0) + value * reach * BIAS_PER_POINT;
  }
  for (const mode of Object.keys(bias)) {
    bias[mode] = Math.round(Math.min(BIAS_MAX, Math.max(BIAS_MIN, bias[mode])) * 1000) / 1000;
  }
  return bias;
};

/** The most similar feedback on other songs, best first. */
export const similarExamples = (taste, print, exceptKey, count = 4) => normalizeTaste(taste).items
  .filter((item) => item.k !== exceptKey)
  .map((item) => ({ item, sim: similarity(item, print) }))
  .filter(({ sim }) => sim >= EXAMPLE_MIN_SIM)
  .sort((a, b) => b.sim - a.sim)
  .slice(0, count)
  .map(({ item }) => item);

/** Modes the user keeps choosing or turning down, for one line of the prompt and the panel. */
export const tasteSummary = (taste) => {
  const scores = Object.entries(modeScores(taste));
  return {
    liked: scores.filter(([, value]) => value >= SUMMARY_MIN).sort((a, b) => b[1] - a[1]).map(([mode, value]) => ({ mode, value })),
    disliked: scores.filter(([, value]) => value <= -SUMMARY_MIN).sort((a, b) => a[1] - b[1]).map(([mode, value]) => ({ mode, value })),
  };
};

/** How an item reads in the prompt and the panel. */
export const describeItem = (item, nameOf = (mode) => mode) => {
  const song = item.t ? `《${item.t}》` : `一首歌`;
  const about = [item.s, (item.g ?? []).join('、')].filter(Boolean).join('，');
  const head = about ? `${song}（${about}）` : song;
  if (item.kind === 'switch') {
    return item.from ? `${head}：AI 选了 ${nameOf(item.from)}，用户改成 ${nameOf(item.to)}` : `${head}：用户自己选了 ${nameOf(item.to)}`;
  }
  if (item.kind === 'up') return `${head}：用户认可 ${nameOf(item.to)}`;
  if (item.kind === 'down') return `${head}：用户否掉了 ${nameOf(item.from)}`;
  return `${head}：用户对 ${nameOf(item.from)} 不太满意，要求重选`;
};
