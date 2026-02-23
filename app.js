'use strict';

// ===== CONSTANTS =====
const STORAGE_KEY = 'mclearn3d_v1';
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
    this.isMobile = 'ontouchstart' in window || window.innerWidth < 900;
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
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xfff8e0, 0.9);
    sun.position.set(40, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left:-70, right:70, top:70, bottom:-70, far:200 });
    this.scene.add(sun);

    this.buildWorld();
    this.buildPlayer();
    this.buildBuildings();
    this.buildPortals();
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
  buildPlayer() {
    const g = new THREE.Group();
    const skin = 0xFFC894, shirt = 0x3355BB, pant = 0x222288;

    const head = this.box(0.5,0.5,0.5, skin); head.position.y = 1.55; head.castShadow = true; g.add(head);
    const body = this.box(0.6,0.7,0.3, shirt); body.position.y = 1.0; body.castShadow = true; g.add(body);
    const lA = this.box(0.25,0.65,0.25, shirt); lA.position.set(-0.43,1.0,0); g.add(lA);
    const rA = this.box(0.25,0.65,0.25, shirt); rA.position.set( 0.43,1.0,0); g.add(rA);
    const lL = this.box(0.27,0.65,0.27, pant); lL.position.set(-0.165,0.325,0); g.add(lL);
    const rL = this.box(0.27,0.65,0.27, pant); rL.position.set( 0.165,0.325,0); g.add(rL);

    this.scene.add(g);
    this.player = g;
    this._lA = lA; this._rA = rA;
    this._lL = lL; this._rL = rL;
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
  }

  // ===== GAME LOOP =====
  loop() {
    requestAnimationFrame(() => this.loop());
    if (!this.gameRunning) return;
    this.frame++;
    this.movePlayer();
    this.followCamera();
    this.glowPortals();
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
    const ACCEL = 0.026;
    const FRICTION = 0.76;
    const MAX_SPD = 0.19;

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
    const sd = QUIZ_DATA[portal.subject];
    const allQ = Object.values(sd.grades).flat();
    const qs = [...allQ].sort(() => Math.random()-0.5).slice(0, QUIZ_PER_SESSION);

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
  }

  // ===== START GAME =====
  start() {
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('world-clears').classList.remove('hidden');
    if (this.isMobile) document.getElementById('mobile-controls').classList.remove('hidden');
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
