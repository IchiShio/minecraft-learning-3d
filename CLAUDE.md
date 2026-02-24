# CLAUDE.md - minecraft-learning-3d

## プロジェクト概要
Three.js製の3Dマイクラ風学習ゲーム。小学生（主に2年生〜6年生）が3Dの村を歩きながら、さんすう・こくご・えいごのクイズに挑戦するPWA。

## 対象ユーザー
- メインターゲット: **小学校2年生**
- レベルアップで対応学年が上がる（Lv1-2=2年生, Lv3-5=3年生, ...）
- `GRADE_FOR_LEVEL` 関数で現在の学年を管理

## ファイル構成

| ファイル | 役割 |
|----------|------|
| `index.html` | HTML構造・UIパーツ |
| `style.css` | スタイル全般 |
| `app.js` | ゲームロジック全体（Three.jsシーン、移動、クイズ、BGM等） |
| `quiz-data.js` | クイズ問題データ（grade2〜grade6） |
| `manifest.json` | PWA設定 |
| `sw.js` | Service Worker |

## 技術スタック
- Three.js r0.158.0（CDN）
- Web Audio API（BGM・SE をプロシージャル生成）
- localStorage（セーブデータ）
- PWA（manifest + Service Worker）

## 重要な設計事項

### 昼夜サイクル
- `updateDayNight()` が毎フレーム呼ばれる
- **JST（日本時間）にリアルタイム同期** している
  - `const jstSec = ((now.getUTCHours() + 9) % 24) * 3600 + ...`
  - 実時間の昼→ゲームも昼、夜→夜
- `isNightTime()`: dayTime < 0.22 または dayTime > 0.78 で夜判定

### モバイル操作（Dパッド）
- スワイプ方式は廃止済み
- 画面左下に**Dパッド（▲▼◀▶ボタン）**、右下に「👆 はいる」ボタン
- `dpadState { up/down/left/right }` で押下状態管理
- `this.joystick { active, x, y }` に変換してPC操作と共通処理
- マルチタッチ（2方向同時押し）で斜め移動対応
- `this.isMobile = 'ontouchstart' in window || window.innerWidth < 900` でモバイル判定

### BGM・SE（Web Audio API）
- BGM: field / night / quiz の3曲（プロシージャル）
- `NOTE_FREQ()`: C4=261.63Hz を基準に音程計算（440Hzベースは間違い）
- `AudioContext` は suspended 状態になるため、`_scheduleBgm()` 内で `ac.resume().then(doSchedule)` でリカバリ
- 昼夜切り替えで自動的に field ↔ night BGMが切り替わる

### クイズ問題文の漢字方針
- **grade2** のデータは小学1〜2年生で習う漢字のみ使用する
- 3年生以上の漢字は**ひらがな**に直す
  - 例: 辺→へん, 針→はり, 周→いっしゅう, 頂点→かど, 反対→はんたい, 自然→しぜん, 動→うごき
- grade3以上は対応学年の漢字を使ってよい
- 問題文(q)・ヒント(hint)・解説(explain)すべてに適用

### XP・レベル設計
- `XP_PER_CORRECT = 12`（1問正解あたり）
- `XP_FOR_LEVEL(lv) = 50 + (lv-1) * 30`

### セーブデータ
- `STORAGE_KEY = 'mclearn3d_v1'`（ゲーム状態）
- `STATS_KEY = 'mclearn3d_stats_v1'`（統計）
- `SETTINGS_KEY = 'mclearn3d_settings_v1'`（設定: speed/bgmVol/seVol）

## 開発ルール
- 変更後は必ず `node --check app.js` で構文確認
- コミット＆プッシュまで自動で行う（確認不要）
- コードの変更は最小限にとどめ、過剰な抽象化・余分なコメント追加はしない
