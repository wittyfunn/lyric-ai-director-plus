// Merges src/*.mjs into one lyric-ai-director-plus/client.mjs.
//
// Why: Folia imports the entry as `client.mjs?v=<fingerprint>`, but a sibling
// imported as `./director.mjs` carries no version, so after a reload the page
// keeps the old copy of every sibling from its module cache and old and new code
// get mixed ("director.onSetupChanged is not a function"). One file means every
// reload loads all of the new code.
//
// Each module is wrapped in its own function scope; `import { a } from './x.mjs'`
// becomes `const { a } = __x;` and `export const a` becomes a returned binding.
// Only the forms this codebase uses are supported, and anything else fails loudly.
//
// Run: node dev/build.mjs         release: dev-only modules become stubs
//      node dev/build.mjs --dev   with the evaluation tools, for our own runs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');
const outFile = path.join(root, 'lyric-ai-director-plus', 'client.mjs');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'lyric-ai-director-plus', 'mod.json'), 'utf8'));

const DEV = process.argv.includes('--dev');
// What a dev-only module becomes in the release (its own imports go with it).
const RELEASE_STUBS = { evaluate: 'export const createEvaluator = null;' };

const IMPORT = /^import\s*\{([^}]+)\}\s*from\s*'\.\/([\w-]+)\.mjs';\s*$/;
const varOf = (name) => `__${name.replace(/-/g, '_')}`;

const parse = (name) => {
  const source = !DEV && RELEASE_STUBS[name] !== undefined
    ? RELEASE_STUBS[name]
    : fs.readFileSync(path.join(srcDir, `${name}.mjs`), 'utf8').replace(/\r\n/g, '\n');
  const deps = [];
  const exports = [];
  const lines = source.split('\n').map((line) => {
    if (line.startsWith('/// <reference')) return null;
    const imported = IMPORT.exec(line);
    if (imported) {
      deps.push(imported[2]);
      return `const {${imported[1]}} = ${varOf(imported[2])};`;
    }
    if (/^import\s/.test(line)) throw new Error(`${name}.mjs: unsupported import: ${line}`);
    const exported = /^export const (\w+)/.exec(line);
    if (exported) {
      exports.push(exported[1]);
      return line.replace(/^export const/, 'const');
    }
    if (/^export\s/.test(line) && !/^export default async function activate/.test(line)) {
      throw new Error(`${name}.mjs: unsupported export: ${line}`);
    }
    return line;
  }).filter((line) => line !== null);
  return { name, deps, exports, body: lines.join('\n').trim() };
};

// Depth-first from the entry, so every module comes after what it imports.
const order = [];
const seen = new Set();
const visit = (name, trail = []) => {
  if (trail.includes(name)) throw new Error(`import cycle: ${[...trail, name].join(' -> ')}`);
  if (seen.has(name)) return;
  const mod = parse(name);
  for (const dep of mod.deps) visit(dep, [...trail, name]);
  seen.add(name);
  order.push(mod);
};
visit('client');

const devOnly = new Set(DEV ? [] : ['eval-set']); // reachable only through a stubbed module
const unused = fs.readdirSync(srcDir).filter((file) => file.endsWith('.mjs') && !seen.has(file.slice(0, -4)) && !devOnly.has(file.slice(0, -4)));
if (unused.length > 0) console.warn(`not reachable from client.mjs (left out): ${unused.join(', ')}`);

const parts = [
  `// AI 歌词动画导演 Plus ${manifest.version}${DEV ? ' (developer build)' : ''} — built from src/ by dev/build.mjs; edit src/, not this file.`,
  '// Source modules are kept in separate scopes below, in dependency order.',
  '',
];
for (const mod of order) {
  if (mod.name === 'client') {
    parts.push(`// ---- src/client.mjs (entry)`, mod.body, '');
  } else {
    parts.push(
      `// ---- src/${mod.name}.mjs`,
      `const ${varOf(mod.name)} = (() => {`,
      mod.body,
      `return { ${mod.exports.join(', ')} };`,
      '})();',
      '',
    );
  }
}
fs.writeFileSync(outFile, parts.join('\n'));
console.log(`built ${path.relative(root, outFile)}${DEV ? ' (dev)' : ''}: ${order.length} modules, ${fs.statSync(outFile).size} bytes`);
