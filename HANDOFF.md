# 《決戰》交接文件

更新：2026-10-21・對象：接手開發的人或新的 Claude 對話

《決戰》是 Shogun 風格的網頁即時戰略（川中島：武田信玄 vs 上杉謙信），手機橫向可玩，以士氣為核心。MVP 已完成 M1～M6、觀戰模式、節奏調整；下一步是 M7（手機效能、平衡、跨瀏覽器）。

## 1. 連結與檔案

| 項目 | 位置 |
| --- | --- |
| 遊戲（可直接玩） | https://claude.ai/artifact/UjqYxfDUxLHEW3CA6xsy7R （第 22 版：地形高低與溪流、情報 v2、鐵砲／大筒不對稱編制）。更新時發布 `dist/kessen-m1.html` 到同一個 URL |
| 設計文件（線上，含圖表） | https://claude.ai/artifact/JAXq85B8a3UheAm2xAcFwL |
| 進度與待辦 | `BACKLOG.md` |
| 原始碼 | GitHub `kuanhuasu-source/lvv-studio` 的 `kessen/` 子資料夾（與 LVV Studio 配音工具同一個 repo，互不相關） |
| 美術原圖 | `art/out/`（不進版控；59 張原圖另以 zip 交給使用者）。遊戲用縮圖在 `art/web/`（進版控） |
| 士氣模擬器 | 遊戲內 `src/sim/` 即同一份模擬核心 |

## 2. 與使用者合作的方式

- 一律使用繁體中文（台灣用語）。
- 每完成一個里程碑就發布並停下來讓使用者檢視；使用者回「next」／「go next」才進下一步。
- 有設計上的取捨要先問，用選項並附上量測數據與建議。
- 平衡或規則調整一律先用模擬量測（`tools/pace.ts`，AI 對 AI 各 60 場）再提案。
- 使用者主要在手機上看，畫面以戰場為主，介面要精簡；手機版截圖檢查不可省（`tools/shot.mjs`）。

## 3. 進度

| 里程碑 | 狀態 | 內容 |
| --- | --- | --- |
| M1～M5 | 完成 | 戰場、鏡頭、雙方 16 隊 624 人、攻擊與射擊、士氣與連鎖潰逃可視化、上杉 AI、戰場迷霧、忍者與忍術、武將技 |
| 觀戰模式 | 完成 | AI 對 AI、導播鏡頭、視野切換、戰報、結算、速度 5× |
| 節奏調整 | 完成 | 重整後士氣上限 50、取消 AI 有序撤退、主將前移並親征、弓兵 200 m、騎兵奔馳 |
| M6 | 完成 | 勝負與結算、據點呈現、撤退指令、Gemini 2D 美術 |
| AI 動作優化 | 完成 | 止抖（aiSteady）＋戰線式指揮（aiLine） |
| 大名模式 | 完成 | 第一階段：軍議方針、AI 帶兵、軍師建議卡、大名令、接管單隊。第二階段：配置（戰線順序、預備隊、騎兵翼、各翼方針）與將領互換。傳令延遲未做（使用者決定） |
| 軍師與情報回路 | 完成 | 建議規則進模擬層（`advisor.ts`）、半渡而擊與大筒現身建議、`tools/daimyo.ts` 量玩家採納建議的勝率（240 局）：不介入 43%、全採納 53%；繞後與集火最有價值，親征／突擊／整頓量不出效果 |
| M7 | 進行中 | 效能：士兵矩陣更新優化、每幀分段計時（`__kessen.prof`）、模擬每步 0.205→0.066 ms（探索格改外框掃描、擁擠數每步算一次）；跨瀏覽器：es2020／Safari 14 目標、roundRect polyfill；平衡：矩陣與消融量測完成，調整待提案。真機 fps 仍待回報 |

## 4. 架構與檔案地圖

TypeScript + Vite + Three.js，單一 HTML 輸出（約 1.66 MB，其中美術約 1.3 MB）。模擬固定步長 0.1 秒、確定性（同 seed 同結果），畫面插值。

| 檔案 | 內容 |
| --- | --- |
| `src/sim/sim.ts` | 戰鬥與士氣模擬核心；`S.fx` 畫面事件 |
| `src/sim/ai.ts` | AI（戰略／戰術／武將技／忍者）；`S.meta.aiSides` 指定 AI 指揮哪一方。`lineAI`／`lineInfantry` 是戰線式指揮（錨點、槽位、階段），`aiSteady` 是各處的決策鎖。大名模式介面：`S.meta.doctrine[side]`（方針）、`S.meta.manual`（接管的部隊 id）、`issueCommand(S, side, kind, target)`（大名令）、`S.meta.playerSide`（忍術由玩家施放）、`S.meta.deployment[side]` ＋ `applyDeploy`（配置：戰線順序、預備隊 `role: 'reserve'`、騎兵翼、各翼方針），`reserveAI` 是預備隊行為 |
| `src/sim/rules.ts`、`configs.ts`、`game-rules.ts` | 規則參數；遊戲採用 `GAME_RULES` |
| `src/sim/data.ts` | 兵種數值、武將名單、忍者眾、地圖 |
| `src/game/main.ts` | 主迴圈、輸入、指令、資訊面板、事件處理、觀戰導播、結算；大名模式的軍議（`DOCTRINE_ROWS`）、大名令（`doCmd`／`cmdHtml`）、軍師建議卡（`evalAdvice`，規則在 `src/sim/advisor.ts`）、接管（`takeOver`／`handBack`） |
| `src/sim/advisor.ts` | 軍師建議規則（`adviseSide`，含不帶令的「派忍者偵察」提示 `act: 'scout'` 與 `dispatchScouts`）、大名令冷卻與可否下達（`CMD_CD`／`cmdBlocked`）、情報等級（`intelLvl`）。放模擬層是為了 `tools/daimyo.ts` 能量玩家採納建議的勝率 |
| `src/game/orders.ts` | 玩家指令層（攻擊追擊、弓兵自由射擊、撤退令） |
| `src/game/units.ts` | 士兵 InstancedMesh、陣型槽位、接戰動作、陣亡、旗號（含家紋淡印） |
| `src/game/effects.ts`、`ninja.ts`、`terrain.ts` | 特效、忍者顯示、地形與據點（延伸原野、河、遠山、灌木石頭） |
| `src/game/ground.ts` | 地表合成貼圖（草地／林地／稻田／土路紋理、山丘、道路、河、溪流與渡口）；`GROUND` 是延伸範圍，`groundH` 是河床下陷（只影響畫面） |
| `src/game/hud.ts` | 全部介面 |
| `src/game/art.ts` | 2D 美術查表：`portraitOf(武將名)`、`ninjaPortrait(忍者眾)`、`skillIcon`、`jutsuIcon`、`kamon(side)`、`illus('title'|'loading')`；沒有圖檔時回傳 undefined，介面退回漢字與色塊 |
| `src/game/skills.ts` | 武將技／被動／軍略／忍術／忍者眾的名稱與說明 |
| `art/manifest.json` | 59 張提示詞（風格、尺寸、檔名） |
| `tools/gen-art.mjs` | Gemini 生成（預設模型 gemini-3-pro-image-preview） |
| `tools/pack-art.mjs` | 原圖 → WebP（肖像 256、插畫 1280、圖示 96、家紋 128 去背、紋理 512）；會自動裁掉生成圖的紙邊 |
| `tools/pace.ts` | AI 對 AI 批次量測節奏（設定 base／steady／line／crane／craneT） |
| `tools/ai-diag.ts` | AI 行為診斷：目標切換、回頭、落單、戰線散開 |
| `tools/matrix.ts`、`tools/ablate.ts` | 忍者眾對戰矩陣與逆轉率；單一組合的機制消融 |
| `tools/strategy.ts`、`tools/daimyo.ts` | 玩家方針（含一團）對預設 AI 的勝率；大名模式玩家依機率採納軍師建議的勝率與各類建議的消融 |
| `tools/shot.mjs` | 無頭瀏覽器截圖（playwright-core ＋ 工作區預裝的 Chromium） |

## 5. 建置、測試、發布

```bash
cd kessen && npm install
npm run typecheck
npm run build:single          # → dist/kessen-m1.html
node tools/pace.ts 60 base    # 節奏量測（每組 60 場約 4 分鐘）
```

截圖測試（手機尺寸要補 viewport meta，因為 build 會拿掉 head，發布時外殼才補上）：

```bash
(echo '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'; cat dist/kessen-m1.html) > /tmp/phone.html
node tools/shot.mjs "/tmp/phone.html#mode=watch&seed=42" out.png 844 390 2 ./script.mjs
```

腳本（`script.mjs`）匯出 `async (page) => {}`；可用 `window.__kessen`：`advance(秒)` 快轉、`setSel`、`orderAttack`、`orderMove`、`selectNinja`、`startJutsu`、`trySkill`、`screenOf`、`intelOf`、`setSpeed`、`rig`（鏡頭：`rig.tx`、`rig.ty`）。開戰前要先 `page.click('.setup .go')`。網址參數：`#seed=42`、`clan=iga`、`foe=koga`、`mode=watch`、`go=1`。無頭瀏覽器 fps 不代表真機；Google Fonts 在工作區被擋，截圖是後備字型。

發布：Artifact 工具發布 `dist/kessen-m1.html` 到同一個 URL（先 read 再 publish）。`build.mjs` 的 `<title>` 維持「決戰 M1」。

## 6. 美術流程（M6 完成）

- 生成：雲端環境的網路存取允許 `generativelanguage.googleapis.com`，金鑰由代理注入，所以在工作區執行 `NODE_USE_ENV_PROXY=1 GEMINI_API_KEY=proxy node tools/gen-art.mjs`（Node 原生 fetch 不讀 HTTPS_PROXY，所以要 `NODE_USE_ENV_PROXY=1`；`GEMINI_API_KEY` 只是讓腳本不擋，任何值都行）。自己電腦則在 `.env` 寫真實金鑰。檢查金鑰時只確認是否存在，不可印出內容。
- 模型比較：gemini-2.5-flash-image 會在畫面上加假落款與印章；gemini-3-pro-image-preview 乾淨得多，59 張都用它。提示詞已加「no border, no paper margin, fills the entire image edge to edge」，仍偶爾有紙邊，`pack-art.mjs` 會沿四邊各自裁掉。
- 已整合：肖像（旗牌、資訊面板、出陣忍者眾卡、結算勝方主將）、技能／軍略／鬨聲／忍術圖示（面板按鈕）、家紋（軍勢列、結算表頭、旗號淡印 26%）、標題插畫（出陣背景）、一騎討插畫（結算背景）。
- 已生成未用：地形紋理 4 張、旗指物 2 張、介面框。紋理要上 3D 地形，先看手機效能。
- 換圖：`node tools/gen-art.mjs --force --only <id>` → `node tools/pack-art.mjs` → `npm run build:single`。

## 7. 規則現況（遊戲採用）

- 兵種：長槍 60、弓 40、武士 40、騎兵 20、旗本 12、鐵砲 30（120 m、60 m 內 40%、射程邊緣 20%、每發 4 點、裝填 15 秒、士氣 −3；`gunHit`／`gunDmg`）、大筒 8（260 m、150 m 內期望 2.6 彈、遠處 ×0.72，各 12 點、士氣 −8／30 m 內 −3、20 m 內鄰隊吃 0.6 彈跳彈、裝填 25 秒、60 m 內打不到；`cannonLam`／`cannonSplash`）。預設值（命中 50%／5 點、1.8 彈／10 點／40 秒）武田 83%，調後 52%。武田 2 槍 1 侍 2 騎 1 弓 1 銃；上杉 2 槍 2 侍 1 騎 1 弓 1 砲。遠程一律用 `isRanged`／`archerRange`。
- 近戰每 4 秒判定、命中 4 點；箭矢 2 點，射程 200 m（50 m 內 35%，到射程邊緣 15%）。箭雨濺射 50%（15 m 內）、擁擠減速 25%（20 m 內 ≥2 友軍）。
- 忍者眾（`clanPassive`）：每家只有一種主動忍術（`CLANS[*].jutsu[0]`），第二種改為自動特性，實作在 sim.ts `updateVision`（情報網、疑兵）與 `step`（破壞、防諜，參數 `passiveSakutekiR`／`passiveSakutekiImmune`／`passiveGiheiMul`）；介面文字在 skills.ts `CLAN_PASSIVE`。量測用 `tools/matrix.ts`；單一家對軒猿的診斷腳本寫在 scratchpad，之後可併入 tools。
- 情報 v2（`fogV2`）：部隊察覺 130／識別 80 m、忍者 190／110 m（甲賀 ×1.3、小丘 ×1.5、森林 ×0.5）、識別累積 8 秒、洞悉累積 12 秒、識別 40 秒退化、察覺 120 秒遺忘；`S.obs`／`S.mem`／`S.explored` 在 sim.ts `updateVision`；`tools/intel.ts` 量情報曲線。
- 地形：森林（受箭減半、騎兵 −40%、視野減半、察覺距離 60 m）、稻田（移動 −30%、衝鋒減半）、沼澤秘密（移動 −60%、無法衝鋒）、小丘（視野 +50%、居高 +15%）、水域（規則 `streams`，預設關：涉水 −50%、無法衝鋒、受箭 +30%、半渡而擊 −10；渡口 −20%）。
- 士氣：高昂 ≥ 80、動搖 < 50、潰逃 < 25；潰逃後 15 秒未受攻擊且士氣 ≥ 35 重整（主將 60 m 內減半），重整後士氣上限 50，第 2 次潰逃即潰滅。
- 軍勢：低於 25 總崩潰；高於 80 全軍緩升。
- 勝利：總崩潰、全滅、退卻（`withdrawEnd` 90：開戰 300 秒後 90 秒無接戰且軍勢差 ≥15，落後方退卻）、10 分鐘到時軍勢高者勝。據點勝利（控制三據點 60 秒，規則 `pointWin`）在 2026-10-22 回顧後關閉：只佔 5%，據點只給增益。
- AI：不做有序撤退；主將站戰線後 40 m 並追擊附近動搖或潰走敵軍。戰線式指揮（aiLine）：佈陣整體前移 50 m（`deployFwd`，戰線起點 160）、成線階段急行軍（`aiFormRun`）、對峙線在己方 280 m（溪前）、攻勢發起時間 10～40 秒÷侵略性（`aiAttackT0`／`aiAttackTR`）、錨點 3.8 m/s 推進（`aiAnchorSpd`）、對射 12 秒（`aiVolleyDur`）、攻勢錨點以看得到的敵軍為目標（`aiHunt`，否則兩軍會互相穿過各站對方本陣，時間到 25%）；回顧前是 110／走路／250／30～110 秒／3.3／20 秒，首戰 88 秒；回顧後 150 局：首戰 56 秒、時長 292 秒、崩潰 84%、時間到 16%、武田 45%；加 aiHunt 與退卻後 150 局：時長 280 秒、崩潰 87%、時間到 3%、退卻 10%、武田 45%；接戰後空手部隊在 120 m（240 秒後 180 m）內側擊鄰隊對手。AI 對 AI 150 場（2026-10-22，含溪流、起伏、鐵砲／大筒）：時長 335 秒、首戰 84 秒、交戰期 251 秒、總崩潰結束 79%、時間到 16%、據點 5%、武田勝 51%。策略模擬（`tools/strategy.ts`，武田對預設 AI 80 局）：auto 43%、橫陣＋射完箭再攻 29%、橫陣＋開戰即攻 48%、一團 53%、魚鱗 50%
- 測試：網址 `#ai=legacy|steady|line|crane` 切換 AI 變體；`node tools/ai-diag.ts 20 line` 看抖動指標。`#cmd=manual` 全手動模式。`window.__kessen.doCmd('charge')`、`evalAdvice()`、`manualSet` 給腳本用。
- 軍議配置：預設只顯示戰線順序／預備隊／騎兵翼；各翼方針與將領互換在「進階 ▸」（`advOpen`，depHtml）。
- 大名令只留四道：馳援（兩隊，`cmdRelieveN`）、集中弓火（命中 ×1.3、每輪 −4，`cmdFocusHit`／`cmdFocusMorale`）、騎兵繞後（衝鋒 +12、接觸 −10，`cmdRaidCharge`／`cmdRaidShock`）、全軍整頓（接戰中與動搖者 +8，`cmdRegroupMorale`）。全軍突擊與主將親征 240 局量不出效果，2026-10-22 回顧砍掉（`issueCommand` 仍支援給工具用）。軍師建議也只剩對應的四類。大名模式 240 局：不介入 43%、全採納建議 52%。
- 大名模式的預設方針：射完箭再攻（240 局：不介入 43%／全採納建議 48%；軍師裁量 40／39%、開戰即攻 30／40%，開戰即攻在新節奏下會先渡溪挨半渡而擊）、騎兵接戰後繞後、撤退線 35、橫陣。`daimyoPassive`／`daimyoPassiveCav`（玩家方 AI 等令才側擊／繞後）量測結果 18／27%，保留為關閉；`playerOrders`（orders.ts）只處理接管的部隊。將領互換在 `applyWarCouncil`（main.ts）於出陣時套用：改 `cmd/skill/passive`、箭矢 ±5、`S.meta.tenkyu` 跟著典廄走、`hud.refreshCard`。localStorage 鍵：`kessen.doctrine`、`kessen.deploy`、`kessen.roster`。

## 8. 待辦與已知問題

- 真機效能：624 人維持 30 fps 尚未在手機上確認（需使用者回報 fps 與機型）。
- 設計待決：逆轉率偏低（11%）；武田選甲賀只有 35%（標為「較難」），診斷顯示不是情報面的問題（識別覆蓋率反而最高），情報類參數補不回來；時間到比例 23% 偏高，可考慮改 8 分鐘。
- 介面：設計文件的按鍵配置（R 撤退、Z/X 技能）與遊戲實作不同（遊戲：R 武將技、T 撤退、C 鬨聲、V 軍略），之後統一。
- 兵種圖示（設計文件列 10 張）未列入美術清單，目前以漢字角標代替。
- 少數肖像構圖偏小（nin_koga 是遠景群像），可視需要重生成。
- 戰線式 AI 首戰約 100 秒（舊 AI 65 秒）；若試玩覺得開場慢，調 `attackT`（ai.ts setup）或對峙線 295。守勢的錨點目標要用 `Math.max(ayl, 295)`，寫成 min 會卡在半路（已修）。
- 鶴翼、魚鱗、一團、疊放、斜線陣形都可在 `aiFormation`／軍議選；一團與疊放是量測用。
- 溪流 `two` 已啟用，AI 會對準最近渡口並收攏隊形過溪；`east` 保留可選。地形起伏 `reliefNoise` 0.4、`reliefHills`。
- 模擬效能：`updateVision` 每 0.5 秒跑一次，探索格只掃每個觀察者外框內的格子；`crowdN` 在 `moveUnits` 開頭算一次。再慢的話先用 `node --cpu-prof` 看（之前 updateVision 佔 45%）。

## 9. 踩過的坑

- `.info .k` 是面板標頭漢字方塊的 class，新增 class 別用 `k`（本次新增的是 `kj`、`pic`、`pp`、`ic`、`km`）。
- `.box` 是框選矩形的 class（`display: none`），別拿來當別的元件用（配置格子改叫 `.dbox`）。
- `#hud button` 的顏色規則會蓋過 `.rail button[aria-pressed]`，要寫 `#hud .rail …`。
- CSS `background:` 簡寫會把同元素較低優先權規則的 `background-size`／`background-position` 清掉（忍者旗牌肖像就是這樣消失的），要用 `background-color`。
- 覆蓋畫面（出陣、結算、說明）要設 z-index，否則會被 fps 讀數蓋住。
- 玩家撤退令要獨立記錄（`retreatOrders`），否則脫離接觸瞬間會被「士氣 ≥ 50 解除整頓」清掉。
- `let` 變數若在初始化時被呼叫的函式用到，要宣告在呼叫之前（TDZ）。
- 截圖腳本快轉（`advance`）不會跑導播鏡頭與士兵移動，要靠 `snap()` 或等幾秒。
- macOS 的右鍵選單在按下時就出現，`pointerup` 可能收不到：右鍵指令改在 `pointerdown` 就發出，拖曳拉陣線才等放開；`pointermove` 的 `buttons === 0` 與 window `mouseup` 當補救；Ctrl＋左鍵視同右鍵。
- 無頭瀏覽器 10 fps 時 `setTimeout` 會延遲數百毫秒，測連點要用同步的合成事件（`dispatchEvent`），`setPointerCapture` 對合成事件會丟例外，已 try/catch。
- Gemini 圖片 API 的長寬比只接受 1:1、2:3、3:2、3:4、4:3、4:5、5:4、9:16、16:9、21:9、1:4、4:1、1:8、8:1（旗指物原本寫 1:2 被拒，改 9:16）。
- sharp：單通道 raw 經 `resize` 會變 3 通道，要再 `extractChannel(0)`；`resize` 的 `background` 要給物件不能給數字。
