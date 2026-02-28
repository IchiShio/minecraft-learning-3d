'use strict';

// ===== CONSTANTS =====
const STORAGE_KEY = 'mclearn3d_v1';
const STATS_KEY = 'mclearn3d_stats_v1';
const SETTINGS_KEY = 'mclearn3d_settings_v1';
const CUSTOM_Q_KEY  = 'mclearn3d_custom_q_v1';
const DAILY_LOG_KEY = 'mclearn3d_daily_v1';
const SYNC_GIST_KEY = 'mclearn3d_gist_v1'; // { id, syncedAt }
const DEFAULT_SETTINGS = { speed: 1.0, bgmVol: 0.5, seVol: 0.7, difficulty: 'normal', githubToken: '' };
// レベルから現在の学年を返す (Lv1-2=2年生, Lv3-5=3年生, ...)
const GRADE_FOR_LEVEL = lv => lv <= 2 ? 2 : lv <= 5 ? 3 : lv <= 9 ? 4 : lv <= 14 ? 5 : 6;
const QUIZ_PER_SESSION = 5;
const XP_PER_CORRECT = 12;
const XP_FOR_LEVEL = lv => 50 + (lv - 1) * 30;

const DEFAULT_STATE = {
  level: 1, xp: 0,
  totalCorrect: 0, totalGames: 0,
  perfectClears: 0, maxStreak: 0, currentStreak: 0,
  inventory: { wood:0, stone:0, iron:0, gold:0, diamond:0 },
  achievements: [],
  adaptiveBias: 0,   // -2〜+2: 自動難易度オフセット（毎日更新）
  unlockedZones: [], // ワールド拡張ゾーン
  buildingActionCooldown: {}, // 建物アクションのクールダウン { buildingId: timestamp }
};

const inv = s => s.inventory || {};
const totalItems = s => Object.values(inv(s)).reduce((a,b)=>a+b,0);

// ===== BUILDING DEFINITIONS =====
const BUILDING_DEFS = [
  { id:'cabin',   name:'小屋',          icon:'🏠', pos:[6,0,6],     size:[3,3,3],     color:0x8B5E3C, roofColor:0x5c3a1e, cond:s=>inv(s).wood>=3,                              condText:'🪵 木材 3こ',                  desc:'ぼうけんのはじまり！' },
  { id:'tanbo',   name:'田んぼ',        icon:'🌾', pos:[-6,0,6],    size:[5,1.5,3],   color:0x2a8a20, roofColor:0x1a5a10, cond:s=>inv(s).stone>=3,                             condText:'🪨 石 3こ',                    desc:'おこめが そだつ！' },
  { id:'mine',    name:'採掘場',        icon:'⛏️', pos:[8,0,-6],    size:[3.5,3.5,3], color:0x686868, roofColor:0x484848, cond:s=>inv(s).wood>=6,                              condText:'🪵 木材 6こ',                  desc:'ブロックを ほる！' },
  { id:'market',  name:'交易所',        icon:'🏪', pos:[-8,0,-6],   size:[4,3.5,3],   color:0xC4521C, roofColor:0x7a2e00, cond:s=>inv(s).iron>=3,                              condText:'⚙️ 鉄 3こ',                   desc:'せかいと つながる！' },
  { id:'well',    name:'井戸',          icon:'⛲', pos:[0,0,10],    size:[2.5,2.5,2.5],color:0x888888,roofColor:0x505050, cond:s=>totalItems(s)>=12,                           condText:'アイテム ごうけい 12こ',       desc:'きれいな水が でる！' },
  { id:'onsen',   name:'温泉',          icon:'♨️', pos:[12,0,0],    size:[4,3,4],     color:0x5080a0, roofColor:0x305070, cond:s=>totalItems(s)>=20,                           condText:'アイテム ごうけい 20こ',       desc:'ゆっくり くつろぐ！' },
  { id:'forge',   name:'鍛冶屋',        icon:'🔨', pos:[12,0,-10],  size:[3.5,4,3],   color:0x5A3E28, roofColor:0x3a2010, cond:s=>inv(s).gold>=3,                              condText:'✨ 金 3こ',                    desc:'つよい どうぐを つくる！' },
  { id:'shrine',  name:'神社',          icon:'⛩️', pos:[-12,0,-10], size:[3.5,5,3],   color:0xCC2200, roofColor:0x881500, cond:s=>inv(s).stone>=8,                             condText:'🪨 石 8こ',                    desc:'かみさまの パワー！' },
  { id:'guild',   name:'冒険ギルド',    icon:'🏰', pos:[-12,0,0],   size:[4.5,4.5,4], color:0x48485A, roofColor:0x282838, cond:s=>inv(s).iron>=6,                              condText:'⚙️ 鉄 6こ',                   desc:'ぼうけんしゃ 募集！' },
  { id:'garden',  name:'花畑',          icon:'🌸', pos:[0,0,-10],   size:[5,1,4],     color:0x4a8a30, roofColor:0x2a5a18, cond:s=>totalItems(s)>=25,                           condText:'アイテム ごうけい 25こ',       desc:'きれいな はな！' },
  { id:'tower',   name:'見張り塔',      icon:'🗼', pos:[18,0,0],    size:[2.5,8,2.5], color:0x686868, roofColor:0x383838, cond:s=>inv(s).gold>=6,                              condText:'✨ 金 6こ',                    desc:'とおくまで みえる！' },
  { id:'library', name:'図書館',        icon:'📚', pos:[-18,0,0],   size:[4.5,4,3.5], color:0x8060A0, roofColor:0x503080, cond:s=>totalItems(s)>=45,                           condText:'アイテム ごうけい 45こ',       desc:'ちしきの くら！' },
  { id:'port',    name:'港',            icon:'⚓', pos:[0,0,-20],   size:[5,3.5,4],   color:0x2060A0, roofColor:0x103070, cond:s=>inv(s).iron>=10,                             condText:'⚙️ 鉄 10こ',                  desc:'うみの むこうへ！' },
  { id:'castle',  name:'城',            icon:'🏯', pos:[0,0,22],    size:[6,7,5],     color:0xC89820, roofColor:0x806000, cond:s=>totalItems(s)>=60,                           condText:'アイテム ごうけい 60こ',       desc:'りっぱな おしろ！' },
  { id:'dragon',  name:'ドラゴンの すみか',icon:'🐉',pos:[24,0,-16], size:[5.5,6,5],   color:0x4B2080, roofColor:0x2A0050, cond:s=>totalItems(s)>=80,                           condText:'アイテム ごうけい 80こ',       desc:'でんせつの せいいき！' },
  { id:'sky',     name:'そらの しろ',   icon:'☁️', pos:[-24,0,-16], size:[5,5.5,4.5], color:0x6890C0, roofColor:0x3060A0, cond:s=>inv(s).stone>=15&&inv(s).iron>=10,           condText:'🪨 石 15こ ＋ ⚙️ 鉄 10こ',  desc:'くうちゅうに うかぶ しろ！' },
  { id:'rainbow', name:'にじの ゲート', icon:'🌈', pos:[0,0,30],    size:[6,8,2],     color:0xFF66BB, roofColor:0xCC3399, cond:s=>s.level>=15,                                 condText:'レベル 15 たっせい',           desc:'でんせつの もん！' },
];

// Resource types: id, display name, icon, box color, subject, difficulty
const RESOURCE_DEFS = {
  wood:    { id:'wood',    name:'木材',   icon:'🪵', color:0x8B5E3C, subject:'math',     diff:'easy'   },
  stone:   { id:'stone',   name:'石',     icon:'🪨', color:0x888888, subject:'japanese', diff:'easy'   },
  iron:    { id:'iron',    name:'鉄',     icon:'⚙️', color:0xC88830, subject:'english',  diff:'normal' },
  gold:    { id:'gold',    name:'金',     icon:'✨', color:0xFFD700, subject:'math',     diff:'normal' },
  diamond: { id:'diamond', name:'ダイヤ', icon:'💎', color:0x44BBFF, subject:'english',  diff:'hard'   },
};
// Resource block spawn positions [x, z] — scattered across the map
const RESOURCE_SPAWN = [
  {type:'wood',    pos:[ 2, 0,  2]}, {type:'wood',    pos:[-2, 0,  3]},
  {type:'wood',    pos:[ 5, 0, -2]}, {type:'wood',    pos:[-5, 0, -2]},
  {type:'wood',    pos:[ 3, 0,  7]}, {type:'wood',    pos:[-3, 0,  7]},
  {type:'wood',    pos:[ 7, 0,  3]}, {type:'wood',    pos:[-7, 0,  3]},
  {type:'stone',   pos:[11, 0,  8]}, {type:'stone',   pos:[-11,0,  8]},
  {type:'stone',   pos:[ 4, 0, 14]}, {type:'stone',   pos:[-4, 0, 14]},
  {type:'stone',   pos:[14, 0, -4]}, {type:'stone',   pos:[-14,0, -4]},
  {type:'stone',   pos:[11, 0, -8]}, {type:'stone',   pos:[-11,0, -8]},
  {type:'iron',    pos:[17, 0,  8]}, {type:'iron',    pos:[-17,0,  8]},
  {type:'iron',    pos:[ 8, 0,-14]}, {type:'iron',    pos:[-8, 0,-14]},
  {type:'iron',    pos:[15, 0, 12]}, {type:'iron',    pos:[-15,0, 12]},
  {type:'gold',    pos:[21, 0,  4]}, {type:'gold',    pos:[-21,0,  4]},
  {type:'gold',    pos:[ 0, 0, 18]}, {type:'gold',    pos:[16, 0,-14]},
  {type:'gold',    pos:[-16,0,-14]},
  {type:'diamond', pos:[23, 0, -8]}, {type:'diamond', pos:[-23,0, -8]},
  {type:'diamond', pos:[11, 0, 26]}, {type:'diamond', pos:[-11,0, 26]},
  {type:'diamond', pos:[23, 0, 10]},
];

// ===== CRAFTING =====
const CRAFT_RECIPES = [
  { id:'pick_wood',  icon:'⛏️', name:'木のツルハシ',   needs:{wood:3},           reward:{xp:15},   once:false, desc:'XP ＋15' },
  { id:'shield',     icon:'🛡️', name:'石のたて',       needs:{stone:3},          reward:{hp:1},    once:false, desc:'HP ＋1 かいふく' },
  { id:'pick_iron',  icon:'⛏️', name:'てつのツルハシ', needs:{iron:2,stone:1},   reward:{xp:30},   once:false, desc:'XP ＋30' },
  { id:'armor_iron', icon:'🥋', name:'てつのよろい',   needs:{iron:4},           reward:{maxHp:1}, once:true,  desc:'さいだいHP ＋1（1かいのみ）' },
  { id:'pick_gold',  icon:'⛏️', name:'きんのツルハシ', needs:{gold:3},           reward:{xp:50},   once:false, desc:'XP ＋50' },
  { id:'armor_dia',  icon:'💎', name:'ダイヤのよろい', needs:{diamond:2},        reward:{maxHp:2}, once:true,  desc:'さいだいHP ＋2（1かいのみ）' },
];

// ===== DAILY QUESTS =====
const QUEST_POOL = [
  { id:'q_correct3',  icon:'⭐', label:'きょう 3もん せいかいしよう！',  check:(g) => g.todayCorrect >= 3,               reward:{xp:15} },
  { id:'q_correct5',  icon:'🌟', label:'きょう 5もん せいかいしよう！',  check:(g) => g.todayCorrect >= 5,               reward:{xp:25} },
  { id:'q_correct10', icon:'💫', label:'きょう 10もん せいかいしよう！', check:(g) => g.todayCorrect >= 10,              reward:{xp:40} },
  { id:'q_math3',     icon:'➕', label:'さんすうを 3もん といて！',      check:(g) => (g.todayLog.math?.c||0) >= 3,      reward:{xp:20} },
  { id:'q_jpn3',      icon:'📝', label:'こくごを 3もん といて！',        check:(g) => (g.todayLog.japanese?.c||0) >= 3,  reward:{xp:20} },
  { id:'q_eng3',      icon:'🔤', label:'えいごを 3もん といて！',        check:(g) => (g.todayLog.english?.c||0) >= 3,   reward:{xp:20} },
  { id:'q_wood2',     icon:'🪵', label:'もくざいを 2こ あつめて！',      check:(g) => (g.state.inventory.wood||0) >= 2,  reward:{xp:15} },
  { id:'q_stone2',    icon:'🪨', label:'いしを 2こ あつめて！',          check:(g) => (g.state.inventory.stone||0) >= 2, reward:{xp:15} },
  { id:'q_streak3',   icon:'🔥', label:'3れんぞく せいかいしよう！',     check:(g) => (g.state.currentStreak||0) >= 3,   reward:{xp:20} },
  { id:'q_building1', icon:'🏠', label:'たてものに はいって！',           check:(g) => g._unlockedBuildingCount() >= 1,   reward:{xp:10} },
];

// ===== ACHIEVEMENTS =====
const ACHIEVEMENTS = [
  { id:'first_correct',  icon:'🌟', label:'はじめての せいかい！',   cond:(s)   => s.totalCorrect >= 1 },
  { id:'streak_3',       icon:'🔥', label:'3れんぞく せいかい！',    cond:(s)   => (s.maxStreak||0) >= 3 },
  { id:'streak_5',       icon:'⚡', label:'5れんぞく せいかい！',    cond:(s)   => (s.maxStreak||0) >= 5 },
  { id:'streak_10',      icon:'💥', label:'10れんぞく せいかい！',   cond:(s)   => (s.maxStreak||0) >= 10 },
  { id:'total_10',       icon:'📚', label:'10もん といた！',         cond:(s)   => s.totalCorrect >= 10 },
  { id:'total_50',       icon:'📖', label:'50もん といた！',         cond:(s)   => s.totalCorrect >= 50 },
  { id:'total_100',      icon:'🏆', label:'100もん といた！',        cond:(s)   => s.totalCorrect >= 100 },
  { id:'math_10',        icon:'➕', label:'さんすうはかせ！',        cond:(_,g) => g._subjectCorrect('math')     >= 10 },
  { id:'japanese_10',    icon:'📝', label:'こくごはかせ！',          cond:(_,g) => g._subjectCorrect('japanese') >= 10 },
  { id:'english_10',     icon:'🔤', label:'えいごはかせ！',          cond:(_,g) => g._subjectCorrect('english')  >= 10 },
  { id:'level_3',        icon:'⬆️', label:'レベル3たっせい！',       cond:(s)   => s.level >= 3 },
  { id:'level_5',        icon:'🌙', label:'レベル5たっせい！',       cond:(s)   => s.level >= 5 },
  { id:'level_10',       icon:'👑', label:'レベル10たっせい！',      cond:(s)   => s.level >= 10 },
  { id:'diamond_1',      icon:'💎', label:'ダイヤを ゲット！',       cond:(s)   => (s.inventory?.diamond||0) >= 1 },
  { id:'building_1',     icon:'🏠', label:'はじめての たてもの！',  cond:(_,g) => g._unlockedBuildingCount() >= 1 },
  { id:'building_5',     icon:'🏘️', label:'たてもの 5つ かいほう！', cond:(_,g) => g._unlockedBuildingCount() >= 5 },
  { id:'login_3',        icon:'📅', label:'3日れんぞく ログイン！',   cond:(s)   => (s.loginStreak||0) >= 3 },
  { id:'login_7',        icon:'🗓️', label:'7日れんぞく ログイン！',   cond:(s)   => (s.loginStreak||0) >= 7 },
  { id:'quest_3',        icon:'📋', label:'クエスト 3かい クリア！',  cond:(s)   => (s.totalQuestsCompleted||0) >= 3 },
  { id:'quest_10',       icon:'🗺️', label:'クエスト 10かい クリア！', cond:(s)   => (s.totalQuestsCompleted||0) >= 10 },
  { id:'mob_1',          icon:'⚔️', label:'はじめての てきを たおした！', cond:(s) => (s.totalMobKills||0) >= 1 },
  { id:'mob_10',         icon:'🗡️', label:'てきを 10たい たおした！',    cond:(s) => (s.totalMobKills||0) >= 10 },
  { id:'trade_1',        icon:'🤝', label:'はじめての こうかん！',        cond:(s) => (s.totalTrades||0) >= 1 },
];

// ===== WORLD EXPANSION ZONES =====
const WORLD_ZONES = [
  { id:'zone2', name:'むらのはずれ',     bound:33, fog:0.012,
    toast:'🌾 せかいが ひろがった！\nむらのはずれが かいほう！',
    cond:(s,it)=>it>=5 },
  { id:'zone3', name:'もりのおく',       bound:46, fog:0.009,
    toast:'🌲 しんぴのもりを はっけん！\nさらに とおくへ すすめるよ！',
    cond:(s,it)=>it>=20 },
  { id:'zone4', name:'さいはての ち',    bound:58, fog:0.005,
    toast:'🏚️ さいはての ちへ…\nいにしえの いせきが あらわれた！',
    cond:(s,it)=>it>=45||s.level>=10 },
  { id:'zone5', name:'でんせつのせかい', bound:70, fog:0.003,
    toast:'🌈 でんせつのせかいが かいほう！\nすべての ちへいを たんけんせよ！',
    cond:(s,it)=>it>=80||s.level>=15 },
];

// ===== BUILDING ACTION DEFINITIONS =====
// 各建物で1回できるアクション（問題を解くと実行できる）
const BUILDING_ACTIONS = {
  cabin:   { icon:'🛌', label:'ねる',          pos:[-3,-2], subj:'math',     reward:{ xp:20 },              cooldown:60000  },
  tanbo:   { icon:'🌾', label:'しゅうかくする', pos:[-3,-3], subj:'japanese', reward:{ xp:15, item:'wood' },  cooldown:45000  },
  mine:    { icon:'⛏️', label:'ほる',           pos:[0,-3],  subj:'math',     reward:{ xp:15, item:'stone' }, cooldown:45000  },
  market:  { icon:'🤝', label:'こうえきする',   pos:[0,0],   subj:'english',  reward:{ xp:20 },              cooldown:60000  },
  well:    { icon:'💧', label:'みずくむ',        pos:[0,0],   subj:'japanese', reward:{ xp:15 },              cooldown:30000  },
  onsen:   { icon:'♨️', label:'にゅうよくする', pos:[0,0],   subj:'math',     reward:{ xp:25 },              cooldown:90000  },
  forge:   { icon:'🔨', label:'うちきをする',   pos:[0,-1],  subj:'math',     reward:{ xp:20, item:'iron' },  cooldown:60000  },
  shrine:  { icon:'🙏', label:'おまいりする',   pos:[0,-3],  subj:'japanese', reward:{ xp:20 },              cooldown:60000  },
  guild:   { icon:'📋', label:'いらいをうける', pos:[0,-2],  subj:'english',  reward:{ xp:25 },              cooldown:60000  },
  garden:  { icon:'🪴', label:'みずやりする',   pos:[0,2],   subj:'japanese', reward:{ xp:15 },              cooldown:30000  },
  tower:   { icon:'🔭', label:'かんさつする',   pos:[-3,-2], subj:'math',     reward:{ xp:20 },              cooldown:60000  },
  library: { icon:'📖', label:'どくしょする',   pos:[-3,2],  subj:'japanese', reward:{ xp:25 },              cooldown:60000  },
  port:    { icon:'🎣', label:'つりをする',     pos:[-2,-1], subj:'math',     reward:{ xp:15 },              cooldown:30000  },
  castle:  { icon:'👑', label:'たいざする',     pos:[0,-4],  subj:'english',  reward:{ xp:30 },              cooldown:90000  },
  dragon:  { icon:'💰', label:'たからをとる',   pos:[-3,-3], subj:'math',     reward:{ xp:35, item:'gold' },  cooldown:150000 },
  sky:     { icon:'✨', label:'こうだんする',   pos:[0,-3],  subj:'english',  reward:{ xp:30 },              cooldown:90000  },
  rainbow: { icon:'🌈', label:'とびこむ',       pos:[0,2],   subj:'english',  reward:{ xp:40, item:'diamond'},cooldown:300000 },
};

// ===== TREASURE CHESTS =====
const TREASURE_SPAWNS = [
  { pos:[ 3, 0, -4],  subject:'math'     },
  { pos:[-7, 0,  2],  subject:'japanese' },
  { pos:[10, 0,-13],  subject:'english'  },
  { pos:[-14,0,  5],  subject:'math'     },
  { pos:[ 5, 0, 17],  subject:'japanese' },
  { pos:[-5, 0,-13],  subject:'english'  },
];
const COMBO_MILESTONES = [3, 5, 7, 10]; // コンボボーナス発動ストリーク数
const COMBO_BONUS_XP   = 8;             // コンボ1段階あたりのボーナスXP

// ===== CHARACTER DEFINITIONS =====
const CHARACTER_DEFS = [
  { id:'steve',  name:'スティーブ',   skin:'#C8A882', hair:'#593D29', eye:'#4477FF', shirt:'#3464AC', pants:'#1E3A6E', shoes:'#3D2B1E' },
  { id:'alex',   name:'アレックス',   skin:'#C8A882', hair:'#E8721C', eye:'#4477FF', shirt:'#3A8A3A', pants:'#6B4226', shoes:'#3D2B1E' },
  { id:'tiroru', name:'ティロル',     skin:'#F5D0A8', hair:'#1A1A1A', eye:'#4488EE', shirt:'#2255BB', pants:'#334466', shoes:'#112233', hat:'#111111' },
  { id:'pino',   name:'ピノ',         skin:'#F5D0A8', hair:'#FF88BB', eye:'#99AAFF', shirt:'#FF99CC', pants:'#FF88BB', shoes:'#FFBBDD', cheek:'#FF99AA' },
  { id:'sensei', name:'スマナイ先生', skin:'#F5D0A8', hair:'#111111', eye:'#333333', shirt:'#EEEEEE', pants:'#222222', shoes:'#111111', glasses:true },
  { id:'red',    name:'Mr.レッド',    skin:'#F5D0A8', hair:'#CC1100', eye:'#FF2200', shirt:'#DD2200', pants:'#AA0000', shoes:'#880000' },
  { id:'blue',   name:'Mr.ブルー',    skin:'#F5D0A8', hair:'#0033CC', eye:'#0055FF', shirt:'#0044DD', pants:'#002299', shoes:'#001166' },
  { id:'black',  name:'Mr.ブラック',  skin:'#D0C0B0', hair:'#111111', eye:'#FF0000', shirt:'#111111', pants:'#111111', shoes:'#111111', evil:true },
  { id:'money',  name:'Mr.マネー',    skin:'#F5D0A8', hair:'#FFD700', eye:'#DAA520', shirt:'#FFD700', pants:'#B8860B', shoes:'#8B6914', hat:'#FFD700', tophat:true },
  { id:'banana', name:'Mr.バナナ',    skin:'#FFEE66', hair:'#FFCC00', eye:'#885500', shirt:'#FFE000', pants:'#FFCC00', shoes:'#CC9900', cheek:'#FFAA00' },
  { id:'ginsan', name:'Mr.ギンさん',  skin:'#E8E8E8', hair:'#FFFFFF', eye:'#AAAAAA', shirt:'#CCCCCC', pants:'#AAAAAA', shoes:'#888888' },
  { id:'baby',   name:'Mr.ベイビー',  skin:'#FFE8D0', hair:'#FFAA66', eye:'#5599FF', shirt:'#FFFFFF', pants:'#FFFFFF', shoes:'#FFB0A0', cheek:'#FFB0A0', baby:true },
];

const CHAR_STORAGE_KEY = 'mclearn3d_char';

// ===== MOB DEFINITIONS =====
// burnDay: 日光で燃える(ゾンビ/スケルトン) chargeRange: 爆発距離(クリーパー)
const MOB_TYPES = {
  zombie:   { hostile:true,  speed:0.022, chaseR:14, fleeR:0,  skin:'#4A9A4A', shirt:'#2A6A2A', pants:'#1A4A1A', shoes:'#0A2A0A', flying:false, burnDay:true,  chargeRange:0   },
  creeper:  { hostile:true,  speed:0.020, chaseR:10, fleeR:0,  skin:'#55AA55', shirt:'#3A8A3A', pants:'#2A6A2A', shoes:'#1A5A1A', flying:false, burnDay:false, chargeRange:3.2 },
  skeleton: { hostile:true,  speed:0.016, chaseR:14, fleeR:0,  skin:'#D8D8D8', shirt:'#C0C0C0', pants:'#B0B0B0', shoes:'#A0A0A0', flying:false, burnDay:true,  chargeRange:0,  rangedAttack:true },
  pig:      { hostile:false, speed:0.015, chaseR:0,  fleeR:5,  skin:'#F0B0A0', shirt:'#E89888', pants:'#E89888', shoes:'#D07060', flying:false, burnDay:false, chargeRange:0   },
  sheep:    { hostile:false, speed:0.015, chaseR:0,  fleeR:5,  skin:'#D8D8C0', shirt:'#DDDDC8', pants:'#D0D0B8', shoes:'#B0B0A0', flying:false, burnDay:false, chargeRange:0   },
  chicken:  { hostile:false, speed:0.012, chaseR:0,  fleeR:4,  skin:'#FFFFFF', shirt:'#EEEEEE', pants:'#FFB040', shoes:'#FF8800', flying:false, burnDay:false, chargeRange:0   },
  ghast:    { hostile:true,  speed:0.013, chaseR:20, fleeR:0,  skin:'#F0F0F0', shirt:'#F8F8F8', pants:'#E8E8E8', shoes:'#D8D8D8', flying:true,  burnDay:false, chargeRange:0   },
};

// ===== MOB COMBAT =====
const MOB_COMBAT = {
  zombie:   { hp: 3, xp:  8, name:'ゾンビ',    drop: () => Math.random() < 0.5 ? 'wood'  : 'stone' },
  skeleton: { hp: 3, xp:  8, name:'スケルトン', drop: () => Math.random() < 0.6 ? 'stone' : 'iron'  },
  creeper:  { hp: 4, xp: 10, name:'クリーパー', drop: () => 'stone'                                  },
  ghast:    { hp: 5, xp: 15, name:'ガスト',     drop: () => 'iron'                                   },
};

// ゲーム1日の長さ(フレーム)、モブ上限
const DAY_LENGTH      = 28800; // ≈8分/日 (60fps想定)
const MOB_CAP_HOSTILE = 12;
const MOB_CAP_PASSIVE = 10;

// 初期配置(昼間 受動モブのみ)
const INITIAL_MOBS = [
  {type:'pig',     x:6,   z:12}, {type:'pig',    x:-8, z:13}, {type:'pig',   x:11, z:-8},
  {type:'sheep',   x:-9,  z:11}, {type:'sheep',  x:7,  z:-11},
  {type:'chicken', x:4,   z:14}, {type:'chicken', x:-5, z:-13},
];

// ===== VILLAGER DEFINITIONS =====
const VILLAGER_DEFS = [
  { id:'vil_shop',  name:'アイテム屋さん', icon:'🛒', x:  4, z:-16,
    skin:'#F5D5B0', shirt:'#3366CC', pants:'#224499', hatCol:'#CC3322',
    trades:[
      { icon:'🪵', label:'木×3 → XP20',       needs:{wood:3},    reward:{xp:20}     },
      { icon:'🪨', label:'石×3 → HP かいふく', needs:{stone:3},   reward:{hp:1}      },
      { icon:'⚙️', label:'鉄×2 → XP40',       needs:{iron:2},    reward:{xp:40}     },
    ]},
  { id:'vil_armor', name:'ぼうぐ屋さん',   icon:'🛡️', x:-13, z: -7,
    skin:'#D4A070', shirt:'#884422', pants:'#663311', hatCol:'#442200',
    trades:[
      { icon:'✨', label:'金×3 → ダイヤ1こ',  needs:{gold:3},    reward:{diamond:1}  },
      { icon:'⚙️', label:'鉄×3 → HP ぜんかい', needs:{iron:3},   reward:{hpFull:1}   },
      { icon:'💎', label:'ダイヤ×1 → XP80',  needs:{diamond:1}, reward:{xp:80}      },
    ]},
  { id:'vil_mage',  name:'まほう使い',     icon:'🧙', x: 17, z: 12,
    skin:'#C8A0CC', shirt:'#6633AA', pants:'#4422AA', hatCol:'#221144',
    trades:[
      { icon:'🪵🪨', label:'木×2＋石×2 → XP30',    needs:{wood:2, stone:2}, reward:{xp:30}   },
      { icon:'⚙️✨', label:'鉄×1＋金×1 → ダイヤ1', needs:{iron:1, gold:1},  reward:{diamond:1} },
      { icon:'💎',   label:'ダイヤ×2 → XP150',      needs:{diamond:2},       reward:{xp:150}  },
    ]},
];

function hexDarken(hex, f) {
  hex = hex.replace('#','');
  if (hex.length===3) hex=hex.split('').map(c=>c+c).join('');
  const r=Math.floor(parseInt(hex.slice(0,2),16)*f);
  const g=Math.floor(parseInt(hex.slice(2,4),16)*f);
  const b=Math.floor(parseInt(hex.slice(4,6),16)*f);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// ===== AUDIO DEFINITIONS =====
const NOTE_FREQ = (() => {
  const base = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  return function(n) {
    if (n === 'R') return 0;
    const m = n.match(/^([A-G])(#|b)?(\d)$/);
    if (!m) return 261.63;
    // C4 = 261.63 Hz を基準とする
    const semi = (parseInt(m[3]) - 4) * 12 + base[m[1]] + (m[2]==='#'?1:m[2]==='b'?-1:0);
    return 261.63 * Math.pow(2, semi / 12);
  };
})();

const BGM_DEFS = {
  field: {
    bpm: 100, type: 'sine',
    notes: [
      ['C4',0.5],['E4',0.5],['G4',0.5],['C5',0.5],
      ['B4',0.5],['G4',0.5],['E4',0.5],['G4',0.5],
      ['A4',0.5],['C5',0.5],['E5',0.5],['A4',0.5],
      ['G4',1.0],['R',0.5],['E4',0.5],
      ['F4',0.5],['A4',0.5],['C5',0.5],['F4',0.5],
      ['E4',1.0],['R',0.5],['G4',0.5],
      ['D4',0.5],['F4',0.5],['A4',0.5],['D4',0.5],
      ['C4',2.0],
    ],
  },
  night: {
    bpm: 68, type: 'triangle',
    notes: [
      ['A3',1.0],['C4',1.0],['E4',1.0],['A4',2.0],['R',1.0],
      ['G3',1.0],['B3',1.0],['D4',1.0],['G4',2.0],['R',1.0],
      ['F3',1.0],['A3',1.0],['C4',1.0],['F4',2.0],['R',1.0],
      ['E3',1.0],['G3',1.0],['B3',1.0],['E4',2.0],['R',1.0],
    ],
  },
  quiz: {
    bpm: 128, type: 'square',
    notes: [
      ['E4',0.5],['G4',0.5],['A4',0.5],['B4',0.5],
      ['C5',1.0],['B4',0.5],['A4',0.5],
      ['G4',0.5],['A4',0.5],['B4',0.5],['C5',0.5],
      ['D5',1.0],['R',1.0],
      ['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],
      ['A4',1.0],['G4',0.5],['A4',0.5],
      ['B4',0.5],['A4',0.5],['G4',0.5],['F4',0.5],
      ['G4',2.0],
    ],
  },
};

// ===== GAME CLASS =====
class Game {
  constructor() {
    this.state = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.player = null;
    this.cameraAngle = 0; // camera at +z, looking toward -z (north)
    this.cameraPitch = 0.45;
    this.cameraDist = 11;
    this.buildingGroups = {};
    this.resourceNodes = [];
    this.treasureChests = [];
    this.keys = {};
    this.joystick = { active: false, x: 0, y: 0 };
    this.nearResource = null;
    this.nearBuilding = null;
    this.nearTreasure = null;
    this.nearVillager = null;
    this.villagers = [];
    this.mining = null;
    this.gameRunning = false;
    this.frame = 0;
    this.vx = 0; this.vz = 0; // velocity for smooth movement
    this.moveTarget = null; // tap-to-move target {x, z, interact}
    this.cursorAngle = null; // カーソル方向への自動向き（マウスホバーで更新）
    this.worldBound = 28;  // 現在のプレイヤー移動範囲（ゾーン拡張で増加）
    this.playerMaxHp = 6;
    this.playerHp = 6;
    this.invincibleTimer = 0;
    this.playerAttackCd = 0;
    this.zoneDecorMeshes = {}; // ゾーンごとのデコレーションメッシュ
    this.mobs = [];
    this.fireballs = [];
    this.playerStats = {};
    // 昼夜サイクル (0=深夜, 0.25=日の出, 0.5=正午, 0.75=日没)
    this.dayTime = 0.30;
    this.dayCount = 1;
    this.ambientLight = null;
    this.sunLight = null;
    this.sunMesh = null;
    this.moonMesh = null;
    this.mobSpawnTimer = 0;
    this.dayFrame = 0;
    this.isMobile = navigator.maxTouchPoints > 0;
    // Settings & Audio
    this.settings = null;
    this.audioCtx = null;
    this.bgmGain = null;
    this.seGain = null;
    this.currentBgm = null;
    this._bgmTimeout = null;
    this._wasNight = false;
    this._activeOscNodes = [];
    this._syncTimer = null;
    this.insideBuilding = false;
    this.interiorGroup = null;
    this.prevPlayerPos = null;
    this.currentBuildingDef = null;
    this.nearBuildingAction = null;
    this.currentBuildingAction = null;
    this.actionIndicatorMesh = null;
    this.lookState = { up: false, down: false };
    // 当日の回答集計（1日の終わりに自動難易度調整に使う）
    this.todayCorrect = 0;
    this.todayWrong   = 0;
    this.todayLog     = {};  // subject -> {c, w} (当日の教科別集計)
    // questions.csv から読み込んだデータ（null = まだ未ロード）
    this.quizData = null;
  }

  // ===== STATS & ADAPTIVE =====
  initQuestionIds() {
    ['math','japanese','english'].forEach(subject => {
      const sd = this.quizData[subject];
      Object.entries(sd.grades).forEach(([grade, qs]) => {
        qs.forEach((q, i) => {
          if (!q.id) q.id = `${subject}_g${grade}_${String(i).padStart(3,'0')}`;
          q.grade = parseInt(grade);
          q.subject = subject;
        });
      });
    });
  }

  loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch(e) { return {}; }
  }

  saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(this.playerStats)); } catch(e) {}
  }

  updateQuestionStat(id, isCorrect) {
    if (!id) return;
    if (!this.playerStats[id]) this.playerStats[id] = { seen:0, correct:0, wrong:0, streak:0 };
    const s = this.playerStats[id];
    s.seen++;
    if (isCorrect) { s.correct++; s.streak = (s.streak||0)+1; }
    else { s.wrong++; s.streak = 0; s.lastWrong = Date.now(); }
    this.saveStats();
  }

  getWeakTopics() {
    const topicStats = {};
    Object.entries(this.playerStats).forEach(([id, stat]) => {
      const parts = id.split('_');
      if (parts.length < 3) return;
      const topic = parts.slice(2).join('_');
      if (!topicStats[topic]) topicStats[topic] = { correct:0, total:0 };
      topicStats[topic].correct += stat.correct;
      topicStats[topic].total += stat.seen;
    });
    return Object.entries(topicStats)
      .filter(([,s]) => s.total >= 3 && s.correct/s.total < 0.65)
      .map(([topic]) => topic);
  }

  // ===== CSV 問題ロード =====
  async loadCustomQuestions() {
    let rows = null;
    try {
      const res = await fetch('./questions.csv', { cache: 'no-cache' });
      if (res.ok) {
        const text = await res.text();
        rows = this.parseCSV(text);
        localStorage.setItem(CUSTOM_Q_KEY, JSON.stringify(rows));
        // フィンガープリントで更新検知
        const fp = text.length + '|' + text.slice(0, 300);
        const prevFp = localStorage.getItem('mclearn3d_csv_fp');
        if (prevFp && prevFp !== fp) this.csvUpdated = true;
        localStorage.setItem('mclearn3d_csv_fp', fp);
      }
    } catch(e) {}
    if (!rows) {
      try {
        const cached = localStorage.getItem(CUSTOM_Q_KEY);
        if (cached) rows = JSON.parse(cached);
      } catch(e) {}
    }
    this.quizData = (rows && rows.length > 0) ? this.buildQuizData(rows) : QUIZ_DATA;
  }

  parseCSV(text) {
    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim());
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] !== undefined ? vals[i] : ''; });
      return obj;
    }).filter(r => r.subject && r.question && r.opt1 && (r.opt2 || r.type === 'write'));
  }

  buildQuizData(rows) {
    const data = {
      math:     { grades: {} },
      japanese: { grades: {} },
      english:  { grades: {} },
    };
    rows.forEach((r, idx) => {
      const subj = r.subject;
      if (!data[subj]) return;
      const grade = r.grade || '2';
      if (!data[subj].grades[grade]) data[subj].grades[grade] = [];
      const opts = [r.opt1, r.opt2, r.opt3, r.opt4].filter(Boolean);
      data[subj].grades[grade].push({
        id: r.id || `${subj}_${grade}_csv${idx}`,
        q: r.question,
        opts,
        correct: parseInt(r.correct) || 0,
        explain: r.explain || '',
        diff: r.diff || 'normal',
        type: r.type || 'choice',
      });
    });
    return data;
  }

  // 1日の終わりに呼ばれる。正解率から adaptiveBias を更新する
  onNewDay() {
    const total = this.todayCorrect + this.todayWrong;
    if (total >= 3) {
      const acc = this.todayCorrect / total;
      const prev = this.state.adaptiveBias || 0;
      let next = prev;
      if (acc >= 0.80 && next < 2)  next++;
      if (acc <  0.50 && next > -2) next--;
      if (next !== prev) {
        this.state.adaptiveBias = next;
        const pct = Math.round(acc * 100);
        const msg = next > prev
          ? `🌟 もんだいレベルアップ！\n正解率 ${pct}% → すこし むずかしくなるよ`
          : `🌱 もんだいを やさしくしました\n正解率 ${pct}% → もう すこし がんばろう`;
        this._showToast(msg);
        this.saveState();
      }
    }
    this.todayCorrect = 0;
    this.todayWrong   = 0;
    this.todayLog     = {};
  }

  // ===== DAILY LOG =====
  loadDailyLog() {
    try { return JSON.parse(localStorage.getItem(DAILY_LOG_KEY)) || {}; } catch(e) { return {}; }
  }

  saveDailyLog(log) {
    try { localStorage.setItem(DAILY_LOG_KEY, JSON.stringify(log)); } catch(e) {}
  }

  // 当日のログを保存（毎回答後に呼ぶ）
  _saveTodayLog() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const allLogs = this.loadDailyLog();
    allLogs[today] = {
      correct: this.todayCorrect,
      wrong: this.todayWrong,
      subjects: JSON.parse(JSON.stringify(this.todayLog)),
    };
    // 30日より古いエントリを削除
    const keys = Object.keys(allLogs).sort();
    if (keys.length > 30) keys.slice(0, keys.length - 30).forEach(k => delete allLogs[k]);
    this.saveDailyLog(allLogs);
  }

  // 起動時に当日の既存ログを復元（再起動しても当日分が引き継がれる）
  _restoreTodayLog() {
    const today = new Date().toISOString().slice(0, 10);
    const allLogs = this.loadDailyLog();
    if (allLogs[today]) {
      this.todayCorrect = allLogs[today].correct || 0;
      this.todayWrong   = allLogs[today].wrong   || 0;
      this.todayLog     = allLogs[today].subjects || {};
    }
  }

  _showToast(msg) {
    const div = document.createElement('div');
    div.textContent = msg;
    div.style.cssText = [
      'position:fixed', 'top:50%', 'left:50%',
      'transform:translate(-50%,-50%)',
      'background:rgba(0,0,0,0.82)', 'color:#fff',
      'padding:18px 28px', 'border-radius:14px',
      'font-family:inherit', 'font-weight:900', 'font-size:1.05rem',
      'z-index:9999', 'text-align:center', 'white-space:pre-line',
      'pointer-events:none', 'line-height:1.6',
    ].join(';');
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }

  // ===== ACHIEVEMENTS =====
  _subjectCorrect(subj) {
    const grades = this.quizData?.[subj]?.grades || {};
    return Object.values(grades).flat().reduce((sum, q) => sum + (this.playerStats[q.id]?.correct || 0), 0);
  }

  _unlockedBuildingCount() {
    return BUILDING_DEFS.filter(b => b.cond(this.state)).length;
  }

  checkAchievements() {
    if (!this.state.achievements) this.state.achievements = [];
    const unlocked = this.state.achievements;
    const newOnes = [];
    for (const a of ACHIEVEMENTS) {
      if (unlocked.includes(a.id)) continue;
      if (a.cond(this.state, this)) {
        unlocked.push(a.id);
        newOnes.push(a);
      }
    }
    if (newOnes.length) {
      this.saveState();
      this._updateAchievementHud();
      newOnes.forEach((a, i) => {
        setTimeout(() => this._showAchievementToast(a), i * 1200);
      });
    }
  }

  _showAchievementToast(a) {
    const div = document.createElement('div');
    div.innerHTML = `🏅 じっせき かいほう！<br><strong>${a.icon} ${a.label}</strong>`;
    div.style.cssText = [
      'position:fixed', 'top:64px', 'left:50%', 'transform:translateX(-50%)',
      'background:linear-gradient(135deg,#7a5500,#c8900a)',
      'border:2px solid #ffd700', 'border-radius:12px',
      'padding:12px 24px', 'font-size:0.95rem', 'color:#fff',
      'z-index:9999', 'text-align:center', 'white-space:pre-line',
      'box-shadow:0 0 20px #ffd70066', 'pointer-events:none',
      'font-family:inherit', 'font-weight:700', 'line-height:1.6',
    ].join(';');
    document.body.appendChild(div);
    setTimeout(() => { div.style.transition = 'opacity 0.5s'; div.style.opacity = '0'; }, 2500);
    setTimeout(() => div.remove(), 3100);
  }

  _updateAchievementHud() {
    const el = document.getElementById('hud-achievements');
    if (!el) return;
    const count = (this.state.achievements || []).length;
    el.textContent = `🏅 ${count} / ${ACHIEVEMENTS.length}`;
  }

  // ===== CRAFTING =====
  openCraftMenu() {
    const list = document.getElementById('craft-list');
    list.innerHTML = '';
    const inv = this.state.inventory || {};
    for (const r of CRAFT_RECIPES) {
      const done = r.once && (this.state.crafted || []).includes(r.id);
      const canAfford = Object.entries(r.needs).every(([k, v]) => (inv[k] || 0) >= v);
      const needsHtml = Object.entries(r.needs).map(([k, v]) => {
        const have = inv[k] || 0;
        return `<span style="color:${have>=v?'#7cf07c':'#f88'}">${RESOURCE_DEFS[k].icon}×${v}(${have})</span>`;
      }).join(' ');
      const div = document.createElement('div');
      div.className = 'craft-item';
      div.innerHTML = `
        <span class="craft-item-icon">${r.icon}</span>
        <div class="craft-item-info">
          <div class="craft-item-name">${r.name}</div>
          <div class="craft-item-needs">${needsHtml}</div>
          <div class="craft-item-reward">→ ${r.desc}</div>
          ${done ? '<div class="craft-item-crafted">✅ つくりずみ</div>' : ''}
        </div>
        <button class="btn-do-craft" ${!canAfford || done ? 'disabled' : ''} data-id="${r.id}">つくる</button>
      `;
      list.appendChild(div);
    }
    list.querySelectorAll('.btn-do-craft:not(:disabled)').forEach(btn => {
      btn.onclick = () => this.doCraft(btn.dataset.id);
    });
    document.getElementById('craft-menu').classList.remove('hidden');
  }

  doCraft(id) {
    const r = CRAFT_RECIPES.find(x => x.id === id);
    if (!r) return;
    const inv = this.state.inventory;
    for (const [k, v] of Object.entries(r.needs)) inv[k] = (inv[k] || 0) - v;
    if (r.reward.xp)    this.addXP(r.reward.xp);
    if (r.reward.hp) {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + r.reward.hp);
      this._updateHpHud();
    }
    if (r.reward.maxHp) {
      this.playerMaxHp += r.reward.maxHp;
      this.playerHp = Math.min(this.playerHp + r.reward.maxHp, this.playerMaxHp);
      this._updateHpHud();
    }
    if (r.once) {
      if (!this.state.crafted) this.state.crafted = [];
      this.state.crafted.push(r.id);
    }
    this.updateInventoryHUD();
    this.saveState();
    this.playSe('unlock');
    this._showToast(`⚒️ ${r.icon} ${r.name} をつくった！`);
    this.checkAchievements();
    this.openCraftMenu();
  }

  // ===== VILLAGER TRADING =====
  openTradeMenu(def) {
    document.getElementById('trade-villager-name').textContent = `${def.icon} ${def.name}`;
    const list = document.getElementById('trade-list');
    list.innerHTML = '';
    const inv = this.state.inventory || {};
    for (const trade of def.trades) {
      const canAfford = Object.entries(trade.needs).every(([k, v]) => (inv[k] || 0) >= v);
      const needsHtml = Object.entries(trade.needs).map(([k, v]) => {
        const have = inv[k] || 0;
        return `<span style="color:${have>=v?'#7cf07c':'#f88'}">${RESOURCE_DEFS[k].icon}×${v}(${have})</span>`;
      }).join(' ');
      const div = document.createElement('div');
      div.className = 'craft-item';
      div.innerHTML = `
        <span class="craft-item-icon">${trade.icon}</span>
        <div class="craft-item-info">
          <div class="craft-item-name">${trade.label}</div>
          <div class="craft-item-needs">${needsHtml}</div>
        </div>
        <button class="btn-do-craft" ${!canAfford ? 'disabled' : ''} data-id="${def.trades.indexOf(trade)}">こうかん</button>
      `;
      list.appendChild(div);
    }
    list.querySelectorAll('.btn-do-craft:not(:disabled)').forEach(btn => {
      btn.onclick = () => this.doTrade(def, def.trades[parseInt(btn.dataset.id)]);
    });
    document.getElementById('trade-menu').classList.remove('hidden');
  }

  doTrade(def, trade) {
    const inv = this.state.inventory;
    if (!Object.entries(trade.needs).every(([k, v]) => (inv[k] || 0) >= v)) return;
    for (const [k, v] of Object.entries(trade.needs)) inv[k] = (inv[k] || 0) - v;
    let msg = `🤝 ${def.name}と こうかんした！`;
    if (trade.reward.xp)     { this.addXP(trade.reward.xp); msg += ` ＋${trade.reward.xp}XP`; }
    if (trade.reward.hp)     { this.playerHp = Math.min(this.playerMaxHp, this.playerHp + trade.reward.hp); this._updateHpHud(); }
    if (trade.reward.hpFull) { this.playerHp = this.playerMaxHp; this._updateHpHud(); }
    if (trade.reward.diamond){ inv.diamond = (inv.diamond || 0) + trade.reward.diamond; }
    this.state.totalTrades = (this.state.totalTrades || 0) + 1;
    this.updateInventoryHUD();
    this.saveState();
    this.playSe('unlock');
    this._showToast(msg);
    this.checkAchievements();
    this.openTradeMenu(def);
  }

  // ===== DAILY LOGIN BONUS =====
  _getDailyBonus(streak) {
    if (streak % 7 === 0) return { items:{gold:1, stone:2}, xp:30, special:'🎊 7日ごほうびスペシャル！' };
    if (streak >= 5)      return { items:{iron:1, stone:1}, xp:20 };
    if (streak >= 3)      return { items:{stone:2},         xp:15 };
                          return { items:{wood:2},           xp:10 };
  }

  _checkDailyLogin() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.state.lastLoginDate === today) return;

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const streak = (this.state.lastLoginDate === yesterday)
      ? (this.state.loginStreak || 0) + 1
      : 1;
    this.state.loginStreak   = streak;
    this.state.lastLoginDate = today;
    this.state.totalLoginDays = (this.state.totalLoginDays || 0) + 1;
    this.saveState();

    const bonus = this._getDailyBonus(streak);
    const streakEl = document.getElementById('daily-streak');
    const itemsEl  = document.getElementById('daily-items');

    const streakLabel = (streak > 1 && streak % 7 === 0)
      ? `🎊 ${streak}日れんぞく！ すごい！`
      : streak > 1
        ? `🔥 ${streak}日れんぞく！`
        : '🌱 きょうも がくしゅうしよう！';
    streakEl.textContent = streakLabel;

    let html = '';
    if (bonus.special) html += `<div style="color:#ffd700;margin-bottom:8px">${bonus.special}</div>`;
    for (const [k, v] of Object.entries(bonus.items)) {
      html += `<div>${RESOURCE_DEFS[k].icon} ${RESOURCE_DEFS[k].name} ×${v}</div>`;
    }
    html += `<div style="margin-top:6px">✨ XP ＋${bonus.xp}</div>`;
    itemsEl.innerHTML = html;

    document.getElementById('btn-daily-ok').onclick = () => {
      document.getElementById('daily-bonus').classList.add('hidden');
      for (const [k, v] of Object.entries(bonus.items)) {
        this.state.inventory[k] = (this.state.inventory[k] || 0) + v;
      }
      this.addXP(bonus.xp);
      this.updateInventoryHUD();
      this.saveState();
      this.checkAchievements();
    };

    setTimeout(() => document.getElementById('daily-bonus').classList.remove('hidden'), 1200);
  }

  // ===== DAILY QUESTS =====
  _initDailyQuests() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.state.questDate === today) return;
    const shuffled = [...QUEST_POOL].sort(() => Math.random() - 0.5);
    this.state.questDate        = today;
    this.state.activeQuestIds   = shuffled.slice(0, 3).map(q => q.id);
    this.state.completedQuestIds = [];
    this.saveState();
  }

  checkQuests() {
    if (!this.state.activeQuestIds) return;
    const completed = this.state.completedQuestIds || [];
    let anyNew = false;
    for (const id of this.state.activeQuestIds) {
      if (completed.includes(id)) continue;
      const quest = QUEST_POOL.find(q => q.id === id);
      if (!quest || !quest.check(this)) continue;
      completed.push(id);
      anyNew = true;
      this.state.totalQuestsCompleted = (this.state.totalQuestsCompleted || 0) + 1;
      if (quest.reward.xp)   this.addXP(quest.reward.xp);
      if (quest.reward.item) {
        const k = quest.reward.item;
        this.state.inventory[k] = (this.state.inventory[k] || 0) + 1;
        this.updateInventoryHUD();
      }
      this._showToast(`📋 クエスト かんりょう！\n${quest.icon} ${quest.label}`);
    }
    if (anyNew) {
      this.state.completedQuestIds = completed;
      this.saveState();
      this._updateQuestBtn();
      this.checkAchievements();
    }
  }

  openQuestPanel() {
    const list = document.getElementById('quest-list');
    list.innerHTML = '';
    const active    = this.state.activeQuestIds   || [];
    const completed = this.state.completedQuestIds || [];
    for (const id of active) {
      const quest = QUEST_POOL.find(q => q.id === id);
      if (!quest) continue;
      const done = completed.includes(id);
      const div = document.createElement('div');
      div.className = 'quest-item' + (done ? ' quest-done' : '');
      div.innerHTML = `
        <span class="quest-icon">${done ? '✅' : quest.icon}</span>
        <div class="quest-label">${quest.label}</div>
        <span class="quest-reward">${done ? 'クリア！' : `XP＋${quest.reward.xp}`}</span>
      `;
      list.appendChild(div);
    }
    document.getElementById('quest-panel').classList.remove('hidden');
  }

  _updateQuestBtn() {
    const el = document.getElementById('btn-quest');
    if (!el) return;
    const done  = (this.state.completedQuestIds || []).length;
    const total = (this.state.activeQuestIds    || []).length || 3;
    el.textContent = `📋 ${done}/${total}`;
  }

  selectAdaptiveQuestions(subject, count) {
    const sd = this.quizData[subject];
    const maxGrade = GRADE_FOR_LEVEL(this.state.level);
    const reviewPool = [], normalPool = [], previewPool = [], solvedPool = [];
    const shuf = arr => [...arr].sort(() => Math.random()-0.5);

    Object.entries(sd.grades).forEach(([grade, qs]) => {
      const g = parseInt(grade);
      if (g > maxGrade + 1) return;
      qs.forEach(q => {
        const diff = this.settings ? this.settings.difficulty : 'normal';
        if (diff === 'easy' && q.diff === 'hard') return;
        if (diff === 'normal' && q.diff === 'hard') return;
        const stat = this.playerStats[q.id] || { seen:0, correct:0, wrong:0 };
        // 正解済みの問題はスキップ（定着バリアントプールへ）
        if (stat.correct > 0) { if (g <= maxGrade) solvedPool.push(q); return; }
        const isWeak = stat.seen >= 2 && stat.wrong > stat.correct;
        if (g > maxGrade)      previewPool.push(q);
        else if (isWeak)       reviewPool.push(q);
        else                   normalPool.push(q);
      });
    });

    if (subject === 'math') {
      this.generateMathPool(maxGrade).forEach(q => normalPool.push(q));
    }

    const selected = [];
    const pick = (pool, n) => shuf(pool).slice(0, n);
    const bias = this.state ? (this.state.adaptiveBias || 0) : 0;
    const diff = this.settings ? this.settings.difficulty : 'normal';
    const maxPreview = (diff === 'easy') ? 0 : Math.max(0, Math.min(bias, 2));
    const maxReview  = bias < 0 ? 3 : 2;
    selected.push(...pick(reviewPool, Math.min(maxReview, reviewPool.length)));
    selected.push(...pick(normalPool, Math.min(count - selected.length - maxPreview, normalPool.length)));
    if (maxPreview && previewPool.length) selected.push(...pick(previewPool, Math.min(maxPreview, previewPool.length)));

    // 問題が足りない場合、解済み問題の定着バリアントで補充
    if (selected.length < count && solvedPool.length) {
      shuf(solvedPool).slice(0, count - selected.length).forEach(q => {
        const v = this.generateRetentionVariant(q);
        if (v) selected.push(v);
      });
    }
    // それでも足りなければ全プールから
    if (selected.length < count) {
      const rest = [...reviewPool, ...normalPool, ...previewPool].filter(q => !selected.includes(q));
      selected.push(...pick(rest, count - selected.length));
    }
    return selected.slice(0, count);
  }

  generateRetentionVariant(q) {
    // truefalse問題: 答えの数値を微妙に変えた「定着確認」バリアントを生成
    if (q.type === 'truefalse') {
      const nums = q.q.match(/\d+/g);
      if (nums && nums.length >= 1) {
        const lastNum = parseInt(nums[nums.length - 1]);
        const delta = lastNum > 5 ? (Math.random() > 0.5 ? 2 : -2) : (Math.random() > 0.5 ? 1 : 2);
        const newNum = Math.max(1, lastNum + delta);
        const re = new RegExp('(^|\\D)' + lastNum + '(\\D|$)');
        const newQText = q.q.replace(re, (m, pre, suf) => pre + newNum + suf);
        return {
          ...q,
          id: 'ret_' + q.id,
          q: '【かくにん】' + newQText,
          correct: 1, // 数値を変えたので×になる（元が○でも×でも、変えた値は不正解）
          opts: ['○', '×'],
        };
      }
    }
    // 選択肢問題: シャッフルして選択肢の位置記憶を防ぐ
    if (q.opts && q.opts.length >= 3) {
      const correctAnswer = q.opts[q.correct];
      const wrongs = q.opts.filter((_, i) => i !== q.correct);
      const shuf = arr => [...arr].sort(() => Math.random() - 0.5);
      const newOpts = shuf([correctAnswer, ...wrongs]);
      return {
        ...q,
        id: 'ret_' + q.id,
        opts: newOpts,
        correct: newOpts.indexOf(correctAnswer),
        q: '【かくにん】' + q.q,
      };
    }
    return null;
  }

  generateMathPool(maxGrade) {
    const pool = [];
    const r = (mn, mx) => mn + Math.floor(Math.random()*(mx-mn+1));
    const shuf = arr => [...arr].sort(() => Math.random()-0.5);
    const wrongs = (ans, n) => {
      const set = new Set();
      let tries = 0;
      while (set.size < n && tries < 50) {
        tries++;
        const w = ans + r(-6,6);
        if (w !== ans && w > 0) set.add(w);
      }
      return [...set].slice(0,n);
    };

    for (let i = 0; i < 10; i++) {
      if (maxGrade >= 2) {
        const a=r(1,20), b=r(1,20), ans=a+b;
        const opts=shuf([ans,...wrongs(ans,3)]);
        pool.push({ id:`gen_add2_${i}`, grade:2, subject:'math',
          q:`${a} ＋ ${b} ＝ ？`, opts:opts.map(String), correct:opts.indexOf(ans),
          explain:`${a}＋${b}＝${ans}！` });
        const c=r(5,25), d=r(1,Math.min(c-1,12)), ans2=c-d;
        const opts2=shuf([ans2,...wrongs(ans2,3)]);
        pool.push({ id:`gen_sub2_${i}`, grade:2, subject:'math',
          q:`${c} ー ${d} ＝ ？`, opts:opts2.map(String), correct:opts2.indexOf(ans2),
          explain:`${c}ー${d}＝${ans2}！` });
      }
      if (maxGrade >= 3) {
        const a=r(2,9), b=r(2,9), ans=a*b;
        const opts=shuf([ans,...wrongs(ans,3)]);
        pool.push({ id:`gen_mult3_${i}`, grade:3, subject:'math',
          q:`${a} × ${b} ＝ ？`, opts:opts.map(String), correct:opts.indexOf(ans),
          explain:`${a}×${b}＝${ans}！${a}のだんで覚えよう！` });
        const c=r(2,9), d=r(2,9), ans2=c*d;
        const opts2=shuf([c,...wrongs(c,3)]);
        pool.push({ id:`gen_div3_${i}`, grade:3, subject:'math',
          q:`${ans2} ÷ ${d} ＝ ？`, opts:opts2.map(String), correct:opts2.indexOf(c),
          explain:`${ans2}÷${d}＝${c}！${d}×${c}＝${ans2}だから！` });
      }
      if (maxGrade >= 4) {
        const a=r(11,29), b=r(2,9), ans=a*b;
        const opts=shuf([ans,...wrongs(ans,3)]);
        pool.push({ id:`gen_mult4_${i}`, grade:4, subject:'math',
          q:`${a} × ${b} ＝ ？`, opts:opts.map(String), correct:opts.indexOf(ans),
          explain:`${a}×${b}＝${ans}！くふうして計算しよう！` });
      }
      if (maxGrade >= 5) {
        const a=r(1,9), b=r(2,9);
        const ans=parseFloat((a*b/10).toFixed(1));
        const ansCents=Math.round(ans*10);
        const opts=shuf([ans,...wrongs(ansCents,3).map(x=>parseFloat((x/10).toFixed(1)))]);
        pool.push({ id:`gen_dec5_${i}`, grade:5, subject:'math',
          q:`0.${a} × ${b} ＝ ？`, opts:opts.map(String), correct:opts.findIndex(x=>x===ans),
          explain:`0.${a}×${b}＝${ans}！小数点に気をつけよう！` });
      }
    }
    return pool;
  }

  // ===== STATE =====
  loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        return {
          ...DEFAULT_STATE,
          ...saved,
          inventory: { ...DEFAULT_STATE.inventory, ...(saved.inventory || {}) },
          unlockedZones: Array.isArray(saved.unlockedZones) ? saved.unlockedZones : [],
          buildingActionCooldown: saved.buildingActionCooldown || {},
        };
      }
    } catch(e) {}
    return { ...DEFAULT_STATE, inventory: { wood:0, stone:0, iron:0, gold:0, diamond:0 }, unlockedZones: [] };
  }

  saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch(e) {}
  }

  resetState() {
    this._clearZoneDecorations();
    this.worldBound = 28;
    if (this.scene && this.scene.fog) this.scene.fog.density = 0.016;
    this.state = { ...DEFAULT_STATE, inventory: { wood:0, stone:0, iron:0, gold:0, diamond:0 }, unlockedZones: [] };
    this.saveState();
  }

  // ===== SETTINGS =====
  loadSettings() {
    try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
    catch(e) { return { ...DEFAULT_SETTINGS }; }
  }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch(e) {}
  }

  openSettings() {
    const s = this.settings;
    const panel = document.getElementById('settings-panel');
    // スピードボタン
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.speed) === s.speed);
    });
    // 難易度ボタン
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.diff === (s.difficulty || 'normal'));
    });
    // 音量スライダー
    const bgmSlider = document.getElementById('settings-bgm');
    const seSlider  = document.getElementById('settings-se');
    bgmSlider.value = Math.round(s.bgmVol * 100);
    seSlider.value  = Math.round(s.seVol  * 100);
    document.getElementById('settings-bgm-val').textContent = bgmSlider.value + '%';
    document.getElementById('settings-se-val').textContent  = seSlider.value  + '%';
    // Cloud sync
    const tokenEl = document.getElementById('settings-token');
    if (tokenEl) tokenEl.value = s.githubToken || '';
    this._updateSyncStatus();
    panel.classList.remove('hidden');
  }

  closeSettings() {
    const tokenEl = document.getElementById('settings-token');
    if (tokenEl) this.settings.githubToken = tokenEl.value.trim();
    document.getElementById('settings-panel').classList.add('hidden');
    this.saveSettings();
  }

  exportStats() {
    const questions = [];
    ['math','japanese','english'].forEach(subj => {
      const grades = this.quizData?.[subj]?.grades || {};
      Object.entries(grades).forEach(([grade, qs]) => {
        qs.forEach(q => {
          const stat = this.playerStats[q.id] || { seen:0, correct:0, wrong:0, streak:0 };
          questions.push({
            id: q.id, subject: subj, grade: parseInt(grade),
            q: q.q, diff: q.diff || 'normal',
            seen: stat.seen, correct: stat.correct, wrong: stat.wrong,
            streak: stat.streak || 0,
          });
        });
      });
    });
    const data = JSON.stringify({ exportedAt: new Date().toISOString(), questions }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'minecraft-stats.json'; a.click();
    URL.revokeObjectURL(url);
    this._showToast('📊 せいせきを エクスポートしました！\ntools/dashboard.js で ひらいてね');
  }

  // ===== CLOUD SYNC (GitHub Gist) =====
  async syncStatsToGitHub() {
    const token = this.settings.githubToken;
    if (!token) return;
    const questions = [];
    ['math','japanese','english'].forEach(subj => {
      const grades = this.quizData?.[subj]?.grades || {};
      Object.entries(grades).forEach(([grade, qs]) => {
        qs.forEach(q => {
          const s = this.playerStats[q.id] || { seen:0, correct:0, wrong:0 };
          questions.push({ id:q.id, q:q.q, subj, grade:parseInt(grade), diff:q.diff||'normal',
            seen:s.seen, correct:s.correct, wrong:s.wrong });
        });
      });
    });
    const payload = { syncedAt: new Date().toISOString(), level: this.state.level, questions };
    const fileContent = JSON.stringify(payload);
    let gistId = null;
    try { const saved = JSON.parse(localStorage.getItem(SYNC_GIST_KEY) || 'null'); gistId = saved?.id || null; } catch(e) {}
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      let res;
      if (gistId) {
        res = await fetch(`https://api.github.com/gists/${gistId}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ files: { 'minecraft-stats.json': { content: fileContent } } }),
        });
      } else {
        res = await fetch('https://api.github.com/gists', {
          method: 'POST', headers,
          body: JSON.stringify({ description: 'Minecraft Learning Stats', public: false, files: { 'minecraft-stats.json': { content: fileContent } } }),
        });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      localStorage.setItem(SYNC_GIST_KEY, JSON.stringify({ id: json.id, syncedAt: payload.syncedAt }));
      this._updateSyncStatus();
    } catch(e) {
      console.warn('Gist sync failed:', e);
    }
  }

  _scheduleSyncToGitHub() {
    if (!this.settings.githubToken) return;
    if (this._syncTimer) clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => { this._syncTimer = null; this.syncStatsToGitHub(); }, 5000);
  }

  _updateSyncStatus() {
    const el = document.getElementById('sync-status');
    if (!el) return;
    if (!this.settings.githubToken) { el.textContent = 'トークン未設定'; return; }
    try {
      const saved = JSON.parse(localStorage.getItem(SYNC_GIST_KEY) || 'null');
      if (saved?.syncedAt) {
        const d = new Date(saved.syncedAt);
        el.textContent = `最終同期: ${d.toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}`;
      } else {
        el.textContent = 'まだ同期していません';
      }
    } catch(e) { el.textContent = 'まだ同期していません'; }
  }

  // ===== QUESTION REVIEW =====
  openReviewPanel() {
    this._reviewSubj = 'all';
    this._reviewIdx = 0;
    this._buildReviewList();
    this._renderReviewCard();
    document.getElementById('review-panel').classList.remove('hidden');
  }

  _buildReviewList() {
    this._reviewList = [];
    const subjects = this._reviewSubj === 'all' ? ['math','japanese','english'] : [this._reviewSubj];
    subjects.forEach(subj => {
      const grades = this.quizData?.[subj]?.grades || {};
      Object.entries(grades).forEach(([grade, qs]) => {
        qs.forEach(q => this._reviewList.push({ q, subj, grade: parseInt(grade) }));
      });
    });
    this._reviewIdx = 0;
  }

  _renderReviewCard() {
    const counter = document.getElementById('review-counter');
    const card = document.getElementById('review-card');
    const total = this._reviewList.length;
    if (!total) {
      counter.textContent = '0 問';
      card.innerHTML = '<div class="rv-q" style="color:#888">もんだいがありません</div>';
      document.getElementById('btn-rv-prev').disabled = true;
      document.getElementById('btn-rv-next').disabled = true;
      return;
    }
    const idx = this._reviewIdx;
    counter.textContent = `${idx + 1} / ${total}`;
    const { q, subj, grade } = this._reviewList[idx];
    const stat = this.playerStats[q.id] || { seen:0, correct:0, wrong:0 };
    const subjLabel = { math:'さんすう', japanese:'こくご', english:'えいご' }[subj] || subj;
    const diffLabel = { easy:'かんたん', normal:'ふつう', hard:'むずかしい' }[q.diff || 'normal'];
    const statsHtml = stat.seen === 0
      ? '<div class="rv-unseen">まだ といていない</div>'
      : `<div class="rv-stats"><span class="rv-stat-ok">✅ ${stat.correct}かい せいかい</span><span class="rv-stat-ng">❌ ${stat.wrong}かい まちがい</span></div>`;
    card.innerHTML = `
      <div class="rv-meta">
        <span class="rv-badge">${subjLabel}</span>
        <span class="rv-badge">${grade}ねんせい</span>
        <span class="rv-badge">${diffLabel}</span>
      </div>
      <div class="rv-q">${q.q}</div>
      ${statsHtml}
    `;
    document.getElementById('btn-rv-prev').disabled = idx === 0;
    document.getElementById('btn-rv-next').disabled = idx === total - 1;
  }

  // ===== AUDIO =====
  initAudio() {
    if (this.audioCtx) {
      // すでに作成済みの場合は resume だけ呼ぶ
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      return;
    }
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.bgmGain = this.audioCtx.createGain();
      this.bgmGain.gain.value = this.settings.bgmVol;
      this.bgmGain.connect(this.audioCtx.destination);
      this.seGain = this.audioCtx.createGain();
      this.seGain.gain.value = this.settings.seVol;
      this.seGain.connect(this.audioCtx.destination);
      // ブラウザのAutoplay Policy対応: ユーザー操作後でも suspended のことがある
      this.audioCtx.resume();
    } catch(e) { this.audioCtx = null; }
  }

  playBgm(name) {
    if (!this.audioCtx) return;
    if (this.currentBgm === name) return;
    this.stopBgm();
    this.currentBgm = name;
    this._scheduleBgm(name);
  }

  stopBgm() {
    if (this._bgmTimeout) { clearTimeout(this._bgmTimeout); this._bgmTimeout = null; }
    if (this.audioCtx && this._activeOscNodes.length > 0) {
      const now = this.audioCtx.currentTime;
      this._activeOscNodes.forEach(({ osc, g }) => {
        try {
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(g.gain.value || 0, now);
          g.gain.linearRampToValueAtTime(0, now + 0.08);
          osc.stop(now + 0.1);
        } catch(e) {}
      });
    }
    this._activeOscNodes = [];
    this.currentBgm = null;
  }

  _scheduleBgm(name) {
    if (this.currentBgm !== name || !this.audioCtx || this.settings.bgmVol < 0.01) return;
    const ac = this.audioCtx;

    const doSchedule = () => {
      if (this.currentBgm !== name) return;
      const def = BGM_DEFS[name];
      const beatSec = 60 / def.bpm;
      let t = ac.currentTime + 0.15;
      let totalSec = 0;

      def.notes.forEach(([n, dur]) => {
        const freq = NOTE_FREQ(n);
        const noteSec = dur * beatSec;
        if (freq > 0) {
          const osc = ac.createOscillator();
          const g   = ac.createGain();
          osc.type = def.type;
          osc.frequency.value = freq;
          const vol = name === 'quiz' ? 0.15 : 0.35;
          const fadeIn  = Math.min(0.04, noteSec * 0.15);
          const fadeOut = Math.min(0.08, noteSec * 0.25);
          g.gain.setValueAtTime(0.001, t);
          g.gain.linearRampToValueAtTime(vol, t + fadeIn);
          g.gain.setValueAtTime(vol, Math.max(t + fadeIn, t + noteSec - fadeOut));
          g.gain.linearRampToValueAtTime(0.001, t + noteSec);
          osc.connect(g);
          g.connect(this.bgmGain);
          osc.start(t);
          osc.stop(t + noteSec);
          this._activeOscNodes.push({ osc, g });
        }
        t += noteSec;
        totalSec += noteSec;
      });

      this._bgmTimeout = setTimeout(() => this._scheduleBgm(name), (totalSec - 0.2) * 1000);
    };

    // AudioContext が suspended のまま音符をスケジュールするとタイミングがずれるため
    // resume を確実に待ってからスケジュールする
    if (ac.state === 'suspended') {
      ac.resume().then(doSchedule).catch(() => {});
    } else {
      doSchedule();
    }
  }

  playSe(name) {
    if (!this.audioCtx || this.settings.seVol < 0.01) return;
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    const ac = this.audioCtx;
    const vol = this.settings.seVol;

    const tone = (freq, dur, type='sine', startVol=0.35) => {
      const osc = ac.createOscillator();
      const g   = ac.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.setValueAtTime(startVol * vol, ac.currentTime);
      g.gain.linearRampToValueAtTime(0, ac.currentTime + dur);
      osc.connect(g); g.connect(this.seGain);
      osc.start(); osc.stop(ac.currentTime + dur);
    };

    const sweep = (f0, f1, dur, type='sine') => {
      const osc = ac.createOscillator();
      const g   = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, ac.currentTime);
      osc.frequency.linearRampToValueAtTime(f1, ac.currentTime + dur);
      g.gain.setValueAtTime(0.35 * vol, ac.currentTime);
      g.gain.linearRampToValueAtTime(0, ac.currentTime + dur);
      osc.connect(g); g.connect(this.seGain);
      osc.start(); osc.stop(ac.currentTime + dur);
    };

    if (name === 'correct') {
      sweep(523, 784, 0.25);
      setTimeout(() => tone(1047, 0.2), 180);
    } else if (name === 'wrong') {
      sweep(330, 180, 0.35, 'sawtooth');
    } else if (name === 'levelup') {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.3), i * 110));
    } else if (name === 'unlock') {
      [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle'), i * 90));
    } else if (name === 'portal') {
      sweep(440, 660, 0.2);
      setTimeout(() => sweep(660, 440, 0.15), 150);
    } else if (name === 'start') {
      [261, 330, 392, 523].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sine', 0.28), i * 120));
    } else if (name === 'hurt') {
      sweep(300, 180, 0.2, 'square');
    } else if (name === 'death') {
      [440, 330, 220, 147].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'sawtooth', 0.38), i * 110));
    }
  }

  lvText(lv) {
    if (lv >= 20) return '🌟Lv.' + lv;
    if (lv >= 15) return '💫Lv.' + lv;
    if (lv >= 10) return '⭐Lv.' + lv;
    return 'Lv.' + lv;
  }

  addXP(amount) {
    this.state.xp += amount;
    const need = XP_FOR_LEVEL(this.state.level);
    if (this.state.xp >= need) {
      this.state.xp -= need;
      this.state.level++;
      const banner = document.getElementById('levelup-banner');
      document.getElementById('levelup-lv').textContent = this.lvText(this.state.level);
      banner.classList.remove('hidden');
      setTimeout(() => banner.classList.add('hidden'), 2500);
      this.playSe('levelup');
      this.checkWorldExpansion();
    }
  }

  // ===== THREE.JS INIT =====
  init() {
    const canvas = document.getElementById('game-canvas');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.016);

    this.camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 500);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.isMobile });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth/innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    // Lights
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(this.ambientLight);
    this.sunLight = new THREE.DirectionalLight(0xfff8e0, 0.9);
    this.sunLight.position.set(40, 70, 30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sunLight.shadow.camera, { left:-70, right:70, top:70, bottom:-70, far:200 });
    this.scene.add(this.sunLight);

    this.initQuestionIds();
    this.playerStats = this.loadStats();
    this.buildDayNightVisuals();
    this.buildWorld();
    this.applyWorldZones();
    const savedCharId = localStorage.getItem(CHAR_STORAGE_KEY) || 'steve';
    this.currentChar = CHARACTER_DEFS.find(c=>c.id===savedCharId) || CHARACTER_DEFS[0];
    this.buildPlayer(this.currentChar);
    this.buildBuildings();
    this.buildResourceNodes();
    this.buildTreasureChests();
    this.buildVillagers();
    this.spawnMobs();
    this.setupControls();
    this.loop();
  }

  // ===== WORLD =====
  buildWorld() {
    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshLambertMaterial({ color: 0x4a8a3a })
    );
    ground.rotation.x = -Math.PI/2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Paths
    const pathMat = new THREE.MeshLambertMaterial({ color: 0x888870 });
    [[60,0.1,2,0,0.05,0],[2,0.1,60,0,0.05,0]].forEach(([w,h,d,x,y,z]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), pathMat);
      m.position.set(x,y,z); this.scene.add(m);
    });

    // Trees
    [
      [14,14],[-14,14],[14,-14],[-14,-14],
      [8,-15],[-8,-15],[16,8],[-16,8],
      [20,20],[-20,20],[22,-6],[-22,-6],[6,16],[-6,16],
      [28,0],[-28,0],[0,28],[0,-28],
    ].forEach(([x,z]) => this.addTree(x,z));
  }

  addTree(x, z) {
    const trunkH = 2 + Math.random()*1.5;
    const leavesW = 1.6 + Math.random()*0.8;
    const leavesH = 1.8 + Math.random()*0.6;

    const trunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, trunkH, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x5C3A1E })
    );
    trunk.position.set(x, trunkH/2, z);
    trunk.castShadow = true;
    this.scene.add(trunk);

    const leaves = new THREE.Mesh(
      new THREE.BoxGeometry(leavesW, leavesH, leavesW),
      new THREE.MeshLambertMaterial({ color: 0x2D6A2F })
    );
    leaves.position.set(x, trunkH + leavesH/2 - 0.3, z);
    leaves.castShadow = true;
    this.scene.add(leaves);
  }

  box(w, h, d, color) {
    return new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
  }

  // ===== PLAYER =====
  makeSkinTextures(ch) {
    const self = this;
    function ct(drawFn) {
      const c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      drawFn(g);
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      return t;
    }
    const front = ct(g => {
      g.fillStyle = ch.skin; g.fillRect(0,0,32,32);
      // hair top + sides
      g.fillStyle = ch.hair;
      g.fillRect(0,0,32,7);
      g.fillRect(0,7,3,14); g.fillRect(29,7,3,14);
      // eye whites
      g.fillStyle = '#FFFFFF';
      g.fillRect(4,10,10,8); g.fillRect(18,10,10,8);
      // pupils color
      g.fillStyle = ch.eye;
      g.fillRect(6,11,6,5); g.fillRect(20,11,6,5);
      // dark pupils
      g.fillStyle = '#0A0A20';
      g.fillRect(7,12,3,3); g.fillRect(21,12,3,3);
      // highlight
      g.fillStyle = '#FFFFFF';
      g.fillRect(8,12,1,1); g.fillRect(22,12,1,1);
      // nose
      g.fillStyle = hexDarken(ch.skin, 0.75);
      g.fillRect(14,17,4,3);
      // mouth
      g.fillStyle = '#6A2808'; g.fillRect(10,22,12,2);
      g.fillStyle = '#C06040'; g.fillRect(11,24,10,1);
      // cheeks
      if (ch.cheek) {
        g.globalAlpha=0.55; g.fillStyle=ch.cheek;
        g.fillRect(2,19,5,4); g.fillRect(25,19,5,4);
        g.globalAlpha=1;
      }
      // hat (cap style)
      if (ch.hat && !ch.tophat) {
        g.fillStyle=ch.hat; g.fillRect(0,0,32,6);
        g.fillStyle=hexDarken(ch.hat,0.6); g.fillRect(0,5,32,2);
      }
      // tophat
      if (ch.tophat) {
        g.fillStyle=ch.hat; g.fillRect(8,0,16,10);
        g.fillStyle=hexDarken(ch.hat,0.7); g.fillRect(2,9,28,3);
      }
      // glasses
      if (ch.glasses) {
        g.strokeStyle='#222'; g.lineWidth=1.5;
        g.strokeRect(3.5,9.5,11,9); g.strokeRect(17.5,9.5,11,9);
        g.fillStyle='#222'; g.fillRect(14,13,4,2);
      }
      // evil eyes
      if (ch.evil) {
        g.fillStyle='#FF0000';
        g.fillRect(4,9,11,9); g.fillRect(17,9,11,9);
        g.fillStyle='#000'; g.fillRect(6,11,7,5); g.fillRect(19,11,7,5);
        g.fillStyle='#FF4444'; g.fillRect(7,12,3,2); g.fillRect(20,12,3,2);
      }
      // baby
      if (ch.baby) {
        g.fillStyle=ch.skin; g.fillRect(0,0,32,32);
        g.fillStyle=ch.hair; g.fillRect(6,0,20,6);
        g.fillStyle='#FFFFFF'; g.fillRect(5,10,9,8); g.fillRect(18,10,9,8);
        g.fillStyle=ch.eye; g.fillRect(6,12,7,4); g.fillRect(19,12,7,4);
        g.fillStyle='#0A0A20'; g.fillRect(8,12,3,3); g.fillRect(21,12,3,3);
        g.fillStyle='#FFFFFF'; g.fillRect(9,12,1,1); g.fillRect(22,12,1,1);
        g.fillStyle='#6A2808'; g.fillRect(11,22,10,2);
        if(ch.cheek){g.globalAlpha=0.65;g.fillStyle=ch.cheek;g.fillRect(2,20,6,4);g.fillRect(24,20,6,4);g.globalAlpha=1;}
      }
    });
    const back = ct(g => {
      g.fillStyle=ch.hair; g.fillRect(0,0,32,32);
      g.fillStyle=hexDarken(ch.hair,0.7); g.fillRect(0,10,32,8);
    });
    const sideL = ct(g => {
      g.fillStyle=ch.skin; g.fillRect(0,0,32,32);
      g.fillStyle=ch.hair; g.fillRect(0,0,32,7); g.fillRect(0,7,5,16);
      g.fillStyle=hexDarken(ch.skin,0.82); g.fillRect(24,13,8,6);
    });
    const sideR = ct(g => {
      g.fillStyle=ch.skin; g.fillRect(0,0,32,32);
      g.fillStyle=ch.hair; g.fillRect(0,0,32,7); g.fillRect(27,7,5,16);
      g.fillStyle=hexDarken(ch.skin,0.82); g.fillRect(0,13,8,6);
    });
    const top = ct(g => {
      g.fillStyle=(ch.hat||ch.tophat)?ch.hat:ch.hair; g.fillRect(0,0,32,32);
      g.fillStyle=hexDarken((ch.hat||ch.tophat)?ch.hat:ch.hair,0.7); g.fillRect(4,4,24,24);
    });
    const bot = ct(g => { g.fillStyle=ch.skin; g.fillRect(0,0,32,32); });
    // [+x,-x,+y,-y,+z(front),-z(back)]
    return [sideR, sideL, top, bot, front, back];
  }

  buildPlayer(charDef) {
    if (!charDef) charDef = CHARACTER_DEFS[0];
    if (this.player) {
      this.scene.remove(this.player);
      this.player.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});
    }
    const g = new THREE.Group();
    const pos = this.player ? this.player.position.clone() : new THREE.Vector3(0,0,0);
    const rot = this.player ? this.player.rotation.clone() : new THREE.Euler();

    // Head — textured 6 faces
    const headTexs = this.makeSkinTextures(charDef);
    const headMats = headTexs.map(t => new THREE.MeshLambertMaterial({ map:t }));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5), headMats);
    head.position.y=1.55; head.castShadow=true; g.add(head);

    // Body
    const bodyMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(charDef.shirt) });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.7,0.3), bodyMat);
    body.position.y=1.0; body.castShadow=true; g.add(body);

    // Arms
    const armMat = () => new THREE.MeshLambertMaterial({ color: new THREE.Color(charDef.shirt) });
    const lA = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.65,0.25), armMat());
    lA.position.set(-0.43,1.0,0); g.add(lA);
    const rA = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.65,0.25), armMat());
    rA.position.set(0.43,1.0,0); g.add(rA);

    // Legs
    const pantMat = () => new THREE.MeshLambertMaterial({ color: new THREE.Color(charDef.pants) });
    const lL = new THREE.Mesh(new THREE.BoxGeometry(0.27,0.65,0.27), pantMat());
    lL.position.set(-0.165,0.325,0); g.add(lL);
    const rL = new THREE.Mesh(new THREE.BoxGeometry(0.27,0.65,0.27), pantMat());
    rL.position.set(0.165,0.325,0); g.add(rL);

    // Shoes
    const shoeMat = () => new THREE.MeshLambertMaterial({ color: new THREE.Color(charDef.shoes) });
    const lS = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.18,0.32), shoeMat());
    lS.position.set(-0.165,0.0,0.02); g.add(lS);
    const rS = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.18,0.32), shoeMat());
    rS.position.set(0.165,0.0,0.02); g.add(rS);

    g.position.copy(pos); g.rotation.copy(rot);
    this.scene.add(g);
    this.player=g; this._lA=lA; this._rA=rA; this._lL=lL; this._rL=rL;
  }

  // Character portrait for select screen (Canvas 2D)
  renderPortrait(canvas, ch) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const s = canvas.width / 20;
    // body
    ctx.fillStyle=ch.shirt; ctx.fillRect(4*s,11*s,12*s,7*s);
    // arms
    ctx.fillRect(1*s,11*s,3*s,6*s); ctx.fillRect(16*s,11*s,3*s,6*s);
    // legs
    ctx.fillStyle=ch.pants; ctx.fillRect(5*s,18*s,4*s,5*s); ctx.fillRect(11*s,18*s,4*s,5*s);
    // shoes
    ctx.fillStyle=ch.shoes; ctx.fillRect(4*s,22*s,5*s,2*s); ctx.fillRect(11*s,22*s,5*s,2*s);
    // head
    ctx.fillStyle=ch.skin; ctx.fillRect(5*s,2*s,10*s,9*s);
    // hair
    ctx.fillStyle=ch.hair; ctx.fillRect(5*s,2*s,10*s,3*s);
    ctx.fillRect(5*s,2*s,2*s,6*s); ctx.fillRect(13*s,2*s,2*s,6*s);
    // eyes
    ctx.fillStyle='#FFFFFF'; ctx.fillRect(7*s,6*s,2*s,2*s); ctx.fillRect(11*s,6*s,2*s,2*s);
    ctx.fillStyle=ch.eye; ctx.fillRect(7*s,6*s,2*s,2*s); ctx.fillRect(11*s,6*s,2*s,2*s);
    ctx.fillStyle='#0A0A20'; ctx.fillRect(8*s,7*s,1*s,1*s); ctx.fillRect(12*s,7*s,1*s,1*s);
    ctx.fillStyle='#FFF'; ctx.fillRect(7*s,6*s,1*s,1*s); ctx.fillRect(11*s,6*s,1*s,1*s);
    // mouth
    ctx.fillStyle='#6A2808'; ctx.fillRect(8*s,9*s,4*s,1*s);
    // cheeks
    if(ch.cheek){ctx.globalAlpha=0.6;ctx.fillStyle=ch.cheek;ctx.fillRect(6*s,8*s,1*s,2*s);ctx.fillRect(13*s,8*s,1*s,2*s);ctx.globalAlpha=1;}
    // hat
    if(ch.hat&&!ch.tophat){ctx.fillStyle=ch.hat;ctx.fillRect(5*s,0,10*s,3*s);}
    if(ch.tophat){ctx.fillStyle=ch.hat;ctx.fillRect(7*s,0,6*s,4*s);ctx.fillRect(4*s,3*s,12*s,2*s);}
    // glasses
    if(ch.glasses){ctx.strokeStyle='#222';ctx.lineWidth=0.6;ctx.strokeRect(6*s+0.5,5*s+0.5,3*s-1,3*s-1);ctx.strokeRect(10*s+0.5,5*s+0.5,3*s-1,3*s-1);ctx.fillStyle='#222';ctx.fillRect(9*s,7*s,1*s,1);}
    // evil
    if(ch.evil){ctx.fillStyle='#FF0000';ctx.fillRect(6*s,5*s,3*s,3*s);ctx.fillRect(11*s,5*s,3*s,3*s);}
  }

  // ===== BUILDINGS =====
  buildBuildings() {
    BUILDING_DEFS.forEach(d => this.spawnBuilding(d));
  }

  spawnBuilding(def) {
    const unlocked = def.cond(this.state);
    const g = new THREE.Group();
    const [x,,z] = def.pos, [w,h,d] = def.size;

    if (unlocked) {
      const body = this.box(w,h,d, def.color);
      body.position.y = h/2; body.castShadow = true; body.receiveShadow = true;
      g.add(body);

      const roof = this.box(w+0.6,0.4,d+0.6, def.roofColor);
      roof.position.y = h+0.2; roof.castShadow = true;
      g.add(roof);

      const dh = Math.min(h*0.6, 2);
      const door = this.box(0.7, dh, 0.12, 0x3a1a00);
      door.position.set(0, dh/2, d/2+0.06); g.add(door);

      if (w > 2.5) {
        const win = this.box(0.7,0.6,0.12, 0x88ccff);
        win.position.set(w/3, h*0.62, d/2+0.06); g.add(win);
      }
    } else {
      // Ghost
      const ghost = new THREE.Mesh(
        new THREE.BoxGeometry(w,h,d),
        new THREE.MeshLambertMaterial({ color:0xbbbbbb, transparent:true, opacity:0.2 })
      );
      ghost.position.y = h/2; g.add(ghost);

      const wire = new THREE.Mesh(
        new THREE.BoxGeometry(w+0.05,h+0.05,d+0.05),
        new THREE.MeshBasicMaterial({ color:0x888888, wireframe:true, transparent:true, opacity:0.35 })
      );
      wire.position.y = h/2; g.add(wire);
    }

    g.position.set(x,0,z);
    g.userData = { defId:def.id, unlocked };
    this.scene.add(g);
    this.buildingGroups[def.id] = g;
  }

  refreshBuildings() {
    BUILDING_DEFS.forEach(def => {
      const g = this.buildingGroups[def.id];
      const now = def.cond(this.state);
      if (g && g.userData.unlocked !== now) {
        this.scene.remove(g);
        g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose()); });
        delete this.buildingGroups[def.id];
        this.spawnBuilding(def);
      }
    });
  }

  unlockedCount() { return BUILDING_DEFS.filter(d=>d.cond(this.state)).length; }

  // ===== RESOURCE NODES =====
  buildResourceNodes() {
    this.resourceNodes = [];
    RESOURCE_SPAWN.forEach((spawn, idx) => {
      const def = RESOURCE_DEFS[spawn.type];
      const mat = new THREE.MeshLambertMaterial({ color: def.color });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      mesh.position.set(spawn.pos[0], 0.5, spawn.pos[2]);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.resourceNodes.push({ def, mesh, depleted: false, respawnAt: 0, idx });
    });
  }

  buildTreasureChests() {
    this.treasureChests = [];
    TREASURE_SPAWNS.forEach((spawn, idx) => {
      // 箱本体（茶色）
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x8B5E3C });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.7), bodyMat);
      // 蓋（金色）
      const lidMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.7), lidMat);
      lid.position.y = 0.42;
      body.add(lid);
      body.position.set(spawn.pos[0], 0.3, spawn.pos[2]);
      body.castShadow = true;
      this.scene.add(body);
      // 📦 浮遊インジケーター（DOM overlay）
      const sparkleEl = document.createElement('div');
      sparkleEl.textContent = '📦';
      sparkleEl.style.cssText = 'position:fixed;font-size:1.5rem;pointer-events:none;z-index:50;opacity:0;transition:opacity 0.3s;';
      document.body.appendChild(sparkleEl);
      this.treasureChests.push({ spawn, mesh: body, depleted: false, respawnAt: 0, sparkleEl, idx });
    });
  }

  // ===== MOBS =====
  makeMobHeadTex(type) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const def = MOB_TYPES[type];
    g.fillStyle = def.skin; g.fillRect(0,0,16,16);
    if (type === 'zombie') {
      g.fillStyle='#111'; g.fillRect(2,4,4,5); g.fillRect(10,4,4,5);
      g.fillStyle='#6FDD6F'; g.fillRect(3,5,2,3); g.fillRect(11,5,2,3);
      g.fillStyle='#1A3A1A'; g.fillRect(5,10,6,2);
      g.fillStyle='#CCFFCC'; g.fillRect(4,12,3,1); g.fillRect(9,12,3,1);
    } else if (type === 'creeper') {
      g.fillStyle='#1A1A1A';
      g.fillRect(2,4,3,4); g.fillRect(11,4,3,4);
      g.fillRect(5,9,2,2); g.fillRect(9,9,2,2);
      g.fillRect(4,11,8,4);
    } else if (type === 'skeleton') {
      g.fillStyle='#111'; g.fillRect(2,4,4,5); g.fillRect(10,4,4,5);
      g.fillStyle='#555'; g.fillRect(3,5,2,3); g.fillRect(11,5,2,3);
      g.fillStyle='#111'; g.fillRect(5,9,2,2);
      g.fillStyle='#E8E8E8'; g.fillRect(3,12,2,2); g.fillRect(7,12,2,2); g.fillRect(11,12,2,2);
    } else if (type === 'pig') {
      g.fillStyle='#E88888'; g.fillRect(0,0,16,16);
      g.fillStyle='#222'; g.fillRect(2,4,3,3); g.fillRect(11,4,3,3);
      g.fillStyle='#CC6060'; g.fillRect(3,9,10,5);
      g.fillStyle='#111'; g.fillRect(5,10,2,2); g.fillRect(9,10,2,2);
    } else if (type === 'sheep') {
      g.fillStyle='#222'; g.fillRect(3,5,3,3); g.fillRect(10,5,3,3);
      g.fillStyle='#AAA'; g.fillRect(5,10,6,3);
    } else if (type === 'chicken') {
      g.fillStyle='#222'; g.fillRect(3,4,3,3); g.fillRect(10,4,3,3);
      g.fillStyle='#FF8800'; g.fillRect(5,8,6,2);
      g.fillStyle='#FF4400'; g.fillRect(6,10,4,4);
      g.fillStyle='#FF0000'; g.fillRect(5,12,3,2);
    } else if (type === 'ghast') {
      g.fillStyle='#111';
      g.fillRect(3,5,2,3); g.fillRect(11,5,2,3);
      g.fillRect(4,10,8,2);
      g.fillStyle='#666'; g.fillRect(4,5,1,2); g.fillRect(12,5,1,2);
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
  }

  buildMobMesh(type, spawnX, spawnZ) {
    const def = MOB_TYPES[type];
    const g = new THREE.Group();
    const mkMat = hex => new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
    const skinM = mkMat(def.skin);
    const shirtM = mkMat(def.shirt);
    const pantsM = mkMat(def.pants);
    const shoesM = mkMat(def.shoes);
    const faceTex = this.makeMobHeadTex(type);
    const faceM = new THREE.MeshLambertMaterial({ map: faceTex });
    const headMats = [skinM, skinM, skinM, skinM, faceM, skinM];

    if (type === 'ghast') {
      const hs = 1.2;
      const head = new THREE.Mesh(new THREE.BoxGeometry(hs,hs,hs), headMats);
      g.add(head);
      for (let tx=-1; tx<=1; tx++) for (let tz=-1; tz<=1; tz++) {
        const th = 0.28+Math.random()*0.42;
        const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.1,th,0.1), mkMat(def.skin));
        t2.position.set(tx*0.37, -hs/2-th/2, tz*0.37); g.add(t2);
      }
      g.position.set(spawnX, 9+Math.random()*2, spawnZ);
      g.userData = { type, def, state:'wander', wanderTimer:0, wanderDx:0, wanderDz:0, fireCooldown:Math.floor(120+Math.random()*180), legL:null, legR:null, hp: MOB_COMBAT[type]?.hp ?? 999 };
      return g;
    }

    if (type === 'pig' || type === 'sheep' || type === 'chicken') {
      const bw = type==='chicken'?0.35:0.55;
      const bh = type==='chicken'?0.28:0.38;
      const bd = type==='chicken'?0.42:0.70;
      const body = new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd), shirtM);
      body.position.y = 0.40; g.add(body);
      const hs = type==='chicken'?0.24:0.30;
      const head = new THREE.Mesh(new THREE.BoxGeometry(hs,hs,hs), headMats);
      head.position.set(0, 0.54, bd/2+hs*0.4); g.add(head);
      const lh = type==='chicken'?0.16:0.24, lw = type==='chicken'?0.09:0.12;
      const legFL = new THREE.Mesh(new THREE.BoxGeometry(lw,lh,lw), pantsM); legFL.position.set(-bw*0.28, lh/2, bd*0.27); g.add(legFL);
      const legFR = new THREE.Mesh(new THREE.BoxGeometry(lw,lh,lw), pantsM); legFR.position.set( bw*0.28, lh/2, bd*0.27); g.add(legFR);
      const legBL = new THREE.Mesh(new THREE.BoxGeometry(lw,lh,lw), pantsM); legBL.position.set(-bw*0.28, lh/2,-bd*0.27); g.add(legBL);
      const legBR = new THREE.Mesh(new THREE.BoxGeometry(lw,lh,lw), pantsM); legBR.position.set( bw*0.28, lh/2,-bd*0.27); g.add(legBR);
      if (type === 'sheep') {
        const wool = new THREE.Mesh(new THREE.BoxGeometry(bw+0.12,bh+0.1,bd+0.12), mkMat('#DDDDC8'));
        wool.position.y = 0.42; g.add(wool);
      }
      if (type === 'chicken') {
        const wL = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.18,0.32), mkMat('#EEEEEE'));
        wL.position.set(-bw/2-0.03, 0.42, 0); g.add(wL);
        const wR = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.18,0.32), mkMat('#EEEEEE'));
        wR.position.set( bw/2+0.03, 0.42, 0); g.add(wR);
      }
      g.position.set(spawnX, 0, spawnZ);
      g.userData = { type, def, state:'wander', wanderTimer:0, wanderDx:0, wanderDz:0, fireCooldown:9999, legL:legFL, legR:legBR };
      return g;
    }

    // Biped: zombie, creeper, skeleton
    const hs = 0.44, bh = 0.55, lh = 0.44;
    const head = new THREE.Mesh(new THREE.BoxGeometry(hs,hs,hs), headMats);
    head.position.y = lh+bh+hs/2+0.05; g.add(head);
    const body = new THREE.Mesh(new THREE.BoxGeometry(hs*1.1,bh,hs*0.55), shirtM);
    body.position.y = lh+bh/2; g.add(body);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(hs*0.42,lh,hs*0.42), pantsM);
    legL.position.set(-hs*0.24, lh/2, 0); g.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(hs*0.42,lh,hs*0.42), pantsM);
    legR.position.set( hs*0.24, lh/2, 0); g.add(legR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17,0.46,0.17), shirtM);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.17,0.46,0.17), shirtM);
    if (type === 'zombie') {
      armL.position.set(-hs*0.76, lh+bh-0.05, 0.14); armL.rotation.x = -Math.PI/2.4;
      armR.position.set( hs*0.76, lh+bh-0.05, 0.14); armR.rotation.x = -Math.PI/2.4;
    } else {
      armL.position.set(-hs*0.76, lh+bh*0.5, 0);
      armR.position.set( hs*0.76, lh+bh*0.5, 0);
    }
    g.add(armL); g.add(armR);
    if (type === 'skeleton') {
      const bow = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.54,0.05), mkMat('#8B6914'));
      bow.position.set(hs*0.76+0.14, lh+bh*0.5, 0.12); g.add(bow);
    }
    g.position.set(spawnX, 0, spawnZ);
    g.userData = { type, def, state:'wander', wanderTimer:0, wanderDx:0, wanderDz:0, fireCooldown:9999, legL, legR, hp: MOB_COMBAT[type]?.hp ?? 999 };
    return g;
  }

  // ===== VILLAGERS =====
  buildVillagers() {
    this.villagers.forEach(v => this.scene.remove(v.mesh));
    this.villagers = [];
    VILLAGER_DEFS.forEach(def => {
      const mesh = this.buildVillagerMesh(def);
      this.scene.add(mesh);
      this.villagers.push({ mesh, def });
    });
  }

  buildVillagerMesh(def) {
    const mkMat = hex => new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
    const g = new THREE.Group();
    const hs = 0.44, bh = 0.55, lh = 0.44;
    // head
    const head = new THREE.Mesh(new THREE.BoxGeometry(hs, hs, hs), mkMat(def.skin));
    head.position.y = lh + bh + hs / 2 + 0.05;
    g.add(head);
    // hat
    const brim = new THREE.Mesh(new THREE.BoxGeometry(hs + 0.16, 0.06, hs + 0.16), mkMat(def.hatCol));
    brim.position.y = lh + bh + hs + 0.08 + 0.03;
    g.add(brim);
    const hatTop = new THREE.Mesh(new THREE.BoxGeometry(hs + 0.02, 0.22, hs + 0.02), mkMat(def.hatCol));
    hatTop.position.y = lh + bh + hs + 0.08 + 0.06 + 0.11;
    g.add(hatTop);
    // body
    const body = new THREE.Mesh(new THREE.BoxGeometry(hs * 1.1, bh, hs * 0.55), mkMat(def.shirt));
    body.position.y = lh + bh / 2;
    g.add(body);
    // legs
    const legL = new THREE.Mesh(new THREE.BoxGeometry(hs * 0.42, lh, hs * 0.42), mkMat(def.pants));
    legL.position.set(-hs * 0.24, lh / 2, 0);
    g.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(hs * 0.42, lh, hs * 0.42), mkMat(def.pants));
    legR.position.set(hs * 0.24, lh / 2, 0);
    g.add(legR);
    // arms
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.46, 0.17), mkMat(def.shirt));
    armL.position.set(-hs * 0.76, lh + bh * 0.5, 0);
    g.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.46, 0.17), mkMat(def.shirt));
    armR.position.set(hs * 0.76, lh + bh * 0.5, 0);
    g.add(armR);
    g.position.set(def.x, 0, def.z);
    g.userData = { type: 'villager', def, legL, legR, phase: Math.random() * Math.PI * 2 };
    return g;
  }

  spawnMobs() {
    this.mobs.forEach(m => this.scene.remove(m));
    this.fireballs.forEach(f => this.scene.remove(f));
    this.mobs = [];
    this.fireballs = [];
    INITIAL_MOBS.forEach(sp => {
      const m = this.buildMobMesh(sp.type, sp.x, sp.z);
      this.scene.add(m);
      this.mobs.push(m);
    });
  }

  updateMobs() {
    const px = this.player.position.x, pz = this.player.position.z;
    const night = this.isNightTime();
    const toRemove = [];

    this.mobs.forEach(mob => {
      const ud = mob.userData, def = ud.def;
      const dist = Math.hypot(px - mob.position.x, pz - mob.position.z);

      // ===== デスポーン (距離 > 50 で即、> 35 でランダム) =====
      if (dist > 50 || (dist > 35 && def.hostile && Math.random() < 0.003)) {
        toRemove.push(mob); return;
      }

      // ===== 昼間燃焼 (ゾンビ・スケルトン) =====
      if (def.burnDay && !night) {
        ud.burnTimer = (ud.burnTimer || 0) + 1;
        // 3秒後(180f)から地面に沈む
        if (ud.burnTimer > 180) {
          mob.position.y -= 0.05;
          if (mob.position.y < -3) { toRemove.push(mob); return; }
          return; // 燃焼中は移動しない
        }
        // 炎のチカチカ(スケール微振動)
        const flicker = 1 + 0.04 * Math.sin(ud.burnTimer * 0.8);
        mob.scale.set(flicker, flicker, flicker);
        return;
      } else {
        ud.burnTimer = 0;
        if (!def.flying && !ud.burning) mob.position.y = 0;
      }

      // ===== 浮遊型(ガスト) =====
      if (def.flying) {
        mob.position.y = 9 + Math.sin(Date.now()*0.0009 + mob.position.x*0.3) * 1.8;
        const dx = px - mob.position.x, dz = pz - mob.position.z;
        if (dist < def.chaseR && dist > 0.5) {
          mob.position.x += (dx/dist)*def.speed*0.5;
          mob.position.z += (dz/dist)*def.speed*0.5;
          mob.rotation.y = Math.atan2(dx, dz);
          ud.fireCooldown--;
          if (ud.fireCooldown <= 0) {
            this.spawnFireball(mob);
            ud.fireCooldown = 160 + Math.floor(Math.random()*100);
          }
        } else {
          ud.wanderTimer--;
          if (ud.wanderTimer <= 0) {
            const a = Math.random()*Math.PI*2;
            ud.wanderDx = Math.cos(a); ud.wanderDz = Math.sin(a);
            ud.wanderTimer = 80 + Math.floor(Math.random()*120);
          }
          mob.position.x = Math.max(-42, Math.min(42, mob.position.x + ud.wanderDx*def.speed*0.4));
          mob.position.z = Math.max(-42, Math.min(42, mob.position.z + ud.wanderDz*def.speed*0.4));
        }
        return;
      }

      // ===== クリーパー チャージ → 爆発 =====
      if (def.chargeRange > 0) {
        if (dist < def.chargeRange) {
          ud.chargeTimer = (ud.chargeTimer || 0) + 1;
          // チカチカ点滅(スケール)
          const s = 1 + 0.07 * Math.sin(ud.chargeTimer * 0.45);
          mob.scale.set(s, s, s);
          if (ud.chargeTimer >= 90) {  // 1.5秒後に爆発
            this.triggerExplosion(mob.position.clone());
            toRemove.push(mob); return;
          }
        } else {
          if ((ud.chargeTimer||0) > 0) {
            ud.chargeTimer = Math.max(0, ud.chargeTimer - 2);
            mob.scale.set(1, 1, 1);
          }
        }
      }

      // ===== 通常 AI (追跡/逃走/徘徊) =====
      const dx = px - mob.position.x, dz = pz - mob.position.z;
      let mvx = 0, mvz = 0;

      if (def.hostile && dist < def.chaseR && dist > 0.5) {
        mvx = (dx/dist)*def.speed; mvz = (dz/dist)*def.speed;
      } else if (!def.hostile && dist < def.fleeR && dist > 0.5) {
        mvx = -(dx/dist)*def.speed*1.2; mvz = -(dz/dist)*def.speed*1.2;
      } else {
        ud.wanderTimer--;
        if (ud.wanderTimer <= 0) {
          if (Math.random() < 0.28) { ud.wanderDx=0; ud.wanderDz=0; }
          else { const a=Math.random()*Math.PI*2; ud.wanderDx=Math.cos(a); ud.wanderDz=Math.sin(a); }
          ud.wanderTimer = 90 + Math.floor(Math.random()*150);
        }
        mvx = ud.wanderDx*def.speed*0.45; mvz = ud.wanderDz*def.speed*0.45;
      }

      mob.position.x = Math.max(-42, Math.min(42, mob.position.x + mvx));
      mob.position.z = Math.max(-42, Math.min(42, mob.position.z + mvz));
      const spd = Math.hypot(mvx, mvz);
      if (spd > 0.001) mob.rotation.y = Math.atan2(mvx, mvz);
      if (ud.legL && ud.legR && spd > 0.001) {
        const sw = Math.sin(Date.now()*0.013)*0.55;
        ud.legL.rotation.x = sw; ud.legR.rotation.x = -sw;
      }

      // ===== 攻撃 =====
      if (def.hostile && !def.flying && !this.insideBuilding) {
        ud.attackCd = (ud.attackCd || 0) - 1;
        if (def.rangedAttack) {
          // スケルトン: 遠距離から矢を発射
          if (dist < def.chaseR && dist > 3 && ud.attackCd <= 0) {
            this.spawnArrow(mob);
            ud.attackCd = 90 + Math.floor(Math.random() * 40);
          }
        } else {
          // ゾンビ: 接近メレー
          if (dist < 1.5 && ud.attackCd <= 0) {
            this.hurtPlayer(1);
            ud.attackCd = 60;
          }
        }
      }
    });

    // 削除リスト処理
    toRemove.forEach(mob => {
      this.scene.remove(mob);
      mob.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());
      });
    });
    this.mobs = this.mobs.filter(m => !toRemove.includes(m));

    // ===== 火の玉 更新 =====
    this.fireballs = this.fireballs.filter(fb => {
      fb.userData.life--;
      fb.position.x += fb.userData.vx;
      fb.position.y += fb.userData.vy;
      fb.position.z += fb.userData.vz;
      fb.rotation.x += 0.15; fb.rotation.z += 0.1;
      if (fb.userData.life <= 0) { this.scene.remove(fb); return false; }
      if (Math.hypot(fb.position.x-px, fb.position.z-pz) < 1.2) {
        if (!this.insideBuilding) this.hurtPlayer(fb.userData.isArrow ? 1 : 2);
        this.scene.remove(fb); return false;
      }
      return true;
    });
  }

  spawnFireball(mob) {
    const fb = new THREE.Mesh(
      new THREE.BoxGeometry(0.35,0.35,0.35),
      new THREE.MeshBasicMaterial({ color:0xFF6600 })
    );
    fb.position.copy(mob.position);
    const px = this.player.position.x, pz = this.player.position.z;
    const dx = px-mob.position.x, dy = 1.2-mob.position.y, dz = pz-mob.position.z;
    const dist = Math.hypot(dx, dy, dz);
    const spd = 0.2;
    fb.userData = { vx:(dx/dist)*spd, vy:(dy/dist)*spd*0.4, vz:(dz/dist)*spd, life:90 };
    this.scene.add(fb);
    this.fireballs.push(fb);
  }

  // ===== クリーパー爆発エフェクト =====
  triggerExplosion(pos) {
    const mat = new THREE.MeshBasicMaterial({ color:0xFF8800, transparent:true, opacity:0.85 });
    const boom = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), mat);
    boom.position.copy(pos); boom.position.y = 1;
    this.scene.add(boom);
    let t = 0;
    const expand = () => {
      t++;
      boom.scale.setScalar(1 + t * 0.45);
      mat.opacity = 0.85 - t * 0.09;
      if (t < 9) requestAnimationFrame(expand);
      else { this.scene.remove(boom); mat.dispose(); }
    };
    requestAnimationFrame(expand);
    // プレイヤーが近ければダメージ + ノックバック
    const d = Math.hypot(pos.x-this.player.position.x, pos.z-this.player.position.z);
    if (d < 5 && !this.insideBuilding) {
      this.hurtPlayer(3);
      const kdx = this.player.position.x - pos.x, kdz = this.player.position.z - pos.z;
      const kd = Math.hypot(kdx, kdz) || 1;
      this.vx += (kdx / kd) * 0.9;
      this.vz += (kdz / kd) * 0.9;
    }
  }

  // ===== スケルトンの矢 =====
  spawnArrow(mob) {
    const arrow = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x8B5E3C })
    );
    arrow.position.set(mob.position.x, 1.5, mob.position.z);
    const px = this.player.position.x, pz = this.player.position.z;
    const dx = px - mob.position.x, dz = pz - mob.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const spd = 0.3;
    arrow.rotation.y = Math.atan2(dx, dz);
    arrow.userData = { vx: (dx/d)*spd, vy: 0, vz: (dz/d)*spd, life: 70, isArrow: true };
    this.scene.add(arrow);
    this.fireballs.push(arrow);
  }

  // ===== HP / ダメージ =====
  hurtPlayer(dmg) {
    if (this.invincibleTimer > 0 || !this.gameRunning) return;
    if (!document.getElementById('mining-popup').classList.contains('hidden')) return;
    if (!document.getElementById('building-action-popup').classList.contains('hidden')) return;
    this.playerHp = Math.max(0, this.playerHp - dmg);
    this.invincibleTimer = 80;
    this._updateHpHud();
    this.playSe('hurt');
    const flash = document.getElementById('damage-flash');
    if (flash) { flash.classList.remove('active'); void flash.offsetWidth; flash.classList.add('active'); }
    if (this.playerHp <= 0) this._playerDeath();
  }

  _playerDeath() {
    // アイテムペナルティ：3個を価値の低い順に没収
    const ORDER = ['wood','stone','iron','gold','diamond'];
    const ICONS = { wood:'🪵', stone:'🪨', iron:'⚙️', gold:'✨', diamond:'💎' };
    let lose = 3;
    const lost = {};
    for (const type of ORDER) {
      if (lose <= 0) break;
      const have = this.state.inventory[type] || 0;
      if (have > 0) {
        const take = Math.min(have, lose);
        this.state.inventory[type] -= take;
        lost[type] = take;
        lose -= take;
      }
    }
    this.saveState();
    const lostText = Object.entries(lost).map(([t,n]) => `${ICONS[t]}×${n}`).join(' ');
    const lossEl = document.getElementById('death-item-loss');
    if (lossEl) lossEl.textContent = lostText ? `アイテム ${lostText} を うしなった…` : '';
    this.gameRunning = false;
    this.player.visible = true;
    this.stopBgm();
    this.playSe('death');
    document.getElementById('death-screen').classList.remove('hidden');
  }

  _respawn() {
    this.playerHp = this.playerMaxHp;
    this.invincibleTimer = 180;
    this.player.position.set(0, 0, 0);
    this.vx = 0; this.vz = 0;
    this.moveTarget = null;
    this.gameRunning = true;
    this._updateHpHud();
    document.getElementById('death-screen').classList.add('hidden');
    this.playBgm(this.isNightTime() ? 'night' : 'field');
  }

  _updateHpHud() {
    const el = document.getElementById('hud-hearts');
    if (!el) return;
    let html = '';
    for (let i = 0; i < this.playerMaxHp; i++) {
      html += `<span class="heart">${i < this.playerHp ? '❤️' : '🖤'}</span>`;
    }
    el.innerHTML = html;
  }

  // ===== 昼夜サイクル =====
  buildDayNightVisuals() {
    // Minecraft風の四角い太陽・月
    this.sunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(5,5,0.4),
      new THREE.MeshBasicMaterial({ color:0xFFFF44 })
    );
    this.scene.add(this.sunMesh);
    this.moonMesh = new THREE.Mesh(
      new THREE.BoxGeometry(3.5,3.5,0.4),
      new THREE.MeshBasicMaterial({ color:0xCCCCEE })
    );
    this.scene.add(this.moonMesh);
  }

  updateDayNight() {
    // ゲーム内時間（フレームベース）
    this.dayFrame++;
    const prevDayTime = this.dayTime;
    this.dayTime = (this.dayFrame % DAY_LENGTH) / DAY_LENGTH;
    // 1日経過したら日数カウントアップ
    if (prevDayTime > 0.9 && this.dayTime < 0.1) {
      this.dayCount++;
      this.onNewDay();
    }
    const t = this.dayTime;

    // 空の色補間 (深夜→夜明け→昼→夕暮れ→深夜)
    let sky;
    const lerp = (a, b, f) => a + (b-a)*Math.max(0,Math.min(1,f));
    const hexToRGB = h => [parseInt(h,16)>>16, (parseInt(h,16)>>8)&0xFF, parseInt(h,16)&0xFF];
    const lerpHex = (ha, hb, f) => {
      const [ar,ag,ab] = hexToRGB(ha.replace('#','')), [br,bg,bb] = hexToRGB(hb.replace('#',''));
      return new THREE.Color(lerp(ar,br,f)/255, lerp(ag,bg,f)/255, lerp(ab,bb,f)/255);
    };
    if      (t < 0.20) sky = lerpHex('#030818','#030818', 1);
    else if (t < 0.28) sky = lerpHex('#030818','#FF8844', (t-0.20)/0.08);
    else if (t < 0.38) sky = lerpHex('#FF8844','#87CEEB', (t-0.28)/0.10);
    else if (t < 0.62) sky = lerpHex('#87CEEB','#87CEEB', 1);
    else if (t < 0.72) sky = lerpHex('#87CEEB','#FF6622', (t-0.62)/0.10);
    else if (t < 0.80) sky = lerpHex('#FF6622','#030818', (t-0.72)/0.08);
    else               sky = lerpHex('#030818','#030818', 1);

    this.scene.background = sky;
    this.scene.fog.color = sky;

    // 太陽・月の軌道 (XY平面で回転, Z=-20)
    const angle = t * Math.PI * 2;
    const R = 80, H = 65;
    this.sunMesh.position.set(Math.sin(angle)*R, Math.cos(angle)*H, -20);
    this.sunMesh.lookAt(0, 0, 0);
    this.moonMesh.position.set(-Math.sin(angle)*R, -Math.cos(angle)*H, -20);
    this.moonMesh.lookAt(0, 0, 0);

    // ライト強度 (昼:明るい / 夜:暗い)
    const dayFactor = Math.max(0, Math.min(1, Math.sin((t - 0.23) * Math.PI / 0.54)));
    this.ambientLight.intensity = 0.12 + dayFactor * 0.55;
    this.sunLight.intensity = dayFactor * 0.9;

    // 夜間警告ラベル更新
    const hudDay = document.getElementById('hud-day');
    if (hudDay) hudDay.textContent = this.isNightTime() ? `🌙 ${this.dayCount}日目` : `☀️ ${this.dayCount}日目`;

    // 昼夜BGM切り替え（クイズ中は変えない）
    if (this.gameRunning && !this.quiz) {
      const night = this.isNightTime();
      if (night !== this._wasNight) {
        this._wasNight = night;
        this.playBgm(night ? 'night' : 'field');
      }
    }
  }

  isNightTime() {
    return this.dayTime < 0.22 || this.dayTime > 0.78;
  }

  // ===== 動的モブスポーン =====
  mobSpawnTick() {
    this.mobSpawnTimer++;
    if (this.mobSpawnTimer % 100 !== 0) return; // 約1.7秒ごとにチェック

    const hostileCount = this.mobs.filter(m => MOB_TYPES[m.userData.type].hostile).length;
    const passiveCount = this.mobs.filter(m => !MOB_TYPES[m.userData.type].hostile).length;

    if (this.isNightTime() && hostileCount < MOB_CAP_HOSTILE) {
      // 夜: 敵対モブをスポーン (ゾンビ40%・スケルトン30%・クリーパー30%)
      const r = Math.random();
      const type = r < 0.4 ? 'zombie' : r < 0.7 ? 'skeleton' : 'creeper';
      const pos = this.randomSpawnPos();
      if (pos) this.spawnMobAt(type, pos.x, pos.z);

      // レベル3以上でガストが出現
      if (this.state.level >= 3) {
        const ghastCount = this.mobs.filter(m => m.userData.type === 'ghast').length;
        if (ghastCount < 2 && Math.random() < 0.18) {
          const pos2 = this.randomSpawnPos();
          if (pos2) this.spawnMobAt('ghast', pos2.x, pos2.z);
        }
      }
    } else if (!this.isNightTime() && passiveCount < MOB_CAP_PASSIVE) {
      // 昼: 受動モブをスポーン
      const types = ['pig','pig','sheep','chicken'];
      const type = types[Math.floor(Math.random()*types.length)];
      const pos = this.randomSpawnPos();
      if (pos) this.spawnMobAt(type, pos.x, pos.z);
    }
  }

  randomSpawnPos() {
    const px = this.player.position.x, pz = this.player.position.z;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 12 + Math.random() * 22;
      const x = Math.max(-44, Math.min(44, px + Math.cos(a)*d));
      const z = Math.max(-44, Math.min(44, pz + Math.sin(a)*d));
      return { x, z };
    }
    return null;
  }

  spawnMobAt(type, x, z) {
    const m = this.buildMobMesh(type, x, z);
    this.scene.add(m);
    this.mobs.push(m);
  }

  // ===== CONTROLS =====
  setupControls() {
    addEventListener('keydown', e => {
      this.keys[e.key] = true;
      if (e.key === 'e' || e.key === 'E') this.tryInteract();
      if (e.key === ' ') { e.preventDefault(); this.tryAttack(); }
    });
    addEventListener('keyup', e => { this.keys[e.key] = false; });

    // Camera drag (mouse): rotate angle & pitch
    const canvas = document.getElementById('game-canvas');
    let camDrag = null;
    canvas.addEventListener('mousedown', e => {
      this.cursorAngle = null; // ドラッグ中はカーソルフォローを停止
      camDrag = { x: e.clientX, y: e.clientY, angle: this.cameraAngle, pitch: this.cameraPitch };
    });
    window.addEventListener('mousemove', e => {
      if (camDrag) {
        this.cameraAngle = camDrag.angle - (e.clientX - camDrag.x) * 0.006;
        this.cameraPitch = Math.max(-0.15, Math.min(0.80, camDrag.pitch - (e.clientY - camDrag.y) * 0.004));
      } else if (this.gameRunning && !this.insideBuilding) {
        this._updateCursorFollow(e.clientX, e.clientY);
      }
    });
    window.addEventListener('mouseup', () => { camDrag = null; });

    // Camera drag (touch on canvas): rotate angle & pitch
    let touchCamId = null, touchCamStart = null;
    canvas.addEventListener('touchstart', e => {
      if (touchCamId !== null) return;
      const t = e.changedTouches[0];
      touchCamId = t.identifier;
      touchCamStart = { x: t.clientX, y: t.clientY, angle: this.cameraAngle, pitch: this.cameraPitch };
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (touchCamId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === touchCamId) {
          this.cameraAngle = touchCamStart.angle - (t.clientX - touchCamStart.x) * 0.006;
          this.cameraPitch = Math.max(-0.15, Math.min(0.80, touchCamStart.pitch - (t.clientY - touchCamStart.y) * 0.004));
          break;
        }
      }
    }, { passive: true });
    canvas.addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === touchCamId) { touchCamId = null; break; }
      }
    }, { passive: true });

    // Tap-to-move (touch: detect short tap vs camera drag)
    let tapStart = null;
    canvas.addEventListener('touchstart', e => {
      if (tapStart) return;
      const t = e.changedTouches[0];
      tapStart = { id: t.identifier, x: t.clientX, y: t.clientY };
    }, { passive: true });
    canvas.addEventListener('touchend', e => {
      if (!tapStart || !this.gameRunning) { tapStart = null; return; }
      for (const t of e.changedTouches) {
        if (t.identifier !== tapStart.id) continue;
        if (Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) < 12) {
          this._handleTap(t.clientX, t.clientY);
        }
        tapStart = null;
        break;
      }
    }, { passive: true });

    // Tap-to-move (mouse click: click event fires only without significant drag)
    canvas.addEventListener('click', e => {
      if (this.gameRunning) this._handleTap(e.clientX, e.clientY);
    });

    // D-pad controls (常時有効: タッチ・マウス両対応)
    const dpadState = { up: false, down: false, left: false, right: false };
    const syncDpad = () => {
      let x = 0, z = 0;
      if (dpadState.up)    z -= 1;
      if (dpadState.down)  z += 1;
      if (dpadState.left)  x -= 1;
      if (dpadState.right) x += 1;
      this.joystick.active = (x !== 0 || z !== 0);
      this.joystick.x = x;
      this.joystick.y = z;
    };
    const dpadMap = { 'dpad-up': 'up', 'dpad-down': 'down', 'dpad-left': 'left', 'dpad-right': 'right' };
    Object.entries(dpadMap).forEach(([id, dir]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      // タッチ
      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        dpadState[dir] = true;
        syncDpad();
      }, { passive: false });
      const releaseTouch = e => {
        if (e) e.preventDefault();
        dpadState[dir] = false;
        syncDpad();
      };
      btn.addEventListener('touchend',   releaseTouch, { passive: false });
      btn.addEventListener('touchcancel', releaseTouch);
      // マウス
      btn.addEventListener('mousedown', () => { dpadState[dir] = true;  syncDpad(); });
      const releaseMouse = () => { dpadState[dir] = false; syncDpad(); };
      btn.addEventListener('mouseup',    releaseMouse);
      btn.addEventListener('mouseleave', releaseMouse);
    });

    // Look up/down buttons (camera pitch)
    ['look-up', 'look-down'].forEach(id => {
      const dir = id === 'look-up' ? 'up' : 'down';
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('touchstart', e => { e.preventDefault(); this.lookState[dir] = true; }, { passive: false });
      const release = e => { if (e) e.preventDefault(); this.lookState[dir] = false; };
      btn.addEventListener('touchend',    release, { passive: false });
      btn.addEventListener('touchcancel', release);
      btn.addEventListener('mousedown',  () => { this.lookState[dir] = true; });
      btn.addEventListener('mouseup',    () => { this.lookState[dir] = false; });
      btn.addEventListener('mouseleave', () => { this.lookState[dir] = false; });
    });

    // Interact btn
    const btnI = document.getElementById('btn-interact');
    btnI.addEventListener('click', () => this.tryInteract());
    btnI.addEventListener('touchend', e => { e.preventDefault(); this.tryInteract(); });

    // Home button
    document.getElementById('btn-home').addEventListener('click', () => this.goHome());

    // Character select
    document.getElementById('btn-char').addEventListener('click', () => this.openCharSelect());
    document.getElementById('btn-char-back').addEventListener('click', () => {
      document.getElementById('char-select').classList.add('hidden');
      document.getElementById('title-screen').classList.remove('hidden');
    });
    document.getElementById('btn-char-ok').addEventListener('click', () => {
      const sel = document.querySelector('.char-card.selected');
      if (sel) {
        const charId = sel.dataset.id;
        localStorage.setItem(CHAR_STORAGE_KEY, charId);
        this.currentChar = CHARACTER_DEFS.find(c=>c.id===charId) || CHARACTER_DEFS[0];
        this.buildPlayer(this.currentChar);
      }
      document.getElementById('char-select').classList.add('hidden');
      document.getElementById('title-screen').classList.remove('hidden');
    });
  }

  openCharSelect() {
    document.getElementById('title-screen').classList.add('hidden');
    const grid = document.getElementById('char-grid');
    grid.innerHTML = '';
    const savedId = localStorage.getItem(CHAR_STORAGE_KEY) || 'steve';
    CHARACTER_DEFS.forEach(ch => {
      const card = document.createElement('div');
      card.className = 'char-card' + (ch.id===savedId?' selected':'');
      card.dataset.id = ch.id;

      const cvs = document.createElement('canvas');
      cvs.width = 64; cvs.height = 64;
      this.renderPortrait(cvs, ch);

      const name = document.createElement('div');
      name.className = 'char-name';
      name.textContent = ch.name;

      card.append(cvs, name);
      card.addEventListener('click', () => {
        document.querySelectorAll('.char-card').forEach(c=>c.classList.remove('selected'));
        card.classList.add('selected');
      });
      grid.appendChild(card);
    });
    document.getElementById('char-select').classList.remove('hidden');
  }

  // ===== MOB COMBAT =====
  tryAttack() {
    if (this.insideBuilding || !this.gameRunning) return;
    if (this.playerAttackCd > 0) return;
    const px = this.player.position.x, pz = this.player.position.z;
    let closest = null, closestD = 3.5;
    for (const mob of this.mobs) {
      if (!MOB_COMBAT[mob.userData.type]) continue;
      const dx = mob.position.x - px, dz = mob.position.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < closestD) { closestD = d; closest = mob; }
    }
    if (!closest) return;
    this.hitMob(closest);
    this.playerAttackCd = 20;
    this.playSe('correct');
  }

  hitMob(mob) {
    mob.userData.hp--;
    mob.traverse(c => {
      if (c.isMesh) {
        const orig = c.material.color.clone();
        c.material.color.set(0xff4444);
        setTimeout(() => { if (c.material) c.material.color.copy(orig); }, 120);
      }
    });
    if (mob.userData.hp <= 0) this.killMob(mob);
  }

  killMob(mob) {
    const cbt = MOB_COMBAT[mob.userData.type];
    this.scene.remove(mob);
    this.mobs = this.mobs.filter(m => m !== mob);
    if (!cbt) return;
    const item = cbt.drop();
    const icon = RESOURCE_DEFS[item]?.icon || '💎';
    this.state.inventory[item] = (this.state.inventory[item] || 0) + 1;
    this.spawnFloatingItem(mob.position.clone(), icon);
    this.addXP(cbt.xp);
    this._showToast(`💀 ${cbt.name}を たおした！ ＋${cbt.xp}XP`);
    this.state.totalMobKills = (this.state.totalMobKills || 0) + 1;
    this.checkAchievements();
    this.saveState();
    this.updateInventoryHUD();
  }

  _updateAttackBtn() {
    const btn = document.getElementById('btn-attack');
    if (!btn) return;
    if (!this.gameRunning || this.insideBuilding || !this.isMobile) { btn.classList.add('hidden'); return; }
    const px = this.player.position.x, pz = this.player.position.z;
    let hasTarget = false;
    for (const mob of this.mobs) {
      if (!MOB_COMBAT[mob.userData.type]) continue;
      const dx = mob.position.x - px, dz = mob.position.z - pz;
      if (Math.sqrt(dx * dx + dz * dz) < 3.5) { hasTarget = true; break; }
    }
    btn.classList.toggle('hidden', !hasTarget);
    btn.disabled = this.playerAttackCd > 0;
  }

  // ===== GAME LOOP =====
  loop() {
    requestAnimationFrame(() => this.loop());
    if (!this.gameRunning) return;
    this.frame++;
    this.movePlayer();
    this.followCamera();
    this.updateDayNight();
    this.updateMobs();
    this.mobSpawnTick();
    this.checkNearby();
    this.checkNearbyInterior();
    // HP無敵タイマー・点滅・自然回復
    if (this.invincibleTimer > 0) {
      this.invincibleTimer--;
      this.player.visible = (this.invincibleTimer % 8 < 4);
    } else {
      this.player.visible = true;
      if (this.playerHp < this.playerMaxHp && this.frame % 600 === 0) {
        this.playerHp = Math.min(this.playerMaxHp, this.playerHp + 1);
        this._updateHpHud();
      }
    }
    // Attack cooldown
    if (this.playerAttackCd > 0) this.playerAttackCd--;
    if (this.frame % 5 === 0) this._updateAttackBtn();
    // Villager idle bob & facing player
    this.villagers.forEach(v => {
      const ud = v.mesh.userData;
      v.mesh.position.y = Math.sin(this.frame * 0.025 + ud.phase) * 0.05;
      const dx = this.player.position.x - v.mesh.position.x;
      const dz = this.player.position.z - v.mesh.position.z;
      if (Math.hypot(dx, dz) < 10) v.mesh.rotation.y = Math.atan2(dx, dz);
      const legSwing = Math.sin(this.frame * 0.06 + ud.phase) * 0.18;
      if (ud.legL) ud.legL.rotation.x =  legSwing;
      if (ud.legR) ud.legR.rotation.x = -legSwing;
    });
    // Animate building action indicator
    if (this.actionIndicatorMesh) {
      this.actionIndicatorMesh.position.y = 1.5 + Math.sin(this.frame * 0.06) * 0.18;
      this.actionIndicatorMesh.rotation.y += 0.04;
    }
    // Respawn depleted resource nodes
    const now = Date.now();
    this.resourceNodes.forEach(node => {
      if (node.depleted && now >= node.respawnAt) {
        node.depleted = false;
        node.mesh.material.color.setHex(node.def.color);
      }
    });
    // Treasure chest respawn + sparkle indicator
    this.treasureChests.forEach(chest => {
      if (chest.depleted && now >= chest.respawnAt) {
        chest.depleted = false;
        chest.mesh.visible = true;
      }
      if (!chest.depleted && !this.insideBuilding) {
        const v = chest.mesh.position.clone().add(new THREE.Vector3(0, 1.6, 0)).project(this.camera);
        if (v.z < 1) {
          const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
          const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
          const dist = chest.mesh.position.distanceTo(this.player.position);
          chest.sparkleEl.style.left = sx + 'px';
          chest.sparkleEl.style.top  = sy + 'px';
          chest.sparkleEl.style.opacity = dist < 25 ? '1' : '0';
          chest.sparkleEl.style.transform = `translate(-50%,-50%) scale(${Math.max(0.5, 1 - dist * 0.03)})`;
        } else {
          chest.sparkleEl.style.opacity = '0';
        }
      } else {
        chest.sparkleEl.style.opacity = '0';
      }
    });
    this.renderer.render(this.scene, this.camera);
  }

  movePlayer() {
    const miningOpen = !document.getElementById('mining-popup').classList.contains('hidden')
      || !document.getElementById('building-action-popup').classList.contains('hidden');
    if (miningOpen) { this.vx *= 0.7; this.vz *= 0.7; return; }

    let dx = 0, dz = 0;
    if (this.keys['w'] || this.keys['ArrowUp'])    dz -= 1;
    if (this.keys['s'] || this.keys['ArrowDown'])  dz += 1;
    if (this.keys['a'] || this.keys['ArrowLeft'])  dx -= 1;
    if (this.keys['d'] || this.keys['ArrowRight']) dx += 1;
    if (this.joystick.active) { dx += this.joystick.x; dz += this.joystick.y; }

    // Tap-to-move: manual input cancels, otherwise steer toward target
    if (this.moveTarget) {
      if (Math.hypot(dx, dz) > 0.01) {
        this.moveTarget = null;
      } else {
        const tx = this.moveTarget.x - this.player.position.x;
        const tz = this.moveTarget.z - this.player.position.z;
        const dist = Math.hypot(tx, tz);
        if (dist < 1.8) {
          const doInteract = this.moveTarget.interact;
          this.moveTarget = null;
          if (doInteract) this.tryInteract();
        } else {
          // Convert world-space direction to camera-relative input
          const ca = this.cameraAngle;
          const wdx = tx / dist, wdz = tz / dist;
          dx = wdx * Math.cos(ca) + wdz * Math.sin(ca);
          dz = -wdx * Math.sin(ca) + wdz * Math.cos(ca);
        }
      }
    }

    const len = Math.hypot(dx, dz);
    const spd = this.settings ? this.settings.speed : 1.0;
    const ACCEL = 0.055 * spd;
    const FRICTION = 0.76;
    const MAX_SPD = 0.38 * spd;

    if (len > 0.01) {
      dx /= len; dz /= len;
      const ca = this.cameraAngle;
      const wx = dx*Math.cos(ca) - dz*Math.sin(ca);
      const wz = dx*Math.sin(ca) + dz*Math.cos(ca);

      this.vx += wx * ACCEL;
      this.vz += wz * ACCEL;
      const spd = Math.hypot(this.vx, this.vz);
      if (spd > MAX_SPD) { this.vx = this.vx/spd*MAX_SPD; this.vz = this.vz/spd*MAX_SPD; }

      // Face direction of velocity (カーソルフォロー中はそちらを優先)
      if (this.cursorAngle !== null) {
        this.player.rotation.y = this.cursorAngle;
      } else if (spd > 0.01) {
        this.player.rotation.y = Math.atan2(this.vx, this.vz);
      }
    } else {
      this.vx *= FRICTION;
      this.vz *= FRICTION;
      if (Math.hypot(this.vx, this.vz) < 0.002) { this.vx = 0; this.vz = 0; }
      // 停止中もカーソルの方向へ体を向ける
      if (this.cursorAngle !== null) this.player.rotation.y = this.cursorAngle;
    }

    if (this.insideBuilding) {
      this.player.position.x = Math.max(195, Math.min(205, this.player.position.x + this.vx));
      this.player.position.z = Math.max(195, Math.min(205, this.player.position.z + this.vz));
    } else {
      this.player.position.x = Math.max(-this.worldBound, Math.min(this.worldBound, this.player.position.x + this.vx));
      this.player.position.z = Math.max(-this.worldBound, Math.min(this.worldBound, this.player.position.z + this.vz));
      // 建物への衝突（AABB押し出し）
      BUILDING_DEFS.forEach(def => {
        const [bx,,bz] = def.pos, [bw,,bd] = def.size;
        const hw = bw / 2 + 0.25, hd = bd / 2 + 0.25;
        const cx = this.player.position.x - bx, cz = this.player.position.z - bz;
        if (Math.abs(cx) < hw && Math.abs(cz) < hd) {
          const ox = hw - Math.abs(cx), oz = hd - Math.abs(cz);
          if (ox < oz) this.player.position.x = bx + Math.sign(cx) * hw;
          else         this.player.position.z = bz + Math.sign(cz) * hd;
        }
      });
    }

    const spd2 = Math.hypot(this.vx, this.vz);
    if (spd2 > 0.01) {
      const sw = Math.sin(this.frame * 0.32) * Math.min(spd2 / MAX_SPD, 1) * 0.5;
      this._lL.rotation.x =  sw; this._rL.rotation.x = -sw;
      this._lA.rotation.x = -sw*0.6; this._rA.rotation.x =  sw*0.6;
    } else {
      this._lL.rotation.x *= 0.8; this._rL.rotation.x *= 0.8;
      this._lA.rotation.x *= 0.8; this._rA.rotation.x *= 0.8;
    }
  }

  followCamera() {
    if (this.lookState.up)   this.cameraPitch = Math.max(-0.15, this.cameraPitch - 0.018);
    if (this.lookState.down) this.cameraPitch = Math.min(0.80,  this.cameraPitch + 0.018);

    // カーソルフォロー: カメラをカーソル方向の真後ろへ滑らかに回転
    if (this.cursorAngle !== null) {
      const target = this.cursorAngle + Math.PI;
      const diff = ((target - this.cameraAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.cameraAngle += diff * 0.08;
    }

    const px = this.player.position.x;
    const py = this.player.position.y + 1.3;
    const pz = this.player.position.z;
    const ca = this.cameraAngle;
    const cd = this.insideBuilding ? 3 : this.cameraDist;

    const tx = px + Math.sin(ca)*cd;
    const ty = py + Math.tan(this.cameraPitch)*cd;
    const tz = pz + Math.cos(ca)*cd;

    this.camera.position.lerp(new THREE.Vector3(tx,ty,tz), 0.12);
    this.camera.lookAt(px, py, pz);
  }

  checkNearby() {
    if (this.insideBuilding) return;
    const px = this.player.position.x, pz = this.player.position.z;

    // Find nearest resource node
    let nr = null, nrd = 3.5;
    this.resourceNodes.forEach(node => {
      if (node.depleted) return;
      const d = Math.hypot(px - node.mesh.position.x, pz - node.mesh.position.z);
      if (d < nrd) { nrd = d; nr = node; }
    });

    // Find nearest treasure chest
    let nt = null, ntd = 3.5;
    this.treasureChests.forEach(chest => {
      if (chest.depleted) return;
      const d = Math.hypot(px - chest.spawn.pos[0], pz - chest.spawn.pos[2]);
      if (d < ntd) { ntd = d; nt = chest; }
    });

    // Find nearest villager
    let nv = null, nvd = 2.8;
    this.villagers.forEach(v => {
      const d = Math.hypot(px - v.mesh.position.x, pz - v.mesh.position.z);
      if (d < nvd) { nvd = d; nv = v; }
    });

    // Find nearest building
    let nb = null, nbd = 5;
    BUILDING_DEFS.forEach(b => {
      const d = Math.hypot(px - b.pos[0], pz - b.pos[2]);
      if (d < nbd) { nbd = d; nb = b; }
    });

    if (nr && nr !== this.nearResource) this.playSe('portal');
    if (nt && nt !== this.nearTreasure) this.playSe('portal');
    if (nv && nv !== this.nearVillager) this.playSe('portal');
    this.nearResource = nr;
    this.nearTreasure = nt;
    this.nearVillager = nv;
    this.nearBuilding = nb;

    const hint = document.getElementById('interact-hint');
    const btnI = document.getElementById('btn-interact');
    const popup = document.getElementById('building-popup');

    if (nr) {
      hint.textContent = `${nr.def.icon} ${nr.def.name}をほる：E / タップ！`;
      hint.classList.remove('hidden');
      btnI.classList.remove('hidden');
      popup.classList.add('hidden');
    } else if (nt) {
      hint.textContent = `📦 宝箱を あける：E / タップ！`;
      hint.classList.remove('hidden');
      btnI.classList.remove('hidden');
      popup.classList.add('hidden');
    } else if (nv) {
      hint.textContent = `${nv.def.icon} ${nv.def.name}：E / タップ でこうかん！`;
      hint.classList.remove('hidden');
      btnI.classList.remove('hidden');
      popup.classList.add('hidden');
    } else if (nb) {
      const ok = nb.cond(this.state);
      document.getElementById('bp-name').textContent = `${nb.icon} ${nb.name}`;
      document.getElementById('bp-desc').textContent = nb.desc;
      document.getElementById('bp-lock').textContent = ok ? '✅ かいほう済み！' : `🔒 ${nb.condText}`;
      popup.classList.remove('hidden');
      if (ok) {
        hint.textContent = `${nb.icon} ${nb.name}：E / タップ で はいる！`;
        hint.classList.remove('hidden');
        btnI.classList.remove('hidden');
      } else {
        hint.classList.add('hidden');
        btnI.classList.add('hidden');
      }
    } else {
      hint.classList.add('hidden');
      btnI.classList.add('hidden');
      popup.classList.add('hidden');
    }
  }

  checkNearbyInterior() {
    if (!this.insideBuilding || !this.currentBuildingDef) return;
    const act = BUILDING_ACTIONS[this.currentBuildingDef.id];
    if (!act) return;

    // Player local position relative to interior origin (200,0,200)
    const px = this.player.position.x - 200;
    const pz = this.player.position.z - 200;
    const dist = Math.hypot(px - act.pos[0], pz - act.pos[1]);

    const hint = document.getElementById('interact-hint');
    const btnA = document.getElementById('btn-building-action');

    if (dist < 2.5) {
      this.nearBuildingAction = { def: this.currentBuildingDef, act };
      const now = Date.now();
      const cd = (this.state.buildingActionCooldown || {})[this.currentBuildingDef.id];
      if (cd && now < cd) {
        const remaining = Math.ceil((cd - now) / 1000);
        hint.textContent = `${act.icon} ${act.label}：あと ${remaining}びょう`;
        hint.classList.remove('hidden');
        btnA.classList.add('hidden');
      } else {
        hint.textContent = `${act.icon} ${act.label}：E`;
        hint.classList.remove('hidden');
        btnA.textContent = `${act.icon} ${act.label}`;
        btnA.classList.remove('hidden');
      }
    } else {
      this.nearBuildingAction = null;
      hint.classList.add('hidden');
      btnA.classList.add('hidden');
    }
  }

  // ===== INTERACT =====
  tryInteract() {
    if (this.insideBuilding) {
      if (this.nearBuildingAction) {
        this.startBuildingAction(this.nearBuildingAction.def, this.nearBuildingAction.act);
      } else {
        this.exitBuilding();
      }
      return;
    }
    if (this.nearResource && !this.mining) {
      this.startMining(this.nearResource);
    } else if (this.nearTreasure && !this.mining) {
      this.startTreasureQuiz(this.nearTreasure);
    } else if (this.nearVillager) {
      this.openTradeMenu(this.nearVillager.def);
    } else if (this.nearBuilding && this.nearBuilding.cond(this.state)) {
      this.enterBuilding(this.nearBuilding);
    }
  }

  _updateCursorFollow(clientX, clientY) {
    const ndc = new THREE.Vector2(
      (clientX / innerWidth) * 2 - 1,
      -(clientY / innerHeight) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(ground, hit)) return;
    const dx = hit.x - this.player.position.x;
    const dz = hit.z - this.player.position.z;
    if (Math.hypot(dx, dz) < 1.5) return; // 近すぎる場合は無視
    this.cursorAngle = Math.atan2(dx, dz);
  }

  _handleTap(clientX, clientY) {
    if (this.insideBuilding) {
      if (this.nearBuildingAction) this.tryInteract();
      return;
    }
    if (!document.getElementById('mining-popup').classList.contains('hidden')) return;

    // Raycast onto the ground plane (y=0)
    const ndc = new THREE.Vector2(
      (clientX / innerWidth) * 2 - 1,
      -(clientY / innerHeight) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(groundPlane, hit)) return;
    const hx = hit.x, hz = hit.z;

    // Snap to nearest resource node within 6 units
    let bestR = null, bestRd = 6;
    this.resourceNodes.forEach(node => {
      if (node.depleted) return;
      const d = Math.hypot(hx - node.mesh.position.x, hz - node.mesh.position.z);
      if (d < bestRd) { bestRd = d; bestR = node; }
    });
    if (bestR) {
      this.moveTarget = { x: bestR.mesh.position.x, z: bestR.mesh.position.z, interact: true };
      return;
    }

    // Snap to nearest treasure chest within 6 units
    let bestT = null, bestTd = 6;
    this.treasureChests.forEach(chest => {
      if (chest.depleted) return;
      const d = Math.hypot(hx - chest.spawn.pos[0], hz - chest.spawn.pos[2]);
      if (d < bestTd) { bestTd = d; bestT = chest; }
    });
    if (bestT) {
      this.moveTarget = { x: bestT.spawn.pos[0], z: bestT.spawn.pos[2], interact: true };
      return;
    }

    // Snap to nearest building within 10 units
    let bestB = null, bestBd = 10;
    BUILDING_DEFS.forEach(b => {
      const d = Math.hypot(hx - b.pos[0], hz - b.pos[2]);
      if (d < bestBd) { bestBd = d; bestB = b; }
    });
    if (bestB) {
      this.moveTarget = { x: bestB.pos[0], z: bestB.pos[2], interact: bestB.cond(this.state) };
      return;
    }

    // Plain ground tap
    this.moveTarget = {
      x: Math.max(-46, Math.min(46, hx)),
      z: Math.max(-46, Math.min(46, hz)),
      interact: false
    };
  }

  _makeMesh(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  }

  enterBuilding(def) {
    this.insideBuilding = true;
    this.cursorAngle = null; // 建物内ではカーソルフォロー無効
    this.prevPlayerPos = this.player.position.clone();
    const ix = 200, iy = 0, iz = 200;
    const roomW = 12, roomH = 4.5, roomD = 12;
    const g = new THREE.Group();

    // Floor color per building
    const floorCols = {
      cabin:0x8B5E3C, tanbo:0x6B8B3C, mine:0x606060, market:0x888878,
      well:0x607090,  onsen:0x4A7090, forge:0x505050, shrine:0x887060,
      guild:0x706860, garden:0x559944, tower:0x686868, library:0x5C3A28,
      port:0x665544,  castle:0x888888, dragon:0x442222, sky:0xCCDDFF, rainbow:0xD8C8FF
    };
    const floorCol = floorCols[def.id] || 0x888866;
    const ceilCols = {
      dragon:0x331111, sky:0xAABBEE, rainbow:0xBBAEFF, onsen:0x607888, shrine:0x6A4838
    };
    const ceilCol = ceilCols[def.id] || 0xBBBBBB;

    const wallMat  = new THREE.MeshLambertMaterial({ color: def.color });
    const floorMat = new THREE.MeshLambertMaterial({ color: floorCol });
    const ceilMat  = new THREE.MeshLambertMaterial({ color: ceilCol });

    // Floor / Ceiling / Walls
    g.add(this._makeMesh(new THREE.BoxGeometry(roomW,0.2,roomD), floorMat, 0,0.1,0));
    g.add(this._makeMesh(new THREE.BoxGeometry(roomW,0.2,roomD), ceilMat,  0,roomH,0));
    g.add(this._makeMesh(new THREE.BoxGeometry(roomW,roomH,0.2), wallMat,  0,roomH/2,-roomD/2));
    g.add(this._makeMesh(new THREE.BoxGeometry(roomW,roomH,0.2), wallMat,  0,roomH/2, roomD/2));
    g.add(this._makeMesh(new THREE.BoxGeometry(0.2,roomH,roomD), wallMat, -roomW/2,roomH/2,0));
    g.add(this._makeMesh(new THREE.BoxGeometry(0.2,roomH,roomD), wallMat,  roomW/2,roomH/2,0));

    // Wall torches (all rooms)
    const addTorch = (x, y, z) => {
      const bm = (w,h,d,c,tx,ty,tz) => {
        const m = this.box(w,h,d,c); m.position.set(tx,ty,tz); g.add(m);
      };
      bm(0.15,0.5,0.15, 0x8B5E3C, x,y+0.25,z);
      bm(0.22,0.22,0.22, 0xFF8800, x,y+0.6,z);
      const tl = new THREE.PointLight(0xFFA040,0.6,5);
      tl.position.set(x,y+0.7,z); g.add(tl);
    };
    addTorch(-2, 1.6, -roomD/2+0.2);
    addTorch( 2, 1.6, -roomD/2+0.2);
    addTorch(-2, 1.6,  roomD/2-0.2);
    addTorch( 2, 1.6,  roomD/2-0.2);

    // Overhead light
    const overhead = new THREE.PointLight(0xffe8c0, 0.7, 15);
    overhead.position.set(0, roomH-0.4, 0);
    g.add(overhead);

    // Building-specific interior
    this._buildInterior(def, g);

    g.position.set(ix, iy, iz);
    this.scene.add(g);
    this.interiorGroup = g;
    this.player.position.set(ix, 1, iz+2);
    this.vx = 0; this.vz = 0;
    this.currentBuildingDef = def;

    // Action indicator: glowing cube at action zone
    const act = BUILDING_ACTIONS[def.id];
    if (act) {
      const indGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
      const indMat = new THREE.MeshLambertMaterial({ color: 0xFFFF00, emissive: 0xFFAA00, emissiveIntensity: 0.9 });
      const ind = new THREE.Mesh(indGeo, indMat);
      ind.position.set(ix + act.pos[0], 1.5, iz + act.pos[1]);
      this.scene.add(ind);
      this.actionIndicatorMesh = ind;
    }

    document.getElementById('btn-exit-building').classList.remove('hidden');
    document.getElementById('interact-hint').classList.add('hidden');
    document.getElementById('building-popup').classList.add('hidden');
    document.getElementById('btn-interact').classList.add('hidden');
  }

  _buildInterior(def, g) {
    // Shorthand: box mesh positioned and added to g
    const bm = (w,h,d,col,x,y,z) => {
      const m = this.box(w,h,d,col); m.position.set(x,y,z); g.add(m); return m;
    };
    const pl = (col,intensity,dist,x,y,z) => {
      const l = new THREE.PointLight(col,intensity,dist); l.position.set(x,y,z); g.add(l);
    };

    // ---- Common furniture helpers ----
    const chest = (x,y,z) => {
      bm(1.0,0.65,0.65, 0x8B6914, x,y+0.33,z);
      bm(1.0,0.22,0.65, 0x6B4910, x,y+0.76,z);
      bm(0.22,0.2,0.05, 0xFFD700, x,y+0.5,z-0.34);
    };
    const craftTable = (x,y,z) => {
      bm(1.0,1.0,1.0, 0x8B5E3C, x,y+0.5,z);
      bm(1.02,0.05,1.02, 0x5C3A1E, x,y+1.02,z);
      bm(0.08,0.06,1.02, 0xAA7040, x,y+1.05,z);
      bm(1.02,0.06,0.08, 0xAA7040, x,y+1.05,z);
    };
    const furnace = (x,y,z) => {
      bm(1.0,1.0,1.0, 0x888888, x,y+0.5,z);
      bm(0.5,0.4,0.05, 0x444444, x,y+0.5,z-0.53);
      bm(0.3,0.2,0.06, 0xFF5500, x,y+0.35,z-0.53);
      pl(0xFF4400,0.5,3, x,y+0.8,z);
    };
    const bookshelf = (x,y,z) => {
      bm(1.0,1.0,0.4, 0x8B5E3C, x,y+0.5,z);
      const bc = [0xFF4444,0x4466FF,0x44AA44,0xFF8800,0x9944AA,0xFFFF44];
      for(let i=0;i<6;i++) bm(0.12,0.65,0.32, bc[i], x-0.42+i*0.17,y+0.52,z);
    };
    const bed = (x,y,z,col) => {
      bm(1.0,0.3,2.2, 0x8B5E3C, x,y+0.15,z);
      bm(0.9,0.2,1.6, col, x,y+0.4,z+0.3);
      bm(0.72,0.16,0.32, 0xEEEEEE, x,y+0.4,z-0.85);
      bm(1.0,0.55,0.15, 0x8B5E3C, x,y+0.43,z-1.1); // headboard
    };
    const tableLegs = (x,y,z) => {
      bm(1.8,0.12,1.0, 0x8B5E3C, x,y+1.0,z);
      [[-0.82,-0.42],[0.82,-0.42],[-0.82,0.42],[0.82,0.42]]
        .forEach(([lx,lz]) => bm(0.1,1.0,0.1, 0x6B4A2E, x+lx,y+0.5,z+lz));
    };
    const barrel = (x,y,z) => {
      bm(0.8,0.9,0.8, 0x6B4A2E, x,y+0.45,z);
      bm(0.82,0.05,0.82, 0x888855, x,y+0.2,z);
      bm(0.82,0.05,0.82, 0x888855, x,y+0.7,z);
    };
    const anvil = (x,y,z) => {
      bm(0.4,0.3,0.5, 0x555555, x,y+0.15,z);
      bm(0.7,0.1,0.5, 0x555555, x,y+0.35,z);
      bm(0.9,0.3,0.5, 0x666666, x,y+0.5,z);
    };
    const banner = (x,y,z,col) => {
      bm(0.1,0.2,0.1, 0x8B5E3C, x,y+3.6,z);
      bm(0.8,1.6,0.06, col, x,y+2.55,z);
    };
    const flowerPot = (x,y,z,col) => {
      bm(0.35,0.3,0.35, 0x886644, x,y+0.15,z);
      bm(0.16,0.4,0.16, 0x228B22, x,y+0.55,z);
      bm(0.26,0.18,0.26, col, x,y+0.87,z);
    };
    const lantern = (x,y,z) => {
      bm(0.45,0.6,0.45, 0xFF8800, x,y+0.3,z);
      bm(0.5,0.08,0.5, 0x555555, x,y+0.64,z);
      bm(0.5,0.08,0.5, 0x555555, x,y-0.0,z);
      pl(0xFF8800,0.6,4, x,y+0.4,z);
    };

    switch(def.id) {

      case 'cabin':
        bed(-3,0,-2, 0x4466AA);
        craftTable(3,0,-3);
        furnace(3,0,-1.5);
        chest(-4,0,3); chest(-3,0,3);
        // Window frame on west wall
        bm(1.6,1.4,0.08, 0xCCDDFF, -5.85,2.0,0);
        bm(0.08,1.4,0.08, 0x8B5E3C, -5.82,2.0,0);
        bm(1.6,0.08,0.08, 0x8B5E3C, -5.82,2.0,0);
        break;

      case 'tanbo':
        // Hay bales
        bm(1.0,1.0,1.0, 0xC8AA44, -3,0.5,-3);
        bm(1.0,1.0,1.0, 0xC8AA44, -3,0.5,-2);
        bm(1.0,1.0,1.0, 0xB8993A,  2,0.5,-3);
        bm(1.0,1.0,1.0, 0xB8993A,  2,0.5,-2);
        // Hay binding stripes
        bm(1.02,0.06,1.02, 0x887722, -3,0.5,-3);
        barrel(3,0,2);
        // Hoe on wall (stick + head)
        bm(0.1,2.8,0.1, 0x8B5E3C, -5.5,1.4,-5.5);
        bm(0.55,0.1,0.35, 0x8B5E3C, -5.5,2.9,-5.4);
        // Sacks
        bm(0.7,0.7,0.7, 0xBBAA88,  0,0.35,3);
        bm(0.7,0.7,0.7, 0xBBAA88,  1,0.35,3);
        bm(0.7,0.55,0.7, 0xAA9977, -1,0.28,3);
        // Water trough
        bm(2.5,0.3,0.8, 0x8B5E3C, -1,0.15,-4.5);
        bm(2.5,0.1,0.6, 0x4477AA, -1,0.32,-4.5);
        break;

      case 'mine':
        // Ore display wall
        bm(1,1,1, 0x666666, -4,0.5,-4.5); // stone
        bm(1,1,1, 0x8B6914, -2,0.5,-4.5); // gold ore
        bm(1,1,1, 0x44BBFF, -0,0.5,-4.5); // diamond
        bm(1,1,1, 0xC86028,  2,0.5,-4.5); // iron
        bm(1,1,1, 0x55AA55,  4,0.5,-4.5); // emerald
        // Pickaxe on wall
        bm(0.1,2.2,0.1, 0x8B5E3C, 5.5,1.1,-5.5);
        bm(1.1,0.18,0.22, 0x888888, 5.5,2.3,-5.4);
        // Minecart
        bm(1.4,0.6,0.9, 0x888888, 0,0.3,2);
        bm(0.3,0.18,0.3, 0x444444, -0.45,0.09,2.3);
        bm(0.3,0.18,0.3, 0x444444,  0.45,0.09,2.3);
        bm(0.3,0.18,0.3, 0x444444, -0.45,0.09,1.7);
        bm(0.3,0.18,0.3, 0x444444,  0.45,0.09,1.7);
        // Rail segment
        bm(3.0,0.05,0.12, 0x888888, 0,0.02,2);
        bm(0.12,0.05,1.0, 0x888888, -0.6,0.02,2);
        bm(0.12,0.05,1.0, 0x888888,  0.6,0.02,2);
        chest(4,0,-2); chest(4,0,-1);
        // Extra torch on ore wall
        bm(0.15,0.45,0.15, 0x8B5E3C, 0,1.55,-4.3);
        bm(0.2,0.2,0.2, 0xFF8800, 0,1.82,-4.3);
        pl(0xFFA040,0.5,4, 0,1.9,-4.3);
        break;

      case 'market':
        tableLegs(-2,0,-2); tableLegs(2,0,-2);
        barrel(-4,0,2); barrel(-3,0,2); barrel(3,0,3);
        // Wall shelves
        bm(5.0,0.1,0.5, 0x8B5E3C, -1,2.2,-5.5);
        bm(5.0,0.1,0.5, 0x8B5E3C, -1,1.3,-5.5);
        bm(2.5,0.1,0.5, 0x8B5E3C,  4,2.2,-5.5);
        // Goods on shelves
        [0xDD4444,0x44BB44,0xFFAA00,0x8844CC,0x44CCCC].forEach((c,i) => {
          bm(0.4,0.5,0.3, c, -3.5+i*1.2,2.5,-5.4);
          bm(0.35,0.4,0.3, c, -3.3+i*1.2,1.6,-5.4);
        });
        // Counter
        bm(5.5,0.12,1.0, 0x8B5E3C, 0,1.1,0.8);
        bm(5.5,1.1,0.12, 0x8B5E3C, 0,0.55,1.35);
        // Sign above door
        bm(2.2,0.8,0.07, 0xE8C870, 0,3.5,5.85);
        break;

      case 'well':
        // Stone well surround
        bm(2.0,0.5,2.0, 0x888880, 0,0.25,0);
        bm(2.0,0.15,2.0, 0x4466AA, 0,0.52,0); // water
        bm(0.2,1.8,0.2, 0x8B5E3C, -0.7,1.2,0);
        bm(0.2,1.8,0.2, 0x8B5E3C,  0.7,1.2,0);
        bm(1.6,0.2,0.2, 0x8B5E3C, 0,2.2,0);
        // Rope
        bm(0.06,1.0,0.06, 0xAA9966, 0,1.1,0);
        // Buckets
        bm(0.42,0.4,0.42, 0x888888, -3,0.2,2);
        bm(0.42,0.4,0.42, 0x888888, -2,0.2,2);
        bm(0.42,0.4,0.42, 0x4466AA, -2.5,0.2,0.5); // full bucket
        // Stone ring
        for(let i=0;i<8;i++) {
          const a=i*Math.PI/4, r=2.3;
          bm(0.55,0.45,0.55, 0x888880, Math.cos(a)*r,0.22,Math.sin(a)*r);
        }
        pl(0x88AAFF,0.5,5, 0,0.8,0);
        break;

      case 'onsen':
        // Hot spring pool
        bm(4.5,0.12,4.5, 0x4A90C0, 0,0.06,0);
        // Pool walls
        bm(0.5,0.5,4.5, 0x668899, -2.5,0.25,0);
        bm(0.5,0.5,4.5, 0x668899,  2.5,0.25,0);
        bm(4.5,0.5,0.5, 0x668899, 0,0.25,-2.5);
        bm(4.5,0.5,0.5, 0x668899, 0,0.25, 2.5);
        // Steam (light translucent boxes)
        [[-0.8,0.5],[0.8,-0.6],[-0.5,-0.8],[0.6,0.8]].forEach(([sx,sz]) => {
          bm(0.35,0.35,0.35, 0xDDEEFF, sx,0.9,sz);
          bm(0.25,0.25,0.25, 0xEEF4FF, sx*0.6,1.4,sz*0.6);
        });
        pl(0x88AADD,0.8,7, 0,0.5,0);
        // Rock seats
        bm(1.2,0.55,0.7, 0x777777, -4.5,0.28,0);
        bm(1.2,0.55,0.7, 0x777777,  4.5,0.28,0);
        bm(0.7,0.55,1.2, 0x888888, 0,0.28,-4.5);
        // Bamboo
        bm(0.22,3.8,0.22, 0x668833,  5.2,1.9,-4.8);
        bm(0.22,3.2,0.22, 0x558822,  4.5,1.6,-4.8);
        bm(0.22,3.4,0.22, 0x669944, -5.2,1.7,-4.8);
        // Towel folded on edge
        bm(0.9,0.1,0.4, 0xFF8888, -4.5,0.58,-0.6);
        lantern(-4,0,3); lantern(4,0,3);
        break;

      case 'forge':
        furnace(-3,0,-4); furnace(-2,0,-4);
        anvil(0,0,-1);
        chest(4,0,-4); chest(4,0,-3);
        // Sword on west wall
        bm(0.1,2.8,0.1, 0xCCCCCC, -5.7,1.4,-2);
        bm(0.7,0.12,0.2, 0x8B5E3C, -5.7,0.6,-2);
        bm(0.3,0.3,0.3, 0xFFD700, -5.7,0.95,-2); // pommel
        // Shield on north wall
        bm(1.0,1.2,0.08, 0xCC2200, 3,2.2,-5.8);
        bm(0.08,1.2,0.08, 0xFFD700, 3,2.2,-5.76);
        bm(1.0,0.08,0.08, 0xFFD700, 3,1.7,-5.76);
        bm(1.0,0.08,0.08, 0xFFD700, 3,2.7,-5.76);
        // Coal pile
        bm(1.2,0.3,0.8, 0x333333, -3,0.15,2);
        bm(0.6,0.4,0.5, 0x222222, -3.3,0.35,2);
        // Workbench
        tableLegs(2,0,2);
        break;

      case 'shrine':
        // Torii gate
        bm(0.45,4.2,0.45, 0xCC2200, -3,2.1,-4.5);
        bm(0.45,4.2,0.45, 0xCC2200,  3,2.1,-4.5);
        bm(7.0,0.35,0.45, 0xCC2200, 0,3.8,-4.5);
        bm(6.5,0.35,0.45, 0xCC2200, 0,3.3,-4.5);
        // Offering box
        bm(1.4,0.9,0.9, 0x6B4A2E, 0,0.45,-3.5);
        bm(1.4,0.12,0.9, 0x5C3A1E, 0,0.92,-3.5);
        bm(0.6,0.25,0.05, 0x888888, 0,0.65,-4.0); // coin slot
        // Prayer mat
        bm(1.4,0.06,0.9, 0xDD4444, 0,0.06,-1.5);
        bm(1.2,0.04,0.06, 0xFFD700, 0,0.08,-1.05);
        bm(1.2,0.04,0.06, 0xFFD700, 0,0.08,-1.95);
        // Lanterns
        lantern(-3,0,2); lantern(3,0,2);
        // Shimenawa rope
        bm(6.5,0.12,0.12, 0xDDCC88, 0,3.1,5.7);
        bm(0.12,0.4,0.12, 0xEEDD99, -2,2.75,5.7);
        bm(0.12,0.4,0.12, 0xEEDD99,  2,2.75,5.7);
        break;

      case 'guild':
        // Notice board
        bm(3.2,2.2,0.12, 0x8B5E3C, 0,2.1,-5.8);
        bm(3.0,2.0,0.08, 0xE8D8A0, 0,2.1,-5.75);
        bm(0.7,0.9,0.06, 0xFFFFFF, -0.9,2.3,-5.72);
        bm(0.7,0.9,0.06, 0xFFFFF0,  0.5,2.4,-5.72);
        bm(0.5,0.6,0.06, 0xFFEEEE,  -0.3,1.8,-5.72);
        // Tables
        tableLegs(-3,0,-1); tableLegs(1,0,-1); tableLegs(-3,0,2);
        // Trophy
        bm(0.32,0.7,0.32, 0xFFD700, 4.5,0.35,-4.5);
        bm(0.55,0.1,0.55, 0x888850, 4.5,0.05,-4.5);
        bm(0.12,0.35,0.12, 0xFFD700, 4.5,0.82,-4.5);
        bm(0.5,0.22,0.22, 0xFFD700, 4.5,0.98,-4.5);
        // Weapon rack
        bm(1.2,0.1,0.6, 0x8B5E3C, -4.5,2.6,-5.6);
        bm(0.1,2.2,0.1, 0x888888, -4.0,1.5,-5.6);
        bm(0.1,2.2,0.1, 0x888888, -5.0,1.5,-5.6);
        // Banners
        banner(-5,0,-5, 0x224488);
        banner( 5,0,-5, 0x224488);
        break;

      case 'garden':
        // Flower pots on floor
        flowerPot(-4,0,-3, 0xFF4466); flowerPot(-2.8,0,-3, 0xFFAA00);
        flowerPot(-1.6,0,-3, 0xFF6699); flowerPot(-0.4,0,-3, 0xFFFF00);
        flowerPot(0.8,0,-3, 0xFF6688);  flowerPot(2.0,0,-3, 0xAA44FF);
        // Wall shelf
        bm(4.5,0.1,0.35, 0x8B5E3C, -1.5,1.9,-5.5);
        bm(0.1,1.5,0.35, 0x8B5E3C, -3.8,1.15,-5.5);
        bm(0.1,1.5,0.35, 0x8B5E3C,  0.8,1.15,-5.5);
        // Pots on shelf
        flowerPot(-3,1.88,-5.3, 0xFF88AA);
        flowerPot(-2,1.88,-5.3, 0xFFCC00);
        flowerPot(-1,1.88,-5.3, 0x88FF88);
        flowerPot( 0,1.88,-5.3, 0xFF6644);
        // Bench
        bm(3.2,0.1,0.75, 0x8B5E3C, -1.5,0.72,2.5);
        bm(0.15,0.72,0.65, 0x8B5E3C, -3.1,0.36,2.5);
        bm(0.15,0.72,0.65, 0x8B5E3C,  0.1,0.36,2.5);
        // Watering can
        bm(0.55,0.62,0.35, 0x888888, 3.5,0.31,2.5);
        bm(0.16,0.16,0.65, 0x888888, 3.5,0.7,2.2);
        // Soil patches
        bm(1.5,0.06,1.0, 0x6B4A2E, 3.5,0.06,-2);
        bm(1.5,0.06,1.0, 0x6B4A2E, 3.5,0.06,-3.5);
        break;

      case 'tower':
        // Ladder (side rails + rungs)
        bm(0.08,4.2,0.08, 0x8B5E3C,  4.2,2.1,-5.5);
        bm(0.08,4.2,0.08, 0x8B5E3C,  4.8,2.1,-5.5);
        for(let i=0;i<7;i++) bm(0.55,0.08,0.08, 0x8B5E3C, 4.5,0.4+i*0.6,-5.5);
        // Window (bright slit on west wall)
        bm(1.8,2.2,0.08, 0xCCDDFF, -5.88,2.0,0);
        bm(0.08,2.2,0.08, 0x555555, -5.84,2.0,0);
        bm(1.8,0.08,0.08, 0x555555, -5.84,2.0,0);
        pl(0xCCEEFF,0.4,5, -5.5,2.0,0);
        // Telescope
        bm(0.22,0.22,1.8, 0x888888, -2.5,1.5,-2.5);
        bm(0.35,0.35,0.18, 0x888888, -2.5,1.5,-3.4);
        bm(0.18,0.18,0.18, 0x4466AA, -2.5,1.5,-3.55);
        // Tripod legs
        bm(0.08,1.0,0.08, 0x8B5E3C, -2.8,0.5,-2.5);
        bm(0.08,1.0,0.08, 0x8B5E3C, -2.2,0.5,-2.5);
        bm(0.08,1.0,0.08, 0x8B5E3C, -2.5,0.5,-2.8);
        // Map table
        tableLegs(0,0,1);
        bm(1.6,0.05,1.0, 0xE8D8A0, 0,1.07,1); // map on table
        chest(-4,0,3.5);
        break;

      case 'library':
        // Bookshelves lining back wall
        for(let i=0;i<5;i++) bookshelf(-4.5+i*2,0,-5.5);
        // Second tier of shelves
        for(let i=0;i<5;i++) {
          bm(1.0,1.0,0.4, 0x8B5E3C, -4.5+i*2,1.1,-5.5);
          const bc=[0xFF4444,0x4466FF,0x44AA44,0xFF8800,0x9944AA,0xFFFF44];
          for(let j=0;j<6;j++) bm(0.12,0.65,0.32, bc[j], -4.5+i*2-0.42+j*0.17,1.62,-5.5);
        }
        // Side bookshelf
        for(let i=0;i<2;i++) {
          const bs = this.box(0.4,1.0,1.0,0x8B5E3C);
          bs.position.set(-5.5,0.5,-2.5+i*2.5); g.add(bs);
          const bc=[0xFF4444,0x4466FF,0x44AA44,0xFF8800,0x9944AA,0xFFFF44];
          for(let j=0;j<6;j++) {
            const bk=this.box(0.32,0.65,0.12,bc[j]);
            bk.position.set(-5.5,-2.5+i*2.5+(-0.42+j*0.17),0.52); g.add(bk);
          }
        }
        // Reading tables
        tableLegs(0,0,-1); tableLegs(2,0,2);
        // Lectern
        bm(0.85,1.1,0.65, 0x6B4A2E, -3,0.55,2.5);
        bm(0.85,0.1,0.75, 0x8B5E3C, -3,1.16,2.4);
        bm(0.7,0.05,0.55, 0xF0E8D0, -3,1.22,2.4); // open book
        // Candles
        bm(0.15,0.55,0.15, 0xFFEE88, 0.7,1.16,-0.5);
        bm(0.15,0.45,0.15, 0xFFEE88, -0.7,1.16,-0.5);
        bm(0.2,0.2,0.2, 0xFF8800, 0.7,1.44,-0.5);
        bm(0.2,0.2,0.2, 0xFF8800, -0.7,1.44,-0.5);
        pl(0xFFDD80,0.5,4, 0,2.0,-0.5);
        break;

      case 'port':
        barrel(-4,0,-3); barrel(-3,0,-3); barrel(-4,0,-2);
        barrel(3,0,-3);  barrel(3,0,-2);  barrel(4,0,-2);
        // Anchor
        bm(0.16,2.2,0.16, 0x888888, 0,1.1,-4);
        bm(2.2,0.16,0.16, 0x888888, 0,0.35,-4);
        bm(0.55,0.55,0.16, 0x888888, -1.0,0.2,-4);
        bm(0.55,0.55,0.16, 0x888888,  1.0,0.2,-4);
        bm(0.35,0.35,0.16, 0x888888, 0,2.3,-4); // ring
        // Fishing net on wall
        bm(3.5,2.5,0.07, 0x998855, 3,1.8,-5.8);
        bm(3.4,0.07,0.07, 0x887744, 3,0.6,-5.78);
        bm(3.4,0.07,0.07, 0x887744, 3,1.2,-5.78);
        bm(3.4,0.07,0.07, 0x887744, 3,1.8,-5.78);
        bm(3.4,0.07,0.07, 0x887744, 3,2.4,-5.78);
        // Fish on table
        tableLegs(-2,0,-1);
        bm(0.6,0.22,0.18, 0xFF8844, -2.5,1.08,-1.5);
        bm(0.6,0.22,0.18, 0x4488FF, -1.5,1.08,-1.5);
        bm(0.55,0.2,0.16, 0xFF4444, -2.0,1.08,-0.5);
        // Rope coil
        bm(0.9,0.22,0.9, 0xAA9966, 4,0.11,3);
        break;

      case 'castle':
        // Throne
        bm(1.2,0.55,1.2, 0x777777, 0,0.28,-4.5);
        bm(1.2,2.2,0.2,  0x777777, 0,1.6,-4.95);
        bm(1.6,0.35,0.2,  0x888888, 0,3.0,-4.95);
        bm(1.22,0.1,1.22, 0xFFD700, 0,0.58,-4.5); // gold seat
        bm(1.22,0.1,0.22, 0xFFD700, 0,2.98,-4.93); // gold top
        // Pillars (4 corners)
        [[-4.5,-4.5],[4.5,-4.5],[-4.5,4.5],[4.5,4.5]].forEach(([px,pz]) => {
          bm(0.65,4.6,0.65, 0x888888, px,2.3,pz);
          bm(0.9,0.3,0.9, 0x999999, px,4.55,pz); // capital
        });
        // Banners
        banner(-4,0,-5, 0xCC2200); banner(4,0,-5, 0xCC2200);
        banner(-4,0, 5, 0xCC2200); banner(4,0, 5, 0xCC2200);
        bm(0.82,0.14,0.07, 0xFFD700, -4,2.55,-5.02);
        bm(0.82,0.14,0.07, 0xFFD700,  4,2.55,-5.02);
        chest(-4,0,4); chest(-3,0,4); chest(3,0,4);
        pl(0xFFD080,0.8,10, 0,3.0,0);
        break;

      case 'dragon':
        // Treasure pile
        [[-1.2,0],[0,0],[1.2,0],[-0.6,0.7],[0.6,0.7],[0,1.35]].forEach(([gx,gy]) => {
          bm(0.85,0.85,0.85, 0xFFD700, -3+gx,gy+0.42,-3);
        });
        bm(0.55,0.55,0.55, 0x44BBFF, -3,1.5,-3);
        bm(0.55,0.55,0.55, 0x44BBFF, -1.6,0.95,-3);
        bm(0.55,0.55,0.55, 0xFF44AA, -3.5,0.45,-3);
        // Lava pool
        bm(3.5,0.12,3.5, 0xFF4400, 2.5,0.06,0.5);
        bm(3.5,0.08,3.5, 0xFF8800, 2.5,0.1,0.5); // brighter surface
        pl(0xFF3300,1.5,9, 2.5,0.5,0.5);
        // Dragon skull
        bm(1.8,1.6,1.8, 0xDDDDCC,  2,0.8,-4);
        bm(0.45,0.45,0.32, 0x111111, 1.4,0.95,-4.92); // eye L
        bm(0.45,0.45,0.32, 0x111111, 2.6,0.95,-4.92); // eye R
        bm(0.8,0.32,0.32, 0x111111, 2.0,0.38,-4.92);  // jaw
        // Dragon teeth
        for(let i=0;i<4;i++) bm(0.12,0.3,0.12, 0xEEEECC, 1.6+i*0.28,0.14,-4.92);
        // Bones scattered
        bm(1.8,0.2,0.2, 0xEEEEDD, -2,0.1,-1); bm(0.2,0.2,1.4, 0xEEEEDD, -1.5,0.1,1.5);
        bm(1.4,0.2,0.2, 0xEEEEDD,  4.5,0.1,-3);
        // Dark ceiling glow
        pl(0x440011,0.4,12, 0,4.0,0);
        break;

      case 'sky':
        // Cloud blocks
        [[-2.5,1.2,-3],[-1.2,1.5,-3],[0,1.2,-3],[1.2,1.5,-3],[2.5,1.2,-3],
         [-1.8,2.1,-1.5],[0,2.4,-1.5],[1.8,2.1,-1.5]].forEach(([cx,cy,cz]) => {
          bm(1.4,0.9,0.9, 0xEEEEFF, cx,cy,cz);
        });
        // Crystal pillar
        bm(0.55,2.8,0.55, 0xAADDFF, 0,1.4,0);
        bm(0.9,0.5,0.9, 0x88CCFF, 0,2.95,0);
        bm(0.4,0.4,0.4, 0xCCEEFF, 0,3.3,0); // tip
        pl(0x88CCFF,1.2,10, 0,2.5,0);
        // Altar
        bm(2.2,0.32,2.2, 0xCCDDFF, 0,0.16,-3.5);
        bm(1.6,0.65,1.6, 0xAABBEE, 0,0.65,-3.5);
        bm(0.55,0.55,0.55, 0x88AAFF, 0,1.1,-3.5); // offering gem
        // Floating gems
        bm(0.45,0.45,0.45, 0xFFAAFF, -3.5,2.2,-3);
        bm(0.45,0.45,0.45, 0xAAFFFF,  3.5,2.0,-3);
        bm(0.45,0.45,0.45, 0xFFFF88,  0,2.4, 3.5);
        pl(0xCCAAFF,0.6,6, 0,1.5,-3.5);
        break;

      case 'rainbow':
        // Colorful pillars
        [0xFF4444,0xFF8800,0xFFFF00,0x44FF44,0x4488FF,0x8844FF].forEach((c,i) => {
          bm(0.65,4.2,0.65, c, -3+i*1.2,2.1,-4.5);
        });
        // Rainbow arch
        for(let i=0;i<9;i++) {
          const t=i/8, a=Math.PI*t;
          const rx=Math.cos(a)*4.5, ry=Math.sin(a)*3.0+0.4;
          const rc=[0xFF4444,0xFF8800,0xFFFF00,0x44FF44,0x4466FF,0x8844FF,0xFF44FF][i%7];
          bm(0.55,0.55,0.65, rc, rx,ry,1.5);
        }
        // End portal glow floor
        bm(4.5,0.12,3.2, 0x220066, 0,0.07,2);
        bm(4.3,0.08,3.0, 0x6600CC, 0,0.1,2);
        pl(0x9900FF,1.2,9, 0,0.8,2);
        // Stars on ceiling
        [[-3,4.1,3],[3,4.1,3],[0,4.3,-1],[-2.5,4.2,2],[2.5,4.2,-2.5]].forEach(([sx,sy,sz]) => {
          bm(0.32,0.32,0.32, 0xFFFFAA, sx,sy,sz);
        });
        pl(0xFFFF88,0.4,8, 0,4.0,0);
        break;

      default:
        tableLegs(0,0,-1.5);
        chest(-3,0,2); chest(-2,0,2);
        break;
    }
  }

  exitBuilding() {
    if (this.interiorGroup) {
      this.scene.remove(this.interiorGroup);
      this.interiorGroup.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
      });
      this.interiorGroup = null;
    }
    if (this.actionIndicatorMesh) {
      this.scene.remove(this.actionIndicatorMesh);
      this.actionIndicatorMesh.geometry.dispose();
      this.actionIndicatorMesh.material.dispose();
      this.actionIndicatorMesh = null;
    }
    if (this.prevPlayerPos) {
      this.player.position.copy(this.prevPlayerPos);
      this.prevPlayerPos = null;
    }
    this.vx = 0; this.vz = 0;
    this.insideBuilding = false;
    this.currentBuildingDef = null;
    this.nearBuildingAction = null;
    document.getElementById('btn-exit-building').classList.add('hidden');
    document.getElementById('interact-hint').classList.add('hidden');
    document.getElementById('btn-interact').classList.add('hidden');
    document.getElementById('btn-building-action').classList.add('hidden');
  }

  // ===== RESOURCE MINING =====
  startMining(node) {
    const def = node.def;
    const allQ = this.selectAdaptiveQuestions(def.subject, 1);
    if (!allQ.length) return;
    const q = allQ[0];
    this.mining = { node, q };
    this.playBgm('quiz');

    document.getElementById('mining-item-icon').textContent = def.icon;
    document.getElementById('mining-item-name').textContent = `${def.name}をGetしよう！`;
    document.getElementById('mining-question').textContent = q.q;

    this._renderMiningOptions(q);

    document.getElementById('mining-feedback').classList.add('hidden');
    document.getElementById('mining-popup').classList.remove('hidden');
  }

  startTreasureQuiz(chest) {
    const allQ = this.selectAdaptiveQuestions(chest.spawn.subject, 1);
    if (!allQ.length) return;
    const q = allQ[0];
    this.mining = { node: null, q, isTreasure: true, chest };
    this.playBgm('quiz');

    document.getElementById('mining-item-icon').textContent = '📦';
    document.getElementById('mining-item-name').textContent = '宝箱を あけよう！';
    document.getElementById('mining-question').textContent = q.q;

    this._renderMiningOptions(q);

    document.getElementById('mining-feedback').classList.add('hidden');
    document.getElementById('mining-popup').classList.remove('hidden');
  }

  _renderMiningOptions(q) {
    const optsEl = document.getElementById('mining-options');
    optsEl.innerHTML = '';
    // 前回の手書きパッド状態をリセット
    optsEl.parentElement.classList.remove('has-handwrite');
    this._handwriteShowAnswer = null;
    if (q.type === 'write') {
      this._createHandwritePad(optsEl, q);
    } else {
      q.opts.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'mining-option';
        btn.textContent = opt;
        btn.onclick = () => this.answerMining(i);
        optsEl.appendChild(btn);
      });
    }
  }

  _createHandwritePad(container, q) {
    const SIZE = 420;
    const wrap = document.createElement('div');
    wrap.className = 'handwrite-wrap';

    // モーダルを手書きモード用に拡張
    container.parentElement.classList.add('has-handwrite');

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    canvas.className = 'handwrite-canvas';
    const ctx = canvas.getContext('2d');

    const strokeCanvas = document.createElement('canvas');
    strokeCanvas.width = SIZE;
    strokeCanvas.height = SIZE;
    const sc = strokeCanvas.getContext('2d');
    sc.strokeStyle = '#e8ffe8';
    sc.lineWidth = 22;
    sc.lineCap = 'round';
    sc.lineJoin = 'round';

    const redraw = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(strokeCanvas, 0, 0);
    };
    redraw();

    // 不正解時に正解の漢字を薄く表示する関数（answerMiningから呼ばれる）
    this._handwriteShowAnswer = (kanji) => {
      ctx.save();
      ctx.font = `bold ${Math.floor(SIZE * 0.70)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(100,220,100,0.25)';
      ctx.fillText(kanji, SIZE / 2, SIZE / 2);
      ctx.restore();
    };

    let drawing = false;
    let hasStrokes = false;

    const getPos = e => {
      const rect = canvas.getBoundingClientRect();
      // changedTouches を優先（touchstart/touchmove/touchend で確実に現在の指の位置を取得）
      const src = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
      return {
        x: (src.clientX - rect.left) * (SIZE / rect.width),
        y: (src.clientY - rect.top) * (SIZE / rect.height)
      };
    };
    const startDraw = e => {
      e.preventDefault();
      e.stopPropagation();
      const p = getPos(e);
      sc.beginPath();
      sc.moveTo(p.x, p.y);
      drawing = true;
      hasStrokes = true;
    };
    const moveDraw = e => {
      e.preventDefault();
      e.stopPropagation();
      if (!drawing) return;
      const p = getPos(e);
      sc.lineTo(p.x, p.y);
      sc.stroke();
      sc.beginPath();
      sc.moveTo(p.x, p.y);
      redraw();
    };
    const endDraw = e => {
      e.preventDefault();
      drawing = false;
      sc.beginPath();
    };

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', moveDraw, { passive: false });
    canvas.addEventListener('touchend', endDraw, { passive: false });
    canvas.addEventListener('touchcancel', endDraw, { passive: false });
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);

    const btnRow = document.createElement('div');
    btnRow.className = 'handwrite-btns';

    const clearBtn = document.createElement('button');
    clearBtn.className = 'handwrite-clear-btn';
    clearBtn.textContent = '🗑 けす';
    clearBtn.onclick = () => {
      sc.clearRect(0, 0, SIZE, SIZE);
      ctx.clearRect(0, 0, SIZE, SIZE);
      hasStrokes = false;
    };

    const submitBtn = document.createElement('button');
    submitBtn.className = 'write-submit-btn';
    submitBtn.textContent = '✓ こたえる';
    submitBtn.onclick = () => {
      if (!hasStrokes) {
        submitBtn.textContent = '✏️ まず かいてね！';
        setTimeout(() => { submitBtn.textContent = '✓ こたえる'; }, 1200);
        return;
      }
      submitBtn.disabled = true;
      clearBtn.disabled = true;
      const ok = this._evaluateHandwriting(strokeCanvas, q.opts[0], SIZE);
      this.answerMining(ok ? 0 : -1);
    };

    btnRow.appendChild(clearBtn);
    btnRow.appendChild(submitBtn);
    wrap.appendChild(canvas);
    wrap.appendChild(btnRow);
    container.appendChild(wrap);
  }

  _evaluateHandwriting(strokeCanvas, targetKanji, size) {
    const gs = 64;

    const refC = document.createElement('canvas');
    refC.width = refC.height = gs;
    const rc = refC.getContext('2d');
    rc.fillStyle = '#fff';
    rc.font = `bold ${Math.floor(gs * 0.70)}px serif`;
    rc.textAlign = 'center';
    rc.textBaseline = 'middle';
    rc.fillText(targetKanji, gs / 2, gs / 2);
    const refPx = rc.getImageData(0, 0, gs, gs).data;

    const userC = document.createElement('canvas');
    userC.width = userC.height = gs;
    userC.getContext('2d').drawImage(strokeCanvas, 0, 0, gs, gs);
    const userPx = userC.getContext('2d').getImageData(0, 0, gs, gs).data;

    const dil = 7;
    const dilated = new Uint8Array(gs * gs);
    for (let py = 0; py < gs; py++) {
      for (let px = 0; px < gs; px++) {
        if (refPx[(py * gs + px) * 4 + 3] > 80) {
          const y0 = Math.max(0, py - dil), y1 = Math.min(gs - 1, py + dil);
          const x0 = Math.max(0, px - dil), x1 = Math.min(gs - 1, px + dil);
          for (let dy = y0; dy <= y1; dy++)
            for (let dx = x0; dx <= x1; dx++)
              dilated[dy * gs + dx] = 1;
        }
      }
    }

    let userPxCount = 0, hitCount = 0;
    for (let i = 0; i < gs * gs; i++) {
      if (userPx[i * 4 + 3] > 50) {
        userPxCount++;
        if (dilated[i]) hitCount++;
      }
    }

    if (userPxCount < 8) return false;
    const precision = hitCount / userPxCount;
    console.log(`[handwrite] kanji=${targetKanji} precision=${precision.toFixed(2)} userPx=${userPxCount}`);
    return precision >= 0.50;
  }

  answerMining(idx) {
    const { mining } = this;
    if (!mining) return;
    const { node, q, isTreasure, chest } = mining;
    const ok = idx === q.correct;

    document.querySelectorAll('.mining-option').forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.correct) btn.classList.add('correct');
      else if (i === idx && !ok) btn.classList.add('wrong');
    });

    // 定着バリアント（ret_プレフィックス）はstatsに記録しない
    const isRetention = q.id && String(q.id).startsWith('ret_');
    if (!isRetention) this.updateQuestionStat(q.id, ok);
    this.playSe(ok ? 'correct' : 'wrong');

    const fb = document.getElementById('mining-feedback');
    const subj = isTreasure ? chest.spawn.subject : node.def.subject;
    if (!this.todayLog[subj]) this.todayLog[subj] = { c: 0, w: 0 };

    if (ok) {
      this.state.totalCorrect++;
      this.state.currentStreak = (this.state.currentStreak || 0) + 1;
      if (this.state.currentStreak > this.state.maxStreak) this.state.maxStreak = this.state.currentStreak;
      this.todayCorrect++;
      this.todayLog[subj].c++;
      this.addXP(XP_PER_CORRECT);

      // コンボストリークボーナス
      const streak = this.state.currentStreak;
      if (COMBO_MILESTONES.includes(streak)) {
        const bonus = COMBO_BONUS_XP * streak;
        this.addXP(bonus);
        setTimeout(() => this._showToast(`🔥 ${streak}れんぞく せいかい！\nボーナス XP ＋${bonus}！`), 1600);
      }

      if (isTreasure) {
        const items = ['wood','stone','iron','gold'];
        const item = items[Math.floor(Math.random() * items.length)];
        const itemDef = RESOURCE_DEFS[item];
        this.state.inventory[item] = (this.state.inventory[item] || 0) + 1;
        this.updateInventoryHUD();
        this.refreshBuildings();
        this.checkWorldExpansion();
        fb.textContent = `✅ せいかい！ 📦 ${itemDef.icon} ${itemDef.name} ＋1こ！`;
      } else {
        fb.textContent = `✅ せいかい！ ${node.def.icon} ${node.def.name} ＋1こ！`;
      }
      fb.className = 'mining-feedback correct';
    } else {
      this.state.currentStreak = 0;
      this.todayWrong++;
      this.todayLog[subj].w++;
      const correctLabel = q.opts[q.correct];
      fb.textContent = `❌ ちがう！ 正解: ${correctLabel}。${q.explain || ''}`;
      fb.className = 'mining-feedback wrong';
      // 手書き問題の場合、キャンバスに正解を薄く表示
      if (q.type === 'write' && this._handwriteShowAnswer) this._handwriteShowAnswer(correctLabel);
    }
    fb.classList.remove('hidden');
    this.state.totalGames++;
    this.saveState();
    this._saveTodayLog();
    this._scheduleSyncToGitHub();

    setTimeout(() => {
      document.getElementById('mining-popup').classList.add('hidden');
      this.mining = null;
      this.playBgm(this.isNightTime() ? 'night' : 'field');
      if (ok) {
        if (isTreasure) {
          chest.depleted = true;
          chest.mesh.visible = false;
          chest.sparkleEl.style.opacity = '0';
          chest.respawnAt = Date.now() + 180000; // 3分後リスポーン
          this.spawnFloatingItem(chest.mesh.position.clone(), '📦');
        } else {
          this.collectItem(node);
        }
        this.checkQuests();
        this.checkAchievements();
      }
    }, ok ? 1500 : 1200);
  }

  collectItem(node) {
    const def = node.def;
    if (!this.state.inventory) this.state.inventory = { wood:0, stone:0, iron:0, gold:0, diamond:0 };
    this.state.inventory[def.id] = (this.state.inventory[def.id] || 0) + 1;
    this.saveState();
    this.updateInventoryHUD();
    this.refreshBuildings();
    this.checkWorldExpansion();

    // Deplete the block
    node.depleted = true;
    node.mesh.material.color.setHex(0x333333);
    node.respawnAt = Date.now() + 60000; // respawn after 60s

    // Floating item animation
    this.spawnFloatingItem(node.mesh.position.clone(), def.icon);
  }

  spawnFloatingItem(worldPos, icon) {
    // Create a DOM overlay item that floats up
    const el = document.createElement('div');
    el.textContent = icon;
    el.style.cssText = 'position:fixed;font-size:2rem;pointer-events:none;z-index:500;transition:all 1.2s ease-out;';
    document.body.appendChild(el);

    // Project world position to screen
    const v = worldPos.clone().project(this.camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%, -50%)';

    requestAnimationFrame(() => {
      el.style.top = (y - 80) + 'px';
      el.style.opacity = '0';
    });
    setTimeout(() => el.remove(), 1300);
  }

  // ===== BUILDING ACTIONS =====
  startBuildingAction(def, act) {
    if (!def || !act) return;
    const now = Date.now();
    const cd = (this.state.buildingActionCooldown || {})[def.id];
    if (cd && now < cd) return;

    const allQ = this.selectAdaptiveQuestions(act.subj, 1);
    if (!allQ.length) return;
    const q = allQ[0];
    this.currentBuildingAction = { def, act, q };
    this.playBgm('quiz');

    document.getElementById('ba-icon').textContent = act.icon;
    document.getElementById('ba-label').textContent = act.label;
    document.getElementById('ba-question').textContent = q.q;

    const optsEl = document.getElementById('ba-options');
    optsEl.innerHTML = '';
    q.opts.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'mining-option';
      btn.textContent = opt;
      btn.onclick = () => this.answerBuildingAction(i);
      optsEl.appendChild(btn);
    });

    document.getElementById('ba-feedback').classList.add('hidden');
    document.getElementById('building-action-popup').classList.remove('hidden');
  }

  answerBuildingAction(idx) {
    const { currentBuildingAction } = this;
    if (!currentBuildingAction) return;
    const { def, act, q } = currentBuildingAction;
    const ok = idx === q.correct;

    document.querySelectorAll('#ba-options .mining-option').forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.correct) btn.classList.add('correct');
      else if (i === idx && !ok) btn.classList.add('wrong');
    });

    this.updateQuestionStat(q.id, ok);
    this.playSe(ok ? 'correct' : 'wrong');

    const subj = act.subj;
    if (!this.todayLog[subj]) this.todayLog[subj] = { c: 0, w: 0 };
    const fb = document.getElementById('ba-feedback');

    if (ok) {
      this.state.totalCorrect++;
      this.state.currentStreak = (this.state.currentStreak || 0) + 1;
      if (this.state.currentStreak > this.state.maxStreak) this.state.maxStreak = this.state.currentStreak;
      this.todayCorrect++;
      this.todayLog[subj].c++;
      this.addXP(act.reward.xp);

      // コンボストリークボーナス
      const streak = this.state.currentStreak;
      if (COMBO_MILESTONES.includes(streak)) {
        const bonus = COMBO_BONUS_XP * streak;
        this.addXP(bonus);
        setTimeout(() => this._showToast(`🔥 ${streak}れんぞく せいかい！\nボーナス XP ＋${bonus}！`), 1600);
      }

      if (!this.state.buildingActionCooldown) this.state.buildingActionCooldown = {};
      this.state.buildingActionCooldown[def.id] = Date.now() + act.cooldown;

      // 温泉: HP全回復
      if (def.id === 'onsen' && this.playerHp < this.playerMaxHp) {
        this.playerHp = this.playerMaxHp;
        this._updateHpHud();
      }
      let rewardText = `✅ せいかい！ XP +${act.reward.xp}！`;
      if (def.id === 'onsen') rewardText += ' ♨️ HP かいふく！';
      if (act.reward.item) {
        const itemDef = RESOURCE_DEFS[act.reward.item];
        this.state.inventory[act.reward.item] = (this.state.inventory[act.reward.item] || 0) + 1;
        this.updateInventoryHUD();
        this.refreshBuildings();
        this.checkWorldExpansion();
        rewardText += ` ${itemDef.icon} ${itemDef.name} +1こ！`;
      }
      fb.textContent = rewardText;
      fb.className = 'mining-feedback correct';
    } else {
      this.state.currentStreak = 0;
      this.todayWrong++;
      this.todayLog[subj].w++;
      const correctLabel = q.opts[q.correct];
      fb.textContent = `❌ ちがう！ 正解: ${correctLabel}。${q.explain || ''}`;
      fb.className = 'mining-feedback wrong';
    }
    fb.classList.remove('hidden');
    this.state.totalGames++;
    this.saveState();
    this._saveTodayLog();
    this._scheduleSyncToGitHub();

    setTimeout(() => {
      document.getElementById('building-action-popup').classList.add('hidden');
      this.currentBuildingAction = null;
      this.playBgm(this.isNightTime() ? 'night' : 'field');
      if (ok) {
        if (act.reward.item) {
          const itemDef = RESOURCE_DEFS[act.reward.item];
          const ix = 200, iz = 200;
          this.spawnFloatingItem(new THREE.Vector3(ix + act.pos[0], 1.5, iz + act.pos[1]), itemDef.icon);
        }
        this.checkQuests();
        this.checkAchievements();
      }
    }, ok ? 1500 : 1200);
  }

  // ===== WORLD EXPANSION =====
  applyWorldZones() {
    if (!this.state || !this.state.unlockedZones) return;
    this.state.unlockedZones.forEach(id => {
      const zone = WORLD_ZONES.find(z => z.id === id);
      if (!zone) return;
      this.worldBound = zone.bound;
      this.scene.fog.density = zone.fog;
      this._buildZoneDecorations(id);
    });
  }

  checkWorldExpansion() {
    if (!this.state.unlockedZones) this.state.unlockedZones = [];
    const it = totalItems(this.state);
    WORLD_ZONES.forEach(zone => {
      if (this.state.unlockedZones.includes(zone.id)) return;
      if (zone.cond(this.state, it)) this.expandWorld(zone);
    });
  }

  expandWorld(zone) {
    if (!this.state.unlockedZones) this.state.unlockedZones = [];
    this.state.unlockedZones.push(zone.id);
    this.worldBound = zone.bound;
    this.scene.fog.density = zone.fog;
    this._buildZoneDecorations(zone.id);
    this.saveState();
    this._showToast(zone.toast);
    this.playSe('levelup');
  }

  _clearZoneDecorations() {
    if (!this.scene || !this.zoneDecorMeshes) return;
    Object.values(this.zoneDecorMeshes).forEach(arr => {
      arr.forEach(m => this.scene.remove(m));
    });
    this.zoneDecorMeshes = {};
  }

  _buildZoneDecorations(zoneId) {
    if (!this.zoneDecorMeshes) this.zoneDecorMeshes = {};
    if (this.zoneDecorMeshes[zoneId]) return;
    const meshes = [];
    const add = m => { this.scene.add(m); meshes.push(m); };
    const bx = (w, h, d, col, x, y, z) => {
      const m = this.box(w, h, d, col);
      m.position.set(x, y, z);
      m.castShadow = true;
      add(m);
    };

    if (zoneId === 'zone2') {
      // Flower patches in radius 29-35
      const flowerCols = [0xFF6680, 0xFF9900, 0xFFFF44, 0xFF44AA, 0xAA44FF, 0x44AAFF];
      [
        [30,0,6],[30,0,-6],[-30,0,6],[-30,0,-6],
        [6,0,30],[-6,0,30],[6,0,-30],[-6,0,-30],
        [25,0,22],[25,0,-20],[-25,0,22],[-25,0,-20],
      ].forEach(([x,,z], i) => {
        bx(0.2, 0.6, 0.2, 0x2D6A2F, x, 0.3, z);
        bx(0.5, 0.5, 0.5, flowerCols[i % flowerCols.length], x, 0.75, z);
      });
      // Fence posts along z=±33
      for (let x = -30; x <= 30; x += 3) {
        bx(0.2, 1.2, 0.2, 0x8B5E3C, x, 0.6, 33);
        bx(0.2, 1.2, 0.2, 0x8B5E3C, x, 0.6, -33);
      }
      for (let z = -30; z <= 30; z += 3) {
        bx(0.2, 1.2, 0.2, 0x8B5E3C, 33, 0.6, z);
        bx(0.2, 1.2, 0.2, 0x8B5E3C, -33, 0.6, z);
      }
      // Fence rails
      bx(60, 0.12, 0.12, 0x8B5E3C, 0, 1.1,  33);
      bx(60, 0.12, 0.12, 0x8B5E3C, 0, 1.1, -33);
      bx(0.12, 0.12, 60, 0x8B5E3C,  33, 1.1, 0);
      bx(0.12, 0.12, 60, 0x8B5E3C, -33, 1.1, 0);
      // Extra trees at zone 2 boundary
      [[31,14],[31,-14],[-31,14],[-31,-14],[14,31],[14,-31],[-14,31],[-14,-31],
       [32,0],[-32,0],[0,32],[0,-32]].forEach(([x,z]) => this.addTree(x,z));
    }

    if (zoneId === 'zone3') {
      // Giant mushrooms at radius 38-44
      [[38,18],[38,-18],[-38,18],[-38,-18],[18,38],[18,-38],[-18,38],[-18,-38],
       [42,5],[-42,5],[5,42],[-5,42]].forEach(([x,z], i) => {
        const h = 2.5 + (i % 3) * 0.8;
        bx(0.5, h, 0.5, 0x5C3A1E, x, h/2, z);
        bx(2.8, 0.8, 2.8, i % 2 === 0 ? 0xCC2222 : 0x884400, x, h + 0.4, z);
        bx(0.4, 0.12, 0.4, 0xFFFFFF, x, h + 0.85, z);
      });
      // Boulder clusters
      [[40,-10],[-40,-10],[40,10],[-40,10],[12,42],[-12,42],[12,-42],[-12,-42]].forEach(([x,z]) => {
        bx(1.8, 1.2, 1.8, 0x666666, x,     0.6,  z);
        bx(1.2, 0.9, 1.2, 0x777777, x+0.8, 0.45, z+0.6);
        bx(0.9, 0.7, 0.9, 0x888888, x-0.5, 0.35, z-0.5);
      });
      // Dense trees
      [[36,8],[36,-8],[-36,8],[-36,-8],[8,36],[8,-36],[-8,36],[-8,-36],
       [40,16],[40,-16],[-40,16],[-40,-16],[20,40],[20,-40],[-20,40],[-20,-40]].forEach(([x,z]) => this.addTree(x,z));
    }

    if (zoneId === 'zone4') {
      // Ancient ruins at radius 48-56
      [[50,12],[50,-12],[-50,12],[-50,-12],[12,50],[-12,50],[12,-50],[-12,-50]].forEach(([x,z]) => {
        bx(4.0, 2.5, 0.6, 0x888870, x,     1.25, z);
        bx(0.6, 3.5, 4.0, 0x888870, x+2.5, 1.75, z);
        bx(1.2, 1.0, 0.6, 0x888870, x-1.0, 3.0,  z);
        bx(0.6, 0.6, 0.6, 0x777760, x+1.5, 0.3,  z+1.5);
        bx(0.4, 0.4, 0.4, 0x777760, x-2.0, 0.2,  z-1.0);
      });
      // Stone monoliths
      [[54,0],[-54,0],[0,54],[0,-54],[48,22],[48,-22],[-48,22],[-48,-22]].forEach(([x,z], i) => {
        const h = 4 + (i % 3) * 1.5;
        bx(0.8, h,   0.8, 0x667766, x, h/2,  z);
        bx(1.2, 0.3, 1.2, 0x557755, x, h+0.15, z);
      });
      // Ground patches (sand-colored)
      [[52,8],[52,-8],[-52,8],[-52,-8],[8,52],[-8,52],[8,-52],[-8,-52]].forEach(([x,z]) => {
        bx(6, 0.08, 6, 0xC8A870, x, 0.04, z);
      });
    }

    if (zoneId === 'zone5') {
      // Crystal formations at radius 60-68
      const crystalCols = [0x44DDFF, 0xFF44FF, 0x44FF88, 0xFFFF44, 0xFF8844, 0xFF4444];
      [[62,10],[62,-10],[-62,10],[-62,-10],[10,62],[-10,62],[10,-62],[-10,-62],
       [60,26],[60,-26],[-60,26],[-60,-26]].forEach(([x,z], i) => {
        const col = crystalCols[i % crystalCols.length];
        const mat = new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.4 });
        const h = 3 + (i % 4) * 0.8;
        const main = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, 0.5), mat);
        main.position.set(x, h/2, z);
        add(main);
        [[-0.8,0.6],[0.6,-0.7],[-0.5,-0.8]].forEach(([dx,dz]) => {
          const sh = h * 0.6;
          const sm = new THREE.Mesh(new THREE.BoxGeometry(0.3, sh, 0.3), mat);
          sm.position.set(x+dx, sh/2, z+dz);
          add(sm);
        });
        const pl = new THREE.PointLight(col, 0.8, 12);
        pl.position.set(x, 3, z);
        this.scene.add(pl);
        meshes.push(pl);
      });
      // Floating rocks
      [[65,0],[-65,0],[0,65],[0,-65],[58,32],[58,-32],[-58,32],[-58,-32]].forEach(([x,z], i) => {
        const s = 1.5 + (i % 3) * 0.5;
        const y = 5 + (i % 4);
        bx(s,     s*0.6, s,     0x666688, x,        y,        z);
        bx(s*0.7, s*0.4, s*0.7, 0x777799, x+s*0.3, y+s*0.4,  z+s*0.2);
      });
    }

    this.zoneDecorMeshes[zoneId] = meshes;
  }

  updateInventoryHUD() {
    const inv = this.state.inventory || {};
    ['wood','stone','iron','gold','diamond'].forEach(id => {
      const el = document.getElementById('inv-' + id);
      if (el) el.textContent = inv[id] || 0;
    });
    // also update buildings count
    const hb = document.getElementById('hud-buildings');
    if (hb) hb.textContent = `建物: ${this.unlockedCount()} / ${BUILDING_DEFS.length}`;
  }

  goHome() {
    // Close any open modals
    document.getElementById('mining-popup').classList.add('hidden');
    document.getElementById('settings-panel').classList.add('hidden');
    this.mining = null;
    this.vx = 0; this.vz = 0;
    this.gameRunning = false;
    this.stopBgm();
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('hotbar').classList.add('hidden');
    document.getElementById('btn-home').classList.add('hidden');
    document.getElementById('btn-settings').classList.add('hidden');
    document.getElementById('btn-craft').classList.add('hidden');
    document.getElementById('btn-quest').classList.add('hidden');
    document.getElementById('mobile-controls').classList.add('hidden');
    document.getElementById('interact-hint').classList.add('hidden');
    document.getElementById('building-popup').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
  }

  // ===== HUD =====
  updateHUD() {
    const s = this.state;
    document.getElementById('hud-level').textContent = this.lvText(s.level);
    const need = XP_FOR_LEVEL(s.level);
    document.getElementById('hud-xp-text').textContent = `${s.xp} / ${need}`;
    document.getElementById('hud-xp-bar').style.width = (s.xp / need * 100).toFixed(1) + '%';
    const hudDay = document.getElementById('hud-day');
    if (hudDay) hudDay.textContent = this.isNightTime() ? `🌙 ${this.dayCount}日目` : `☀️ ${this.dayCount}日目`;
    this.updateInventoryHUD();
  }

  // ===== START GAME =====
  start() {
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('hotbar').classList.remove('hidden');
    document.getElementById('btn-home').classList.remove('hidden');
    document.getElementById('btn-settings').classList.remove('hidden');
    document.getElementById('btn-craft').classList.remove('hidden');
    document.getElementById('btn-quest').classList.remove('hidden');
    if (this.isMobile) document.getElementById('mobile-controls').classList.remove('hidden');
    // モブ・昼夜リセット
    this.spawnMobs();
    this.dayTime = 0.3; // 朝からスタート
    this.dayFrame = Math.round(0.3 * DAY_LENGTH);
    this._wasNight = false;
    this.dayCount = 1;
    this.mobSpawnTimer = 0;
    this.gameRunning = true;
    this.vx = 0; this.vz = 0;
    this.playerHp = this.playerMaxHp;
    this.invincibleTimer = 0;
    this._updateHpHud();
    this._updateAchievementHud();
    this._checkDailyLogin();
    this._initDailyQuests();
    this._updateQuestBtn();
    this.initAudio();
    this.playSe('start');
    setTimeout(() => this.playBgm('field'), 600);
    this.updateHUD();
  }
}

// ===== BOOT =====
let game;
addEventListener('load', () => {
  const bar = document.getElementById('loading-bar');
  const txt = document.getElementById('loading-text');

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});

  txt.textContent = 'Three.js 読み込み中...';
  bar.style.width = '20%';

  setTimeout(async () => {
    bar.style.width = '40%';
    txt.textContent = '問題を読み込み中...';

    game = new Game();
    game.settings = game.loadSettings();
    // URLハッシュ経由のトークン自動設定 ( #t=TOKEN ) — QRスキャン時
    const _urlToken = new URLSearchParams(location.hash.replace(/^#/, '')).get('t');
    if (_urlToken) {
      game.settings.githubToken = _urlToken;
      game.saveSettings();
      history.replaceState(null, '', location.pathname + location.search);
      game._setupToastPending = true;
    }
    game.state = game.loadState();
    await game.loadCustomQuestions();
    game._restoreTodayLog();

    bar.style.width = '70%';
    txt.textContent = 'ワールドを生成中...';
    game.init();

    setTimeout(() => {
      bar.style.width = '100%';
      txt.textContent = '準備完了！';

      setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('title-screen').classList.remove('hidden');
        if (game.csvUpdated) {
          setTimeout(() => document.getElementById('update-popup').classList.remove('hidden'), 400);
        }
        game._setupToastPending = false;

        document.getElementById('btn-start').addEventListener('click', () => {
          game.resetState();
          game.state = game.loadState();
          game.refreshBuildings();
          game.start();
        });
        document.getElementById('btn-continue').addEventListener('click', () => {
          game.start();
        });

        // 設定パネル（タイトルから）
        document.getElementById('btn-settings-title').addEventListener('click', () => {
          game.openSettings();
        });
        // 設定パネル（ゲーム中）
        document.getElementById('btn-settings').addEventListener('click', () => {
          game.openSettings();
        });
        document.getElementById('btn-settings-close').addEventListener('click', () => {
          game.closeSettings();
        });
        document.getElementById('btn-export-stats').addEventListener('click', () => {
          game.exportStats();
        });
        const syncNowBtn = document.getElementById('btn-sync-now');
        if (syncNowBtn) syncNowBtn.addEventListener('click', () => {
          const tokenEl = document.getElementById('settings-token');
          if (tokenEl) game.settings.githubToken = tokenEl.value.trim();
          game.syncStatsToGitHub();
        });

        // スピードボタン
        document.querySelectorAll('.speed-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            game.settings.speed = parseFloat(btn.dataset.speed);
            document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
          });
        });

        // 難易度ボタン
        document.querySelectorAll('.diff-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            game.settings.difficulty = btn.dataset.diff;
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
          });
        });

        // クラフトメニュー
        document.getElementById('btn-craft').addEventListener('click', () => game.openCraftMenu());
        document.getElementById('btn-craft-close').addEventListener('click', () => {
          document.getElementById('craft-menu').classList.add('hidden');
        });

        // クエストパネル
        document.getElementById('btn-quest').addEventListener('click', () => game.openQuestPanel());
        document.getElementById('btn-quest-close').addEventListener('click', () => {
          document.getElementById('quest-panel').classList.add('hidden');
        });

        // 攻撃ボタン（モバイル）
        const btnAtk = document.getElementById('btn-attack');
        btnAtk.addEventListener('click', () => game.tryAttack());
        btnAtk.addEventListener('touchend', e => { e.preventDefault(); game.tryAttack(); });

        // 交易メニュー
        document.getElementById('btn-trade-close').addEventListener('click', () => {
          document.getElementById('trade-menu').classList.add('hidden');
        });

        // 建物から出るボタン
        document.getElementById('btn-exit-building').addEventListener('click', () => {
          game.exitBuilding();
        });

        // 建物内アクションボタン（タップ用）
        document.getElementById('btn-building-action').addEventListener('click', () => {
          game.tryInteract();
        });

        // リスポーンボタン
        document.getElementById('btn-respawn').addEventListener('click', () => {
          game._respawn();
        });

        // CSV更新ポップアップ
        document.getElementById('btn-update-ok').addEventListener('click', () => {
          document.getElementById('update-popup').classList.add('hidden');
          game._showToast('📚 あたらしいもんだい、はじめよう！');
        });

        // もんだいレビューパネル
        document.getElementById('btn-review-stats').addEventListener('click', () => {
          game.closeSettings();
          game.openReviewPanel();
        });
        document.getElementById('btn-review-close').addEventListener('click', () => {
          document.getElementById('review-panel').classList.add('hidden');
        });
        document.querySelectorAll('.rv-filter').forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll('.rv-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            game._reviewSubj = btn.dataset.subj;
            game._buildReviewList();
            game._renderReviewCard();
          });
        });
        document.getElementById('btn-rv-prev').addEventListener('click', () => {
          if (game._reviewIdx > 0) { game._reviewIdx--; game._renderReviewCard(); }
        });
        document.getElementById('btn-rv-next').addEventListener('click', () => {
          if (game._reviewIdx < (game._reviewList || []).length - 1) { game._reviewIdx++; game._renderReviewCard(); }
        });

        // BGM音量スライダー
        document.getElementById('settings-bgm').addEventListener('input', e => {
          const v = parseInt(e.target.value) / 100;
          game.settings.bgmVol = v;
          document.getElementById('settings-bgm-val').textContent = e.target.value + '%';
          if (game.bgmGain) game.bgmGain.gain.value = v;
          // 0になったらBGM停止、再開
          if (v < 0.01) game.stopBgm();
          else if (!game.currentBgm && game.gameRunning) {
            game.playBgm(game.isNightTime() ? 'night' : 'field');
          }
        });

        // SE音量スライダー
        document.getElementById('settings-se').addEventListener('input', e => {
          const v = parseInt(e.target.value) / 100;
          game.settings.seVol = v;
          document.getElementById('settings-se-val').textContent = e.target.value + '%';
          if (game.seGain) game.seGain.gain.value = v;
        });

      }, 500);
    }, 800);
  }, 400);
});
