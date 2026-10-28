// Writes the label review sheet (评测集标注审阅表.md) from an evaluation report:
// for every song, the labelled modes next to what the AI picked and why, with a
// column for a person's verdict. Labels are revised in src/eval-set.mjs.
//
// Run: node dev/eval-review.mjs dev/eval/<report>.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILES } from '../src/profiles.mjs';
import { EVAL_SET } from '../src/eval-set.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const name = (mode) => (PROFILES[mode] ? `${PROFILES[mode].name}` : mode);
const cell = (text) => String(text ?? '').replace(/\|/g, '／').replace(/\n/g, ' ');

const rows = report.rows.map((row, index) => {
  const item = EVAL_SET.find((entry) => entry.title === row.title && entry.artist === row.artist);
  const accept = (item?.accept ?? row.accept).map(name).join('、');
  const dataIssue = row.error || (row.instrumental && !item?.instrumental);
  const pick = row.decision ? `${name(row.decision.mode)}：${cell(row.decision.reason)}` : '—';
  const verdict = dataIssue ? '⚠ 数据问题，不计分' : (row.hit ? '✓' : '✗');
  return `| ${index + 1} | ${row.holdout ? '保留' : '调参'} | ${cell(row.title)} — ${cell(row.artist)} | ${accept} | ${pick} | ${verdict} |  |`;
});

const legend = Object.entries(PROFILES)
  .filter(([id]) => id !== 'still')
  .map(([id, profile]) => `- **${profile.name}**（${id}）：${profile.host}`)
  .join('\n');

const sheet = `# 评测集标注审阅表

> 由 \`node dev/eval-review.mjs\` 根据 ${path.basename(process.argv[2])}（${report.model}，${report.at}）生成。

## 请你帮忙做的事

“可接受的模式”这一列是我（Claude）按每个模式的画面和歌曲气质起草的，**标注本身就是评测的标准，所以最需要你的口味**。

请在最后一列“你的意见”里写：
- **同意**：标注没问题；
- **加 X**：AI 选的（或别的）模式你也能接受，比如“加 倾诉”；
- **去 X**：某个标注的模式你其实不想要；
- 不认识这首歌就留空。

✗ 的行最值得看：有些可能不是 AI 选错，而是我标得太严。比如《First Love》选了倾诉、《消愁》选了倾诉，理由都说得通。

## 结果

| # | 集合 | 歌曲 | 可接受的模式（草稿） | AI 的选择和理由 | 结果 | 你的意见 |
|---|---|---|---|---|---|---|
${rows.join('\n')}

“调参”集是用来改进模式画像的 30 首，“保留”集是改完之后才加入、没参与调参的 12 首，后者的命中率才是真实水平。

## 模式速查

${legend}
`;
const out = path.join(root, '评测集标注审阅表.md');
fs.writeFileSync(out, sheet);
console.log(`wrote ${path.relative(root, out)} (${rows.length} songs)`);
