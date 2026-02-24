'use strict';

// ===== CONSTANTS =====
const STORAGE_KEY = 'mclearn3d_v1';
const STATS_KEY = 'mclearn3d_stats_v1';
// レベルから現在の学年を返す (Lv1-2=2年生, Lv3-5=3年生, ...)
const GRADE_FOR_LEVEL = lv => lv <= 2 ? 2 : lv <= 5 ? 3 : lv <= 9 ? 4 : lv <= 14 ? 5 : 6;
const QUIZ_PER_SESSION = 5;
const XP_PER_CORRECT = 10;
const XP_FOR_LEVEL = lv => 50 + (lv - 1) * 30;

const DEFAULT_STATE = {
  level: 1, xp: 0,
  totalCorrect: 0, totalGames: 0,
  perfectClears: 0, maxStreak: 0, currentStreak: 0,
  worldClears: { math: 0, japanese: 0, english: 0 },
  achievements: [],
};

// ===== BUILDING DEFINITIONS =====
const BUILDING_DEFS = [
  { id:'cabin',   name:'小屋',          icon:'🏠', pos:[6,0,6],     size:[3,3,3],     color:0x8B5E3C, roofColor:0x5c3a1e, cond:s=>wc(s)>=1,         condText:'いずれか 1回クリア',      desc:'ぼうけんのはじまり！' },
  { id:'tanbo',   name:'田んぼ',        icon:'🌾', pos:[-6,0,6],    size:[5,1.5,3],   color:0x2a8a20, roofColor:0x1a5a10, cond:s=>s.worldClears.japanese>=1, condText:'こくご 1回クリア', desc:'おこめが そだつ！' },
  { id:'mine',    name:'採掘場',        icon:'⛏️', pos:[8,0,-6],    size:[3.5,3.5,3], color:0x686868, roofColor:0x484848, cond:s=>s.worldClears.math>=1,     condText:'さんすう 1回クリア', desc:'ブロックを ほる！' },
  { id:'market',  name:'交易所',        icon:'🏪', pos:[-8,0,-6],   size:[4,3.5,3],   color:0xC4521C, roofColor:0x7a2e00, cond:s=>s.worldClears.english>=1,  condText:'えいご 1回クリア', desc:'せかいと つながる！' },
  { id:'well',    name:'井戸',          icon:'⛲', pos:[0,0,10],    size:[2.5,2.5,2.5],color:0x888888,roofColor:0x505050, cond:s=>wc(s)>=4,         condText:'ごうけい 4回クリア',     desc:'きれいな水が でる！' },
  { id:'onsen',   name:'温泉',          icon:'♨️', pos:[12,0,0],    size:[4,3,4],     color:0x5080a0, roofColor:0x305070, cond:s=>wc(s)>=6,         condText:'ごうけい 6回クリア',     desc:'ゆっくり くつろぐ！' },
  { id:'forge',   name:'鍛冶屋',        icon:'🔨', pos:[12,0,-10],  size:[3.5,4,3],   color:0x5A3E28, roofColor:0x3a2010, cond:s=>s.worldClears.math>=3,     condText:'さんすう 3回クリア', desc:'つよい どうぐを つくる！' },
  { id:'shrine',  name:'神社',          icon:'⛩️', pos:[-12,0,-10], size:[3.5,5,3],   color:0xCC2200, roofColor:0x881500, cond:s=>s.worldClears.japanese>=3, condText:'こくご 3回クリア', desc:'かみさまの パワー！' },
  { id:'guild',   name:'冒険ギルド',    icon:'🏰', pos:[-12,0,0],   size:[4.5,4.5,4], color:0x48485A, roofColor:0x282838, cond:s=>s.worldClears.english>=3,  condText:'えいご 3回クリア', desc:'ぼうけんしゃ 募集！' },
  { id:'garden',  name:'花畑',          icon:'🌸', pos:[0,0,-10],   size:[5,1,4],     color:0x4a8a30, roofColor:0x2a5a18, cond:s=>(s.perfectClears||0)>=1,   condText:'パーフェクト 1回',       desc:'きれいな はな！' },
  { id:'tower',   name:'見張り塔',      icon:'🗼', pos:[18,0,0],    size:[2.5,8,2.5], color:0x686868, roofColor:0x383838, cond:s=>s.worldClears.math>=5,     condText:'さんすう 5回クリア', desc:'とおくまで みえる！' },
  { id:'library', name:'図書館',        icon:'📚', pos:[-18,0,0],   size:[4.5,4,3.5], color:0x8060A0, roofColor:0x503080, cond:s=>wc(s)>=12,        condText:'ごうけい 12回クリア',    desc:'ちしきの くら！' },
  { id:'port',    name:'港',            icon:'⚓', pos:[0,0,-20],   size:[5,3.5,4],   color:0x2060A0, roofColor:0x103070, cond:s=>s.worldClears.english>=5,  condText:'えいご 5回クリア', desc:'うみの むこうへ！' },
  { id:'castle',  name:'城',            icon:'🏯', pos:[0,0,22],    size:[6,7,5],     color:0xC89820, roofColor:0x806000, cond:s=>wc(s)>=20,        condText:'ごうけい 20回クリア',    desc:'りっぱな おしろ！' },
  { id:'dragon',  name:'ドラゴンの すみか',icon:'🐉',pos:[24,0,-16], size:[5.5,6,5],   color:0x4B2080, roofColor:0x2A0050, cond:s=>wc(s)>=30,        condText:'ごうけい 30回クリア',    desc:'でんせつの せいいき！' },
  { id:'sky',     name:'そらの しろ',   icon:'☁️', pos:[-24,0,-16], size:[5,5.5,4.5], color:0x6890C0, roofColor:0x3060A0, cond:s=>(s.perfectClears||0)>=5,   condText:'パーフェクト 5回',       desc:'くうちゅうに うかぶ しろ！' },
  { id:'rainbow', name:'にじの ゲート', icon:'🌈', pos:[0,0,30],    size:[6,8,2],     color:0xFF66BB, roofColor:0xCC3399, cond:s=>s.level>=15,       condText:'レベル 15 たっせい',     desc:'でんせつの もん！' },
];

function wc(s) { return s.worldClears.math + s.worldClears.japanese + s.worldClears.english; }

// ===== QUIZ PORTALS =====
const PORTAL_DEFS = [
  { id:'math',     subject:'math',     name:'さんすうの どうくつ', icon:'⛏️', pos:[-24,0,0],  color:0xFF6600 },
  { id:'japanese', subject:'japanese', name:'こくごの もり',       icon:'📖', pos:[24,0,0],   color:0x00CC44 },
  { id:'english',  subject:'english',  name:'えいごの むら',       icon:'🗣️', pos:[0,0,-24],  color:0x4488FF },
];

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
  skeleton: { hostile:true,  speed:0.025, chaseR:14, fleeR:0,  skin:'#D8D8D8', shirt:'#C0C0C0', pants:'#B0B0B0', shoes:'#A0A0A0', flying:false, burnDay:true,  chargeRange:0   },
  pig:      { hostile:false, speed:0.015, chaseR:0,  fleeR:5,  skin:'#F0B0A0', shirt:'#E89888', pants:'#E89888', shoes:'#D07060', flying:false, burnDay:false, chargeRange:0   },
  sheep:    { hostile:false, speed:0.015, chaseR:0,  fleeR:5,  skin:'#D8D8C0', shirt:'#DDDDC8', pants:'#D0D0B8', shoes:'#B0B0A0', flying:false, burnDay:false, chargeRange:0   },
  chicken:  { hostile:false, speed:0.012, chaseR:0,  fleeR:4,  skin:'#FFFFFF', shirt:'#EEEEEE', pants:'#FFB040', shoes:'#FF8800', flying:false, burnDay:false, chargeRange:0   },
  ghast:    { hostile:true,  speed:0.013, chaseR:20, fleeR:0,  skin:'#F0F0F0', shirt:'#F8F8F8', pants:'#E8E8E8', shoes:'#D8D8D8', flying:true,  burnDay:false, chargeRange:0   },
};

// ゲーム1日の長さ(フレーム)、モブ上限
const DAY_LENGTH      = 2400; // ≈40秒/日 (60fps)
const MOB_CAP_HOSTILE = 12;
const MOB_CAP_PASSIVE = 10;

// 初期配置(昼間 受動モブのみ)
const INITIAL_MOBS = [
  {type:'pig',     x:6,   z:12}, {type:'pig',    x:-8, z:13}, {type:'pig',   x:11, z:-8},
  {type:'sheep',   x:-9,  z:11}, {type:'sheep',  x:7,  z:-11},
  {type:'chicken', x:4,   z:14}, {type:'chicken', x:-5, z:-13},
];

function hexDarken(hex, f) {
  hex = hex.replace('#','');
  if (hex.length===3) hex=hex.split('').map(c=>c+c).join('');
  const r=Math.floor(parseInt(hex.slice(0,2),16)*f);
  const g=Math.floor(parseInt(hex.slice(2,4),16)*f);
  const b=Math.floor(parseInt(hex.slice(4,6),16)*f);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

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
    this.portalGlows = [];
    this.keys = {};
    this.joystick = { active: false, x: 0, y: 0 };
    this.nearPortal = null;
    this.nearBuilding = null;
    this.quiz = null;
    this.gameRunning = false;
    this.frame = 0;
    this.vx = 0; this.vz = 0; // velocity for smooth movement
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
    this.isMobile = 'ontouchstart' in window || window.innerWidth < 900;
  }

  // ===== STATS & ADAPTIVE =====
  initQuestionIds() {
    ['math','japanese','english'].forEach(subject => {
      const sd = QUIZ_DATA[subject];
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

  selectAdaptiveQuestions(subject, count) {
    const sd = QUIZ_DATA[subject];
    const maxGrade = GRADE_FOR_LEVEL(this.state.level);
    const reviewPool = [], normalPool = [], previewPool = [];
    const shuf = arr => [...arr].sort(() => Math.random()-0.5);

    Object.entries(sd.grades).forEach(([grade, qs]) => {
      const g = parseInt(grade);
      if (g > maxGrade + 1) return;
      qs.forEach(q => {
        const stat = this.playerStats[q.id] || { seen:0, correct:0, wrong:0 };
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
    selected.push(...pick(reviewPool, Math.min(2, reviewPool.length)));
    selected.push(...pick(normalPool, Math.min(count - selected.length - 1, normalPool.length)));
    if (previewPool.length) selected.push(...pick(previewPool, 1));
    if (selected.length < count) {
      const rest = [...reviewPool, ...normalPool, ...previewPool].filter(q => !selected.includes(q));
      selected.push(...pick(rest, count - selected.length));
    }
    return selected.slice(0, count);
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
        const a=r(10,49), b=r(10,49), ans=a+b;
        const opts=shuf([ans,...wrongs(ans,3)]);
        pool.push({ id:`gen_add2_${i}`, grade:2, subject:'math',
          q:`${a} ＋ ${b} ＝ ？`, opts:opts.map(String), correct:opts.indexOf(ans),
          explain:`${a}＋${b}＝${ans}！` });
        const c=r(20,79), d=r(10,Math.min(c,40)), ans2=c-d;
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
          worldClears: { ...DEFAULT_STATE.worldClears, ...(saved.worldClears || {}) },
        };
      }
    } catch(e) {}
    return { ...DEFAULT_STATE, worldClears: { math:0, japanese:0, english:0 } };
  }

  saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch(e) {}
  }

  resetState() {
    this.state = { ...DEFAULT_STATE, worldClears: { math:0, japanese:0, english:0 } };
    this.saveState();
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
    }
  }

  // ===== THREE.JS INIT =====
  init() {
    const canvas = document.getElementById('game-canvas');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.012);

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
    const savedCharId = localStorage.getItem(CHAR_STORAGE_KEY) || 'steve';
    this.currentChar = CHARACTER_DEFS.find(c=>c.id===savedCharId) || CHARACTER_DEFS[0];
    this.buildPlayer(this.currentChar);
    this.buildBuildings();
    this.buildPortals();
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

  // ===== PORTALS =====
  buildPortals() {
    PORTAL_DEFS.forEach(def => {
      const g = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: def.color });

      const lP = new THREE.Mesh(new THREE.BoxGeometry(0.4,4,0.4), mat); lP.position.set(-1.2,2,0); lP.castShadow=true; g.add(lP);
      const rP = new THREE.Mesh(new THREE.BoxGeometry(0.4,4,0.4), mat); rP.position.set( 1.2,2,0); rP.castShadow=true; g.add(rP);
      const top = new THREE.Mesh(new THREE.BoxGeometry(3.2,0.5,0.4), mat); top.position.set(0,4.25,0); g.add(top);

      const glowMat = new THREE.MeshBasicMaterial({ color: def.color, transparent:true, opacity:0.5, side: THREE.DoubleSide });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(2,3.4), glowMat);
      glow.position.set(0,2,0); g.add(glow);
      this.portalGlows.push(glow);

      const base = new THREE.Mesh(new THREE.BoxGeometry(3.5,0.3,3), new THREE.MeshLambertMaterial({ color:0x555555 }));
      base.position.set(0,0.15,0); base.receiveShadow=true; g.add(base);

      g.position.set(def.pos[0], 0, def.pos[2]);
      this.scene.add(g);
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
      g.userData = { type, def, state:'wander', wanderTimer:0, wanderDx:0, wanderDz:0, fireCooldown:Math.floor(120+Math.random()*180), legL:null, legR:null };
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
    g.userData = { type, def, state:'wander', wanderTimer:0, wanderDx:0, wanderDz:0, fireCooldown:9999, legL, legR };
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
      if (Math.hypot(fb.position.x-px, fb.position.z-pz) < 1.2) { this.scene.remove(fb); return false; }
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
    // プレイヤーが近ければ警告表示
    const d = Math.hypot(pos.x-this.player.position.x, pos.z-this.player.position.z);
    if (d < 5) {
      const hint = document.getElementById('interact-hint');
      hint.textContent = '💥 クリーパーが爆発した！';
      hint.classList.remove('hidden');
      setTimeout(() => hint.classList.add('hidden'), 1800);
    }
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
    const prev = this.dayTime;
    this.dayTime = (this.dayTime + 1/DAY_LENGTH) % 1;
    // 深夜を越えたら日数カウントアップ
    if (prev > 0.95 && this.dayTime < 0.05) {
      this.dayCount++;
      document.getElementById('hud-day').textContent = this.isNightTime() ? `🌙 ${this.dayCount}日目` : `☀️ ${this.dayCount}日目`;
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
      // Camera rotation with Q/E... skip for simplicity
    });
    addEventListener('keyup', e => { this.keys[e.key] = false; });

    // Joystick
    const base = document.getElementById('joystick-base');
    const stick = document.getElementById('joystick-stick');
    let jX=0, jY=0;
    const R = 38;

    base.addEventListener('touchstart', e => {
      e.preventDefault();
      jX = e.touches[0].clientX; jY = e.touches[0].clientY;
      this.joystick.active = true;
    }, {passive:false});

    base.addEventListener('touchmove', e => {
      e.preventDefault();
      let dx = e.touches[0].clientX - jX;
      let dy = e.touches[0].clientY - jY;
      const dist = Math.hypot(dx,dy);
      if (dist > R) { dx=dx/dist*R; dy=dy/dist*R; }
      stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.joystick.x = dx/R;
      this.joystick.y = dy/R;
    }, {passive:false});

    const stopJ = () => {
      this.joystick.active=false; this.joystick.x=0; this.joystick.y=0;
      stick.style.transform = 'translate(-50%, -50%)';
    };
    base.addEventListener('touchend', stopJ);
    base.addEventListener('touchcancel', stopJ);

    // Interact btn
    const btnI = document.getElementById('btn-interact');
    btnI.addEventListener('click', () => this.tryInteract());
    btnI.addEventListener('touchend', e => { e.preventDefault(); this.tryInteract(); });

    // Quiz buttons
    document.getElementById('quiz-next-btn').addEventListener('click', () => this.quizNext());
    document.getElementById('quiz-quit-btn').addEventListener('click', () => this.quitQuiz());
    document.getElementById('btn-result-close').addEventListener('click', () => {
      document.getElementById('quiz-result').classList.add('hidden');
    });

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

  // ===== GAME LOOP =====
  loop() {
    requestAnimationFrame(() => this.loop());
    if (!this.gameRunning) return;
    this.frame++;
    this.movePlayer();
    this.followCamera();
    this.glowPortals();
    this.updateDayNight();
    this.updateMobs();
    this.mobSpawnTick();
    this.checkNearby();
    this.renderer.render(this.scene, this.camera);
  }

  movePlayer() {
    const quizOpen = !document.getElementById('quiz-overlay').classList.contains('hidden') ||
                     !document.getElementById('quiz-result').classList.contains('hidden');
    if (quizOpen) { this.vx *= 0.7; this.vz *= 0.7; return; }

    let dx = 0, dz = 0;
    if (this.keys['w'] || this.keys['ArrowUp'])    dz -= 1;
    if (this.keys['s'] || this.keys['ArrowDown'])  dz += 1;
    if (this.keys['a'] || this.keys['ArrowLeft'])  dx -= 1;
    if (this.keys['d'] || this.keys['ArrowRight']) dx += 1;
    if (this.joystick.active) { dx += this.joystick.x; dz += this.joystick.y; }

    const len = Math.hypot(dx, dz);
    const ACCEL = 0.055;
    const FRICTION = 0.76;
    const MAX_SPD = 0.38;

    if (len > 0.01) {
      dx /= len; dz /= len;
      const ca = this.cameraAngle;
      const wx = dx*Math.cos(ca) - dz*Math.sin(ca);
      const wz = dx*Math.sin(ca) + dz*Math.cos(ca);

      this.vx += wx * ACCEL;
      this.vz += wz * ACCEL;
      const spd = Math.hypot(this.vx, this.vz);
      if (spd > MAX_SPD) { this.vx = this.vx/spd*MAX_SPD; this.vz = this.vz/spd*MAX_SPD; }

      // Face direction of velocity
      if (spd > 0.01) this.player.rotation.y = Math.atan2(this.vx, this.vz);
    } else {
      this.vx *= FRICTION;
      this.vz *= FRICTION;
      if (Math.hypot(this.vx, this.vz) < 0.002) { this.vx = 0; this.vz = 0; }
    }

    this.player.position.x = Math.max(-48, Math.min(48, this.player.position.x + this.vx));
    this.player.position.z = Math.max(-48, Math.min(48, this.player.position.z + this.vz));

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
    const px = this.player.position.x;
    const py = this.player.position.y + 1.3;
    const pz = this.player.position.z;
    const ca = this.cameraAngle;
    const cd = this.cameraDist;

    const tx = px + Math.sin(ca)*cd;
    const ty = py + Math.tan(this.cameraPitch)*cd;
    const tz = pz + Math.cos(ca)*cd;

    this.camera.position.lerp(new THREE.Vector3(tx,ty,tz), 0.12);
    this.camera.lookAt(px, py, pz);
  }

  glowPortals() {
    const v = 0.3 + 0.25*Math.sin(Date.now()*0.002);
    this.portalGlows.forEach(g => { g.material.opacity = v; });
  }

  checkNearby() {
    const px = this.player.position.x, pz = this.player.position.z;

    let np = null, npd = 7;
    PORTAL_DEFS.forEach(p => {
      const d = Math.hypot(px-p.pos[0], pz-p.pos[2]);
      if (d < npd) { npd=d; np=p; }
    });

    let nb = null, nbd = 5;
    BUILDING_DEFS.forEach(b => {
      const d = Math.hypot(px-b.pos[0], pz-b.pos[2]);
      if (d < nbd) { nbd=d; nb=b; }
    });

    this.nearPortal = np;
    this.nearBuilding = nb;

    const hint = document.getElementById('interact-hint');
    const btnI = document.getElementById('btn-interact');
    const popup = document.getElementById('building-popup');

    if (np) {
      hint.textContent = `${np.icon} ${np.name}：E / タップ でチャレンジ！`;
      hint.classList.remove('hidden');
      btnI.classList.remove('hidden');
      popup.classList.add('hidden');
    } else if (nb) {
      const ok = nb.cond(this.state);
      document.getElementById('bp-name').textContent = `${nb.icon} ${nb.name}`;
      document.getElementById('bp-desc').textContent = nb.desc;
      document.getElementById('bp-lock').textContent = ok ? '✅ かいほう済み！' : `🔒 ${nb.condText}`;
      popup.classList.remove('hidden');
      hint.classList.add('hidden');
      btnI.classList.add('hidden');
    } else {
      hint.classList.add('hidden');
      btnI.classList.add('hidden');
      popup.classList.add('hidden');
    }
  }

  // ===== INTERACT =====
  tryInteract() {
    if (this.nearPortal && !this.quiz &&
        document.getElementById('quiz-overlay').classList.contains('hidden') &&
        document.getElementById('quiz-result').classList.contains('hidden')) {
      this.startQuiz(this.nearPortal);
    }
  }

  // ===== QUIZ =====
  startQuiz(portal) {
    const qs = this.selectAdaptiveQuestions(portal.subject, QUIZ_PER_SESSION);

    this.quiz = { portal, questions:qs, cur:0, correct:0, answered:false };
    document.getElementById('quiz-icon').textContent = portal.icon;
    document.getElementById('quiz-subject-name').textContent = portal.name;
    document.getElementById('quiz-overlay').classList.remove('hidden');
    this.renderQuestion();
  }

  renderQuestion() {
    const { quiz } = this;
    const q = quiz.questions[quiz.cur];
    document.getElementById('quiz-progress').textContent = `${quiz.cur+1} / ${quiz.questions.length}`;
    document.getElementById('quiz-question').textContent = q.q;
    document.getElementById('quiz-feedback').classList.add('hidden');
    document.getElementById('quiz-next-btn').classList.add('hidden');

    const el = document.getElementById('quiz-options');
    el.innerHTML = '';
    q.opts.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-option';
      btn.textContent = opt;
      btn.onclick = () => this.answerQuiz(i);
      el.appendChild(btn);
    });
    quiz.answered = false;
  }

  answerQuiz(idx) {
    const { quiz } = this;
    if (quiz.answered) return;
    quiz.answered = true;

    const q = quiz.questions[quiz.cur];
    const ok = idx === q.correct;
    this.updateQuestionStat(q.id, ok);

    document.querySelectorAll('.quiz-option').forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.correct) btn.classList.add('correct');
      else if (i === idx && !ok) btn.classList.add('wrong');
    });

    if (ok) {
      quiz.correct++;
      this.state.totalCorrect++;
      this.state.currentStreak = (this.state.currentStreak||0) + 1;
      if (this.state.currentStreak > this.state.maxStreak) this.state.maxStreak = this.state.currentStreak;
    } else {
      this.state.currentStreak = 0;
    }
    this.state.totalGames++;

    const fb = document.getElementById('quiz-feedback');
    fb.className = 'quiz-feedback ' + (ok ? 'correct' : 'wrong');
    fb.textContent = ok ? `✅ せいかい！ ${q.explain}` : `❌ ちがいます。正解: ${q.opts[q.correct]}。${q.explain}`;
    fb.classList.remove('hidden');

    const nxt = document.getElementById('quiz-next-btn');
    nxt.textContent = quiz.cur+1 >= quiz.questions.length ? '結果を見る ▶' : 'つぎへ ▶';
    nxt.classList.remove('hidden');
  }

  quizNext() {
    const { quiz } = this;
    quiz.cur++;
    if (quiz.cur >= quiz.questions.length) {
      this.finishQuiz();
    } else {
      this.renderQuestion();
    }
  }

  quitQuiz() {
    document.getElementById('quiz-overlay').classList.add('hidden');
    this.quiz = null;
    this.vx = 0; this.vz = 0;
  }

  goHome() {
    // Close any open modals
    document.getElementById('quiz-overlay').classList.add('hidden');
    document.getElementById('quiz-result').classList.add('hidden');
    this.quiz = null;
    this.vx = 0; this.vz = 0;
    this.gameRunning = false;
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('btn-home').classList.add('hidden');
    document.getElementById('world-clears').classList.add('hidden');
    document.getElementById('mobile-controls').classList.add('hidden');
    document.getElementById('interact-hint').classList.add('hidden');
    document.getElementById('building-popup').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
  }

  finishQuiz() {
    document.getElementById('quiz-overlay').classList.add('hidden');
    const { quiz } = this;
    const { correct, questions, portal } = quiz;
    const total = questions.length;
    const isPerfect = correct === total;
    const xp = correct * XP_PER_CORRECT;

    // Remember old clears to detect new unlocks
    const prevState = JSON.parse(JSON.stringify(this.state));
    this.state.worldClears[portal.subject]++;
    if (isPerfect) this.state.perfectClears = (this.state.perfectClears||0) + 1;

    const newUnlocks = BUILDING_DEFS.filter(d => !d.cond(prevState) && d.cond(this.state)).map(d => `${d.icon}${d.name}`);

    this.saveState();
    this.refreshBuildings();
    this.addXP(xp);
    this.saveState();
    this.updateHUD();

    document.getElementById('result-emoji').textContent = isPerfect ? '🌟' : correct >= total*0.6 ? '🎉' : '🍀';
    document.getElementById('result-title').textContent = isPerfect ? 'パーフェクト！！' : 'クリア！';
    document.getElementById('result-score').textContent = `${total}問中 ${correct}問 せいかい！`;
    document.getElementById('result-xp').textContent = `+${xp} XP`;
    document.getElementById('result-unlock').textContent = newUnlocks.length ? `🏗 ${newUnlocks.join('、')} が かいほう！` : '';
    document.getElementById('quiz-result').classList.remove('hidden');

    this.quiz = null;
  }

  // ===== HUD =====
  updateHUD() {
    const s = this.state;
    document.getElementById('hud-level').textContent = this.lvText(s.level);
    const need = XP_FOR_LEVEL(s.level);
    document.getElementById('hud-xp-text').textContent = `${s.xp} / ${need}`;
    document.getElementById('hud-xp-bar').style.width = (s.xp / need * 100).toFixed(1) + '%';
    document.getElementById('hud-buildings').textContent = `建物: ${this.unlockedCount()} / ${BUILDING_DEFS.length}`;
    document.getElementById('wc-math').textContent = s.worldClears.math;
    document.getElementById('wc-ja').textContent = s.worldClears.japanese;
    document.getElementById('wc-en').textContent = s.worldClears.english;
    const hudDay = document.getElementById('hud-day');
    if (hudDay) hudDay.textContent = `☀️ ${this.dayCount}日目`;
  }

  // ===== START GAME =====
  start() {
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('btn-home').classList.remove('hidden');
    document.getElementById('world-clears').classList.remove('hidden');
    if (this.isMobile) document.getElementById('mobile-controls').classList.remove('hidden');
    // モブ・昼夜リセット
    this.spawnMobs();
    this.dayTime = 0.30; // 朝からスタート
    this.dayCount = 1;
    this.mobSpawnTimer = 0;
    this.gameRunning = true;
    this.vx = 0; this.vz = 0;
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

  setTimeout(() => {
    bar.style.width = '50%';
    txt.textContent = 'ワールドを生成中...';

    game = new Game();
    game.state = game.loadState();
    game.init();

    setTimeout(() => {
      bar.style.width = '100%';
      txt.textContent = '準備完了！';

      setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('title-screen').classList.remove('hidden');

        document.getElementById('btn-start').addEventListener('click', () => {
          game.resetState();
          game.state = game.loadState();
          game.refreshBuildings();
          game.start();
        });
        document.getElementById('btn-continue').addEventListener('click', () => {
          game.start();
        });
      }, 500);
    }, 800);
  }, 400);
});
