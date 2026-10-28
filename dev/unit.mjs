// Unit checks for the pure modules of lyric-ai-director-plus.
// Run: node dev/unit.mjs   (from the project folder)
import assert from 'node:assert/strict';
import { MODE_PARAMS, sanitizeParams, paramSpecLine, tuningKeyOf, sanitizeEffects, effectSpecLines, BEAT_EFFECTS } from '../src/params.mjs';
import { PROFILES, TAGS } from '../src/profiles.mjs';
import { buildSongContext, cleanLines, markChorus, songKeyOf } from '../src/song-context.mjs';
import { rankModes } from '../src/ranker.mjs';
import { BRIEF_SYSTEM, buildBriefUser, DECIDE_SYSTEM, buildDecideUser } from '../src/prompts.mjs';
import { isSafeMoment } from '../src/director.mjs';
import { addFeedback, briefPrint, similarity, tasteBias, similarExamples, tasteSummary, describeItem, emptyTaste, TASTE_MAX } from '../src/taste.mjs';
import { chatJson, listModels, usageOf } from '../src/llm.mjs';
import { endpointUrl, thinkingMethodFor, baseUrlFor, isLocalUrl, THINKING_OFF, PROVIDERS } from '../src/providers.mjs';

let passed = 0;
const pending = [];
const test = (name, fn) => {
  const run = async () => { await fn(); passed += 1; console.log(`ok  ${name}`); };
  pending.push(run);
};

test('every profile knob is a whitelisted param, every tag is in the vocabulary', () => {
  for (const [mode, profile] of Object.entries(PROFILES)) {
    assert.ok(MODE_PARAMS[mode], `${mode} missing from MODE_PARAMS`);
    for (const key of Object.keys(profile.knobs)) assert.ok(MODE_PARAMS[mode].params[key], `${mode}.${key} not whitelisted`);
    for (const tag of [...profile.fit, ...profile.avoid]) assert.ok(TAGS.includes(tag), `${mode}: tag ${tag} not in TAGS`);
  }
  assert.equal(Object.keys(PROFILES).length, 15);
});

test('sanitizeParams drops unknown keys and clamps', () => {
  assert.deepEqual(sanitizeParams('sonnet', { cameraIntensity: 5, bogus: 1, showOnlyText: 'false' }), { cameraIntensity: 2, showOnlyText: false });
  assert.deepEqual(sanitizeParams('hanabi', { anything: 1 }), {});
  assert.equal(tuningKeyOf('sonnet'), 'sonnetTuning');
  assert.match(paramSpecLine('sonnet', ['mgDensity']), /mgDensity\(0~2\)\[需 showBackgroundMg=true 且 showOnlyText=false\]/);
});

test('beat effects: sanitized to the allowed ids, strength clamped; depth values marked as needing 墨染奥行', () => {
  const allowed = ['tempera.inkFlash'];
  assert.deepEqual(sanitizeEffects({ 'tempera.inkFlash': { on: true, strength: 3.33 }, 'sonnet.lensTear': { on: true } }, allowed),
    { 'tempera.inkFlash': { on: true, strength: 2 } });
  assert.deepEqual(sanitizeEffects({ 'tempera.inkFlash': { on: 'false' } }, allowed), { 'tempera.inkFlash': { on: false } });
  assert.deepEqual(sanitizeEffects({ 'tempera.inkFlash': { strength: 1 } }, allowed), {});
  assert.deepEqual(sanitizeEffects(null, allowed), {});
  assert.match(paramSpecLine('tempera', ['depthOfField']), /depthOfField\(0~2\)\[需效果 tempera\.inkFlash 开\]景深/);
  assert.equal(effectSpecLines(['tempera.inkFlash', 'bogus.fx']).length, 1);
  for (const id of Object.keys(BEAT_EFFECTS)) assert.match(id, /^[a-z]+\.[A-Za-z]+$/);
});

const line = (t, text, extra = {}) => ({ startTime: t, endTime: t + 2.5, fullText: text, words: [], ...extra });
const lyrics = [
  line(0, '编曲 : 伍佰 & China Blue'),
  line(1, '作词：某人'),
  line(10, '第一句主歌'),
  line(13, '第二句主歌'),
  line(16, '不要让我懂 真的不想懂', { isChorus: true }),
  line(19, '心里的深处 思念依然在', { isChorus: true }),
  line(30, '第三句主歌'),
  line(33, '不要让我懂 真的不想懂'),
  line(36, '心里的深处 思念依然在'),
  line(39, '啊'),
  line(45, '啊'),
];

test('credit lines are removed', () => {
  const cleaned = cleanLines(lyrics);
  assert.equal(cleaned.length, 9);
  assert.ok(!cleaned.some((l) => /编曲|作词/.test(l.fullText)));
});

test('untagged repeated chorus lines are marked, a lone repeated interjection is not', () => {
  const marked = markChorus(cleanLines(lyrics));
  const flags = Object.fromEntries(marked.map((m, i) => [`${i}:${m.line.fullText}`, m.chorus]));
  assert.equal(marked[5].chorus, true); // untagged repeat at 33s
  assert.equal(marked[6].chorus, true);
  assert.equal(marked[7].chorus, false, JSON.stringify(flags)); // "啊" is too short
  assert.equal(marked[0].chorus, false);
});

test('song context and brief prompt', () => {
  const context = buildSongContext({
    song: { id: '1', source: 'netease', title: '真的吗', artist: '莫文蔚', album: 'x' },
    lines: lyrics,
    durationSeconds: 322,
    theme: { name: '雨夜思念', description: '雨夜的思念' },
  });
  assert.equal(context.key, 'netease:1');
  assert.equal(context.structure.lines, 9);
  assert.ok(context.structure.charsPerSecond > 0);
  assert.match(context.lyrics, /^0:10 V 第一句主歌/);
  assert.match(context.lyrics, /0:33 C 不要让我懂/);
  const user = buildBriefUser(context);
  assert.match(user, /播放器主题：雨夜思念/);
  assert.ok(BRIEF_SYSTEM.includes('tags 只能从这个列表里选'));
  assert.equal(songKeyOf({ id: null, title: 'a', artist: 'b' }), 't:a|b');
});

const allModes = ['sonnet', 'tempera', 'lumiere', 'hanabi', 'classic', 'cadenza', 'partita', 'fume', 'tilt', 'claddagh',
  'monet', 'pendolo', 'cappella', 'diorama', 'still', 'mod:visualizer52hz:rings'];

test('ranking: a quiet folk story leans to calm narrative modes, never still', () => {
  const brief = {
    tags: ['民谣', '叙事', '怀旧', '温柔'], energy: { overall: 0.3 },
    visual: { motion: 0.3, density: 0.45, warmth: 0.6, space: 0.4, story: 0.8 }, confidence: 0.8,
  };
  const { ranked, unprofiled } = rankModes(brief, allModes);
  console.log('    folk top5:', ranked.slice(0, 5).map((r) => `${r.id} ${r.score}`).join(', '));
  assert.ok(['partita', 'pendolo', 'monet'].includes(ranked[0].id), ranked[0].id);
  assert.notEqual(ranked[0].id, 'still');
  assert.deepEqual(unprofiled, ['mod:visualizer52hz:rings']);
});

test('ranking: a high-energy electronic sci-fi track leans to diorama', () => {
  const brief = {
    tags: ['电子', '科幻', '激昂'], energy: { overall: 0.85 },
    visual: { motion: 0.85, density: 0.5, warmth: 0.25, space: 0.9, story: 0.3 }, confidence: 0.9,
  };
  const { ranked } = rankModes(brief, allModes);
  console.log('    edm top5:', ranked.slice(0, 5).map((r) => `${r.id} ${r.score}`).join(', '));
  assert.equal(ranked[0].id, 'diorama');
});

test('ranking: a playful duet leans to cappella', () => {
  const brief = {
    tags: ['对唱', '俏皮', '流行', '青春'], energy: { overall: 0.55 },
    visual: { motion: 0.45, density: 0.55, warmth: 0.85, space: 0.2, story: 0.6 }, confidence: 0.8,
  };
  const { ranked } = rankModes(brief, allModes);
  console.log('    duet top5:', ranked.slice(0, 5).map((r) => `${r.id} ${r.score}`).join(', '));
  assert.equal(ranked[0].id, 'cappella');
});

test('decision prompt carries top-3 detail and the rest as one-liners', () => {
  const brief = { tags: ['摇滚', '激昂'], energy: { overall: 0.8 }, visual: { motion: 0.8, density: 0.7, warmth: 0.5, space: 0.6, story: 0.7 }, confidence: 0.8 };
  const { ranked } = rankModes(brief, allModes);
  const user = buildDecideUser({
    brief, title: 't', artist: 'a', candidates: ranked.slice(0, 3),
    others: [{ id: 'mod:visualizer52hz:rings', label: '52Hz' }], previous: null, recentModes: ['tilt'], userHint: '',
  });
  assert.match(user, /### sonnet（商籁/);
  assert.match(user, /其他模式：mod:visualizer52hz:rings（52Hz）/);
  assert.ok(DECIDE_SYSTEM.includes('"mode"'));
  assert.doesNotMatch(user, /鼓点效果/);
  const withFx = buildDecideUser({
    brief, title: 't', artist: 'a', candidates: ranked.slice(0, 3), others: [], previous: null, recentModes: [], userHint: '',
    effects: { sonnet: ['sonnet.lensTear'] },
  });
  assert.match(withFx, /鼓点效果（智能动感）：\n- sonnet\.lensTear（推镜裂光，跟节拍）/);
  assert.ok(DECIDE_SYSTEM.includes('"effects"'));
});

test('taste: one verdict per song, newest 30 kept, similar songs weigh more', () => {
  const calm = { summary: '安静怀旧', tags: ['民谣', '怀旧', '叙事'], visual: { motion: 0.3, density: 0.4, warmth: 0.7, space: 0.5, story: 0.8 }, energy: { overall: 0.35 } };
  const loud = { summary: '激昂摇滚', tags: ['摇滚', '激昂'], visual: { motion: 0.9, density: 0.8, warmth: 0.5, space: 0.6, story: 0.5 }, energy: { overall: 0.9 } };
  assert.equal(similarity(briefPrint(calm), briefPrint(calm)), 1);
  assert.ok(similarity(briefPrint(calm), briefPrint(loud)) < 0.3);

  let taste = emptyTaste();
  taste = addFeedback(taste, { k: 'a', t: '甲', ...briefPrint(calm), kind: 'switch', from: 'tilt', to: 'partita' });
  taste = addFeedback(taste, { k: 'a', t: '甲', ...briefPrint(calm), kind: 'down', from: 'partita' }); // replaces the first
  assert.equal(taste.items.length, 1);
  assert.equal(taste.items[0].kind, 'down');
  for (let i = 0; i < 40; i += 1) taste = addFeedback(taste, { k: `s${i}`, ...briefPrint(calm), kind: 'up', to: 'classic' });
  assert.equal(taste.items.length, TASTE_MAX);

  let t2 = emptyTaste();
  t2 = addFeedback(t2, { k: 'x', t: '安静的歌', ...briefPrint(calm), kind: 'switch', from: 'tilt', to: 'partita' });
  t2 = addFeedback(t2, { k: 'y', t: '另一首', ...briefPrint(calm), kind: 'switch', from: 'tilt', to: 'partita' });
  const near = tasteBias(t2, briefPrint(calm));
  const far = tasteBias(t2, briefPrint(loud));
  assert.ok(near.partita > far.partita && far.partita > 0, JSON.stringify({ near, far }));
  assert.ok(near.tilt < 0 && near.tilt >= -0.15);
  assert.deepEqual(similarExamples(t2, briefPrint(calm), 'x').map((item) => item.k), ['y']);
  assert.equal(similarExamples(t2, briefPrint(loud), 'z').length, 0);
  const summary = tasteSummary(t2);
  assert.deepEqual(summary.liked.map((item) => item.mode), ['partita']);
  assert.deepEqual(summary.disliked.map((item) => item.mode), ['tilt']);
  assert.match(describeItem(t2.items[0]), /《安静的歌》（安静怀旧，民谣、怀旧、叙事）：AI 选了 tilt，用户改成 partita/);
});

test('taste reaches the ranking and the prompt', () => {
  const brief = { tags: ['民谣', '怀旧'], energy: { overall: 0.35 }, visual: { motion: 0.3, density: 0.4, warmth: 0.7, space: 0.5, story: 0.8 }, confidence: 0.8 };
  const plain = rankModes(brief, allModes).ranked;
  const leader = plain[0].id;
  const pushed = rankModes(brief, allModes, { [leader]: -0.15, monet: 0.12 }).ranked;
  assert.equal(pushed.find((item) => item.id === leader).score, Math.round((plain[0].score - 0.15) * 1000) / 1000);
  assert.equal(pushed.find((item) => item.id === 'monet').why.taste, 0.12);
  const user = buildDecideUser({
    brief, title: 't', artist: 'a', candidates: plain.slice(0, 3), others: [], previous: null, recentModes: [], userHint: '',
    taste: { summary: '常主动选 云阶', examples: ['《甲》：AI 选了 倾诉，用户改成 云阶'] }, avoid: 'tilt（倾诉）',
  });
  assert.match(user, /用户口味（从用户过去的修改学到的）：\n- 整体：常主动选 云阶\n- 《甲》：AI 选了 倾诉，用户改成 云阶/);
  assert.match(user, /这次要避开的模式：tilt（倾诉）/);
  assert.ok(DECIDE_SYSTEM.includes('用户口味'));
});

test('safe moments: before the first line and in real gaps only', () => {
  const timed = cleanLines(lyrics);
  assert.equal(isSafeMoment(timed, 5), true); // before first line at 10s
  assert.equal(isSafeMoment(timed, 11), false); // inside a line
  assert.equal(isSafeMoment(timed, 13.0), false); // 0.5 s gap between 12.5 and 13
  assert.equal(isSafeMoment(timed, 23), true); // 21.5 -> 30 gap
  assert.equal(isSafeMoment(timed, 29.5), false); // too close to next line
  assert.equal(isSafeMoment([], 100), true);
});

test('provider presets and URL building', () => {
  assert.equal(endpointUrl('api.deepseek.com', 'chat/completions'), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(endpointUrl('https://x.com/v1/', 'chat/completions'), 'https://x.com/v1/chat/completions');
  assert.equal(endpointUrl('https://x.com/v1/chat/completions', 'models'), 'https://x.com/v1/models');
  assert.equal(endpointUrl(PROVIDERS.gemini.url, 'chat/completions'), 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(endpointUrl(PROVIDERS.volcengine.url, 'chat/completions'), 'https://ark.cn-beijing.volces.com/api/v3/chat/completions');
  assert.equal(endpointUrl(PROVIDERS.ollama.url, 'models'), 'http://localhost:11434/v1/models');
  assert.equal(endpointUrl('https://gw.example.com/v1?api-version=2', 'chat/completions'), 'https://gw.example.com/v1/chat/completions?api-version=2');
  assert.equal(baseUrlFor({ provider: 'openai', baseUrl: '' }), 'https://api.openai.com/v1');
  assert.equal(baseUrlFor({ provider: 'openai', baseUrl: ' https://my.proxy/v1 ' }), 'https://my.proxy/v1');
  assert.equal(baseUrlFor({ provider: 'custom', baseUrl: '' }), '');
  assert.equal(thinkingMethodFor({ method: 'auto', provider: 'custom', url: 'https://api.deepseek.com' }), 'thinking');
  assert.equal(thinkingMethodFor({ method: 'auto', provider: 'dashscope', url: '' }), 'enable_thinking');
  assert.equal(thinkingMethodFor({ method: 'auto', provider: 'custom', url: 'https://unknown.ai/v1' }), 'none');
  assert.equal(thinkingMethodFor({ method: 'none', provider: 'deepseek', url: '' }), 'none');
  assert.ok(isLocalUrl('http://localhost:11434/v1') && isLocalUrl('http://127.0.0.1:1234') && !isLocalUrl('https://api.openai.com/v1'));
  assert.deepEqual(usageOf({ prompt_tokens: 10, completion_tokens: 3, prompt_cache_hit_tokens: 4 }), { input: 10, output: 3, cached: 4, reasoning: 0 });
});

/* A fake OpenAI-compatible server that rejects the fields a picky provider would. */
const fakeServer = ({ rejects = [], requireCompletionTokens = false, thinks = false, models = ['m-1'] }) => {
  const seen = [];
  const reply = (status, data) => ({ ok: status < 300, status, statusText: '', text: () => JSON.stringify(data), json: () => data });
  const fetch = async (url, init) => {
    if (url.endsWith('/models')) return reply(200, { data: models.map((id) => ({ id })) });
    const body = JSON.parse(init.body);
    seen.push({ url, body, auth: init.headers.Authorization });
    for (const field of rejects) if (field in body) return reply(400, { error: { message: `Unrecognized request argument supplied: ${field}` } });
    if (requireCompletionTokens && 'max_tokens' in body) return reply(400, { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } });
    const message = { content: '```json\n{"ok":true}\n```', ...(thinks ? { reasoning_content: '...' } : {}) };
    return reply(200, { choices: [{ message, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } });
  };
  return { fetch, seen };
};

test('adaptive requests: drops what a provider rejects and remembers it', async () => {
  const server = fakeServer({ rejects: ['response_format', 'reasoning_effort', 'temperature'], requireCompletionTokens: true });
  const args = { fetch: server.fetch, baseUrl: 'https://picky.example/v1', apiKey: 'sk-x', model: 'm-1', temperature: 0.3, thinkingFields: THINKING_OFF.reasoning_effort, system: 's', user: 'u' };
  const result = await chatJson(args);
  assert.deepEqual(result.json, { ok: true });
  assert.equal(result.compat.maxTokensField, 'max_completion_tokens');
  assert.deepEqual([...result.compat.drop].sort(), ['reasoning_effort', 'response_format', 'temperature']);
  const calls = server.seen.length;
  const again = await chatJson({ ...args, compat: result.compat });
  assert.deepEqual(again.json, { ok: true });
  assert.equal(server.seen.length, calls + 1, 'second call goes straight through');
});

test('local endpoint: no key, no Authorization header; thinking is reported', async () => {
  const server = fakeServer({ thinks: true });
  const result = await chatJson({ fetch: server.fetch, baseUrl: PROVIDERS.ollama.url, apiKey: '', model: 'qwen3', temperature: 0.3, system: 's', user: 'u' });
  assert.equal(server.seen[0].auth, undefined);
  assert.equal(result.thought, true);
  assert.deepEqual(await listModels({ fetch: server.fetch, baseUrl: PROVIDERS.ollama.url, apiKey: '' }), ['m-1']);
});

test('errors are explained and never echo the key', async () => {
  const fetch = async () => ({ ok: false, status: 401, statusText: 'Unauthorized', text: () => '{"error":"bad key sk-secret-123456789"}', json: () => ({}) });
  await assert.rejects(
    chatJson({ fetch, baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-secret-123456789', model: 'x', temperature: 0.3, system: 's', user: 'u' }),
    (error) => /密钥无效/.test(error.message) && !error.message.includes('sk-secret-123456789'),
  );
});

test('evaluation set: valid labels, every animated mode covered', async () => {
  const { EVAL_SET } = await import('../src/eval-set.mjs');
  assert.ok(EVAL_SET.length >= 25);
  const covered = new Set();
  for (const item of EVAL_SET) {
    assert.ok(item.accept.length >= 1 && item.accept.length <= 3, item.title);
    for (const mode of item.accept) {
      assert.ok(PROFILES[mode], `${item.title}: unknown mode ${mode}`);
      covered.add(mode);
    }
  }
  const missing = Object.keys(PROFILES).filter((mode) => mode !== 'still' && !covered.has(mode));
  assert.deepEqual(missing, []);
});

for (const run of pending) await run();
console.log(`\n${passed} passed`);
