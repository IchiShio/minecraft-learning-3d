'use strict';
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { execSync } = require('child_process');

// .env ロード（tools/.env）
try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch(e) {}

const PORT     = 3001;
const ROOT     = path.join(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'questions.csv');

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
  const rows = questions.filter(q => q.seen > 0);
  const summary = rows.map(q => {
    const acc = q.seen > 0 ? Math.round(q.correct / q.seen * 100) : 0;
    return `[${q.subject}/grade${q.grade}/${q.diff}] 正解率${acc}%(${q.correct}/${q.seen}) 問題:「${q.q}」`;
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
  const weakSubjects = {};
  questions.filter(q => q.seen > 0).forEach(q => {
    const acc = q.correct / q.seen;
    if (acc < 0.6) {
      const key = q.subject;
      if (!weakSubjects[key]) weakSubjects[key] = [];
      weakSubjects[key].push(`「${q.q}」(正解率${Math.round(acc*100)}%)`);
    }
  });

  const weakList = Object.entries(weakSubjects)
    .map(([subj, qs]) => `${subj}: ${qs.slice(0,3).join(', ')}`)
    .join('\n');

  return `以下の苦手な問題に対する新しい練習問題を8問生成してください。

苦手分野:
${weakList || '全体的に練習が必要'}

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
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('subject'));
  const rows = [];
  lines.forEach(line => {
    const parts = line.split(',');
    if (parts.length < 8) return;
    rows.push({
      subject: parts[0]?.trim(),
      grade:   parts[1]?.trim() || '2',
      question:parts[2]?.trim(),
      opt1:    parts[3]?.trim(),
      opt2:    parts[4]?.trim(),
      opt3:    parts[5]?.trim(),
      opt4:    parts[6]?.trim(),
      correct: parts[7]?.trim(),
      explain: parts[8]?.trim() || '',
      diff:    parts[9]?.trim() || 'normal',
    });
  });
  return rows;
}

// ===== HTTP Body Parser =====
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

// ===== Dashboard HTML =====
const HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>📊 マイクラ学習 ダッシュボード</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a2e;color:#ddd;font-family:monospace,sans-serif;min-height:100vh;padding:20px}
h1{color:#5dbb63;text-align:center;font-size:1.6rem;margin-bottom:24px;text-shadow:0 0 8px #3a7a3e}
h2{color:#88ccff;font-size:1.1rem;margin-bottom:12px;border-left:4px solid #4499dd;padding-left:10px}
section{background:#16213e;border:2px solid #2a2a4a;border-radius:8px;padding:20px;margin-bottom:24px}
.upload-area{border:2px dashed #4499dd;border-radius:6px;padding:20px;text-align:center;cursor:pointer}
.upload-area:hover{background:#1a2a4a}
input[type=file]{display:none}
.btn{background:#4a8a50;color:#fff;border:none;border-radius:4px;padding:10px 20px;font-size:1rem;cursor:pointer;font-family:inherit;margin:4px}
.btn:hover{background:#5dbb63}
.btn-blue{background:#2255aa}
.btn-blue:hover{background:#3377cc}
.btn-orange{background:#aa6611}
.btn-orange:hover{background:#cc8822}
.btn-red{background:#aa2222}
.btn-red:hover{background:#cc3333}
.btn:disabled{opacity:.5;cursor:not-allowed}
.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}
.summary-card{background:#0f3460;border-radius:6px;padding:12px;text-align:center}
.summary-card .num{font-size:2rem;font-weight:bold;color:#5dbb63}
.summary-card .label{font-size:.8rem;color:#aaa;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{background:#0f3460;color:#88ccff;padding:8px 6px;text-align:left}
td{padding:6px;border-bottom:1px solid #2a2a4a}
tr:hover td{background:#1a2a3a}
.bar-wrap{background:#2a2a4a;border-radius:3px;height:10px;width:100px;display:inline-block;vertical-align:middle}
.bar{height:100%;border-radius:3px;transition:width .4s}
.bar-green{background:#5dbb63}
.bar-orange{background:#cc8822}
.bar-red{background:#cc3333}
.tag-math{background:#3a6a20;color:#aaffaa;padding:2px 6px;border-radius:3px;font-size:.75rem}
.tag-jp{background:#6a3a20;color:#ffaaaa;padding:2px 6px;border-radius:3px;font-size:.75rem}
.tag-en{background:#1a4a7a;color:#aaccff;padding:2px 6px;border-radius:3px;font-size:.75rem}
.tag-easy{color:#88ff88;font-size:.75rem}
.tag-normal{color:#ffcc44;font-size:.75rem}
.tag-hard{color:#ff8888;font-size:.75rem}
.analysis-box{background:#0a1a2a;border:1px solid #2255aa;border-radius:6px;padding:16px;white-space:pre-wrap;line-height:1.6;margin-top:12px;font-size:.9rem}
.gen-table input{width:100%;background:#1a2a3a;border:1px solid #3a3a5a;color:#ddd;padding:3px 5px;font-family:inherit;font-size:.8rem;border-radius:3px}
.gen-table select{background:#1a2a3a;border:1px solid #3a3a5a;color:#ddd;padding:3px;font-family:inherit;font-size:.8rem;border-radius:3px}
.result-box{background:#0a1a2a;border:1px solid #3a5a2a;border-radius:6px;padding:12px;margin-top:12px;white-space:pre-wrap;font-size:.85rem}
.loading{color:#ffcc44;margin:8px 0}
.hidden{display:none!important}
.info{color:#aaa;font-size:.85rem;margin-bottom:12px}
</style>
</head>
<body>
<h1>📊 マイクラ学習 ダッシュボード</h1>

<!-- Step 1: ファイル読み込み -->
<section>
  <h2>① せいせきファイルを よみこむ</h2>
  <p class="info">ゲームの「⚙️ せってい」→「📊 エクスポート」でダウンロードした JSON ファイルを選択してください。</p>
  <div class="upload-area" onclick="document.getElementById('file-input').click()">
    <div style="font-size:3rem">📂</div>
    <div style="margin-top:8px">クリックして minecraft-stats.json を選択</div>
  </div>
  <input type="file" id="file-input" accept=".json">
  <div id="file-status" class="info" style="margin-top:8px"></div>
</section>

<!-- Step 2: 統計表示 -->
<section id="stats-section" class="hidden">
  <h2>② せいせき サマリー</h2>
  <div class="summary-grid" id="summary-grid"></div>
  <h2 style="margin-top:16px">問題ごとの せいせき</h2>
  <div style="overflow-x:auto">
  <table>
    <thead><tr><th>教科</th><th>学年</th><th>難</th><th>問題</th><th>正解</th><th>不正</th><th>正解率</th><th>バー</th></tr></thead>
    <tbody id="stats-tbody"></tbody>
  </table>
  </div>
</section>

<!-- Step 3: AI分析 -->
<section id="analyze-section" class="hidden">
  <h2>③ AI よわてん ぶんせき</h2>
  <button class="btn btn-blue" onclick="analyzeStats()">🔍 よわてんを ぶんせきする</button>
  <div id="analyze-loading" class="loading hidden">⏳ Claude が分析中...</div>
  <div id="analyze-result" class="analysis-box hidden"></div>
</section>

<!-- Step 4: 問題生成 -->
<section id="generate-section" class="hidden">
  <h2>④ もんだい せいせい</h2>
  <button class="btn btn-orange" onclick="generateQuestions()">✨ よわてんの もんだいを つくる</button>
  <div id="generate-loading" class="loading hidden">⏳ Claude が問題を作成中...</div>
  <div id="generate-result" class="hidden">
    <p class="info" style="margin-top:12px">生成された問題を確認・編集してから実装できます。</p>
    <div style="overflow-x:auto">
    <table class="gen-table">
      <thead><tr><th>✓</th><th>教科</th><th>問題</th><th>opt1</th><th>opt2</th><th>opt3</th><th>opt4</th><th>正解</th><th>解説</th><th>難</th></tr></thead>
      <tbody id="gen-tbody"></tbody>
    </table>
    </div>
  </div>
</section>

<!-- Step 5: 実装 -->
<section id="implement-section" class="hidden">
  <h2>⑤ questions.csv に じっそう</h2>
  <button class="btn btn-red" onclick="implementQuestions()">📝 CSV に ついか して git push</button>
  <div id="implement-result" class="result-box hidden"></div>
</section>

<script>
let statsData = null;
let analysisText = '';
let generatedRows = [];

// ファイル選択
document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      statsData = JSON.parse(ev.target.result);
      document.getElementById('file-status').textContent = '✅ ' + file.name + ' を読み込みました';
      renderStats();
    } catch(err) {
      document.getElementById('file-status').textContent = '❌ JSONの読み込みに失敗しました: ' + err.message;
    }
  };
  reader.readAsText(file);
});

function subjTag(s) {
  if (s === 'math') return '<span class="tag-math">さんすう</span>';
  if (s === 'japanese') return '<span class="tag-jp">こくご</span>';
  return '<span class="tag-en">えいご</span>';
}
function diffTag(d) {
  if (d === 'easy') return '<span class="tag-easy">かんたん</span>';
  if (d === 'hard') return '<span class="tag-hard">むずかしい</span>';
  return '<span class="tag-normal">ふつう</span>';
}

function renderStats() {
  const qs = statsData.questions || [];
  const played = qs.filter(q => q.seen > 0);

  // サマリーカード
  const totalSeen    = played.reduce((a,q) => a + q.seen, 0);
  const totalCorrect = played.reduce((a,q) => a + q.correct, 0);
  const acc = totalSeen > 0 ? Math.round(totalCorrect / totalSeen * 100) : 0;
  const subjectAcc = {};
  played.forEach(q => {
    if (!subjectAcc[q.subject]) subjectAcc[q.subject] = { c:0, s:0 };
    subjectAcc[q.subject].c += q.correct;
    subjectAcc[q.subject].s += q.seen;
  });

  const subLabels = { math:'さんすう', japanese:'こくご', english:'えいご' };
  let cards = \`
    <div class="summary-card"><div class="num">\${totalSeen}</div><div class="label">合計回答</div></div>
    <div class="summary-card"><div class="num">\${acc}%</div><div class="label">全体正解率</div></div>
    <div class="summary-card"><div class="num">\${played.length}</div><div class="label">解いた問題数</div></div>
  \`;
  Object.entries(subjectAcc).forEach(([subj, v]) => {
    const a = v.s > 0 ? Math.round(v.c / v.s * 100) : 0;
    cards += \`<div class="summary-card"><div class="num">\${a}%</div><div class="label">\${subLabels[subj]||subj} 正解率</div></div>\`;
  });
  document.getElementById('summary-grid').innerHTML = cards;

  // 問題テーブル（seen > 0 のもの、正解率昇順）
  const sorted = [...played].sort((a,b) => (a.correct/a.seen) - (b.correct/b.seen));
  const tbody = document.getElementById('stats-tbody');
  tbody.innerHTML = sorted.map(q => {
    const a = q.seen > 0 ? Math.round(q.correct / q.seen * 100) : 0;
    const barCol = a >= 70 ? 'bar-green' : a >= 40 ? 'bar-orange' : 'bar-red';
    return \`<tr>
      <td>\${subjTag(q.subject)}</td>
      <td>\${q.grade}年</td>
      <td>\${diffTag(q.diff)}</td>
      <td style="max-width:200px">\${q.q}</td>
      <td style="color:#88ff88">\${q.correct}</td>
      <td style="color:#ff8888">\${q.wrong}</td>
      <td>\${a}%</td>
      <td><div class="bar-wrap"><div class="bar \${barCol}" style="width:\${a}%"></div></div></td>
    </tr>\`;
  }).join('');

  show('stats-section');
  show('analyze-section');
}

async function analyzeStats() {
  if (!statsData) return;
  const loading = document.getElementById('analyze-loading');
  const result  = document.getElementById('analyze-result');
  loading.classList.remove('hidden');
  result.classList.add('hidden');

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: statsData.questions }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    analysisText = data.analysis;
    result.textContent = analysisText;
    result.classList.remove('hidden');
    show('generate-section');
  } catch(err) {
    result.textContent = '❌ エラー: ' + err.message;
    result.classList.remove('hidden');
  } finally {
    loading.classList.add('hidden');
  }
}

async function generateQuestions() {
  if (!statsData) return;
  const loading = document.getElementById('generate-loading');
  const result  = document.getElementById('generate-result');
  loading.classList.remove('hidden');
  result.classList.add('hidden');

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis: analysisText, questions: statsData.questions }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    generatedRows = data.rows;

    const subLabels = { math:'さんすう', japanese:'こくご', english:'えいご' };
    const tbody = document.getElementById('gen-tbody');
    tbody.innerHTML = generatedRows.map((r, i) => \`<tr data-i="\${i}">
      <td><input type="checkbox" checked class="gen-check" data-i="\${i}"></td>
      <td><select class="gen-subj" data-i="\${i}">
        <option value="math"\${r.subject==='math'?' selected':''}>さんすう</option>
        <option value="japanese"\${r.subject==='japanese'?' selected':''}>こくご</option>
        <option value="english"\${r.subject==='english'?' selected':''}>えいご</option>
      </select></td>
      <td><input value="\${esc(r.question)}" class="gen-q" data-i="\${i}"></td>
      <td><input value="\${esc(r.opt1)}" class="gen-o1" data-i="\${i}"></td>
      <td><input value="\${esc(r.opt2)}" class="gen-o2" data-i="\${i}"></td>
      <td><input value="\${esc(r.opt3)}" class="gen-o3" data-i="\${i}"></td>
      <td><input value="\${esc(r.opt4)}" class="gen-o4" data-i="\${i}"></td>
      <td><input value="\${esc(r.correct)}" class="gen-c" data-i="\${i}" style="width:40px"></td>
      <td><input value="\${esc(r.explain)}" class="gen-ex" data-i="\${i}"></td>
      <td><select class="gen-diff" data-i="\${i}">
        <option value="easy"\${r.diff==='easy'?' selected':''}>easy</option>
        <option value="normal"\${r.diff==='normal'?' selected':''}>normal</option>
        <option value="hard"\${r.diff==='hard'?' selected':''}>hard</option>
      </select></td>
    </tr>\`).join('');

    result.classList.remove('hidden');
    show('implement-section');
  } catch(err) {
    document.getElementById('generate-loading').textContent = '❌ エラー: ' + err.message;
  } finally {
    loading.classList.add('hidden');
  }
}

function esc(s) {
  return (s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function implementQuestions() {
  // テーブルから最新の編集内容を収集
  const rows = [];
  document.querySelectorAll('#gen-tbody tr').forEach((tr, i) => {
    const cb = tr.querySelector('.gen-check');
    if (!cb || !cb.checked) return;
    rows.push({
      subject:  tr.querySelector('.gen-subj').value,
      grade:    '2',
      question: tr.querySelector('.gen-q').value,
      opt1:     tr.querySelector('.gen-o1').value,
      opt2:     tr.querySelector('.gen-o2').value,
      opt3:     tr.querySelector('.gen-o3').value,
      opt4:     tr.querySelector('.gen-o4').value,
      correct:  tr.querySelector('.gen-c').value,
      explain:  tr.querySelector('.gen-ex').value,
      diff:     tr.querySelector('.gen-diff').value,
    });
  });

  if (rows.length === 0) {
    alert('チェックされた問題がありません');
    return;
  }
  if (!confirm(\`\${rows.length}問を questions.csv に追加して git push しますか？\`)) return;

  const result = document.getElementById('implement-result');
  result.textContent = '⏳ 実装中...';
  result.classList.remove('hidden');

  try {
    const res = await fetch('/api/implement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    result.textContent = \`✅ 完了！\n\${data.gitResult}\n\n追加した問題:\n\` + rows.map((r,i) => \`\${i+1}. [\${r.subject}] \${r.question}\`).join('\\n');
  } catch(err) {
    result.textContent = '❌ エラー: ' + err.message;
  }
}

function show(id) {
  document.getElementById(id).classList.remove('hidden');
}
</script>
</body>
</html>`;

// ===== HTTP Server =====
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/analyze') {
    try {
      const body = await parseBody(req);
      if (!anthropic) {
        jsonRes(res, { error: 'ANTHROPIC_API_KEY が設定されていません。tools/.env を確認してください。' }, 500);
        return;
      }
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: buildAnalyzePrompt(body.questions || []) }],
      });
      jsonRes(res, { analysis: msg.content[0].text });
    } catch(e) {
      jsonRes(res, { error: e.message }, 500);
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/generate') {
    try {
      const body = await parseBody(req);
      if (!anthropic) {
        jsonRes(res, { error: 'ANTHROPIC_API_KEY が設定されていません。tools/.env を確認してください。' }, 500);
        return;
      }
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: buildGeneratePrompt(body.analysis || '', body.questions || []) }],
      });
      const rows = parseGeneratedCSV(msg.content[0].text);
      jsonRes(res, { rows, raw: msg.content[0].text });
    } catch(e) {
      jsonRes(res, { error: e.message }, 500);
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/implement') {
    try {
      const body = await parseBody(req);
      const rows = body.rows || [];
      if (rows.length === 0) { jsonRes(res, { error: '問題がありません' }, 400); return; }

      const lines = rows.map(r =>
        [r.subject, r.grade, r.question, r.opt1, r.opt2, r.opt3, r.opt4, r.correct, r.explain, r.diff]
          .map(v => (v||'').replace(/,/g,'，'))  // CSVカンマエスケープ
          .join(',')
      );
      // ファイル末尾が改行で終わっているか確認して追記
      const current = fs.existsSync(CSV_PATH) ? fs.readFileSync(CSV_PATH, 'utf-8') : '';
      const separator = current.endsWith('\n') ? '' : '\n';
      fs.appendFileSync(CSV_PATH, separator + lines.join('\n') + '\n');

      let gitResult = '';
      try {
        const out = execSync(
          `cd "${ROOT}" && git add questions.csv && git commit -m "AI生成問題を追加 (${rows.length}問)" && git push`,
          { encoding: 'utf-8', timeout: 30000 }
        );
        gitResult = `git push 成功 (${rows.length}問追加)\n${out}`;
      } catch(e) {
        gitResult = `⚠ git エラー（CSV追記は完了）:\n${e.message}`;
      }
      jsonRes(res, { ok: true, gitResult, count: rows.length });
    } catch(e) {
      jsonRes(res, { error: e.message }, 500);
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');

}).listen(PORT, () => {
  console.log(`\n📊 マイクラ学習 ダッシュボード 起動中`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`\n   ※ ANTHROPIC_API_KEY が未設定の場合は tools/.env を作成してください`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn(`   ⚠ ANTHROPIC_API_KEY が設定されていません\n`);
});
