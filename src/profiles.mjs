// Mode profiles: what each builtin mode looks like, on the same five axes the
// song brief scores, plus the tags it suits or clashes with and what its most
// useful knobs do. `host` is Folia's own one-line description from its mode
// picker (read in Folia 0.7.22); axes, tags and knob notes are first-draft
// judgements to be tuned against the M2 evaluation set.
//
// Axes, each 0..1:
//   motion   how much moves (camera, glyphs, transitions)
//   density  how much text and decoration is on screen at once
//   warmth   cold/technical (0) to warm/organic (1)
//   space    flat poster (0) to deep 3D space (1)
//   story    how strongly it reads as a narrative sequence of lines

export const PROFILE_VERSION = 3;

/** The tag vocabulary the brief picks from; the ranker matches on these. */
export const TAGS = [
  // genre
  '流行', '抒情', '民谣', '摇滚', '说唱', '电子', 'R&B', '爵士', '古风', '动漫', '管弦', '纯音乐',
  // mood
  '温柔', '伤感', '怀旧', '浪漫', '治愈', '激昂', '愤怒', '俏皮', '梦幻', '孤独', '释然', '壮阔', '暗黑',
  // theme
  '叙事', '对唱', '独白', '城市', '夜晚', '夏天', '青春', '时间', '自然', '科幻', '离别', '庆祝',
];

export const PROFILES = {
  classic: {
    name: '流光',
    host: '单行大字居中，逐字旋转点亮，整行随呼吸轻浮',
    axes: { motion: 0.4, density: 0.2, warmth: 0.55, space: 0.25, story: 0.4 },
    energy: [0.25, 0.75],
    fit: ['流行', '抒情', '温柔', '治愈', '青春'],
    avoid: ['说唱', '壮阔'],
    knobs: {
      breathingFloatMultiplier: '整行上下浮动的幅度；安静的歌调低，轻快的歌调高',
      enableWordRotation: '逐字点亮时的旋转；关掉更克制',
    },
  },
  cadenza: {
    name: '心象',
    host: '整句拆成单字散落画面，像脑海里浮起的碎片',
    axes: { motion: 0.6, density: 0.55, warmth: 0.5, space: 0.6, story: 0.3 },
    energy: [0.35, 0.9],
    fit: ['梦幻', '孤独', '电子', '独白', '伤感'],
    avoid: ['叙事', '对唱'],
    knobs: {
      motionAmount: '碎字漂移的幅度',
      glowIntensity: '光晕和光束的强度；情绪外放时调高',
      fontScale: '字号；字少的歌可以放大',
    },
  },
  partita: {
    name: '云阶',
    host: '歌词沿引导线逐块错落下行，像一级级云中阶梯',
    axes: { motion: 0.4, density: 0.5, warmth: 0.5, space: 0.45, story: 0.75 },
    energy: [0.2, 0.65],
    fit: ['民谣', '叙事', '温柔', '怀旧', '释然'],
    avoid: ['说唱', '愤怒', '电子'],
    knobs: {
      staggerMax: '逐块入场的最大错开；越大越舒缓（需不小于 staggerMin）',
      useSemanticLayout: '按语义断句排版；歌词句子长时打开',
      showGuideLines: '显示引导线；想更干净就关掉',
    },
  },
  fume: {
    name: '浮名',
    host: '满屏歌词层层堆叠，镜头追着当前句推移，虚实之间浮沉',
    axes: { motion: 0.5, density: 0.85, warmth: 0.6, space: 0.6, story: 0.65 },
    energy: [0.3, 0.8],
    fit: ['说唱', '怀旧', '伤感', '城市', '夜晚', '独白'],
    avoid: ['纯音乐', '俏皮'],
    knobs: {
      cameraSpeed: '镜头追当前句的速度',
      glowIntensity: '当前句的辉光',
      textHoldRatio: '唱完后文字停留的比例；字多的歌调低以免糊成一片',
      backgroundObjectOpacity: '背景堆叠文字的不透明度；调低更聚焦当前句',
    },
  },
  tilt: {
    name: '倾诉',
    host: '长句自动断行，随机斜体强调，像有人凑近低声说话',
    axes: { motion: 0.45, density: 0.4, warmth: 0.65, space: 0.3, story: 0.7 },
    energy: [0.2, 0.8],
    fit: ['独白', 'R&B', '说唱', '孤独', '伤感', '夜晚'],
    avoid: ['壮阔', '管弦', '庆祝'],
    knobs: {
      tiltStyleProbability: '每行用倾斜强调样式的概率；情绪越躁动越高',
      splitProbability: '整行裂开的概率；激烈处调高，安静的歌调低',
      colorScheme: '配色方案',
    },
  },
  claddagh: {
    name: '回环',
    host: '歌词沿倾斜圆环轨道循环推进，大小对比拉开纵深',
    axes: { motion: 0.55, density: 0.45, warmth: 0.6, space: 0.75, story: 0.3 },
    energy: [0.3, 0.75],
    fit: ['浪漫', '梦幻', '电子', '时间'],
    avoid: ['说唱', '愤怒'],
    knobs: {
      radiusScale: '圆环大小',
      ellipseTiltDeg: '圆环倾斜角；越大纵深感越强',
      focusScaleRatio: '当前句相对其他句的放大比例',
    },
  },
  monet: {
    name: '莫奈',
    host: '海报式版面：左侧歌词轨、右侧肖像、底部频谱',
    axes: { motion: 0.2, density: 0.5, warmth: 0.6, space: 0.15, story: 0.5 },
    energy: [0.15, 0.6],
    fit: ['爵士', '民谣', '怀旧', '温柔', '抒情'],
    avoid: ['电子', '激昂', '科幻'],
    keywords: ['爵士', '酒', '咖啡', '老唱片', '旧照片', '画', '月亮'],
    knobs: {
      fontScale: '歌词字号',
      showAudioVisualization: '底部频谱；纯人声或很安静的歌可以关掉',
      keywordColoringEnabled: '关键词着色',
    },
  },
  pendolo: {
    name: '时计',
    host: '封面嵌进钟表盘，歌词沿弧线随摆锤一格格推过',
    axes: { motion: 0.35, density: 0.35, warmth: 0.45, space: 0.4, story: 0.55 },
    energy: [0.25, 0.65],
    fit: ['时间', '怀旧', '离别', '释然'],
    avoid: ['俏皮', '愤怒'],
    keywords: ['时钟', '钟表', '十年', '时光', '倒数', '等待', '岁月'],
    knobs: {
      tickSnappiness: '摆锤走一格的干脆程度；节奏感强的歌调高',
      showGearDecor: '齿轮装饰的多少',
      enableLineGlow: '当前句发光（齿轮装饰为 none 时无效）',
    },
  },
  cappella: {
    name: '群唱',
    host: '歌词化成聊天气泡左右往返，配头像与表情，像一场对唱',
    axes: { motion: 0.4, density: 0.55, warmth: 0.8, space: 0.15, story: 0.65 },
    energy: [0.3, 0.8],
    fit: ['对唱', '俏皮', '浪漫'],
    avoid: ['壮阔', '暗黑', '伤感', '管弦', '纯音乐'],
    keywords: ['对话', '聊天', '你问我答', '两人', '求婚'],
    knobs: {
      showEmoMessages: '插入表情包消息；轻松的歌打开，认真的歌关掉',
      avatarSource: '头像来源；cover 用专辑封面',
    },
  },
  diorama: {
    name: '镜台',
    host: '点阵化的文字在 3D 空间里穿行，镜头跟着歌词运镜',
    axes: { motion: 0.75, density: 0.5, warmth: 0.3, space: 0.95, story: 0.4 },
    energy: [0.4, 0.95],
    fit: ['电子', '科幻', '梦幻', '壮阔'],
    avoid: ['民谣', '爵士', '古风'],
    keywords: ['宇宙', '星空', '星河', '光年', '太空', '行星', '未来', '数字', '赛博', '机械'],
    knobs: {
      cameraSpeed: '镜头飞行速度',
      motionAmount: '整体运动量',
      audioReactivity: '画面随音乐跳动的程度；鼓点强的歌调高',
      showParticles: '粒子；想更干净就关掉',
    },
  },
  sonnet: {
    name: '商籁',
    host: '短线、边框与镂空巨字轮番铺开，歌词像被排进一页页翻动的诗稿',
    axes: { motion: 0.8, density: 0.7, warmth: 0.5, space: 0.6, story: 0.75 },
    energy: [0.45, 1],
    fit: ['摇滚', '动漫', '激昂'],
    avoid: ['纯音乐', '治愈'],
    knobs: {
      cameraIntensity: '镜头推拉的力度；副歌爆发的歌调高（这个模式最吃性能）',
      typographyMotion: '文字本身的运动量',
      mgDensity: '背景动态图形的密度（需 showBackgroundMg=true 且 showOnlyText=false）',
      enableTransitions: '段落间的转场',
    },
  },
  tempera: {
    name: '凝彩',
    host: '成片的色块与细密网点缓缓重组，歌词压过颜色时翻出反色',
    axes: { motion: 0.6, density: 0.65, warmth: 0.75, space: 0.3, story: 0.45 },
    energy: [0.35, 0.9],
    fit: ['流行', '俏皮', '城市', '夜晚', '青春'],
    avoid: ['暗黑', '孤独', '管弦'],
    knobs: {
      cameraIntensity: '镜头运动力度',
      glyphMotion: '逐字入场的幅度',
      colorMode: '配色：duo 双色、mono 单色、gradient 渐变',
      showBlocks: '色块；关掉后更素',
      depthOfField: '景深：背景和前景虚化的程度，有空间感的歌调高',
      depthPan: '镜头平移的幅度，律动强的歌调高',
      glyphDepth: '歌词按字号分出远近的程度',
    },
  },
  lumiere: {
    name: '绘光',
    host: '体积光穿过烟雾与浮尘，歌词像被光一点点照亮的刻字',
    axes: { motion: 0.45, density: 0.4, warmth: 0.55, space: 0.8, story: 0.5 },
    energy: [0.3, 0.9],
    fit: ['壮阔', '管弦', '抒情', '释然', '治愈', '古风'],
    avoid: ['俏皮', '说唱'],
    keywords: ['光束', '微光', '烟雨', '雾', '尘埃', '神', '信仰', '黎明', '曙光', '天空'],
    knobs: {
      lightIntensity: '光的强度',
      fogDensity: '烟雾浓度；神秘、沉重的歌调高',
      audioResponse: '随音乐变亮的程度',
      decay: '唱完的字崩解的强度；激烈处调高',
    },
  },
  hanabi: {
    name: '花火',
    host: '花火烟花歌词 PV 可视化',
    axes: { motion: 0.7, density: 0.5, warmth: 0.8, space: 0.7, story: 0.4 },
    energy: [0.4, 0.95],
    fit: ['夏天', '庆祝'],
    avoid: ['暗黑', '愤怒', '孤独'],
    keywords: ['烟花', '烟火', '花火', '夏夜', '夏祭', '祭典', '流星'],
    knobs: {},
  },
  still: {
    name: '静止',
    host: '歌词静止在画面中央，不做动画也不渲染背景，最省资源',
    axes: { motion: 0, density: 0.1, warmth: 0.5, space: 0.05, story: 0.2 },
    energy: [0, 0.2],
    fit: [],
    avoid: [],
    knobs: {},
    // Never picked on fit alone: it is the "no animation" choice.
    penalty: 0.25,
  },
};
