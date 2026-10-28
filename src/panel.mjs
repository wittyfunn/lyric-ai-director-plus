// The "AI 导演" player panel tab: what the director is doing for the song on
// screen, the brief, the ranking, the decision and what it cost.

import { PROFILES } from './profiles.mjs';
import { BEAT_EFFECTS } from './params.mjs';
import { describeItem } from './taste.mjs';

const PHASES = {
  idle: '空闲',
  'waiting-lyrics': '等歌词',
  briefing: '理解歌曲中',
  deciding: '挑选模式中',
  'waiting-gap': '等歌词空隙',
  applied: '已应用',
  remembered: '记忆命中',
  'user-memory': '沿用你的手动选择',
  user: '你已手动接管',
  'no-key': '缺少密钥',
  'no-config': '还没设置好',
  'waiting-prepare': '提前准备中',
  fetching: '取歌词中',
  ready: '已准备好',
  skipped: '跳过',
  error: '出错',
};

const AXES = { motion: '运动', density: '密度', warmth: '温度', space: '纵深', story: '叙事' };
const nameOf = (mode) => (PROFILES[mode] ? `${PROFILES[mode].name}（${mode}）` : mode);
const pct = (value) => (typeof value === 'number' ? value.toFixed(2) : '—');

const CSS = `
  .ad { font: 13px/1.55 system-ui, sans-serif; padding: 12px; color: inherit; }
  .ad h3 { font-size: 13px; margin: 14px 0 4px; opacity: 0.75; font-weight: 600; }
  .ad .song { font-size: 15px; font-weight: 600; }
  .ad .badge { display: inline-block; padding: 1px 8px; border-radius: 10px; border: 1px solid currentColor; font-size: 12px; margin-right: 6px; }
  .ad .muted { opacity: 0.6; font-size: 12px; }
  .ad .err { color: #ff8a80; }
  .ad .mode { font-size: 16px; font-weight: 600; }
  .ad .row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .ad button { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 6px; cursor: pointer;
    border: 1px solid currentColor; background: transparent; color: inherit; opacity: 0.85; }
  .ad button:hover { opacity: 1; }
  .ad table { border-collapse: collapse; width: 100%; font-size: 12px; }
  .ad td { padding: 2px 4px; vertical-align: top; }
  .ad .guide { border: 1px dashed currentColor; border-radius: 8px; padding: 8px 10px; margin: 8px 0; font-size: 12px; }
  .ad .guide ol { margin: 4px 0 0 18px; padding: 0; }
  .ad .test { white-space: pre-wrap; font-size: 12px; margin: 6px 0; }
  .ad .warn { color: #ffcc80; font-size: 12px; }
  .ad .bar { display: inline-block; height: 6px; border-radius: 3px; background: currentColor; opacity: 0.6; vertical-align: middle; }
`;

export const mountPanel = (container, ctx, { director, folium, settings, onRender }) => {
  const money = (value) => {
    const { priceIn, priceOut, currency } = settings();
    return priceIn + priceOut > 0 ? `，约 ${currency}${(value ?? 0).toFixed(4)}` : '';
  };
  const style = document.createElement('style');
  style.textContent = CSS;
  const root = document.createElement('div');
  root.className = 'ad';
  const view = document.createElement('div');
  const actions = document.createElement('div');
  actions.className = 'row';
  const result = document.createElement('div');
  result.className = 'muted';
  const testOut = document.createElement('div');
  testOut.className = 'test';
  const evalBox = document.createElement('div');
  root.append(view, actions, result, testOut, evalBox);
  container.append(style, root);

  const button = (label, run) => {
    const node = document.createElement('button');
    node.textContent = label;
    node.addEventListener('click', async () => {
      result.textContent = '进行中…';
      try {
        result.textContent = String(await run());
      } catch (error) {
        result.textContent = `出错：${error?.message ?? error}`;
      }
    });
    return node;
  };
  actions.append(
    button('为这首歌决策', () => director.decideNow()),
    button('重新挑选模式', () => director.decideNow({ force: true })),
    button('重新理解整首歌', () => director.decideNow({ force: true, rebrief: true })),
    button('恢复原来的设置', () => director.restore()),
    button('测试连接', async () => {
      testOut.textContent = '测试中…';
      const report = await director.testConnection();
      const lines = [];
      if (report.models) {
        lines.push(`模型列表：${report.models.length} 个${report.modelListed === false ? '（你填的模型名不在列表里，检查一下拼写）' : ''}`);
        if (report.models.length > 0) lines.push(report.models.slice(0, 40).join('  ') + (report.models.length > 40 ? '  …' : ''));
      } else if (report.modelsError) {
        lines.push(`模型列表：拿不到（${report.modelsError}）。有些服务商不提供列表，不影响使用`);
      }
      if (report.chat) {
        lines.push(`对话测试：成功，${report.chat.ms} ms，${report.chat.usage.input + report.chat.usage.output} token`);
        if (report.chat.thought) lines.push('⚠ 模型在“思考”：更贵也更慢。到设置里换一种“关闭思考”的方式，或换个不带思考的模型');
        if ((report.chat.compat.drop ?? []).length > 0) lines.push(`已自动适配：这个接口不支持 ${report.chat.compat.drop.join('、')}`);
      } else if (report.chatError) {
        lines.push(`对话测试：失败——${report.chatError}`);
      } else {
        lines.push('还没填模型名：从上面的列表里挑一个填进设置');
      }
      testOut.textContent = lines.join('\n');
      return '测试完成';
    }),
  );


  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };

  const render = () => {
    const { current, next, totals, beat } = director.getState();
    view.replaceChildren();
    const values = settings();
    if (['no-config', 'no-key'].includes(current?.phase) || (!values.model && !values.baseUrl && values.provider === 'custom')) {
      const guide = el('div', '', 'guide');
      guide.append(el('div', '第一次使用：'));
      const steps = el('ol');
      for (const step of [
        '打开 设置 → 模组 → AI 歌词动画导演 Plus',
        '“服务商”选你在用的（任何兼容 OpenAI 接口的都行，列表里没有就选“自定义”填地址）',
        '填 API 密钥（本机的 Ollama、LM Studio 不用填）',
        '回到这里点“测试连接”，从列表里挑一个模型名填进设置',
      ]) steps.append(el('li', step));
      guide.append(steps);
      view.append(guide);
    }
    if (!current) {
      view.append(el('div', '现在没有在播放的歌', 'muted'));
    } else {
      view.append(el('div', `${current.song.title} - ${current.song.artist}`, 'song'));
      const status = el('div');
      status.append(el('span', PHASES[current.phase] ?? current.phase, 'badge'));
      if (current.message) status.append(el('span', current.message, ['error', 'no-key', 'no-config'].includes(current.phase) ? 'err' : 'muted'));
      view.append(status);
      if (current.thought) view.append(el('div', '⚠ 这个模型在“思考”，更贵也更慢：到设置里换一种“关闭思考”的方式，或换个模型', 'warn'));

      const decision = current.decision;
      if (decision) {
        view.append(el('h3', '选择'));
        view.append(el('div', nameOf(decision.mode), 'mode'));
        if (decision.reason) view.append(el('div', decision.reason));
        const applied = current.applied;
        const params = applied?.written && Object.keys(applied.written).length > 0 ? applied.written : decision.params;
        if (params && Object.keys(params).length > 0) view.append(el('div', `参数：${JSON.stringify(params)}`, 'muted'));
        const fx = applied?.fx && Object.keys(applied.fx).length > 0 ? applied.fx : decision.fx;
        if (fx && Object.keys(fx).length > 0) {
          const text = Object.entries(fx)
            .map(([id, value]) => `${BEAT_EFFECTS[id]?.zh ?? id} ${value.on ? `开 ${value.strength ?? ''}`.trim() : '关'}`)
            .join('，');
          view.append(el('div', `鼓点效果：${text}`, 'muted'));
        } else if (beat && Object.keys(BEAT_EFFECTS).some((id) => id.startsWith(`${decision.mode}.`))) {
          // The mode has 智能动感 effects but the AI did not set them: say why.
          let why;
          if (beat === 'off') why = 'Folia 的智能动感是关的，打开后（歌词样式 → 全局）AI 会一起安排';
          else if (!values.beatFx) why = '由你自己设；在设置里打开“同时调整智能动感”可交给 AI';
          else why = '这首是之前定的，没安排鼓点效果；点“重新挑选模式”可让 AI 一起安排';
          view.append(el('div', `鼓点效果：${why}`, 'muted'));
        }
        for (const note of applied?.notes ?? []) view.append(el('div', `· ${note}`, 'muted'));
        if (decision.confidence) view.append(el('div', `把握 ${pct(decision.confidence)}`, 'muted'));
        if (current.tasteUsed) view.append(el('div', `参考了 ${current.tasteUsed} 条你在相似歌上的口味记录`, 'muted'));
        if (values.learnTaste && current.brief) {
          const verdict = el('div', '', 'row');
          verdict.append(
            button('👍 合适', () => director.feedback('up')),
            button('👎 不合适，换一个', () => director.feedback('down')),
          );
          view.append(verdict);
        }
      }

      const brief = current.brief;
      if (brief) {
        view.append(el('h3', '歌曲简报'));
        if (brief.summary) view.append(el('div', brief.summary));
        view.append(el('div', `情绪：${(brief.mood ?? []).join('、')}　标签：${(brief.tags ?? []).join('、')}`, 'muted'));
        if (brief.arc) view.append(el('div', `走势：${brief.arc}`, 'muted'));
        if (brief.contrast) view.append(el('div', `反差：${brief.contrast}`, 'muted'));
        if (brief.visual) {
          const table = el('table');
          for (const [axis, label] of Object.entries(AXES)) {
            const value = Number(brief.visual[axis]) || 0;
            const tr = el('tr');
            const bar = el('span', '', 'bar');
            bar.style.width = `${Math.round(value * 120)}px`;
            const cell = el('td');
            cell.append(bar, el('span', ` ${pct(value)}`, 'muted'));
            tr.append(el('td', label), cell);
            table.append(tr);
          }
          view.append(table);
        }
        view.append(el('div', `${brief.known ? '模型认识这首歌' : '模型不认识这首歌，只凭歌词判断'}　把握 ${pct(brief.confidence)}`, 'muted'));
      }

      if (current.ranked?.length) {
        view.append(el('h3', '本地打分（前 5）'));
        const table = el('table');
        for (const item of current.ranked.slice(0, 5)) {
          const tr = el('tr');
          tr.append(
            el('td', nameOf(item.id)),
            el('td', item.score.toFixed(3)),
            el('td', [...item.why.fit.map((tag) => `+${tag}`), ...item.why.avoid.map((tag) => `−${tag}`)].join(' '), 'muted'),
          );
          table.append(tr);
        }
        view.append(table);
      }

      if (current.prepared) view.append(el('div', '这首歌是提前准备好的，切歌时直接套用', 'muted'));

      if (next) {
        view.append(el('h3', '下一首'));
        const row = el('div');
        row.append(el('span', PHASES[next.phase] ?? next.phase, 'badge'), el('span', `${next.song.title} - ${next.song.artist}`));
        view.append(row);
        if (next.decision) view.append(el('div', `→ ${nameOf(next.decision.mode)}${next.decision.reason ? `：${next.decision.reason}` : ''}`, 'muted'));
        else if (next.message) view.append(el('div', next.message, next.phase === 'error' ? 'err' : 'muted'));
      }

      const usage = current.usage;
      view.append(el('h3', '花费'));
      view.append(el('div', usage.calls > 0
        ? `本首：${usage.calls} 次调用，输入 ${usage.input}（缓存 ${usage.cached}）/ 输出 ${usage.output} token${money(usage.cost)}`
        : '本首：0 次调用', 'muted'));
      if (next?.usage?.calls > 0) {
        view.append(el('div', `提前准备下一首：${next.usage.calls} 次调用，输入 ${next.usage.input} / 输出 ${next.usage.output} token${money(next.usage.cost)}`, 'muted'));
      }
    }
    view.append(el('div', `累计：${totals.calls} 次调用，输入 ${totals.input} / 输出 ${totals.output} token${money(totals.cost)}`, 'muted'));
    renderTaste(values);
    renderEval();
  };

  /* M5: what has been learnt, newest first, with a way to start over. */
  const tasteBox = document.createElement('div');
  root.insertBefore(tasteBox, evalBox);
  const clearTaste = button('清除口味记录', () => director.clearTaste());
  const renderTaste = (values) => {
    tasteBox.replaceChildren();
    if (!values.learnTaste) return;
    const { items, summary } = director.getTaste();
    tasteBox.append(el('h3', `你的口味（${items.length} 条记录）`));
    if (items.length === 0) {
      tasteBox.append(el('div', '还没有记录。手动换模式（停留 8 秒以上）、点 👍 / 👎 都会记下来，之后相似的歌会参考。', 'muted'));
      return;
    }
    if (summary) tasteBox.append(el('div', summary));
    for (const item of items.slice(-5).reverse()) tasteBox.append(el('div', `· ${describeItem(item, nameOf)}`, 'muted'));
    const row = el('div', '', 'row');
    row.append(clearTaste);
    tasteBox.append(row);
  };

  /* Developer tool: the evaluation set (settings → 显示评测工具). */
  const evalOut = document.createElement('div');
  evalOut.className = 'test';
  const evalActions = document.createElement('div');
  evalActions.className = 'row';
  evalActions.append(
    button('运行评测', () => director.evaluate()),
    button('重新理解后评测', () => director.evaluate({ rebrief: true })),
    button('复制评测结果（JSON）', async () => {
      const report = await director.getEvalReport();
      if (!report) return '还没有评测结果';
      await navigator.clipboard.writeText(JSON.stringify(report, null, 1));
      return '已复制到剪贴板';
    }),
  );
  const renderEval = () => {
    evalBox.replaceChildren();
    if (!settings().devTools) return;
    evalBox.append(el('h3', '评测集（开发者）'), evalActions, evalOut);
    const run = director.getEvalRun();
    if (!run) {
      evalOut.textContent = '用内置的 30 首歌跑一遍完整流程，对照人工标注算命中率。简报会缓存，第二次起只花第 2 步的钱。';
      return;
    }
    const lines = [run.running ? `进行中 ${run.done}/${run.total}…` : ''];
    if (run.summary) {
      const s = run.summary;
      lines.push(`AI 命中 ${s.aiHit}%　本地第一名 ${s.localTop1}%　本地前三 ${s.localTop3}%　用了 ${s.distinctModes} 种模式　有效 ${s.scored}/${s.songs}`);
      if (s.holdout?.songs) {
        lines.push(`　调参集 ${s.tuned.songs} 首：AI ${s.tuned.aiHit}% / 第一名 ${s.tuned.localTop1}% / 前三 ${s.tuned.localTop3}%`);
        lines.push(`　保留集 ${s.holdout.songs} 首（没用来调参）：AI ${s.holdout.aiHit}% / 第一名 ${s.holdout.localTop1}% / 前三 ${s.holdout.localTop3}%`);
      }
      lines.push(`用量：${s.usage.calls} 次调用，输入 ${s.usage.input} / 输出 ${s.usage.output} token${money(s.usage.cost)}`);
    }
    for (const row of run.rows) {
      lines.push(row.error
        ? `✗ ${row.title}：${row.error}`
        : `${row.hit ? '✓' : '✗'} ${row.title} → ${nameOf(row.decision.mode)}（可接受：${row.accept.join('、')}；本地前三 ${row.top.slice(0, 3).map((item) => item.id).join('、')}）`);
    }
    evalOut.textContent = lines.filter(Boolean).join('\n');
  };

  const stop = onRender(render);
  ctx.every(1000, render);
  render();
  return stop;
};
