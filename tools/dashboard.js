'use strict';
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { execSync } = require('child_process');

try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch(e) {}

const PORT     = 3001;
const ROOT     = path.join(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'questions.csv');

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.csv':  'text/plain; charset=utf-8',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt':  'text/plain; charset=utf-8',
};

// ===== Claude API =====
let anthropic = null;
try {
  const Anthropic = require('@anthropic-ai/sdk');
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
} catch(e) {
  console.warn('⚠ @anthropic-ai/sdk が見つかりません。npm install を実行してください。');
}

// ===== Prompts =====
function buildAnalyzePrompt(questions) {
  const attempted = questions.filter(q => q.seen > 0);
  if (attempted.length === 0) return '統計データがありません。';

  const summary = attempted.map(q => {
    const acc = Math.round(q.correct / q.seen * 100);
    return `[${q.subject}/grade${q.grade}/${q.diff}] 正解率${acc}%(${q.correct}/${q.seen}) 「${q.q}」`;
  }).join('\n');

  return `あなたは小学生向け学習ゲームのAIアシスタントです。
以下は小学生の学習統計データです（seen=解いた回数、correct=正解数）。

${summary}

この統計から以下を日本語で分析してください：
1. 苦手な教科・分野（正解率が低いもの）
2. 特に間違えやすい問題TOP3（具体的な問題文を挙げる）
3. 保護者向けの具体的なアドバイス（やさしい言葉で2〜3行）

回答は見やすく整理し、絵文字を使って読みやすくしてください。`;
}

function buildGeneratePrompt(analysis, questions) {
  const weak = questions
    .filter(q => q.seen > 0 && q.correct / q.seen < 0.6)
    .sort((a, b) => (a.correct / a.seen) - (b.correct / b.seen))
    .slice(0, 6);

  const weakList = weak.length > 0
    ? weak.map(q => `[${q.subject}] 「${q.q}」(正解率${Math.round(q.correct/q.seen*100)}%)`).join('\n')
    : '全体的に練習が必要';

  return `以下の苦手な問題に対する新しい練習問題を8問生成してください。

苦手問題:
${weakList}

以下のCSV形式で出力してください（ヘッダーなし、1行1問）：
subject,grade,question,opt1,opt2,opt3,opt4,correct,explain,diff

ルール：
- subject: math / japanese / english のどれか
- grade: 2
- question: 問題文（数式は ２ ＋ ３ ＝ ？ のように全角文字）
- opt1〜opt4: 4つの選択肢
- correct: 正解の選択肢番号（0始まり。opt1=0, opt2=1, opt3=2, opt4=3）
- explain: 解説文（子供向けにやさしく）
- diff: easy / normal / hard

問題文・選択肢・解説は小学2年生向けにひらがな多めで書いてください。
CSVのみ出力してください（説明文は不要）。`;
}

function parseGeneratedCSV(raw) {
  const rows = [];
  raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('subject')).forEach(line => {
    const parts = line.split(',');
    if (parts.length < 8) return;
    const subject = parts[0]?.trim();
    if (!['math','japanese','english'].includes(subject)) return;
    rows.push({
      subject,
      grade:    parts[1]?.trim() || '2',
      question: parts[2]?.trim(),
      opt1:     parts[3]?.trim(),
      opt2:     parts[4]?.trim(),
      opt3:     parts[5]?.trim(),
      opt4:     parts[6]?.trim(),
      correct:  parts[7]?.trim(),
      explain:  parts[8]?.trim() || '',
      diff:     parts[9]?.trim() || 'normal',
    });
  });
  return rows;
}

// ===== HTTP helpers =====
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
    });
    req.on('error', reject);
  });
}
function jsonRes(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}
function serveFile(res, filePath) {
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403); res.end(); return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404); res.end('Not Found'); return;
  }
  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  res.end(fs.readFileSync(filePath));
}

// ===== Dashboard HTML =====
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>📊 マイクラ学習 ダッシュボード</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a2e;color:#ddd;font-family:monospace,sans-serif;min-height:100vh;padding:16px 20px}
a{color:#88ccff}
h1{color:#5dbb63;text-align:center;font-size:1.5rem;margin-bottom:16px;text-shadow:0 0 8px #3a7a3e}
h2{color:#88ccff;font-size:1rem;margin-bottom:10px;border-left:4px solid #4499dd;padding-left:8px}
section{background:#16213e;border:2px solid #2a2a4a;border-radius:8px;padding:16px;margin-bottom:18px}
.flow{display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:#0f1a2e;border:1px solid #2a3a5a;border-radius:6px;padding:12px;margin-bottom:16px;font-size:.82rem;color:#aabbcc}
.flow-step{background:#1a2a4a;border:1px solid #3a5a8a;border-radius:4px;padding:4px 10px;white-space:nowrap}
.flow-arr{color:#4488cc}
.btn{background:#3a7a40;color:#fff;border:none;border-radius:4px;padding:10px 22px;font-size:.95rem;cursor:pointer;font-family:inherit;margin:4px 4px 4px 0;transition:background .15s}
.btn:hover{background:#5dbb63}
.btn-blue{background:#2255aa}.btn-blue:hover{background:#3377cc}
.btn-orange{background:#995511}.btn-orange:hover{background:#bb7722}
.btn-red{background:#991111}.btn-red:hover{background:#cc2222}
.btn-sm{padding:6px 14px;font-size:.82rem}
.btn:disabled{opacity:.4;cursor:not-allowed}
.drop-zone{border:2px dashed #4488cc;border-radius:8px;padding:28px 16px;text-align:center;cursor:pointer;transition:all .2s;margin-bottom:12px}
.drop-zone:hover,.drop-zone.drag-over{border-color:#5dbb63;background:#0a1a2a}
.drop-zone .dz-icon{font-size:2.4rem;display:block;margin-bottom:6px}
.drop-zone .dz-text{color:#88aacc;font-size:.9rem}
.drop-zone .dz-sub{color:#556677;font-size:.78rem;margin-top:4px}
.dev-link{font-size:.78rem;color:#556677;margin-top:10px}
.dev-link a{color:#6688aa}
.summary-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:14px}
.card{background:#0f3460;border-radius:6px;padding:10px;text-align:center}
.card .num{font-size:1.8rem;font-weight:bold;color:#5dbb63}
.card .lbl{font-size:.75rem;color:#aaa;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:.82rem}
th{background:#0f3460;color:#88ccff;padding:7px 5px;text-align:left;position:sticky;top:0}
td{padding:5px;border-bottom:1px solid #252545}
tr:hover td{background:#1a2a3a}
.bar-wrap{background:#2a2a4a;border-radius:3px;height:8px;width:80px;display:inline-block;vertical-align:middle}
.bar{height:100%;border-radius:3px}.bg{background:#5dbb63}.bo{background:#cc8822}.br{background:#cc3333}
.sm{color:#88ff88;font-size:.75rem;padding:1px 5px;border-radius:3px;background:#1a4a1a}
.sj{color:#ffaaaa;font-size:.75rem;padding:1px 5px;border-radius:3px;background:#4a1a1a}
.se{color:#aaccff;font-size:.75rem;padding:1px 5px;border-radius:3px;background:#1a2a5a}
.de{color:#88ff88;font-size:.72rem}.dn{color:#ffcc44;font-size:.72rem}.dh{color:#ff8888;font-size:.72rem}
.ai-box{background:#0a1a2a;border:1px solid #2255aa;border-radius:6px;padding:14px;white-space:pre-wrap;line-height:1.65;margin-top:10px;font-size:.88rem}
.gen-table input,.gen-table select{width:100%;background:#1a2a3a;border:1px solid #3a3a5a;color:#ddd;padding:3px 4px;font-family:inherit;font-size:.78rem;border-radius:3px}
.gen-table select{width:auto}
.result{background:#0a1a0a;border:1px solid #2a5a2a;border-radius:6px;padding:12px;margin-top:10px;white-space:pre-wrap;font-size:.82rem}
.err{background:#1a0a0a;border-color:#5a2a2a}
.spin{color:#ffcc44;margin:8px 0;font-size:.9rem}
.hidden{display:none!important}
.tscroll{overflow-x:auto;max-height:340px;overflow-y:auto}
.load-status{margin-top:8px;font-size:.85rem;color:#aaa}
</style>
</head>
<body>
<h1>📊 マイクラ学習 ダッシュボード</h1>

<div class="flow">
  <span class="flow-step">📱 タブレットでゲーム（GitHub Pages）</span>
  <span class="flow-arr">→</span>
  <span class="flow-step">⚙️ せってい → 📥 エクスポート</span>
  <span class="flow-arr">→</span>
  <span class="flow-step">💻 AirDrop / メール / iCloud でPCへ</span>
  <span class="flow-arr">→</span>
  <span class="flow-step">📊 ここにドロップ</span>
  <span class="flow-arr">→</span>
  <span class="flow-step">🤖 AI分析 → 📝 git push</span>
  <span class="flow-arr">→</span>
  <span class="flow-step">📱 自動反映</span>
</div>

<!-- ① 統計読み込み -->
<section>
  <h2>① せいせきファイルを読み込む</h2>
  <div class="drop-zone" id="drop-zone" onclick="document.getElementById('file-input').click()">
    <span class="dz-icon">📂</span>
    <div class="dz-text">minecraft-stats.json をここにドロップ</div>
    <div class="dz-sub">またはクリックしてファイルを選択</div>
  </div>
  <input type="file" id="file-input" accept=".json" style="display:none" onchange="handleFileSelect(event)">
  <div id="load-status" class="load-status"></div>
  <div class="dev-link">開発用（localhost）: <a href="#" onclick="loadFromLocalStorage();return false">localStorageから読み込む</a></div>
</section>

<!-- ② 統計表示 -->
<section id="stats-section" class="hidden">
  <h2>② せいせき サマリー</h2>
  <div class="summary-grid" id="summary-grid"></div>
  <h2 style="margin-top:12px">問題ごとのせいせき（正解率の低い順）</h2>
  <div class="tscroll">
    <table>
      <thead><tr><th>教科</th><th>難</th><th>問題</th><th>正</th><th>誤</th><th>正解率</th><th></th></tr></thead>
      <tbody id="stats-tbody"></tbody>
    </table>
  </div>
</section>

<!-- ③ AI分析 + 問題生成 -->
<section id="analyze-section" class="hidden">
  <h2>③ AI よわてん分析 ＋ 問題生成</h2>
  <button class="btn btn-blue" id="btn-analyze" onclick="analyzeAndGenerate()">🔍✨ 分析して問題を生成する</button>
  <div id="ai-spin" class="spin hidden"></div>
  <div id="ai-result" class="ai-box hidden"></div>
</section>

<!-- ④ 生成問題の確認・編集 -->
<section id="review-section" class="hidden">
  <h2>④ 生成された問題を確認・編集</h2>
  <div class="tscroll">
    <table class="gen-table">
      <thead><tr><th>✓</th><th>教科</th><th>問題</th><th>opt1</th><th>opt2</th><th>opt3</th><th>opt4</th><th>正解</th><th>解説</th><th>難</th></tr></thead>
      <tbody id="gen-tbody"></tbody>
    </table>
  </div>
</section>

<!-- ⑤ 実装 -->
<section id="implement-section" class="hidden">
  <h2>⑤ questions.csv に実装</h2>
  <button class="btn btn-red" id="btn-impl" onclick="implementQuestions()">📝 CSV に追加して git push</button>
  <div id="impl-result" class="result hidden"></div>
</section>

<script>
let statsData   = null;
let analysisText = '';

// ===== CSV パーサー =====
function parseCSV(text) {
  const lines = text.split('\\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] !== undefined ? vals[i] : ''; });
    return obj;
  }).filter(r => r.subject && r.question && r.opt1 && r.opt2);
}

// ===== ドロップゾーン =====
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) readJsonFile(file);
});

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) readJsonFile(file);
}

function readJsonFile(file) {
  const statusEl = document.getElementById('load-status');
  statusEl.textContent = '読み込み中...';
  if (!file.name.endsWith('.json')) {
    statusEl.textContent = '⚠️ .json ファイルを選択してください（ゲームの「エクスポート」で作成できます）';
    return;
  }
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      await processStats(data);
    } catch(err) {
      statusEl.textContent = '❌ JSONの解析に失敗しました: ' + err.message;
    }
  };
  reader.readAsText(file);
}

// ===== localhost 開発用 =====
async function loadFromLocalStorage() {
  const statusEl = document.getElementById('load-status');
  statusEl.textContent = '読み込み中（localStorage）...';
  const raw = localStorage.getItem('mclearn3d_stats_v1');
  if (!raw) {
    statusEl.textContent = '⚠️ localStorageに統計データがありません。http://localhost:3001/game/ でゲームをプレイしてください。';
    return;
  }
  await processStats(JSON.parse(raw));
}

// ===== 統計処理（ファイル or localStorage 共通） =====
async function processStats(stats) {
  const statusEl = document.getElementById('load-status');
  if (!stats || Object.keys(stats).length === 0) {
    statusEl.textContent = '⚠️ 統計データがありません。ゲームで問題を解いてからエクスポートしてください。';
    return;
  }

  let questions = [];
  try {
    const csvRes = await fetch('/game/questions.csv');
    const csvText = await csvRes.text();
    const rows = parseCSV(csvText);
    rows.forEach((r, idx) => {
      const id = \`\${r.subject}_\${r.grade}_csv\${idx}\`;
      const stat = stats[id] || { seen:0, correct:0, wrong:0, streak:0 };
      questions.push({
        id, subject: r.subject, grade: parseInt(r.grade)||2,
        q: r.question, diff: r.diff||'normal',
        seen: stat.seen||0, correct: stat.correct||0, wrong: stat.wrong||0,
      });
    });
  } catch(e) {
    statusEl.textContent = '⚠️ questions.csv の読み込みに失敗しました: ' + e.message;
    return;
  }

  statsData = questions;
  const attempted = questions.filter(q => q.seen > 0);
  statusEl.textContent = \`✅ 読み込み完了（\${attempted.length} 問に回答済み / 全\${questions.length}問）\`;
  renderStats(attempted);
  document.getElementById('stats-section').classList.remove('hidden');
  document.getElementById('analyze-section').classList.remove('hidden');
}

// ===== 統計テーブル描画 =====
function renderStats(attempted) {
  const totalSeen    = attempted.reduce((a,q) => a+q.seen,    0);
  const totalCorrect = attempted.reduce((a,q) => a+q.correct, 0);
  const acc = totalSeen > 0 ? Math.round(totalCorrect/totalSeen*100) : 0;

  const bySub = {};
  attempted.forEach(q => {
    if (!bySub[q.subject]) bySub[q.subject] = {c:0,s:0};
    bySub[q.subject].c += q.correct;
    bySub[q.subject].s += q.seen;
  });
  const subLabel = {math:'さんすう', japanese:'こくご', english:'えいご'};

  let cards = \`
    <div class="card"><div class="num">\${totalSeen}</div><div class="lbl">合計回答</div></div>
    <div class="card"><div class="num">\${acc}%</div><div class="lbl">全体正解率</div></div>
    <div class="card"><div class="num">\${attempted.length}</div><div class="lbl">解いた問題数</div></div>
  \`;
  ['math','japanese','english'].forEach(s => {
    if (!bySub[s]) return;
    const a = bySub[s].s > 0 ? Math.round(bySub[s].c/bySub[s].s*100) : 0;
    cards += \`<div class="card"><div class="num">\${a}%</div><div class="lbl">\${subLabel[s]}</div></div>\`;
  });
  document.getElementById('summary-grid').innerHTML = cards;

  const sorted = [...attempted].sort((a,b) => (a.correct/a.seen)-(b.correct/b.seen));
  document.getElementById('stats-tbody').innerHTML = sorted.map(q => {
    const a = Math.round(q.correct/q.seen*100);
    const bc = a>=70?'bg':a>=40?'bo':'br';
    const stag = q.subject==='math'?'<span class="sm">さんすう</span>':q.subject==='japanese'?'<span class="sj">こくご</span>':'<span class="se">えいご</span>';
    const dtag = q.diff==='easy'?'<span class="de">かんたん</span>':q.diff==='hard'?'<span class="dh">むずかしい</span>':'<span class="dn">ふつう</span>';
    return \`<tr>
      <td>\${stag}</td><td>\${dtag}</td>
      <td style="max-width:220px">\${esc(q.q)}</td>
      <td style="color:#88ff88">\${q.correct}</td>
      <td style="color:#ff8888">\${q.wrong}</td>
      <td>\${a}%</td>
      <td><div class="bar-wrap"><div class="bar \${bc}" style="width:\${a}%"></div></div></td>
    </tr>\`;
  }).join('');
}

// ===== AI 分析 ＋ 問題生成（一括） =====
async function analyzeAndGenerate() {
  if (!statsData) return;
  const btn   = document.getElementById('btn-analyze');
  const spin  = document.getElementById('ai-spin');
  const result = document.getElementById('ai-result');
  btn.disabled = true;
  spin.textContent = '⏳ Claude が弱点を分析中...';
  spin.classList.remove('hidden');
  result.classList.add('hidden');

  try {
    // ① 分析
    const r1 = await fetch('/api/analyze', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ questions: statsData }),
    });
    const d1 = await r1.json();
    if (d1.error) throw new Error(d1.error);
    analysisText = d1.analysis;
    result.textContent = analysisText;
    result.classList.remove('hidden');

    // ② 問題生成
    spin.textContent = '⏳ Claude が問題を生成中...';
    const r2 = await fetch('/api/generate', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ analysis: analysisText, questions: statsData }),
    });
    const d2 = await r2.json();
    if (d2.error) throw new Error(d2.error);

    renderGenerated(d2.rows);
    document.getElementById('review-section').classList.remove('hidden');
    document.getElementById('implement-section').classList.remove('hidden');

  } catch(e) {
    result.textContent = '❌ エラー: ' + e.message;
    result.classList.remove('hidden');
  } finally {
    spin.classList.add('hidden');
    btn.disabled = false;
  }
}

// ===== 生成問題テーブル =====
function renderGenerated(rows) {
  document.getElementById('gen-tbody').innerHTML = rows.map((r, i) => {
    const subOpts = ['math','japanese','english'].map(s =>
      \`<option value="\${s}"\${r.subject===s?' selected':''}>\${s==='math'?'math':s==='japanese'?'jp':'en'}</option>\`
    ).join('');
    const diffOpts = ['easy','normal','hard'].map(d =>
      \`<option value="\${d}"\${r.diff===d?' selected':''}>\${d}</option>\`
    ).join('');
    return \`<tr data-i="\${i}">
      <td><input type="checkbox" class="gchk" checked></td>
      <td><select class="gsubj">\${subOpts}</select></td>
      <td><input value="\${esc(r.question)}" class="gq"></td>
      <td><input value="\${esc(r.opt1)}" class="go1"></td>
      <td><input value="\${esc(r.opt2)}" class="go2"></td>
      <td><input value="\${esc(r.opt3)}" class="go3"></td>
      <td><input value="\${esc(r.opt4)}" class="go4"></td>
      <td><input value="\${esc(r.correct)}" class="gc" style="width:36px"></td>
      <td><input value="\${esc(r.explain)}" class="gex"></td>
      <td><select class="gdiff">\${diffOpts}</select></td>
    </tr>\`;
  }).join('');
}

// ===== 実装 =====
async function implementQuestions() {
  const rows = [];
  document.querySelectorAll('#gen-tbody tr').forEach(tr => {
    if (!tr.querySelector('.gchk').checked) return;
    rows.push({
      subject:  tr.querySelector('.gsubj').value,
      grade:    '2',
      question: tr.querySelector('.gq').value,
      opt1:     tr.querySelector('.go1').value,
      opt2:     tr.querySelector('.go2').value,
      opt3:     tr.querySelector('.go3').value,
      opt4:     tr.querySelector('.go4').value,
      correct:  tr.querySelector('.gc').value,
      explain:  tr.querySelector('.gex').value,
      diff:     tr.querySelector('.gdiff').value,
    });
  });
  if (rows.length === 0) { alert('チェックされた問題がありません'); return; }
  if (!confirm(\`\${rows.length}問を questions.csv に追加して git push しますか？\`)) return;

  const btn  = document.getElementById('btn-impl');
  const res2 = document.getElementById('impl-result');
  btn.disabled = true;
  res2.textContent = '⏳ 実装中...';
  res2.className = 'result';
  res2.classList.remove('hidden');

  try {
    const res = await fetch('/api/implement', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ rows }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    res2.textContent = \`✅ 完了！\n\${data.gitResult}\n\n追加した問題:\n\` +
      rows.map((r,i) => \`\${i+1}. [\${r.subject}] \${r.question}\`).join('\\n');
  } catch(e) {
    res2.className = 'result err';
    res2.textContent = '❌ エラー: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
</script>
</body>
</html>`;

// ===== HTTP Server =====
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = req.url.split('?')[0];

  // ダッシュボードUI
  if (url === '/' || url === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(DASHBOARD_HTML);
    return;
  }

  // ゲームファイルを配信（/game/ or /game）
  if (url.startsWith('/game')) {
    const rel  = url.replace(/^\/game\/?/, '') || 'index.html';
    const full = path.resolve(ROOT, rel);
    serveFile(res, full);
    return;
  }

  // API: 弱点分析
  if (req.method === 'POST' && url === '/api/analyze') {
    try {
      const body = await parseBody(req);
      if (!anthropic) { jsonRes(res, { error: 'ANTHROPIC_API_KEY が未設定です。tools/.env を確認してください。' }, 500); return; }
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role:'user', content: buildAnalyzePrompt(body.questions||[]) }],
      });
      jsonRes(res, { analysis: msg.content[0].text });
    } catch(e) { jsonRes(res, { error: e.message }, 500); }
    return;
  }

  // API: 問題生成
  if (req.method === 'POST' && url === '/api/generate') {
    try {
      const body = await parseBody(req);
      if (!anthropic) { jsonRes(res, { error: 'ANTHROPIC_API_KEY が未設定です。tools/.env を確認してください。' }, 500); return; }
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role:'user', content: buildGeneratePrompt(body.analysis||'', body.questions||[]) }],
      });
      const rows = parseGeneratedCSV(msg.content[0].text);
      jsonRes(res, { rows, raw: msg.content[0].text });
    } catch(e) { jsonRes(res, { error: e.message }, 500); }
    return;
  }

  // API: CSV追記 + git push
  if (req.method === 'POST' && url === '/api/implement') {
    try {
      const body = await parseBody(req);
      const rows = body.rows || [];
      if (rows.length === 0) { jsonRes(res, { error: '問題がありません' }, 400); return; }

      const lines = rows.map(r =>
        [r.subject, r.grade, r.question, r.opt1, r.opt2, r.opt3, r.opt4, r.correct, r.explain, r.diff]
          .map(v => (v||'').replace(/,/g, '，'))
          .join(',')
      );
      const current = fs.existsSync(CSV_PATH) ? fs.readFileSync(CSV_PATH, 'utf-8') : '';
      const sep = current.endsWith('\n') ? '' : '\n';
      fs.appendFileSync(CSV_PATH, sep + lines.join('\n') + '\n');

      let gitResult = '';
      try {
        const out = execSync(
          `cd "${ROOT}" && git add questions.csv && git commit -m "AI生成問題を追加 (${rows.length}問)" && git push`,
          { encoding:'utf-8', timeout:30000 }
        );
        gitResult = `git push 成功 (${rows.length}問追加)\n` + out;
      } catch(e) {
        gitResult = `⚠ git エラー（CSV追記は完了）:\n${e.message}`;
      }
      jsonRes(res, { ok:true, gitResult, count:rows.length });
    } catch(e) { jsonRes(res, { error: e.message }, 500); }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');

}).listen(PORT, () => {
  console.log('\n📊 マイクラ学習 ダッシュボード（管理者用）');
  console.log(`   http://localhost:${PORT}/  ← ブラウザで開く`);
  console.log('\n   使い方:');
  console.log('   ① タブレットのゲーム「せってい → エクスポート」で minecraft-stats.json を取得');
  console.log('   ② AirDrop / メール / iCloud Drive でこのPCに転送');
  console.log('   ③ ダッシュボードにファイルをドロップ → AI分析 → git push');
  console.log('   ④ タブレットのゲームに自動反映（GitHub Pages 更新）');
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('\n   ⚠ ANTHROPIC_API_KEY が未設定です。tools/.env を作成してください。\n');
  } else {
    console.log('\n   ✅ ANTHROPIC_API_KEY 設定済み');
  }
});
