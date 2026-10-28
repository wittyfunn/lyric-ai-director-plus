// Re-scores the local ranking offline, from the briefs in an exported evaluation
// report (panel → 复制评测结果, saved as dev/eval/<name>.json). Uses the current
// profiles.mjs, ranker.mjs and eval-set.mjs labels, so profile or label edits can
// be checked in seconds without calling any AI.
//
// Run: node dev/ranker-eval.mjs dev/eval/<name>.json [--misses]

import fs from 'node:fs';
import { rankModes } from '../src/ranker.mjs';
import { EVAL_SET } from '../src/eval-set.mjs';

const [file, flag] = process.argv.slice(2);
if (!file) {
  console.error('usage: node dev/ranker-eval.mjs <report.json> [--misses]');
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const modes = ['sonnet', 'tempera', 'lumiere', 'hanabi', 'classic', 'cadenza', 'partita', 'fume', 'tilt', 'claddagh',
  'monet', 'pendolo', 'cappella', 'diorama', 'still'];
const labels = new Map(EVAL_SET.map((item) => [`${item.title}|${item.artist}`, item.accept]));

const holdoutIds = new Set(EVAL_SET.filter((item) => item.holdout).map((item) => `${item.title}|${item.artist}`));
const groups = { tuned: { n: 0, top1: 0, top3: 0 }, holdout: { n: 0, top1: 0, top3: 0 } };
let scored = 0;
let top1 = 0;
let top3 = 0;
let aiHit = 0;
const firstPlace = {};
const misses = [];
for (const row of report.rows) {
  if (row.error || !row.brief) continue;
  if (row.instrumental && !EVAL_SET.find((item) => item.title === row.title && item.artist === row.artist)?.instrumental) continue; // data problem, not scored
  const accept = labels.get(`${row.title}|${row.artist}`) ?? row.accept;
  const { ranked } = rankModes(row.brief, modes);
  scored += 1;
  const first = ranked[0].id;
  firstPlace[first] = (firstPlace[first] ?? 0) + 1;
  const inTop1 = accept.includes(first);
  const inTop3 = ranked.slice(0, 3).some((item) => accept.includes(item.id));
  if (inTop1) top1 += 1;
  if (inTop3) top3 += 1;
  const group = groups[holdoutIds.has(`${row.title}|${row.artist}`) ? 'holdout' : 'tuned'];
  group.n += 1;
  if (inTop1) group.top1 += 1;
  if (inTop3) group.top3 += 1;
  if (accept.includes(row.decision?.mode)) aiHit += 1;
  if (!inTop3 || flag === '--all') {
    misses.push(`  ${row.title} - ${row.artist}\n    可接受 ${accept.join('、')} | 本地 ${ranked.slice(0, 5).map((item) => `${item.id} ${item.score.toFixed(2)}`).join('，')}\n    标签 ${(row.brief.tags ?? []).join('、')} | 视觉 ${JSON.stringify(row.brief.visual)} | 能量 ${row.brief.energy?.overall}`);
  }
}
const pct = (n) => `${Math.round((n / scored) * 100)}%`;
console.log(`报告：${file}（${report.model ?? '?'}，${report.at ?? ''}）`);
console.log(`有效 ${scored} 首 | 本地第一名命中 ${pct(top1)} | 本地前三命中 ${pct(top3)} | 当时 AI 命中 ${pct(aiHit)}（AI 结果不随本脚本重算）`);
for (const [name, group] of Object.entries(groups)) {
  if (group.n === 0) continue;
  const p = (n) => `${Math.round((n / group.n) * 100)}%`;
  console.log(`  ${name === 'holdout' ? '保留集（没用来调参）' : '调参集'} ${group.n} 首：本地第一名 ${p(group.top1)}，本地前三 ${p(group.top3)}`);
}
console.log(`本地第一名分布：${Object.entries(firstPlace).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id}×${n}`).join('，')}`);
if (misses.length > 0 && flag) console.log(`\n前三都不可接受的歌：\n${misses.join('\n')}`);
