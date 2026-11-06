/// <reference path="../m0-probe/folium.d.ts" />
// AI 歌词动画导演 Plus — entry point. Wires settings, events, the panel and the
// commands to the director. See DESIGN.md for the plan and M0 findings.

import { createHostAdapter } from './host-adapter.mjs';
import { createStore } from './store.mjs';
import { createDirector } from './director.mjs';
import { createEvaluator } from './evaluate.mjs';
import { mountPanel } from './panel.mjs';
import { PROVIDERS } from './providers.mjs';

const PANEL_ID = 'director';
const T = (zh, en) => ({ 'zh-CN': zh, en });

const PROVIDER_OPTIONS = Object.entries(PROVIDERS).map(([value, provider]) => ({ value, label: T(provider.label, provider.label) }));

const SETTINGS = [
  { key: 'provider', type: 'select', group: T('接口', 'API'), label: T('服务商', 'Provider'),
    description: T('任何兼容 OpenAI 接口的服务都能用；列表里没有的选“自定义”并填接口地址', 'Any OpenAI-compatible API works; pick "custom" for others'),
    defaultValue: 'custom', options: PROVIDER_OPTIONS },
  { key: 'baseUrl', type: 'text', group: T('接口', 'API'), label: T('接口地址', 'API base URL'),
    description: T('选了服务商可以留空；填了就以这里为准。例如 https://api.example.com/v1', 'Leave empty to use the provider preset'),
    defaultValue: '', placeholder: 'https://api.example.com/v1' },
  { key: 'model', type: 'text', group: T('接口', 'API'), label: T('模型', 'Model'),
    description: T('填服务商给的模型名；不确定就先点面板里的“测试连接”看可用列表。推荐便宜、快、不带思考的模型', 'The model id from your provider; "Test connection" lists them'),
    defaultValue: '', placeholder: 'gpt-4o-mini / deepseek-chat / qwen-plus …' },
  { key: 'apiKey', type: 'secret', group: T('接口', 'API'), label: T('API 密钥', 'API key'),
    description: T('由 Folia 加密保存。本机模型（Ollama、LM Studio）可以不填', 'Stored encrypted by Folia; not needed for local servers') },
  { key: 'thinking', type: 'select', group: T('接口', 'API'), label: T('关闭“思考”', 'Turn reasoning off'),
    description: T('很多模型默认先“思考”，费用翻 2–3 倍、耗时 20–60 秒，这个任务用不上。“自动”按服务商选择关闭方式；面板提示“模型在思考”时再手动换一种', 'Reasoning costs 2-3x and is not needed here'),
    defaultValue: 'auto', options: [
      { value: 'auto', label: T('自动（推荐）', 'Auto (recommended)') },
      { value: 'thinking', label: T('thinking: disabled（DeepSeek、智谱、豆包）', 'thinking: disabled') },
      { value: 'enable_thinking', label: T('enable_thinking: false（通义千问、硅基流动）', 'enable_thinking: false') },
      { value: 'reasoning_effort', label: T('reasoning_effort: low（OpenAI、Gemini）', 'reasoning_effort: low') },
      { value: 'none', label: T('不发送（模型本身不思考时）', 'Send nothing') },
    ] },
  { key: 'temperature', type: 'number', group: T('接口', 'API'), label: T('温度', 'Temperature'),
    description: T('越低越稳定', 'Lower is steadier'), defaultValue: 0.3, min: 0, max: 1, step: 0.05 },
  { key: 'autoDecide', type: 'boolean', group: T('行为', 'Behaviour'), label: T('换歌时自动决策', 'Decide on every song change'), defaultValue: true },
  { key: 'applyParams', type: 'boolean', group: T('行为', 'Behaviour'), label: T('同时调整参数', 'Apply parameters too'),
    description: T('关闭则只切换模式。第一次改动前会保存快照，可以随时恢复', 'Off: switch the mode only'), defaultValue: true },
  { key: 'beatFx', type: 'boolean', group: T('行为', 'Behaviour'), label: T('同时调整智能动感（鼓点效果）', 'Set beat effects too'),
    description: T('需要先在 Folia 的歌词样式→全局里打开智能动感。AI 会为每首歌决定当前模式的鼓点效果（如凝彩的墨染奥行）开不开、多强', 'Needs Smart beat on in Folia'), defaultValue: true },
  { key: 'learnTaste', type: 'boolean', group: T('行为', 'Behaviour'), label: T('学习我的口味', 'Learn my taste'),
    description: T('手动换模式、点 👍 / 👎 会被记下（最近 30 条），之后相似的歌会参考。可在面板里清除', 'Manual switches and 👍 / 👎 shape later picks'), defaultValue: true },
  { key: 'remember', type: 'boolean', group: T('行为', 'Behaviour'), label: T('记住每首歌的选择', 'Remember each song'), defaultValue: true },
  { key: 'prefetch', type: 'boolean', group: T('行为', 'Behaviour'), label: T('提前为下一首做准备', 'Prepare the next song'),
    description: T('当前这首放着时就先决定好队列里的下一首，切歌瞬间直接套用（只支持在线歌曲，需要打开“记住每首歌的选择”）', 'Decide the next queued song in the background'), defaultValue: true },
  { key: 'economy', type: 'boolean', group: T('行为', 'Behaviour'), label: T('省钱模式', 'Economy mode'),
    description: T('本地打分第一名明显领先时跳过第 2 步', 'Skip step 2 when the local ranking is clear'), defaultValue: false },
  { key: 'userHint', type: 'text', group: T('行为', 'Behaviour'), label: T('偏好提示（可选）', 'Preference hint'),
    description: T('例如“整体安静一点”“少用群唱”', 'e.g. "calmer overall"'), defaultValue: '' },
  { key: 'currency', type: 'select', group: T('花费显示', 'Cost'), label: T('货币', 'Currency'), defaultValue: 'CNY', options: [
    { value: 'CNY', label: T('人民币 ¥', 'CNY ¥') },
    { value: 'USD', label: T('美元 $', 'USD $') },
  ] },
  { key: 'priceIn', type: 'number', group: T('花费显示', 'Cost'), label: T('输入单价（每百万 token）', 'Input price per 1M tokens'),
    description: T('照服务商价格页填，只用于面板估算花费；填 0 只显示 token 数', 'From the price page of your provider; 0 shows tokens only'), defaultValue: 0, min: 0, max: 200, step: 0.01 },
  { key: 'priceOut', type: 'number', group: T('花费显示', 'Cost'), label: T('输出单价（每百万 token）', 'Output price per 1M tokens'), defaultValue: 0, min: 0, max: 400, step: 0.01 },
  // Only in a developer build (node dev/build.mjs --dev); the release has no evaluator.
  ...(createEvaluator ? [{ key: 'devTools', type: 'boolean', group: T('开发者', 'Developer'), label: T('显示评测工具', 'Show evaluation tools'),
    description: T('在面板和命令面板里加“评测”：用内置的 42 首歌跑一遍，看选择和人工标注对得上多少。一次约 60 次调用', 'Run the built-in 42-song evaluation; about 60 calls'), defaultValue: false }] : []),
];

export default async function activate(folium) {
  if ((folium.host?.folium?.minor ?? 0) < 8) {
    folium.ui.toast('AI 歌词动画导演 Plus 需要 Folium 1.8 或更新版本的 Folia', { type: 'error' });
    return undefined;
  }

  const section = folium.registries.settingsSections.register({
    id: 'main',
    label: T('AI 歌词动画导演 Plus', 'AI lyric director Plus'),
    description: T('选服务商、填模型名和 API 密钥，然后在播放器面板「AI 导演」里点“测试连接”', 'Pick a provider, model and key, then "Test connection" in the panel'),
    settings: SETTINGS,
  });
  const settings = () => {
    const values = section.settings.get();
    return {
      provider: String(values.provider ?? 'custom'),
      baseUrl: String(values.baseUrl ?? '').trim(),
      model: String(values.model ?? '').trim(),
      thinking: String(values.thinking ?? 'auto'),
      temperature: Number(values.temperature ?? 0.3),
      autoDecide: values.autoDecide !== false,
      applyParams: values.applyParams !== false,
      beatFx: values.beatFx !== false,
      learnTaste: values.learnTaste !== false,
      remember: values.remember !== false,
      prefetch: values.prefetch !== false,
      economy: values.economy === true,
      userHint: String(values.userHint ?? '').trim().slice(0, 100),
      currency: values.currency === 'USD' ? '$' : '¥',
      priceIn: Number(values.priceIn ?? 0),
      priceOut: Number(values.priceOut ?? 0),
      devTools: values.devTools === true && Boolean(createEvaluator),
    };
  };

  const renderers = new Set();
  const host = createHostAdapter(folium);
  const store = createStore(folium.storage, folium.log);
  const director = createDirector({
    folium,
    host,
    store,
    settings,
    onChange: () => renderers.forEach((render) => render()),
  });
  const evaluator = createEvaluator?.({ folium, store, settings, ...director.forEvaluation() }) ?? null;

  folium.events.on('playback.songChanged', ({ song }) => director.onSongChanged(song));
  folium.events.on('lyrics.loaded', ({ song, lines }) => director.onLyricsLoaded(song, lines));
  folium.events.on('theme.changed', ({ theme }) => director.onThemeChanged(theme));
  folium.events.on('visualizer.modeChanged', ({ mode, origin }) => director.onModeChanged(mode, origin));
  folium.events.on('playback.queueChanged', () => director.onQueueChanged());
  folium.events.on('playback.loopModeChanged', () => director.onQueueChanged());
  folium.secrets.subscribe((key) => {
    if (key === 'apiKey') director.onSetupChanged();
  });
  section.settings.onChange(() => {
    director.onSetupChanged();
    director.onQueueChanged();
    syncEvalCommand();
  });

  folium.registries.playerPanelTabs.register({
    id: PANEL_ID,
    label: T('AI 导演', 'AI director'),
    order: 600,
    mount: (container, ctx) => mountPanel(container, ctx, {
      director,
      evaluator,
      folium,
      settings,
      onRender: (render) => {
        renderers.add(render);
        return () => renderers.delete(render);
      },
    }),
  });

  const command = (id, zh, en, run, keywords = []) => folium.registries.commands.register({
    id,
    label: T(zh, en),
    keywords: ['ai', '导演', 'director', ...keywords],
    run,
  });
  command('decide', 'AI 导演 Plus：为这首歌决策', 'AI director Plus: decide this song', () => director.decideNow());
  command('like', 'AI 导演 Plus：这个模式合适 👍', 'AI director Plus: this fits 👍', () => director.feedback('up'), ['喜欢', '合适']);
  command('dislike', 'AI 导演 Plus：不合适，换一个 👎', 'AI director Plus: does not fit, pick another 👎', () => director.feedback('down'), ['不喜欢', '换']);
  command('redecide', 'AI 导演 Plus：重新挑选模式', 'AI director Plus: pick again', () => director.decideNow({ force: true }), ['重新']);
  command('rebrief', 'AI 导演 Plus：重新理解整首歌', 'AI director Plus: re-analyse the song', () => director.decideNow({ force: true, rebrief: true }), ['重新', '分析']);
  command('test', 'AI 导演 Plus：测试连接', 'AI director Plus: test connection', async () => {
    const report = await director.testConnection();
    if (report.chatError) return `连接失败：${report.chatError}`;
    if (!report.chat) return report.modelsError ? `获取模型失败：${report.modelsError}` : `连接正常，可用模型 ${report.models?.length ?? 0} 个，请在设置里填模型名`;
    return `连接正常：${report.chat.ms} ms${report.chat.thought ? '，但模型在“思考”，建议换一种关闭思考的方式' : ''}`;
  }, ['测试', '连接']);
  // About 60 calls a run: listed only while the developer switch is on.
  let evalCommand = null;
  const syncEvalCommand = () => {
    if (settings().devTools && !evalCommand) {
      evalCommand = command('evaluate', 'AI 导演 Plus：运行评测集', 'AI director Plus: run the evaluation set', () => evaluator.evaluate(), ['评测', 'eval']);
    } else if (!settings().devTools && evalCommand) {
      evalCommand.unregister();
      evalCommand = null;
    }
  };
  syncEvalCommand();
  command('restore', 'AI 导演 Plus：恢复原来的设置', 'AI director Plus: restore my settings', () => director.restore(), ['恢复', '还原']);
  command('open', 'AI 导演 Plus：打开面板', 'AI director Plus: open panel', () => {
    folium.ui.openPlayerPanel(PANEL_ID);
    return '已打开';
  }, ['面板']);

  // Not awaited: the first song may wait for a lyric gap, and activation must not.
  director.start().catch((error) => folium.log.warn('启动时处理当前歌曲出错', { message: String(error?.message ?? error) }));
  return () => director.dispose();
}
