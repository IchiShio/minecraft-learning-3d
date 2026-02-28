# CLAUDE.md - minecraft-learning-3d

## プロジェクト概要
Three.js製の3Dマイクラ風学習ゲーム。小学生（主に2年生〜6年生）が3Dの村を歩きながら、リソースブロック（木材・石・鉄・金・ダイヤ）を採掘してアイテムを収集するPWA。
問題を解くと1アイテムGET → アイテム数で建物が解放される仕組み。

## 対象ユーザー
- メインターゲット: **小学校2年生**
- レベルアップで対応学年が上がる（Lv1-2=2年生, Lv3-5=3年生, ...）
- `GRADE_FOR_LEVEL` 関数で現在の学年を管理

## 実装済み機能一覧（2026-02-28時点）

| カテゴリ | 機能 | 詳細 |
|----------|------|------|
| コア | リソース採掘 | 33ブロック（木/石/鉄/金/ダイヤ）、正解でアイテムGET |
| コア | 宝箱クイズ | 6箇所、正解でランダムアイテム、180秒リスポーン |
| コア | 建物17棟 | 解放条件付き、専用インテリア付き |
| コア | ワールド拡張 | 5ゾーン（bounds 28→70）、アイテム/Lvで順次解放 |
| 学習 | CSV問題読み込み | questions.csv を自動反映（79問: math/japanese/english） |
| 学習 | 書き取り問題 | type:'write' でテキスト入力式問題（漢字15問追加済み） |
| 学習 | 適応難易度 | 正解率で adaptiveBias (-2〜+2) が自動調整 |
| 学習 | リテンション出題 | 解済み問題をシャッフル/バリアントで再出題 |
| RPG | HP/ダメージ | ハート6個、赤フラッシュ、無敵時間、温泉で全回復 |
| RPG | XP/レベル | 正解12XP、コンボボーナス、レベルアップで学年UP |
| RPG | 実績バッジ | 25種（`ACHIEVEMENTS` 配列）、解放時トースト通知 |
| RPG | クラフト | 6レシピ（⚒️ボタン）、アイテム消費→報酬 |
| RPG | デイリークエスト | 毎日3クエスト（プール10種）、リセット条件あり |
| RPG | ログインボーナス | 毎日初起動時にアイテム＋ストリーク表示 |
| モブ | 敵AI | zombie/skeleton/creeper/ghast（夜スポーン） |
| モブ | 受動モブ | pig/sheep/chicken（昼スポーン、接近で逃走） |
| モブ | プレイヤー攻撃 | Spaceキー/⚔️ボタン、近距離の敵を倒してXP/アイテム |
| NPC | 村人交易 | 3NPC（アイテム屋/ぼうぐ屋/まほう使い）、アイテム交換 |
| 操作 | Dパッド+タップ移動 | モバイル対応、タップ自動移動 |
| 操作 | カーソルフォロー | PCでマウス方向を向く |
| その他 | 昼夜サイクル | 7200フレーム/日、BGM自動切替 |
| その他 | BGM/SE | Web Audio API プロシージャル生成 |
| その他 | キャラクター選択 | タイトル画面から選択可能 |
| その他 | PWA | Service Worker、オフライン対応 |
| その他 | GitHub同期 | questions.csv push → iPad に自動反映 |
| ツール | stats-viewer.html | 学習統計ビューア（フィルタ/ソート/CSVエクスポート） |
| ツール | dashboard.js | Claude AI で弱点分析→問題自動生成（ローカルNode.js） |

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
| `tools/dashboard.js` | ローカル学習統計ダッシュボード（Node.js） |
| `tools/package.json` | ダッシュボード用 npm 設定 |
| `tools/.env.example` | API キーテンプレート |
| `.gitignore` | `.env` / `tools/node_modules/` を除外 |

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

### 宝箱（Treasure Chests）
- `TREASURE_SPAWNS`: 6箇所に宝箱を配置（math×2・japanese×2・english×2）
- 宝箱に近づいて interact → 1問出題 → 正解でランダムアイテム（wood/stone/iron/gold）GET
- 180秒後にリスポーン（枯渇中は非表示）
- `📦` フローティングインジケーターが上下にアニメーション
- `startTreasureQuiz(chest)` → `answerMining()` の isTreasure フラグで分岐

### コンボストリークボーナス
- `COMBO_MILESTONES = [3, 5, 7, 10]`、`COMBO_BONUS_XP = 8`
- 連続正解数がマイルストーンに達すると `COMBO_BONUS_XP × streak` の追加XPを付与
- 採掘（answerMining）・建物アクション（answerBuildingAction）両方で発動

### 解済み問題のスキップとリテンション出題
- **一度正解した問題は通常プールから除外**（`stat.correct > 0` の問題は `solvedPool` へ）
- 通常プールが空になった場合のみ `generateRetentionVariant(q)` でバリアントを生成
  - `truefalse` 型: 数値を微妙にずらして「かくにん」問題として出題
  - 選択肢型: 正解を保持したまま選択肢順をシャッフルして出題
  - バリアントIDは `ret_{元ID}` 形式で、`updateQuestionStat()` を呼ばない
- `STATS_KEY`（`mclearn3d_stats_v1`）が判定の根拠。ニューゲーム後も引き継がれる
  - 全問リセットしたい場合は `localStorage.removeItem('mclearn3d_stats_v1')`

### HP・ダメージシステム
- `this.playerHp = 6 / this.playerMaxHp = 6`（ハート6個）
- HUD 左上にハートアイコン（❤️/🖤）を常時表示（`_updateHpHud()`）
- `hurtPlayer(dmg)`:
  - `invincibleTimer > 0` の間は無敵（ダメージ無効）
  - ダメージ時: 赤フラッシュ・プレイヤー点滅・`playSe('hurt')`
  - `invincibleTimer = 80`（約1.3秒）
- HP0 → `_playerDeath()`: ゲームオーバー画面表示・BGM停止
- `_respawn()`: HP全回復・中心(0,0)にテレポート・`invincibleTimer=180`
- 自然回復: 600フレーム（10秒）ごとに1HP回復
- **建物内は全攻撃無効**（`!this.insideBuilding` チェック）
- **温泉（onsen）で問題正解 → HP全回復**

### モブ（敵・動物）システム

#### モブ種別（MOB_TYPES）
| ID | 特性 | 攻撃方法 | 昼間 |
|----|------|---------|------|
| zombie | 敵対・追跡 | 接近メレー（-1HP、60f CD） | 燃焼→消滅 |
| skeleton | 敵対・後退型 | 矢を発射（-1HP、90f CD） | 燃焼→消滅 |
| creeper | 敵対・チャージ | 爆発（-3HP＋ノックバック） | 消えない |
| ghast | 敵対・浮遊 | 火の玉（-2HP） | 消えない |
| pig / sheep / chicken | 受動 | なし（プレイヤー接近で逃走） | 昼のみスポーン |

#### モブAIの流れ
- 夜: zombie(40%) / skeleton(30%) / creeper(30%) をスポーン、Lv3以上でghast出現
- 昼: pig / sheep / chicken をスポーン
- `MOB_CAP_HOSTILE = 12`、`MOB_CAP_PASSIVE = 10`
- ゾンビ/スケルトンは昼間`burnDay=true`→180フレーム後に地中へ沈んで消滅
- スケルトン: `rangedAttack:true`、距離3〜14uで矢を発射（`spawnArrow(mob)`）
  - 矢は `fireballs[]` 配列を再利用、`isArrow:true` フラグで区別
- ガスト: 高度9±1.8で浮遊、距離20以内で火の玉（`spawnFireball(mob)`、160fCD）
- クリーパー: 距離3.2以内で90fチャージ→`triggerExplosion()`

### 衝突判定
- **ワールド境界**: `Math.max/Math.min` でプレイヤー座標をクランプ（初期±28）
- **建物AABB衝突**: `movePlayer()` 内で `BUILDING_DEFS` 全17棟をAABBチェック
  - 建物内に入ると外側に押し出し（margin 0.25u）
  - 衝突しても建物への入場は妨げない（`tryInteract()` で入場判定は別途）
- **建物内**: 195〜205 の矩形範囲にクランプ

### ワールド自動拡張（World Expansion）
- `WORLD_ZONES`: 4ゾーン定義（zone2〜zone5）
- 初期状態: bounds=28、fog=0.016
- ゾーン解放条件:
  - zone2（むらのはずれ）: totalItems≥5, **bounds=33**（フェンス位置と一致）, fog=0.012
  - zone3（もりのおく）: totalItems≥20, bounds=46, fog=0.009
  - zone4（さいはての ち）: totalItems≥45 or Lv≥10, bounds=58, fog=0.005
  - zone5（でんせつのせかい）: totalItems≥80 or Lv≥15, bounds=70, fog=0.003
- zone2のフェンスポストはz=±33, x=±33に配置 → bounds=33と一致させることで柵が実際の壁になる
- `applyWorldZones()`: ゲーム起動時に保存済みゾーンを復元（トーストなし）
- `checkWorldExpansion()`: `collectItem()` と `addXP()` のレベルアップ時に呼ばれ、新ゾーンをチェック
- `expandWorld(zone)`: bounds/fog更新・デコレーション追加・トースト表示・saveState
- `_buildZoneDecorations(zoneId)`: ゾーンごとのThree.jsオブジェクト生成（花畑・フェンス/キノコ・岩/遺跡・モノリス/クリスタル・浮遊岩）
- `_clearZoneDecorations()`: リセット時にシーンからデコレーション削除

### 建物インテリア（_buildInterior）
- `enterBuilding` が共通の床/壁/天井/壁たいまつを生成後、`_buildInterior(def, g)` を呼ぶ
- 建物IDごとに完全に異なる内装を持つ（17棟すべて専用）
  - cabin: ベッド・クラフト台・かまど・チェスト・窓
  - tanbo: 干し草・水桶・農具・麦袋・水槽
  - mine: 鉱石展示ブロック・ツルハシ・トロッコ・レール・チェスト
  - market: カウンター・棚・樽・商品・看板
  - well: 石の囲い・水面・縄・バケツ
  - onsen: 湯船・湯気・岩の椅子・竹・タオル・ランタン（正解でHP全回復）
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

### 建物内アクションボタン（btn-building-action）
- `#btn-building-action`: `#mobile-controls` の外に常時 DOM 存在（PC・モバイル共通）
- `checkNearbyInterior()`: アクションスポット（距離<2.5）に近づくとボタンテキストを「🛌 ねる」等に設定して表示
- クールダウン中はヒントテキストのみ（残り秒数表示）、ボタン非表示
- キャンバスタップ（`_handleTap()`）も建物内では `nearBuildingAction` があれば `tryInteract()` を呼ぶ
- `exitBuilding()` / `enterBuilding()` でボタンを hidden にリセット

### CSV 問題読み込み
- 起動時に `fetch('./questions.csv', { cache: 'no-cache' })` でロード
- 成功したら `localStorage(CUSTOM_Q_KEY)` にキャッシュ → オフライン時のフォールバック
- CSVがなければ `quiz-data.js` の `QUIZ_DATA` を使用
- `buildQuizData(rows)` で quiz-data.js と同じ構造に変換
- **問題タイプ**: `type:'choice'`（デフォルト）/ `type:'write'`（テキスト入力式）
  - write型: opt1=正解漢字、opt2〜4=空、correct=0。`_renderMiningOptions()` でテキスト入力欄表示
  - `submitWriteAnswer()`: 入力値と opt1 を比較 → `answerMining(0 or -1)` を呼ぶ
  - write型はリテンション出題の対象外（opts.length < 3 のため自動スキップ）
- **現在の questions.csv 内容**（grade2、計79問）:
  - math: たし算・ひき算・かけ算（easy 9問 / normal 14問 / hard 9問）計32問
  - japanese: 読みかた・はんたいことば・漢字読み（計24問）＋書き取り（15問 j025-j039）計39問
  - english: 色・動物・曜日・数字・あいさつ（easy 4問 / normal 4問 / hard 4問）計12問

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
- 画面左下に**Dパッド（▲▼◀▶ボタン）**、右下に「👆 はいる」ボタン（モバイルのみ表示）
- `dpadState { up/down/left/right }` で押下状態管理
- `this.joystick { active, x, y }` に変換してPC操作と共通処理
- マルチタッチ（2方向同時押し）で斜め移動対応
- `this.isMobile = navigator.maxTouchPoints > 0` でタッチデバイス判定
  - **注意**: `(hover: hover) and (pointer: fine)` のCSS media queryはiPadでも一致する場合があるので使わない
  - **注意**: `ontouchstart` や `window.innerWidth < 900` は信頼性が低い

### カーソルフォロー（cursor follow）
- マウスをホバーするだけで**カメラと体がカーソル方向を向く**（PCデフォルト動作）
- `this.cursorAngle`: 地面上のカーソル位置から算出したワールド角度（null=無効）
- `_updateCursorFollow(clientX, clientY)`: mousemove 時に Raycaster → 地面平面ヒット → `atan2(dx, dz)` で角度計算
  - プレイヤーとの距離 < 1.5 は無視（真下付近の不安定動作を防止）
- `followCamera()` 内で `cameraAngle += diff * 0.08` で lerp（カメラを滑らかに追従）
- `movePlayer()` 内で `player.rotation.y = cursorAngle`（移動中・停止中両方）
- **ドラッグ中**は mousedown 時に `cursorAngle = null` にして従来の手動ドラッグを優先
- **建物に入る**と `cursorAngle = null` にしてリセット

### タップ移動（tap-to-move）
- キャンバスをタップ（またはマウスクリック）するとキャラクターが自動移動
- `this.moveTarget = { x, z, interact }` でターゲット座標を管理
- `_handleTap(clientX, clientY)` でRaycast処理:
  1. Three.js Raycasterで地面平面（y=0）に光線を当てて世界座標を取得
  2. **リソースブロック**が6ユニット以内 → そこへ移動して自動インタラクト
  3. **宝箱**が6ユニット以内 → そこへスナップ移動
  4. **建物**が10ユニット以内 → そこへ移動（解放済みなら自動でインタラクト）
  5. それ以外 → タップした地面座標へ移動
  6. **建物内タップ**: `nearBuildingAction` があれば即 `tryInteract()`
- `movePlayer()` でmoveTargetがあればDパッド/キーボードと共通の加速系で移動
  - 1.8ユニット以内に到達 → moveTargetクリア＆インタラクト実行
  - Dパッド/キーボード入力があれば即キャンセル（手動操作優先）
- タッチの判定: touchstart〜touchendの移動量 < 12px をタップとみなす（カメラドラッグと区別）
- マウスの判定: `click` イベントを使用（ドラッグ時はブラウザが発火しない）

### BGM・SE（Web Audio API）
- BGM: field / night / quiz の3曲（プロシージャル）
- SE: correct / wrong / levelup / unlock / portal / start / **hurt / death**
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

### 実績バッジ（ACHIEVEMENTS）
- `ACHIEVEMENTS` 配列に25種を定義: `{ id, icon, label, cond:(state,gameState)=>boolean }`
- `checkAchievements()`: 未解放バッジを全走査 → 条件合致で `state.achievements` に追加 → トースト
- 解放済み判定: `state.achievements.includes(id)`
- HUDに「🏅 N / 25」で進捗表示
- 主なカテゴリ: 採掘系 / 建物系 / 戦闘系 (mob_1/mob_10) / 交易系 (trade_1) / レベル系

### クラフトシステム（CRAFT_RECIPES）
- `CRAFT_RECIPES`: 6レシピを定義 `{ icon, label, needs:{item:n,...}, reward:{item:n,...} or {xp:n} }`
- `⚒️ クラフト` ボタン → `#craft-menu` パネルを開く
- `doCraft(recipe)`: needs を在庫から差し引き、reward をインベントリに加算 → `checkAchievements()`

### デイリーログインボーナス
- ゲーム起動時に前回ログイン日付と比較 → 別の日なら `showDailyBonus()` を呼ぶ
- ストリーク日数に応じてボーナスアイテムが増加
- `#daily-bonus` パネルで表示、「✨ うけとる！」ボタンで受取

### デイリークエスト（DAILY_QUESTS）
- `DAILY_QUESTS`: 10種のクエストを定義（採掘N個・正解N問・モブ討伐等）
- 毎日3クエストをランダム選択、`state.dailyQuests` に保存
- `📋 クエスト` ボタン → `#quest-panel` で進捗確認
- クエスト完了でXP/アイテム報酬 + `checkAchievements()`

### モブ討伐（MOB_COMBAT）
- `MOB_COMBAT`: 敵モブの戦闘パラメータ `{ hp, xp, name, drop:()=>item }`
  - zombie: hp3/xp8、skeleton: hp3/xp8、creeper: hp4/xp10、ghast: hp5/xp15
- `tryAttack()`: Spaceキー/⚔️ボタン押下 → 3.5u以内の敵に攻撃、20fクールダウン
- `hitMob(mob)`: hp-- → 赤フラッシュ → hp≤0で `killMob()`
- `killMob(mob)`: アイテムドロップ・XP付与・`totalMobKills`加算・実績チェック
- `_updateAttackBtn()`: モバイルで近くに敵がいるときのみ⚔️ボタン表示

### 村人交易（VILLAGER_DEFS）
- `VILLAGER_DEFS`: 3NPC定義 `{ id, name, icon, x, z, skin/shirt/pants/hatCol, trades:[] }`
  - アイテム屋さん (x:4, z:-16) / ぼうぐ屋さん (x:-13, z:-7) / まほう使い (x:17, z:12)
- `buildVillagers()`: 起動時にバイペッドメッシュ生成・シーン配置
- 検出距離 2.8u → ヒント表示 → インタラクトで `openTradeMenu(def)` を呼ぶ
- `doTrade(def, trade)`: needs を在庫チェック → reward 付与 → `totalTrades` 加算 → 実績チェック
- ループ内でゆらぎアニメ・プレイヤーに自動で向く

### 学習統計ダッシュボード（tools/dashboard.js）
- **目的**: ゲームの正誤統計を可視化 → Claude AIが弱点分析 → 克服問題を自動生成 → questions.csv に追記してgit push
- **起動手順**:
  1. `tools/.env` を作成して `ANTHROPIC_API_KEY=sk-...` を記載
  2. `cd tools && npm install && node dashboard.js`
  3. ブラウザで `http://localhost:3001` を開く
- **エクスポート方法**: ゲームの「⚙️ せってい」→「📥 エクスポート」→ `minecraft-stats.json` がダウンロードされる
- **ダッシュボードの流れ**:
  1. JSONファイルをアップロード → 問題ごとの正解率テーブルを表示
  2. 「🔍 よわてんを ぶんせきする」→ Claude が苦手分野を分析
  3. 「✨ もんだいを つくる」→ Claude が8問生成（編集可能）
  4. 「📝 CSV に ついか して git push」→ questions.csv 追記 + 自動push
- **APIエンドポイント**:
  - `POST /api/analyze` → 弱点分析（claude-haiku-4-5-20251001使用）
  - `POST /api/generate` → 問題生成（claude-haiku-4-5-20251001使用）
  - `POST /api/implement` → CSV追記 + git push
- **注意**: `.env` は gitignore済み。APIキーをコードに直接書かないこと

## 開発ルール
- 変更後は必ず `node --check app.js` で構文確認
- コミット＆プッシュまで自動で行う（確認不要）
- コードの変更は最小限にとどめ、過剰な抽象化・余分なコメント追加はしない
