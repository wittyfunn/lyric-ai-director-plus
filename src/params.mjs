// Parameter whitelist, ranges and switch dependencies for the builtin modes.
// MODE_PARAMS and PARAM_GATES are taken from duoduo1232/lyric-ai-director
// (MIT, https://github.com/duoduo1232/lyric-ai-director): ranges mirror what the
// host setters clamp to, gates were read off the renderer source by that author.
// Added here: `hanabi` (found in Folia 0.7.22 by M0; no tunables known yet, so
// it can be chosen but not tuned), the 0.7.23 tempera depth values, the beat
// effects of 智能动感 (BEAT_EFFECTS), and the helpers the director needs.

export const MODE_PARAMS = {
  classic: {
    setter: 'handleSetClassicTuning',
    params: {
      enableWordRotation: { kind: 'boolean', zh: '逐字旋转' },
      breathingFloatMultiplier: { kind: 'number', min: 0, max: 2, zh: '呼吸浮动' },
      wordSpacing: { kind: 'number', min: 0, max: 2, zh: '词间距' },
      useLegacyLayout: { kind: 'boolean', zh: '旧版排版' },
    },
  },
  cadenza: {
    setter: 'handleSetCadenzaTuning',
    // 心象没有设置面板，宿主 setter 只做 {...prev, ...patch} 合并（无 clamp），
    // 这里的范围是模组自定的合理区间；每次写入宿主都会把 beamIntensity 归零。
    params: {
      fontScale: { kind: 'number', min: 0.6, max: 2, zh: '字号' },
      widthRatio: { kind: 'number', min: 0.3, max: 1, zh: '行宽占比' },
      motionAmount: { kind: 'number', min: 0, max: 2, zh: '运动量' },
      glowIntensity: { kind: 'number', min: 0, max: 2, zh: '光晕强度' },
    },
  },
  partita: {
    setter: 'handleSetPartitaTuning',
    params: {
      showGuideLines: { kind: 'boolean', zh: '参考线' },
      useSemanticLayout: { kind: 'boolean', zh: '语义排版' },
      staggerMin: { kind: 'number', min: 0, max: 180, zh: '入场错开下限' },
      staggerMax: { kind: 'number', min: 0, max: 180, zh: '入场错开上限' },
    },
  },
  fume: {
    setter: 'handleSetFumeTuning',
    params: {
      hidePrintSymbols: { kind: 'boolean', zh: '隐藏印刷符号' },
      disableGeometricBackground: { kind: 'boolean', zh: '关闭几何背景' },
      backgroundObjectOpacity: { kind: 'number', min: 0, max: 1, zh: '背景元素不透明度' },
      textHoldRatio: { kind: 'number', min: 0, max: 1, zh: '文字停留比例' },
      cameraTrackingMode: { kind: 'select', options: ['stepped', 'smooth'], zh: '镜头跟随' },
      cameraSpeed: { kind: 'number', min: 0.55, max: 1.85, zh: '镜头速度' },
      glowIntensity: { kind: 'number', min: 0, max: 1.8, zh: '辉光强度' },
      heroScale: { kind: 'number', min: 0.82, max: 1.32, zh: '主字缩放' },
    },
  },
  claddagh: {
    setter: 'handleSetCladdaghTuning',
    params: {
      focusScaleRatio: { kind: 'number', min: 0, max: 1.5, zh: '聚焦缩放' },
      radiusScale: { kind: 'number', min: 0.5, max: 1.5, zh: '环半径' },
      ellipseTiltDeg: { kind: 'number', min: 0, max: 60, zh: '环倾角' },
      showAxisLine: { kind: 'boolean', zh: '轴线' },
      letterSpacingOffset: { kind: 'number', min: -5, max: 20, zh: '字距偏移' },
    },
  },
  cappella: {
    setter: 'handleSetCappellaTuning',
    params: {
      showEmoMessages: { kind: 'boolean', zh: '表情消息' },
      emojiPackSource: { kind: 'select', options: ['builtin', 'custom'], zh: '表情包来源' },
      avatarSource: { kind: 'select', options: ['builtin', 'cover', 'color', 'custom'], zh: '头像来源' },
    },
  },
  tilt: {
    setter: 'handleSetTiltTuning',
    params: {
      splitProbability: { kind: 'number', min: 0, max: 1, zh: '裂开概率' },
      tiltStyleProbability: { kind: 'number', min: 0, max: 1, zh: '倾斜样式概率' },
      colorScheme: { kind: 'select', options: ['default', 'swap', 'accentAll', 'primaryAll'], zh: '配色方案' },
    },
  },
  monet: {
    setter: 'handleSetMonetTuning',
    params: {
      keywordColoringEnabled: { kind: 'boolean', zh: '关键词着色' },
      audioStyle: { kind: 'select', options: ['bar', 'line'], zh: '音频样式' },
      showDescription: { kind: 'boolean', zh: '显示简介' },
      showAudioVisualization: { kind: 'boolean', zh: '音频可视化' },
      fontScale: { kind: 'number', min: 0.7, max: 1.5, zh: '字号' },
      portraitStyle: { kind: 'select', options: ['square', 'rectangular'], zh: '封面样式' },
    },
  },
  diorama: {
    setter: 'handleSetDioramaTuning',
    params: {
      cameraSpeed: { kind: 'number', min: 0.55, max: 1.85, zh: '镜头速度' },
      motionAmount: { kind: 'number', min: 0.4, max: 1.6, zh: '运动量' },
      audioReactivity: { kind: 'number', min: 0, max: 1.5, zh: '音频响应' },
      particleScale: { kind: 'number', min: 0.65, max: 1.6, zh: '粒子缩放' },
      showParticles: { kind: 'boolean', zh: '显示粒子' },
      glowEnabled: { kind: 'boolean', zh: '普通辉光跟唱' },
      glowIntensity: { kind: 'number', min: 0.1, max: 1.5, zh: '辉光强度' },
      soulEnabled: { kind: 'boolean', zh: '灵魂出窍跟唱' },
      soulIntensity: { kind: 'number', min: 0.1, max: 1.5, zh: '灵魂出窍强度' },
      gradientEnabled: { kind: 'boolean', zh: '渐变跟唱' },
      gradientIntensity: { kind: 'number', min: 0.1, max: 1.5, zh: '渐变强度' },
      keywordColoringEnabled: { kind: 'boolean', zh: '关键词着色' },
      soulActiveEnabled: { kind: 'boolean', zh: '当前字跟随漂移' },
      particleGlowEnabled: { kind: 'boolean', zh: '粒子光晕' },
      particleGlowIntensity: { kind: 'number', min: 0.1, max: 1.5, zh: '粒子光晕强度' },
    },
  },
  pendolo: {
    setter: 'handleSetPendoloTuning',
    params: {
      arcRadius: { kind: 'number', min: 0.25, max: 0.8, zh: '弧半径' },
      arcAngleDeg: { kind: 'number', min: 40, max: 160, zh: '弧角度' },
      tickSnappiness: { kind: 'number', min: 0.5, max: 2, zh: '走时干脆度' },
      activeScale: { kind: 'number', min: 1, max: 1.6, zh: '当前行缩放' },
      showGearDecor: { kind: 'select', options: ['none', 'subtle', 'full'], zh: '齿轮装饰' },
      showCenterGradient: { kind: 'boolean', zh: '中心渐变' },
      showCoverOnWatchFace: { kind: 'boolean', zh: '表盘显示封面' },
      enableLineGlow: { kind: 'boolean', zh: '行发光' },
    },
  },
  sonnet: {
    setter: 'handleSetSonnetTuning',
    params: {
      cameraIntensity: { kind: 'number', min: 0, max: 2, zh: '相机强度' },
      typographyMotion: { kind: 'number', min: 0, max: 2, zh: '字体运动' },
      mgDensity: { kind: 'number', min: 0, max: 2, zh: '动图密度' },
      showOnlyText: { kind: 'boolean', zh: '只显示文字' },
      showGuide: { kind: 'boolean', zh: '参考线' },
      showBackgroundMg: { kind: 'boolean', zh: '背景动图' },
      showFixedGeo: { kind: 'boolean', zh: '固定几何' },
      showGiantDecorativeText: { kind: 'boolean', zh: '巨型装饰字' },
      showBackgroundDecor: { kind: 'boolean', zh: '背景装饰' },
      enableTransitions: { kind: 'boolean', zh: '转场' },
      outerFrameMode: { kind: 'select', options: ['none', 'frame', 'full'], zh: '外框' },
      textureResolution: { kind: 'number', min: 0.5, max: 4, zh: '纹理分辨率' },
      postProcessEnabled: { kind: 'boolean', zh: '后处理总开关' },
      postProcessGrain: { kind: 'number', min: 0, max: 1, zh: '胶片颗粒' },
      postProcessContrast: { kind: 'number', min: 0, max: 1, zh: '对比度' },
      postProcessRgbShift: { kind: 'number', min: 0, max: 1, zh: 'RGB 偏移' },
      postProcessHalftone: { kind: 'number', min: 0, max: 1, zh: '半调网屏' },
      postProcessVignette: { kind: 'number', min: 0, max: 2, zh: '暗角' },
      postProcessLensDistortion: { kind: 'number', min: 0, max: 2, zh: '镜头畸变' },
      postProcessLensDispersion: { kind: 'number', min: 0, max: 1, zh: '镜头色散' },
    },
  },
  tempera: {
    setter: 'handleSetTemperaTuning',
    params: {
      cameraIntensity: { kind: 'number', min: 0, max: 2, zh: '相机强度' },
      glyphMotion: { kind: 'number', min: 0, max: 2, zh: '逐字入场' },
      wholeLineLyrics: { kind: 'boolean', zh: '整行不切分' },
      glyphSettleStretch: { kind: 'number', min: 0, max: 1, zh: '逐字入场时序' },
      // Folia 0.7.23: the depth of 墨染奥行, live only while that beat effect plays.
      depthOfField: { kind: 'number', min: 0, max: 2, zh: '景深' },
      depthPan: { kind: 'number', min: 0, max: 2, zh: '镜头平移' },
      glyphDepth: { kind: 'number', min: 0, max: 2, zh: '歌词远近' },
      colorMode: { kind: 'select', options: ['duo', 'mono', 'gradient'], zh: '配色模式' },
      showBlocks: { kind: 'boolean', zh: '色块' },
      showDecor: { kind: 'boolean', zh: '装饰' },
      showCornerMarks: { kind: 'boolean', zh: '角标' },
      textInversion: { kind: 'boolean', zh: '文字动态反色' },
      enableTransitions: { kind: 'boolean', zh: '转场' },
      textureResolution: { kind: 'number', min: 0.5, max: 4, zh: '纹理分辨率' },
      postProcessEnabled: { kind: 'boolean', zh: '后处理总开关' },
      postProcessGrain: { kind: 'number', min: 0, max: 1, zh: '颗粒' },
      postProcessContrast: { kind: 'number', min: 0, max: 1, zh: '对比度' },
      postProcessRgbShift: { kind: 'number', min: 0, max: 1, zh: 'RGB 偏移' },
      postProcessVignette: { kind: 'number', min: 0, max: 2, zh: '暗角' },
      postProcessLensDistortion: { kind: 'number', min: 0, max: 2, zh: '镜头畸变' },
    },
  },
  lumiere: {
    setter: 'handleSetLumiereTuning',
    params: {
      lightIntensity: { kind: 'number', min: 0.3, max: 2, zh: '光强' },
      audioResponse: { kind: 'number', min: 0, max: 2, zh: '随音乐变亮' },
      fogDensity: { kind: 'number', min: 0, max: 2, zh: '烟雾浓度' },
      fogOctaves: { kind: 'number', min: 2, max: 6, zh: '烟雾细节' },
      moteAmount: { kind: 'number', min: 0, max: 2, zh: '浮尘数量' },
      bloom: { kind: 'number', min: 0, max: 2, zh: '图形辉光' },
      textBloom: { kind: 'number', min: 0, max: 2, zh: '文字辉光' },
      unlitOpacity: { kind: 'number', min: 0.05, max: 0.6, zh: '未唱字透明度' },
      darkField: { kind: 'number', min: 0, max: 1, zh: '暗场强度' },
      decay: { kind: 'number', min: 0, max: 2, zh: '崩解强度' },
      echo: { kind: 'number', min: 0, max: 2, zh: '背景歌词亮度' },
      windowNeighbors: { kind: 'select', options: [1, 2], zh: '邻行数' },
      lineArt: { kind: 'boolean', zh: '线稿' },
      frontBokeh: { kind: 'boolean', zh: '前景散景' },
      trails: { kind: 'boolean', zh: '轨迹线' },
      seamlessTransitions: { kind: 'boolean', zh: '无缝转场' },
      overlayFrame: { kind: 'boolean', zh: '画框' },
      textOnly: { kind: 'boolean', zh: '仅歌词文字' },
      keywordColors: { kind: 'boolean', zh: '关键词着色' },
      themeIcons: { kind: 'boolean', zh: '主题图标' },
      themeColorMix: { kind: 'number', min: 0, max: 1, zh: '主题色占比' },
      renderQuality: { kind: 'select', options: ['full', 'balanced', 'low'], zh: '画质' },
    },
  },
  still: { setter: null, params: {} },
  hanabi: { setter: null, params: {} },
};

export const PARAM_GATES = {
  classic: {
    // wordSpacing is only consumed by the modern layout.
    wordSpacing: { key: 'useLegacyLayout', mustBe: false },
  },
  cappella: {
    // The emoji pool is only reached from the emo-message branch.
    emojiPackSource: { key: 'showEmoMessages', mustBe: true },
  },
  monet: {
    audioStyle: { key: 'showAudioVisualization', mustBe: true },
  },
  pendolo: {
    // The whole clockwork canvas (line glow included) is skipped at 'none'.
    enableLineGlow: { key: 'showGearDecor', not: 'none', setTo: 'subtle' },
  },
  sonnet: {
    postProcessGrain: { key: 'postProcessEnabled', mustBe: true },
    postProcessContrast: { key: 'postProcessEnabled', mustBe: true },
    postProcessRgbShift: { key: 'postProcessEnabled', mustBe: true },
    postProcessHalftone: { key: 'postProcessEnabled', mustBe: true },
    postProcessVignette: { key: 'postProcessEnabled', mustBe: true },
    postProcessLensDistortion: { key: 'postProcessEnabled', mustBe: true },
    postProcessLensDispersion: { key: 'postProcessEnabled', mustBe: true },
    // MG density needs the background layer, which 'only text' hides entirely.
    mgDensity: [
      { key: 'showBackgroundMg', mustBe: true },
      { key: 'showOnlyText', mustBe: false },
    ],
    showBackgroundMg: { key: 'showOnlyText', mustBe: false },
    showFixedGeo: { key: 'showOnlyText', mustBe: false },
    showBackgroundDecor: { key: 'showOnlyText', mustBe: false },
    showGuide: { key: 'showOnlyText', mustBe: false },
    outerFrameMode: { key: 'showOnlyText', mustBe: false },
  },
  tempera: {
    postProcessGrain: { key: 'postProcessEnabled', mustBe: true },
    postProcessContrast: { key: 'postProcessEnabled', mustBe: true },
    postProcessRgbShift: { key: 'postProcessEnabled', mustBe: true },
    postProcessVignette: { key: 'postProcessEnabled', mustBe: true },
    postProcessLensDistortion: { key: 'postProcessEnabled', mustBe: true },
  },
  diorama: {
    particleGlowIntensity: { key: 'particleGlowEnabled', mustBe: true },
    glowIntensity: { key: 'glowEnabled', mustBe: true },
    soulIntensity: { key: 'soulEnabled', mustBe: true },
    soulActiveEnabled: { key: 'soulEnabled', mustBe: true },
    gradientIntensity: { key: 'gradientEnabled', mustBe: true },
  },
  lumiere: {
    // `textOnly` stops the whole graphics group from rendering.
    themeIcons: { key: 'textOnly', mustBe: false },
    echo: { key: 'textOnly', mustBe: false },
    frontBokeh: { key: 'textOnly', mustBe: false },
    lineArt: { key: 'textOnly', mustBe: false },
    moteAmount: { key: 'textOnly', mustBe: false },
    bloom: { key: 'textOnly', mustBe: false },
    fogDensity: { key: 'textOnly', mustBe: false },
    fogOctaves: { key: 'textOnly', mustBe: false },
    overlayFrame: { key: 'textOnly', mustBe: false },
    renderQuality: { key: 'textOnly', mustBe: false },
  },
};

/* Values that only show while a beat effect plays (not a tuning switch, so not
 * in PARAM_GATES: nothing here can turn it on, and writing them is harmless). */
export const EFFECT_GATES = {
  tempera: { depthOfField: 'tempera.inkFlash', depthPan: 'tempera.inkFlash', glyphDepth: 'tempera.inkFlash' },
};

/*
 * 智能动感 (Folia 0.7.23 `smartBeat`): per-mode effects driven by the beats
 * beat_this finds or the drums HTDemucs separates. Each is { on, strength 0~2 };
 * one never set counts as on at strength 1, and none plays while the global
 * switch is off. Ids come from the live registry (retired ones are skipped);
 * this table only adds what the model needs to judge them.
 */
export const BEAT_EFFECTS = {
  'tempera.inkFlash': { zh: '墨染奥行', source: 'drums',
    effect: '底鼓、军鼓打下时一团强调色墨渍晕开；同时给画面加景深、镜头平移和歌词远近（depthOfField/depthPan/glyphDepth 只在它开着时生效）' },
  'sonnet.lensTear': { zh: '推镜裂光', source: 'beats', effect: '每拍镜头推近，小节第一拍画面撕裂并泛起辉光，很冲' },
  'diorama.ripple': { zh: '水镜涟漪', source: 'beats', effect: '粒子每拍泛起涟漪，小节第一拍大涟漪，正在唱的字随拍跳动' },
  'pendolo.drumhead': { zh: '仿真鼓面', source: 'drums', effect: '底鼓让表盘鼓起、重拍震屏，军鼓让表盘倾斜，镲片点亮刻度' },
  'hanabi.beatBursts': { zh: '随拍烟花', source: 'beats', effect: '每拍天空开一朵小烟花，小节第一拍升空大烟花，拍越重开得越大' },
  'hanabi.beatPulse': { zh: '随拍推镜', source: 'beats', effect: '整个画面每拍推近一下、轻轻一摆，小节第一拍推得更深' },
};

export const EFFECT_DEFAULT = { on: true, strength: 1 };

/** `{ id: { on, strength } }` for the effects `allowed` lists; strength in 0~2, steps of 0.05. */
export const sanitizeEffects = (raw, allowed) => {
  if (!raw || typeof raw !== 'object') return {};
  const clean = {};
  for (const id of allowed) {
    const value = raw[id];
    if (value === undefined || value === null) continue;
    const entry = typeof value === 'object' ? value : { on: value };
    const on = entry.on === true || entry.on === 'true' ? true : entry.on === false || entry.on === 'false' ? false : undefined;
    if (on === undefined) continue;
    const strength = Number(entry.strength);
    clean[id] = Number.isFinite(strength)
      ? { on, strength: Math.round(Math.min(2, Math.max(0, strength)) * 20) / 20 }
      : { on };
  }
  return clean;
};

/** One line per effect for the prompt. */
export const effectSpecLines = (ids) => ids
  .filter((id) => BEAT_EFFECTS[id])
  .map((id) => `- ${id}（${BEAT_EFFECTS[id].zh}，跟${BEAT_EFFECTS[id].source === 'drums' ? '鼓声' : '节拍'}）：${BEAT_EFFECTS[id].effect}`);

/** `handleSetSonnetTuning` -> `sonnetTuning`, the store field the setter writes. */
export const tuningKeyOf = (mode) => {
  const match = /^handleSet([A-Za-z]+)Tuning$/.exec(String(MODE_PARAMS[mode]?.setter ?? ''));
  if (!match) return null;
  return `${match[1].charAt(0).toLowerCase()}${match[1].slice(1)}Tuning`;
};

export const gatesFor = (mode, key) => {
  const raw = PARAM_GATES[mode]?.[key];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
};

/* No tuning read means the gate cannot be proven closed, so nothing is claimed. */
export const gateSatisfied = (tuning, gate) => {
  if (!tuning) return true;
  const value = tuning[gate.key];
  if (gate.not !== undefined) return value !== gate.not;
  return value === gate.mustBe;
};

/* Asking for less (a switch off, an amount of zero) works with the gate closed. */
export const isInertValue = (param, value) => {
  if (!param) return false;
  if (param.kind === 'boolean') return value === false;
  if (param.kind === 'number') return value === 0;
  return false;
};

const normalizeParam = (param, value) => {
  if (param.kind === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }
  if (param.kind === 'select') {
    const options = param.options ?? [];
    if (options.includes(value)) return value;
    const asNumber = Number(value);
    return Number.isFinite(asNumber) && options.includes(asNumber) ? asNumber : undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.round(Math.min(param.max, Math.max(param.min, numeric)) * 1000) / 1000;
};

/** Whitelisted and clamped: unknown keys are dropped, numbers are pulled into range. */
export const sanitizeParams = (mode, raw) => {
  const spec = MODE_PARAMS[mode];
  if (!spec || !raw || typeof raw !== 'object') return {};
  const clean = {};
  for (const [key, value] of Object.entries(raw)) {
    const param = spec.params[key];
    if (!param) continue;
    const normalized = normalizeParam(param, value);
    if (normalized !== undefined) clean[key] = normalized;
  }
  return clean;
};

/** One line per mode for the prompt: `key(range)中文名[需 gate]`. */
export const paramSpecLine = (mode, keys = null) => {
  const spec = MODE_PARAMS[mode];
  if (!spec) return '';
  return Object.entries(spec.params)
    .filter(([key]) => !keys || keys.includes(key))
    .map(([key, param]) => {
      let text;
      if (param.kind === 'boolean') text = `${key}(true|false)`;
      else if (param.kind === 'select') text = `${key}(${param.options.join('|')})`;
      else text = `${key}(${param.min}~${param.max})`;
      const gates = gatesFor(mode, key);
      if (gates.length > 0) {
        text += `[需 ${gates.map((gate) => (gate.not !== undefined ? `${gate.key}≠${gate.not}` : `${gate.key}=${gate.mustBe}`)).join(' 且 ')}]`;
      }
      const effect = EFFECT_GATES[mode]?.[key];
      if (effect) text += `[需效果 ${effect} 开]`;
      return `${text}${param.zh}`;
    })
    .join('，');
};
