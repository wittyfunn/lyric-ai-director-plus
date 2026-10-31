// Prompt templates. Fixed text comes first in every request so provider-side
// prompt caching can hit it; what changes per song comes last.

import { TAGS, PROFILES } from './profiles.mjs';
import { paramSpecLine, effectSpecLines } from './params.mjs';

// ---------------------------------------------------------------- step 1: brief

export const BRIEF_SYSTEM = [
  '你是音乐分析师，为一个歌词动画导演写“歌曲简报”。',
  '你会收到歌曲信息、歌词的结构数据和带时间的完整歌词（C 表示副歌，V 表示其他段落），有时还有播放器为这首歌生成的主题描述。',
  '如果你认识这首歌，请结合你对它的编曲、节奏和演唱的了解；不认识就只依据歌词和结构数据，不要编造。',
  '结构数据里 charsPerSecond 是演唱时每秒的字数：说唱通常在 6 以上，抒情慢歌通常在 3 以下。',
  '',
  '请判断：整体情绪及其变化、叙事视角、核心意象、能量走势（哪里铺垫、哪里爆发、结尾怎么收）、适合的视觉气质。',
  '特别注意旋律与歌词情绪是否矛盾（例如欢快的旋律配遗憾的歌词），这是重要的导演线索，写进 contrast。',
  '',
  `tags 只能从这个列表里选 3~6 个：${TAGS.join('、')}`,
  '',
  '只输出一个 JSON 对象，不要任何其他文字：',
  '{',
  '  "summary": "不超过 60 字，这首歌给人的画面感",',
  '  "mood": ["2~4 个情绪词"],',
  '  "tags": ["从列表中选"],',
  '  "arc": "能量走势，一句话",',
  '  "contrast": "旋律与歌词的反差；没有就写空字符串",',
  '  "imagery": ["2~4 个核心意象"],',
  '  "energy": { "overall": 0~1, "verse": 0~1, "chorus": 0~1 },',
  '  "visual": { "motion": 0~1, "density": 0~1, "warmth": 0~1, "space": 0~1, "story": 0~1 },',
  '  "known": true 或 false（你是否认识这首歌）,',
  '  "confidence": 0~1（你对这份判断的把握）',
  '}',
  'visual 的含义：motion 画面运动量；density 同屏文字与装饰的多少；warmth 冷峻科技(0)到温暖有机(1)；space 平面海报(0)到纵深三维(1)；story 逐句叙事感的强弱。',
].join('\n');

export const buildBriefUser = (context) => {
  const lines = [
    `歌名：${context.title || '(未知)'}`,
    `歌手：${context.artist || '(未知)'}`,
    `专辑：${context.album || '(未知)'}`,
  ];
  if (context.theme) lines.push(`播放器主题：${context.theme.name}——${context.theme.description}`);
  lines.push(`结构数据：${JSON.stringify(context.structure)}`);
  lines.push('', context.instrumental ? '（这首歌没有歌词，可能是纯音乐）' : `歌词：\n${context.lyrics}`);
  return lines.join('\n');
};

// ---------------------------------------------------------------- step 2: decision

export const DECIDE_SYSTEM = [
  '你是歌词动画导演。根据“歌曲简报”，从候选模式里为这首歌选一个歌词动画模式，并给出该模式的参数。',
  '候选已按与简报的贴合程度排好序，并附有每个模式的画面描述、适合与不适合的歌、可调参数及其效果。',
  '',
  '规则：',
  '1. 模式之间没有优劣，只有合适与否。先比较简报的情绪、意象和能量走势与各候选的画面描述，再决定；排序只是参考，你可以选排在后面的候选。',
  '2. 只有当两个候选同样合适时，才优先选“最近没用过”的那个。',
  '3. 只有候选都明显不合适时，才从“其他模式”里选。',
  '4. params 只放你选的那个模式的参数，键名和范围必须来自给出的清单。只给 2~5 个你确信能让画面更贴合这首歌的参数。',
  '5. 形如 key(…)[需 X=Y] 的参数只在开关 X=Y 时生效，要改它就把开关一起写进 params。',
  '6. 如果给出了“这首歌上次的选择”，除非明显不合适，否则沿用；用户主动要求重新决策时不受此限。',
  '7. 如果候选附有“鼓点效果”，为你选的模式的每个效果决定开关和强度(0~2，1 为默认)：节奏鲜明、鼓点清楚的歌打开，能量越高强度越大；安静、抒情、几乎没有鼓的歌关掉。没有附效果就不要输出 effects。',
  '8. 形如 key(…)[需效果 X 开] 的参数只在效果 X 打开时生效。',
  '9. 如果给出了“用户口味”，那是这位用户亲自做过的修改，比一般审美更重要：和例子气质相似的歌，优先用户改成或认可的模式，避开用户否掉的模式；气质不同的歌只作参考。',
  '10. 如果给出了“这次要避开的模式”，不要选它。',
  '',
  '只输出一个 JSON 对象，不要任何其他文字：',
  '{ "mode": "模式 id", "params": { "键": 值 }, "effects": { "效果 id": { "on": true, "strength": 1 } }, "reason": "不超过 40 字，为什么这个模式贴合这首歌", "confidence": 0~1 }',
].join('\n');

const profileBlock = (candidate, effects = []) => {
  const profile = PROFILES[candidate.id];
  const knobs = Object.entries(profile.knobs ?? {});
  const spec = knobs.length > 0 ? paramSpecLine(candidate.id, knobs.map(([key]) => key)) : '';
  const rows = [
    `### ${candidate.id}（${profile.name}${typeof candidate.score === 'number' ? `，贴合度 ${candidate.score.toFixed(2)}` : ''}）`,
    `画面：${profile.host}`,
    `适合：${profile.fit.join('、') || '—'}；不适合：${profile.avoid.join('、') || '—'}`,
  ];
  if (knobs.length > 0) {
    rows.push(`可调参数：${spec}`);
    rows.push(...knobs.map(([key, effect]) => `- ${key}：${effect}`));
  } else {
    rows.push('可调参数：无（只选模式即可）');
  }
  if (effects.length > 0) rows.push('鼓点效果（智能动感）：', ...effectSpecLines(effects));
  return rows.join('\n');
};

/**
 * `effects`: mode id -> beat effect ids, only when 智能动感 is on and the user lets the AI set it.
 * `taste`: { summary: string, examples: string[] } learnt from the user (M5); `avoid`: a mode just turned down.
 */
export const buildDecideUser = ({ brief, title, artist, candidates, others, previous, recentModes, userHint, effects = {}, taste = null, avoid = null }) => {
  const lines = [
    `歌曲：${title} - ${artist}`,
    `简报：${JSON.stringify(brief)}`,
  ];
  if (userHint) lines.push(`用户偏好：${userHint}`);
  if (taste && (taste.summary || taste.examples?.length)) {
    lines.push('用户口味（从用户过去的修改学到的）：');
    if (taste.summary) lines.push(`- 整体：${taste.summary}`);
    for (const example of taste.examples ?? []) lines.push(`- ${example}`);
  }
  if (avoid) lines.push(`这次要避开的模式：${avoid}（用户刚说不合适）`);
  if (previous) lines.push(`这首歌上次的选择：${previous.mode}${previous.reason ? `（${previous.reason}）` : ''}`);
  if (recentModes.length > 0) lines.push(`最近用过的模式（新→旧，只在平局时参考）：${recentModes.join('、')}`);
  lines.push('', '候选模式：', ...candidates.map((candidate) => profileBlock(candidate, effects[candidate.id] ?? [])));
  if (others.length > 0) lines.push('', `其他模式：${others.map((mode) => `${mode.id}（${mode.label}）`).join('、')}`);
  return lines.join('\n');
};

// ---------------------------------------------------------------- after a manual switch: parameters only

export const TUNE_SYSTEM = [
  '你是歌词动画导演。用户已经亲自为这首歌选定了歌词动画模式，模式不能改；你只需要根据“歌曲简报”给出这个模式的参数，让画面更贴合这首歌。',
  '',
  '规则：',
  '1. params 的键名和范围必须来自给出的清单。只给 2~5 个你确信能让画面更贴合这首歌的参数。',
  '2. 形如 key(…)[需 X=Y] 的参数只在开关 X=Y 时生效，要改它就把开关一起写进 params；形如 key(…)[需效果 X 开] 的参数只在效果 X 打开时生效。',
  '3. 如果附有“鼓点效果”，为每个效果决定开关和强度(0~2，1 为默认)：节奏鲜明、鼓点清楚的歌打开，能量越高强度越大；安静、抒情、几乎没有鼓的歌关掉。没有附效果就不要输出 effects。',
  '',
  '只输出一个 JSON 对象，不要任何其他文字：',
  '{ "params": { "键": 值 }, "effects": { "效果 id": { "on": true, "strength": 1 } }, "reason": "不超过 30 字，这些参数为什么贴合这首歌" }',
].join('\n');

/** The one mode the user chose, with its parameters and beat effects to fill in. */
export const buildTuneUser = ({ brief, title, artist, mode, effects = [], userHint }) => {
  const lines = [
    `歌曲：${title} - ${artist}`,
    `简报：${JSON.stringify(brief)}`,
  ];
  if (userHint) lines.push(`用户偏好：${userHint}`);
  lines.push('', '用户选定的模式：', profileBlock({ id: mode }, effects));
  return lines.join('\n');
};
