// Turns a song and its lyric lines into what the brief prompt needs: cleaned
// lines (credits removed), chorus marks (the source's own, plus repeated lines:
// M0 found sources tag only part of the chorus), a compact text form, and a few
// objective structure numbers that stand in for audio until M3.

const CREDIT_PATTERN = /^\s*(作词|作曲|编曲|词|曲|制作人|监制|出品|发行|混音|母带|录音|和声|和音|配唱|吉他|贝斯|鼓|键盘|弦乐|钢琴|企划|统筹|OP|SP|ISRC|Lyrics?|Lyricist|Composer|Compose[rd]?|Arrange[rd]?|Arrangement|Producer|Produced|Mix(?:ed|ing)?|Master(?:ed|ing)?)\s*(by)?\s*[:：]/i;
const NOTICE_PATTERN = /(未经|著作权|版权所有|享有本翻译作品|TME|QQ音乐|网易云音乐|酷狗)/;

const MAX_LINES_FULL = 120;
const MAX_CHARS_PER_LINE = 80;

/** Per-song key: `source:id`, or `title|artist` when there is no id (Folium's advice). */
export const songKeyOf = (song) => {
  if (!song) return null;
  if (song.id) return `${song.source ?? 'unknown'}:${song.id}`;
  return `t:${song.title}|${song.artist}`;
};

const normalizeText = (text) => String(text ?? '').replace(/[\s\p{P}\p{S}]+/gu, '').toLowerCase();
const clip = (text) => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > MAX_CHARS_PER_LINE ? `${flat.slice(0, MAX_CHARS_PER_LINE)}…` : flat;
};
const clock = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const cleanLines = (lines) => (Array.isArray(lines) ? lines : [])
  .filter((line) => {
    const text = String(line?.fullText ?? '').trim();
    return text && !CREDIT_PATTERN.test(text) && !NOTICE_PATTERN.test(text);
  });

/**
 * Lines with a chorus mark: the source's `isChorus`, or a line whose text recurs
 * and sits in a run of at least two recurring lines (a lone repeated "oh" is not
 * a chorus).
 */
export const markChorus = (lines) => {
  const counts = new Map();
  for (const line of lines) {
    const key = normalizeText(line.fullText);
    if (key.length >= 2) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeated = lines.map((line) => (counts.get(normalizeText(line.fullText)) ?? 0) >= 2);
  return lines.map((line, index) => {
    const inRun = repeated[index] && (repeated[index - 1] || repeated[index + 1]);
    return { line, chorus: Boolean(line.isChorus) || inRun, tagged: Boolean(line.isChorus) };
  });
};

/** Objective structure numbers: how wordy, how repetitive, how long. */
export const structureOf = (marked, durationSeconds) => {
  const voiced = marked.filter(({ line }) => Number.isFinite(line.endTime) && line.endTime > line.startTime);
  const chars = voiced.reduce((sum, { line }) => sum + normalizeText(line.fullText).length, 0);
  const singing = voiced.reduce((sum, { line }) => sum + (line.endTime - line.startTime), 0);
  const unique = new Set(marked.map(({ line }) => normalizeText(line.fullText))).size;
  return {
    lines: marked.length,
    duration: Math.round(durationSeconds || 0),
    charsPerSecond: singing > 0 ? Math.round((chars / singing) * 10) / 10 : null,
    repetition: marked.length > 0 ? Math.round((1 - unique / marked.length) * 100) / 100 : 0,
    chorusLines: marked.filter((item) => item.chorus).length,
    taggedChorusLines: marked.filter((item) => item.tagged).length,
    translated: marked.some(({ line }) => Boolean(line.translation)),
  };
};

/**
 * `m:ss C 文本 / 翻译`, one line each. Over MAX_LINES_FULL lines, a chorus line
 * already shown twice is folded into a count instead of being repeated.
 */
export const lyricsText = (marked) => {
  const seen = new Map();
  const rows = [];
  let folded = 0;
  const long = marked.length > MAX_LINES_FULL;
  for (const { line, chorus } of marked) {
    const key = normalizeText(line.fullText);
    const times = (seen.get(key) ?? 0) + 1;
    seen.set(key, times);
    if (long && chorus && times > 2) {
      folded += 1;
      continue;
    }
    let row = `${clock(line.startTime)} ${chorus ? 'C' : 'V'} ${clip(line.fullText)}`;
    if (line.translation) row += ` / ${clip(line.translation)}`;
    rows.push(row);
  }
  if (folded > 0) rows.push(`（另有 ${folded} 行重复副歌已省略）`);
  return rows.join('\n');
};

/** Everything the brief needs, from a song and its raw lines. */
export const buildSongContext = ({ song, lines, durationSeconds, theme }) => {
  const marked = markChorus(cleanLines(lines));
  return {
    key: songKeyOf(song),
    title: song?.title ?? '',
    artist: song?.artist ?? '',
    album: song?.album ?? '',
    structure: structureOf(marked, durationSeconds),
    lyrics: marked.length > 0 ? lyricsText(marked) : '',
    theme: theme?.description ? { name: theme.name ?? '', description: String(theme.description).slice(0, 200) } : null,
    instrumental: marked.length === 0,
  };
};
