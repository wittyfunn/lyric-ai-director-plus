// The M2 evaluation set: songs chosen to cover genres, moods, languages and
// every builtin mode, each with the modes a person would accept for it (1-3).
// Only titles and artists are stored; lyrics are fetched live through Folia's
// online sources when the evaluation runs, so no lyric text ships with the mod.
//
// `accept` is a first draft written from each mode's look (profiles.mjs) and
// the song's character; it is meant to be reviewed by people and revised.
// Bump EVAL_SET_VERSION whenever labels change, so results stay comparable.
//
// `holdout: true` songs were added (and labelled) after profile v2 was tuned on
// the first 30, so they give an honest score for that tuning; never tune on them.

export const EVAL_SET_VERSION = 3;

export const EVAL_SET = [
  { title: '晴天', artist: '周杰伦', accept: ['partita', 'pendolo', 'classic'], note: '校园回忆，叙事' },
  { title: '十年', artist: '陈奕迅', accept: ['pendolo', 'partita', 'tilt'], note: '时间与告别' },
  { title: '倔强', artist: '五月天', accept: ['sonnet', 'lumiere'], note: '摇滚励志，副歌爆发' },
  { title: '海阔天空', artist: 'Beyond', accept: ['lumiere', 'sonnet'], note: '壮阔摇滚' },
  { title: '江南', artist: '林俊杰', accept: ['lumiere', 'partita', 'claddagh'], note: '中国风抒情' },
  { title: '消愁', artist: '毛不易', accept: ['partita', 'monet', 'fume'], note: '民谣，文学性' },
  { title: '成都', artist: '赵雷', accept: ['partita', 'monet', 'pendolo'], note: '民谣，城市怀旧' },
  { title: '光年之外', artist: '邓紫棋', accept: ['diorama', 'lumiere', 'sonnet'], note: '宇宙意象，壮阔' },
  { title: '演员', artist: '薛之谦', accept: ['tilt', 'fume', 'classic'], note: '伤感独白' },
  { title: 'Made in China', artist: 'Higher Brothers', accept: ['fume', 'tempera', 'sonnet'], note: '说唱，躁动' },
  { title: '目不转睛', artist: '王以太', accept: ['tilt', 'fume', 'claddagh'], note: '说唱 R&B，暧昧' },
  { title: '爱人错过', artist: '告五人', accept: ['tempera', 'sonnet', 'classic'], note: '独立流行，轻快' },
  { title: '今天你要嫁给我', artist: '陶喆 蔡依林', accept: ['tempera'], note: '对唱，俏皮；审阅：不要群唱' },
  { title: '屋顶', artist: '周杰伦 温岚', accept: ['cappella', 'claddagh'], note: '男女对唱，浪漫' },
  { title: '红豆', artist: '王菲', accept: ['classic', 'claddagh', 'monet'], note: '温柔情歌' },
  { title: '贝加尔湖畔', artist: '李健', accept: ['lumiere', 'claddagh', 'partita'], note: '自然意象，浪漫' },
  { title: 'Plastic Love', artist: '竹内まりや', accept: ['tempera', 'fume', 'monet'], note: 'City Pop，都市夜色' },
  { title: '夜に駆ける', artist: 'YOASOBI', accept: ['sonnet', 'tempera'], note: '快节奏 J-Pop，叙事' },
  { title: 'Lemon', artist: '米津玄師', accept: ['lumiere', 'tilt', 'fume'], note: '悼念，伤感' },
  { title: '打上花火', artist: 'DAOKO 米津玄師', accept: ['hanabi', 'claddagh'], note: '夏日烟火' },
  { title: 'secret base ~君がくれたもの~', artist: 'ZONE', accept: ['hanabi', 'partita', 'pendolo'], note: '夏天，青春回忆' },
  { title: 'Faded', artist: 'Alan Walker', accept: ['diorama', 'cadenza'], note: '电子，迷离' },
  { title: "when the party's over", artist: 'Billie Eilish', accept: ['cadenza', 'tilt', 'lumiere'], note: '极简暗黑，耳语' },
  { title: "Don't Know Why", artist: 'Norah Jones', accept: ['monet', 'classic'], note: '爵士，慵懒' },
  { title: 'Bohemian Rhapsody', artist: 'Queen', accept: ['sonnet', 'lumiere'], note: '摇滚歌剧，多段落' },
  { title: 'Summer', artist: '久石让', accept: ['lumiere', 'monet', 'classic'], note: '纯音乐钢琴', instrumental: true },
  { title: 'Love Story', artist: 'Taylor Swift', accept: ['partita', 'sonnet', 'claddagh'], note: '童话式叙事' },
  { title: '月亮代表我的心', artist: '邓丽君', accept: ['monet', 'classic', 'claddagh'], note: '经典老歌' },
  { title: 'DDU-DU DDU-DU', artist: 'BLACKPINK', accept: ['tempera', 'sonnet', 'diorama'], note: 'K-Pop，强节奏' },
  { title: '牵丝戏', artist: '银临', accept: ['lumiere', 'partita'], note: '古风，叙事' },
  // ---- holdout (labelled 2026-10-28 before any run on them)
  { title: '富士山下', artist: '陈奕迅', accept: ['partita', 'lumiere', 'tilt'], note: '放手，粤语抒情', holdout: true },
  { title: '稻香', artist: '周杰伦', accept: ['partita', 'classic', 'tempera'], note: '温暖治愈，乡村回忆', holdout: true },
  { title: '大风吹', artist: '草东没有派对', accept: ['sonnet', 'tilt', 'fume'], note: '愤怒独立摇滚', holdout: true },
  { title: '杀死那个石家庄人', artist: '万能青年旅店', accept: ['fume', 'lumiere', 'sonnet'], note: '文学摇滚，壮阔', holdout: true },
  { title: '遇见', artist: '孙燕姿', accept: ['classic', 'claddagh', 'partita'], note: '温柔希望', holdout: true },
  { title: '特别的人', artist: '方大同', accept: ['tilt', 'claddagh', 'classic'], note: 'R&B 情歌', holdout: true },
  { title: 'Viva La Vida', artist: 'Coldplay', accept: ['lumiere', 'sonnet'], note: '管弦史诗', holdout: true },
  { title: 'Summertime Sadness', artist: 'Lana Del Rey', accept: ['tilt', 'cadenza', 'lumiere'], note: '慵懒忧郁', holdout: true },
  { title: 'First Love', artist: '宇多田ヒカル', accept: ['classic', 'pendolo', 'claddagh'], note: '经典日语情歌', holdout: true },
  { title: 'Wake Me Up', artist: 'Avicii', accept: ['tempera', 'sonnet', 'diorama'], note: 'EDM 民谣', holdout: true },
  { title: '奇洛李维斯回信', artist: '薛凯琪', accept: ['tempera', 'classic'], note: '俏皮回信；审阅：不要群唱', holdout: true },
  { title: '罗刹海市', artist: '刀郎', accept: ['fume', 'tilt', 'partita'], note: '讽喻民谣，歌词密', holdout: true },
];
