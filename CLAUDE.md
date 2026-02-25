# CLAUDE.md - minecraft-learning-3d

## プロジェクト概要
Three.js製の3Dマイクラ風学習ゲーム。小学生（主に2年生〜6年生）が3Dの村を歩きながら、リソースブロック（木材・石・鉄・金・ダイヤ）を採掘してアイテムを収集するPWA。
問題を解くと1アイテムGET → アイテム数で建物が解放される仕組み。

## 対象ユーザー
- メインターゲット: **小学校2年生**
- レベルアップで対応学年が上がる（Lv1-2=2年生, Lv3-5=3年生, ...）
- `GRADE_FOR_LEVEL` 関数で現在の学年を管理

## ファイル構成

| ファイル | 役割 |
|----------|------|
| `index.html` | HTML構造・UIパーツ |
| `style.css` | スタイル全般 |
| `app.js` | ゲームロジック全体（Three.jsシーン、移動、採掘、BGM等） |
| `quiz-data.js` | クイズ問題データ（grade2〜grade6、フォールバック用） |
| `questions.csv` | カスタム問題ファイル（親が編集→GitHubにpush→自動反映） |
| `questions_template.csv` | questions.csv の編集用テンプレート（コメント付き） |
| `manifest.json` | PWA設定 |
| `sw.js` | Service Worker（questions.csv はnetwork-first） |
| `archive/portal-quiz-v1/` | 旧ポータル＆クイズ方式のアーカイブ |

## 技術スタック
- Three.js r0.158.0（CDN）
- Web Audio API（BGM・SE をプロシージャル生成）
- localStorage（セーブデータ）
- PWA（manifest + Service Worker）

## 重要な設計事項

### ゲームの仕組み（リソース採掘方式）
- ワールドに33個のリソースブロックが配置: 木材×8・石×8・鉄×6・金×5・ダイヤ×5
- ブロックに近づいて interact → 1問出題（教科はリソース種別に対応）
  - 木材・金 → math、石 → japanese、鉄・ダイヤ → english
- 正解 → アイテム+1・ブロック枯渇（60秒後リスポーン）
- インベントリのアイテム数で `BUILDING_DEFS` の建物が順次解放される
- `RESOURCE_DEFS`: リソース種別の定義（id/名前/アイコン/色/教科/難易度）
- `RESOURCE_SPAWN`: 33箇所のスポーン位置
- `buildResourceNodes()` → `startMining()` → `answerMining()` → `collectItem()` の流れ

### CSV 問題読み込み
- 起動時に `fetch('./questions.csv', { cache: 'no-cache' })` でロード
- 成功したら `localStorage(CUSTOM_Q_KEY)` にキャッシュ → オフライン時のフォールバック
- CSVがなければ `quiz-data.js` の `QUIZ_DATA` を使用
- `buildQuizData(rows)` で quiz-data.js と同じ構造に変換

### 学習履歴・適応難易度
- **日次ログ（DAILY_LOG_KEY）**: 毎回答後 `_saveTodayLog()` で保存、起動時 `_restoreTodayLog()` で復元
  - `{ "YYYY-MM-DD": { correct: N, wrong: N, subjects: { math:{c,w}, ... } } }` 形式
  - 30日分保持、古いエントリは自動削除
- **適応難易度（adaptiveBias）**: 当日の正解率が80%↑でバイアス+1、50%↓でバイアス-1
  - `onNewDay()` が1ゲーム日の終わりに呼ばれ評価
  - バイアスは `-2〜+2`、`selectAdaptiveQuestions()` のプール比率を調整

### 昼夜サイクル
- `updateDayNight()` が毎フレーム呼ばれる
- **フレームベース**でゲーム内時間を進める（JST同期は廃止）
  - `this.dayFrame++` → `this.dayTime = (this.dayFrame % DAY_LENGTH) / DAY_LENGTH`
  - `DAY_LENGTH = 7200`（60fps想定で約2分/日）
- ゲーム開始時は `dayTime = 0.3`（朝）からスタート
- `isNightTime()`: dayTime < 0.22 または dayTime > 0.78 で夜判定

### モバイル操作（Dパッド＋タップ移動）
- スワイプ方式は廃止済み
- 画面左下に**Dパッド（▲▼◀▶ボタン）**、右下に「👆 はいる」ボタン
- `dpadState { up/down/left/right }` で押下状態管理
- `this.joystick { active, x, y }` に変換してPC操作と共通処理
- マルチタッチ（2方向同時押し）で斜め移動対応
- `this.isMobile = navigator.maxTouchPoints > 0` でタッチデバイス判定
  - **注意**: `(hover: hover) and (pointer: fine)` のCSS media queryはiPadでも一致する場合があるので使わない
  - **注意**: `ontouchstart` や `window.innerWidth < 900` は信頼性が低い

### 建物インテリア（_buildInterior）
- `enterBuilding` が共通の床/壁/天井/壁たいまつを生成後、`_buildInterior(def, g)` を呼ぶ
- 建物IDごとに完全に異なる内装を持つ（17棟すべて専用）
  - cabin: ベッド・クラフト台・かまど・チェスト・窓
  - tanbo: 干し草・水桶・農具・麦袋・水槽
  - mine: 鉱石展示ブロック・ツルハシ・トロッコ・レール・チェスト
  - market: カウンター・棚・樽・商品・看板
  - well: 石の囲い・水面・縄・バケツ
  - onsen: 湯船・湯気・岩の椅子・竹・タオル・ランタン
  - forge: かまど×2・アンビル・剣・盾・石炭
  - shrine: 鳥居・賽銭箱・お祈りマット・注連縄・ランタン
  - guild: 掲示板・武器掛け・テーブル・トロフィー・バナー
  - garden: 植木鉢×多数・棚・ベンチ・じょうろ・土
  - tower: ハシゴ・窓・望遠鏡・地図テーブル・チェスト
  - library: 本棚×多段×多列・書見台・読書テーブル・ろうそく
  - port: 樽×多数・錨・魚・漁網・縄コイル
  - castle: 玉座・柱×4・バナー×4・チェスト×3・金装飾
  - dragon: 宝の山・溶岩池・ドラゴンの頭蓋骨・骨
  - sky: 雲ブロック・クリスタルの柱・祭壇・浮かぶ宝石
  - rainbow: 虹色の柱・虹アーチ・エンドポータル・星
- `bm(w,h,d,col,x,y,z)` ショートハンドで全家具を `this.box()` + `g.add()` で配置
- `pl(col,intensity,dist,x,y,z)` ショートハンドでPointLightを追加
- 床色・天井色も建物ごとに変更（floorCols / ceilCols マップ）
- 壁たいまつは4本（前後壁×各2）、torch用PointLight付き

### ワールド自動拡張（World Expansion）
- `WORLD_ZONES`: 4ゾーン定義（zone2〜zone5）、各ゾーンに解放条件・境界・霧密度・トーストメッセージ
- 初期状態: bounds=28（全リソース・レインボー以外の建物を網羅）、fog=0.016
- ゾーン解放条件:
  - zone2（むらのはずれ）: totalItems≥5, bounds=36, fog=0.012
  - zone3（もりのおく）: totalItems≥20, bounds=46, fog=0.009
  - zone4（さいはての ち）: totalItems≥45 or Lv≥10, bounds=58, fog=0.005
  - zone5（でんせつのせかい）: totalItems≥80 or Lv≥15, bounds=70, fog=0.003
- `applyWorldZones()`: ゲーム起動時に保存済みゾーンを復元（トーストなし）
- `checkWorldExpansion()`: `collectItem()` と `addXP()` のレベルアップ時に呼ばれ、新ゾーンをチェック
- `expandWorld(zone)`: bounds/fog更新・デコレーション追加・トースト表示・saveState
- `_buildZoneDecorations(zoneId)`: ゾーンごとのThree.jsオブジェクト生成（花畑・フェンス/キノコ・岩/遺跡・モノリス/クリスタル・浮遊岩）
- `_clearZoneDecorations()`: リセット時にシーンからデコレーション削除
- `this.zoneDecorMeshes`: ゾーンIDキーのMeshリスト（PointLightも含む）
- レインボーゲート（z=30）はzone2解放まで境界外になる（Lv15必要なので問題なし）

### タップ移動（tap-to-move）
- キャンバスをタップ（またはマウスクリック）するとキャラクターが自動移動
- `this.moveTarget = { x, z, interact }` でターゲット座標を管理
- `_handleTap(clientX, clientY)` でRaycast処理:
  1. Three.js Raycasterで地面平面（y=0）に光線を当てて世界座標を取得
  2. **リソースブロック**が6ユニット以内 → そこへ移動して自動インタラクト
  3. **建物**が10ユニット以内 → そこへ移動（解放済みなら自動でインタラクト）
  4. それ以外 → タップした地面座標へ移動
- `movePlayer()` でmoveTargetがあればDパッド/キーボードと共通の加速系で移動
  - 1.8ユニット以内に到達 → moveTargetクリア＆インタラクト実行
  - Dパッド/キーボード入力があれば即キャンセル（手動操作優先）
- タッチの判定: touchstart〜touchendの移動量 < 12px をタップとみなす（カメラドラッグと区別）
- マウスの判定: `click` イベントを使用（ドラッグ時はブラウザが発火しない）

### BGM・SE（Web Audio API）
- BGM: field / night / quiz の3曲（プロシージャル）
- `NOTE_FREQ()`: C4=261.63Hz を基準に音程計算（440Hzベースは間違い）
- `AudioContext` は suspended 状態になるため、`_scheduleBgm()` 内で `ac.resume().then(doSchedule)` でリカバリ
- 昼夜切り替えで自動的に field ↔ night BGMが切り替わる
- BGMの重複再生防止: `_activeOscNodes[]` で全オシレータを追跡し、`stopBgm()` でフェードアウト後に `osc.stop()` する
  - `stopBgm()` はタイムアウトクリアだけでなく実行中のオシレータも停止すること

### Service Worker（PWA キャッシュ）
- `sw.js` の `CACHE_NAME` を変更するとiPad等のキャッシュが強制更新される
- ローカルファイルはcache-firstのため、コードを変えても古いキャッシュが配信され続けることがある
- デバイスでUIが更新されない場合は `CACHE_NAME` をインクリメントして対処（v1→v2→v3...）

### クイズ問題文の漢字方針
- **grade2** のデータは小学1〜2年生で習う漢字のみ使用する
- 3年生以上の漢字は**ひらがな**に直す
  - 例: 辺→へん, 針→はり, 周→いっしゅう, 頂点→かど, 反対→はんたい, 自然→しぜん, 動→うごき
- grade3以上は対応学年の漢字を使ってよい
- 問題文(q)・ヒント(hint)・解説(explain)すべてに適用

### XP・レベル設計
- `XP_PER_CORRECT = 12`（1問正解あたり）
- `XP_FOR_LEVEL(lv) = 50 + (lv-1) * 30`

### セーブデータ（localStorage キー一覧）
| キー定数 | 値 | 内容 |
|---------|-----|------|
| `STORAGE_KEY` | `mclearn3d_v1` | ゲーム状態（level/xp/inventory/adaptiveBias等） |
| `STATS_KEY` | `mclearn3d_stats_v1` | 問題ごとの正誤統計（seen/correct/wrong/streak） |
| `SETTINGS_KEY` | `mclearn3d_settings_v1` | 設定（speed/bgmVol/seVol/difficulty） |
| `CUSTOM_Q_KEY` | `mclearn3d_custom_q_v1` | questions.csv のパース済みキャッシュ |
| `DAILY_LOG_KEY` | `mclearn3d_daily_v1` | 日次学習ログ（30日分、YYYY-MM-DD形式） |

## 開発ルール
- 変更後は必ず `node --check app.js` で構文確認
- コミット＆プッシュまで自動で行う（確認不要）
- コードの変更は最小限にとどめ、過剰な抽象化・余分なコメント追加はしない
