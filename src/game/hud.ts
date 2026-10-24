// 畫面介面：以戰場為主。上方一條細的軍勢列，右側直排的時間控制，左下角小型部隊旗牌。
import type { Unit } from '../sim/sim.ts';
import { KANJI, TYPE_NAME } from './units.ts';
import { kanBox, portraitOf, ninjaPortrait, kamon, img, unitIcon } from './art.ts';

const CSS = `
/* 版面：戰場畫布全螢幕；介面縮成三個小元件，避開畫面四角（手機上四角常被瀏覽器或檢視器的按鈕佔用） */
:root {
  --ink: #15130f; --ink-a: rgba(21,19,15,0.58); --ink-b: rgba(21,19,15,0.78); --paper: #efe6d2; --paper-dim: #b9ae96;
  --takeda: #b8322a; --uesugi: #2f4f86; --gold: #c9a227; --line: rgba(239,230,210,0.16);
  --display: "LXGW WenKai TC", "Noto Serif TC", "Songti TC", serif;
  --ui: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif;
  --edge-l: max(12px, env(safe-area-inset-left, 0px)); --edge-r: max(12px, env(safe-area-inset-right, 0px));
  --edge-t: calc(env(safe-area-inset-top, 0px) + 8px); --edge-b: calc(env(safe-area-inset-bottom, 0px) + 8px);
  color-scheme: dark;
}
[hidden] { display: none !important; }
html, body { height: 100%; background: var(--ink); color: var(--paper); overflow: hidden; overscroll-behavior: none; }
body { font-family: var(--ui); -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
#view { position: fixed; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
#hud { position: fixed; inset: 0; pointer-events: none; font-size: 12px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
#hud button { pointer-events: auto; font: inherit; color: var(--paper); cursor: pointer; }
#hud button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

/* 上方：軍勢列（置中、單行） */
.strip { position: fixed; top: var(--edge-t); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px;
  background: var(--ink-a); border: 1px solid var(--line); border-radius: 999px; padding: 3px 12px; height: 26px; white-space: nowrap; }
.strip .side { font-family: var(--display); font-size: 13px; letter-spacing: 0.04em; }
.strip .bar { width: clamp(48px, 9vw, 120px); height: 5px; border-radius: 3px; background: rgba(239,230,210,0.12); overflow: hidden; display: flex; }
.strip .bar.r { justify-content: flex-end; }
.strip .bar i { display: block; height: 100%; transition: width .3s; }
.strip .bar { position: relative; }
.strip .bar .tk { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(21,19,15,0.85); }
.strip .bar .tk.c { background: #e0574a; }
.strip .av { font-variant-numeric: tabular-nums; font-size: 11px; color: var(--paper-dim); min-width: 16px; text-align: center; }
.strip .av.low { color: #e0a24a; font-weight: 700; }
.strip .av.crit { color: #f08a7e; font-weight: 700; }
.strip .av.high { color: #d9c27a; }
.aev { position: fixed; transform: translateX(-50%); font-size: 11.5px; font-weight: 700; padding: 0 6px; line-height: 18px; border-radius: 9px;
  background: var(--ink-b); white-space: nowrap; animation: aev 2.4s ease-out forwards; }
.aev.neg { color: #f08a7e; } .aev.pos { color: #a9d39a; }
@keyframes aev { 0% { opacity: 0; translate: 0 -4px; } 10% { opacity: 1; translate: 0 0; } 75% { opacity: 1; } 100% { opacity: 0; translate: 0 10px; } }

/* 左下：部隊資訊（選取單一部隊或查看敵軍時） */
.info { position: fixed; left: var(--edge-l); bottom: calc(var(--edge-b) + 58px); width: 248px; max-height: calc(100% - 150px); overflow-y: auto;
  background: var(--ink-b); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px 8px; pointer-events: auto; font-size: 11.5px; line-height: 1.45;
  scrollbar-width: none; }
.info .hd { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.info .k { width: 26px; height: 26px; border-radius: 5px; display: grid; place-items: center; font-family: var(--display); font-size: 16px; flex: none; }
.info .nm { font-family: var(--display); font-size: 14px; line-height: 1.15; }
.info .sub { color: var(--paper-dim); font-size: 11px; }
.info .x { margin-left: auto; width: 24px; height: 24px; border-radius: 6px; background: transparent; border: 0; font-size: 15px; color: var(--paper-dim) !important; padding: 0; }
.info .mb { display: flex; align-items: center; gap: 6px; margin: 2px 0 4px; }
.info .mb .bar { flex: 1; height: 6px; border-radius: 3px; background: rgba(239,230,210,0.12); position: relative; overflow: hidden; }
.info .mb .bar i { position: absolute; left: 0; top: 0; bottom: 0; }
.info .mb .bar b { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(21,19,15,0.9); }
.info .mb .v { font-variant-numeric: tabular-nums; font-weight: 700; min-width: 22px; text-align: right; }
.info .row { display: flex; gap: 6px; }
.info .row > span:first-child { color: var(--paper-dim); flex: none; width: 30px; }
.info .pos { color: #a9d39a; } .info .neg { color: #f08a7e; } .info .warn { color: #e0a24a; }
.info .acts { display: flex; flex-wrap: wrap; gap: 5px; margin: 6px 0 2px; }
.info .act { min-height: 30px; padding: 0 9px; border-radius: 7px; background: rgba(239,230,210,0.1); border: 1px solid var(--line); font-size: 12px;
  font-family: var(--display) !important; display: inline-flex; align-items: center; gap: 5px; }
.info .act.ready { background: #c9a227; color: var(--ink) !important; border-color: #c9a227; }
.info .act:disabled { opacity: 0.45; cursor: default; }
.info .act small { font-family: var(--ui); font-size: 10px; opacity: 0.85; font-variant-numeric: tabular-nums; }
.info .act.on { outline: 2px solid var(--paper); }
.info .desc { color: var(--paper-dim); font-size: 10.5px; line-height: 1.4; margin-top: 3px; }
.card.nin .kan { background-color: #2a262e; }
.card .rdy { position: absolute; right: 3px; top: 3px; width: 7px; height: 7px; border-radius: 50%; background: #c9a227; display: none; }
.card.ready .rdy { display: block; }
.prompt { position: fixed; left: 50%; bottom: calc(var(--edge-b) + 62px); transform: translateX(-50%); background: #c9a227; color: var(--ink);
  border-radius: 8px; padding: 5px 6px 5px 12px; font-weight: 700; display: flex; align-items: center; gap: 10px; pointer-events: auto; white-space: nowrap; }
.prompt button { background: var(--ink) !important; color: var(--paper) !important; border: 0; border-radius: 6px; min-height: 28px; padding: 0 10px; }
.setup { z-index: 20; pointer-events: auto; position: fixed; inset: 0; display: grid; place-items: center; background: rgba(10,9,7,0.72);
  padding: var(--edge-t) max(16px, env(safe-area-inset-right, 0px)) var(--edge-b) max(16px, env(safe-area-inset-left, 0px)); }
.setup .sheet { background: #1f1a14; border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; max-width: 720px; width: 100%; max-height: 100%; overflow: auto; }
.setup h2 { font-family: var(--display); font-size: 22px; margin: 0; letter-spacing: 0.06em; }
.setup .lead { color: var(--paper-dim); margin: 2px 0 10px; font-size: 12.5px; }
.setup .clans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.setup .clan { text-align: left; background: rgba(239,230,210,0.05) !important; border: 1px solid var(--line); border-radius: 9px; padding: 9px 10px; display: flex; flex-direction: column; gap: 3px; }
.setup .clan[aria-pressed="true"] { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold) inset; background: rgba(201,162,39,0.12) !important; }
.setup .clan b { font-family: var(--display); font-size: 17px; font-weight: 700; }
.setup .clan .m { color: var(--paper-dim); font-size: 11px; }
.setup .clan .j { font-size: 11.5px; line-height: 1.4; }
.setup .clan .j em { font-style: normal; color: var(--gold); font-family: var(--display); }
.setup .row2 { display: flex; gap: 8px; margin-top: 12px; align-items: center; flex-wrap: wrap; }
.setup .go { min-height: 42px; padding: 0 24px; border-radius: 9px; background: var(--paper) !important; color: var(--ink) !important; border: 0; font-weight: 700; font-family: var(--display) !important; font-size: 17px; letter-spacing: 0.1em; }
.setup .ghost { min-height: 42px; padding: 0 14px; border-radius: 9px; background: transparent !important; border: 1px solid var(--line); }
.setup .foe { color: var(--paper-dim); font-size: 11.5px; margin-left: auto; }
@media (max-width: 700px), (max-height: 430px) { .setup .clans { gap: 6px; } .setup .clan { padding: 7px 8px; } .setup .clan .j { font-size: 10.5px; } .setup h2 { font-size: 19px; } .setup .lead { display: none; } }
@media (max-height: 430px) { .info .dl:not(.key) { display: none; } }
.hold { position: fixed; left: 50%; top: calc(var(--edge-t) + 54px); transform: translateX(-50%); font-weight: 700; font-size: 12px;
  padding: 2px 10px; border-radius: 10px; background: var(--ink-b); border: 1px solid var(--gold); white-space: nowrap; }
.hold.s0 { color: #f0b3ab; } .hold.s1 { color: #b8cbef; }
.toast { top: calc(var(--edge-t) + 80px) !important; }
/* 觀戰模式 */
.rail .w { display: none !important; }
#hud.watch .rail .w { display: grid !important; }
.rail .c { display: none !important; }
#hud.daimyo .rail .c:not(.gone) { display: grid !important; } /* 大名令鈕已併入決策卡：加 gone 就不顯示 */
#hud .rail #b-cmd { font-family: var(--display); font-size: 16px; }
#hud .rail #b-cmd.on { background: var(--gold); color: var(--ink); border-color: var(--gold); }
/* 情報讀數 */
.intel { position: fixed; left: var(--edge-l); top: var(--edge-t); display: flex; gap: 6px; align-items: center; padding: 3px 9px; height: 26px; border-radius: 999px;
  background: var(--ink-a); border: 1px solid var(--line); font-size: 11px; white-space: nowrap; }
.intel b { font-family: var(--display); font-weight: 700; color: var(--gold); }
.intel .seg { display: flex; gap: 2px; }
.intel .seg i { width: 5px; height: 10px; border-radius: 1px; background: rgba(239,230,210,0.15); }
.intel .seg i.l1 { background: #8b8574; } .intel .seg i.l2 { background: #c9b458; } .intel .seg i.l3 { background: #c9a227; }
/* 大名模式：親自接管的旗牌、軍師建議卡、軍議 */
.card.manual::after { content: '手'; position: absolute; left: -4px; top: -6px; font-size: 9px; line-height: 14px; padding: 0 4px; border-radius: 7px; background: var(--gold); color: var(--ink); font-weight: 700; }
.advice { position: fixed; left: 50%; transform: translateX(-50%); top: calc(var(--edge-t) + 62px); max-width: min(420px, 70vw); pointer-events: auto; z-index: 5;
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 10px; background: var(--ink-b); border: 1px solid var(--gold); font-size: 12px; line-height: 1.4; animation: advin 0.3s ease-out; }
@keyframes advin { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.advice .pp { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; object-position: center 18%; border: 1px solid var(--gold); flex: none; }
.advice .tx b { color: var(--gold); font-family: var(--display); }
.advice .bt { display: flex; flex-direction: column; gap: 4px; flex: none; }
.advice.dec { max-width: min(520px, 86vw); flex-direction: column; align-items: stretch; }
.advice.dec .bt { flex-direction: column; margin-top: 6px; }
.advice.dec .bt button { min-height: 36px; text-align: left; padding: 4px 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; border-radius: 8px; }
.advice.dec .bt button:first-child { background: transparent !important; color: var(--paper) !important; border-color: var(--line); font-weight: 400; }
.advice.dec .bt button.rec { border-color: var(--gold); background: rgba(212,175,55,0.12) !important; }
.advice.dec .bt button small { font-size: 10px; color: var(--gold); border: 1px solid var(--gold); border-radius: 4px; padding: 0 4px; }
.advice.dec .bt button em { font-style: normal; font-size: 11px; color: var(--paper-dim); flex-basis: 100%; }
.advice.dec .hd2 { font-size: 11px; color: var(--paper-dim); margin-bottom: 2px; }
.lead { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(var(--edge-b) + 86px); display: flex; gap: 6px; align-items: center; padding: 6px 10px; border-radius: 999px; background: rgba(31,26,20,0.85); border: 1px solid var(--gold); pointer-events: auto; z-index: 4; }
.lead .nm { font-family: var(--display); color: var(--gold); font-size: 13px; margin-right: 4px; white-space: nowrap; }
.lead button { min-height: 32px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--line); background: transparent !important; color: var(--paper); font-size: 13px; }
.lead button.x2 { border-color: var(--gold); }
.advice:not([hidden]) ~ .lead { display: none; } /* 決策卡出現時先收起視角列 */
@media (max-width: 700px), (max-height: 430px) { .lead { bottom: calc(var(--edge-b) + 78px); padding: 4px 8px; } .lead button { min-height: 28px; padding: 0 8px; font-size: 12px; } }
.advice .bt button { min-height: 26px; min-width: 44px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--line); background: transparent !important; font-family: var(--display) !important; font-size: 13px; }
.advice .bt button:first-child { background: var(--gold) !important; color: var(--ink) !important; border-color: var(--gold); font-weight: 700; }
.setup .war { margin-top: 10px; border-top: 1px solid var(--line); padding-top: 8px; }
.setup .war h3 { font-family: var(--display); font-size: 14px; margin: 0 0 4px; color: var(--gold); }
.setup .war .pick > span { width: 70px; font-size: 13px; }
.setup .war .chip { min-height: 30px; padding: 0 10px; font-size: 12.5px; }
.setup .war .m { color: var(--paper-dim); font-size: 11px; margin: 2px 0 0; }
/* 軍議：配置與將領 */
.setup .dep { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; }
.setup .dep .dbox { min-width: 86px; min-height: 48px; padding: 4px 8px; border-radius: 8px; border: 1px solid var(--line); background: rgba(239,230,210,0.05) !important; text-align: left; display: flex; flex-direction: column; gap: 1px; }
.setup .dep .dbox[aria-pressed="true"] { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold) inset; background: rgba(201,162,39,0.14) !important; }
.setup .dep .dbox.empty { border-style: dashed; color: var(--paper-dim); justify-content: center; }
.setup .dep .dbox .p { font-size: 10.5px; color: var(--paper-dim); }
.setup .dep .dbox .n { font-family: var(--display); font-size: 14px; display: flex; align-items: center; gap: 5px; }
.setup .dep .dbox .n .pp { width: 20px; height: 20px; }
.setup .dep .dbox .s { font-size: 10.5px; color: var(--gold); }
.setup .modes.sm button { min-height: 30px; font-size: 13px; }
@media (max-width: 700px), (max-height: 430px) { .advice { max-width: 62vw; font-size: 11.5px; top: calc(var(--edge-t) + 58px); } .setup .war .chip { min-height: 28px; padding: 0 8px; font-size: 11.5px; } }
#hud.watch #b-form, #hud.watch #b-halt, #hud.watch #b-retreat, #hud.watch #b-box, #hud.watch #b-skill, #hud.watch .cards { display: none !important; }
#hud.watch .info { bottom: var(--edge-b); }
.feed { position: fixed; left: var(--edge-l); top: var(--edge-t); width: min(250px, calc(50% - 190px)); display: flex; flex-direction: column; gap: 3px; }
.feed div { background: var(--ink-a); border-radius: 6px; padding: 2px 7px; font-size: 11px; line-height: 1.45; transition: opacity 1s; }
.feed div.old { opacity: 0; }
.feed .tm { color: var(--paper-dim); font-variant-numeric: tabular-nums; margin-right: 5px; }
.feed .s0 { border-left: 3px solid var(--takeda); } .feed .s1 { border-left: 3px solid var(--uesugi); }
.feed .big { font-weight: 700; }
@media (max-width: 700px) { .feed { display: none; } }
.setup .modes { display: flex; gap: 6px; margin: 8px 0 10px; }
.setup .modes button { flex: 1; min-height: 38px; border-radius: 8px; border: 1px solid var(--line); background: transparent !important; font-family: var(--display) !important; font-size: 15px; }
.setup .modes button[aria-pressed="true"] { background: var(--paper) !important; color: var(--ink) !important; }
.setup .pick { display: flex; align-items: center; gap: 6px; margin: 6px 0; flex-wrap: wrap; }
.setup .pick > span { width: 84px; font-family: var(--display); font-size: 14px; }
.setup .chip { min-height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line); background: rgba(239,230,210,0.05) !important; }
.setup .chip[aria-pressed="true"] { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold) inset; background: rgba(201,162,39,0.14) !important; }
.setup .chip small { color: var(--paper-dim); margin-left: 4px; }
.end { z-index: 20; pointer-events: auto; position: fixed; inset: 0; display: grid; place-items: center; background: rgba(10,9,7,0.6); }
.end .sheet { background: #1f1a14; border: 1px solid var(--line); border-radius: 12px; padding: 14px 18px; width: min(560px, 100%); max-height: 100%; overflow: auto; }
.end h2 { font-family: var(--display); font-size: 24px; margin: 0; letter-spacing: 0.08em; }
.end .why { color: var(--paper-dim); margin: 2px 0 10px; }
.end table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: 12.5px; }
.end th, .end td { padding: 4px 6px; border-bottom: 1px solid var(--line); text-align: right; }
.end th:first-child, .end td:first-child { text-align: left; color: var(--paper-dim); font-weight: 400; }
.end .btns { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.end .btns button { min-height: 40px; padding: 0 16px; border-radius: 9px; border: 1px solid var(--line); background: transparent !important; }
.end .btns button:first-child { background: var(--paper) !important; color: var(--ink) !important; border: 0; font-weight: 700; }
@media (max-height: 430px) { .info { width: 220px; font-size: 11px; line-height: 1.38; padding: 6px 8px; } .info .nm { font-size: 13px; } }
.strip .clock { font-family: var(--display); font-size: 14px; font-variant-numeric: tabular-nums; min-width: 38px; text-align: center; }

/* 右側：時間控制，直向排列在畫面中段 */
.rail { position: fixed; right: var(--edge-r); top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 6px; }
.rail button { width: 40px; height: 40px; border-radius: 10px; background: var(--ink-a); border: 1px solid var(--line); display: grid; place-items: center;
  font-size: 12.5px; font-variant-numeric: tabular-nums; padding: 0; }
#hud .rail button[aria-pressed="true"] { background: var(--paper); color: var(--ink); }
.rail svg { width: 14px; height: 14px; fill: currentColor; }
.rail button svg.li { width: 18px; height: 18px; fill: none; margin-top: 2px; }
.rail button .lb { display: block; font-size: 9.5px; line-height: 10px; margin-top: -1px; opacity: 0.85; font-family: var(--display); }
.rail button:has(.lb) { grid-template-rows: auto auto; align-content: center; gap: 1px; }
#hud .rail button.gone { display: none !important; }
.rail .sep { height: 1px; margin: 2px 6px; background: var(--line); }
.rail #b-form, .rail #b-halt, .rail #b-box, .rail #b-skill, .rail #b-retreat, .rail .w { font-family: var(--display); font-size: 16px; }
.rail button:disabled { opacity: 0.35; cursor: default; }
@media (max-height: 400px) { .rail button { width: 36px; height: 34px; } .rail { gap: 4px; } }
.rail #b-skill.ready { background: #c9a227; color: var(--ink); border-color: #c9a227; }

/* 左下：部隊旗牌 */
.cards { position: fixed; left: var(--edge-l); bottom: var(--edge-b); display: flex; gap: 6px; pointer-events: auto;
  max-width: calc(100% - 120px); overflow-x: auto; scrollbar-width: none; padding: 2px; }
.card { flex: 0 0 auto; position: relative; display: flex; align-items: center; gap: 8px; padding: 3px; border-radius: 8px;
  background: var(--ink-a); border: 1px solid var(--line); }
.card.rout { opacity: 0.5; }
.card.sel { border-color: var(--paper); box-shadow: 0 0 0 1px var(--paper) inset; background: var(--ink-b); }
.card .kan { width: 34px; height: 34px; border-radius: 6px; display: grid; place-items: center; font-family: var(--display); font-size: 20px; color: var(--paper); }
.card .mrt { position: absolute; right: 2px; top: -7px; font-size: 9px; line-height: 13px; color: var(--gold); letter-spacing: -1px; text-shadow: 0 0 2px var(--ink); }
.card .men { position: absolute; left: 25px; top: -6px; min-width: 18px; padding: 0 4px; font-size: 9.5px; line-height: 14px; border-radius: 7px;
  background: var(--ink); border: 1px solid var(--line); font-variant-numeric: tabular-nums; text-align: center; }
.cards { padding-top: 8px; padding-right: 12px; }
.card .mor { position: absolute; left: 4px; right: 4px; bottom: 1px; height: 3px; border-radius: 2px; background: rgba(239,230,210,0.15); overflow: hidden; }
.card .mor i { display: block; height: 100%; }
.card .txt { display: none; flex-direction: column; padding-right: 6px; text-align: left; }
.card .t { font-family: var(--display); font-size: 13px; line-height: 1.2; }
.card .c { font-size: 11px; color: var(--paper-dim); }
/* 大螢幕才顯示部隊名稱 */
@media (min-width: 1100px) and (min-height: 700px) { .card .txt { display: flex; } }

.fps { position: fixed; left: 50%; top: calc(var(--edge-t) + 31px); transform: translateX(-50%); font-size: 11px; line-height: 18px; padding: 0 8px;
  border-radius: 9px; background: var(--ink-a); color: var(--paper); font-variant-numeric: tabular-nums; white-space: nowrap; }
.fps b { font-weight: 700; }
.fps.low b { color: #e0a24a; }
.toast { position: fixed; left: 50%; top: calc(var(--edge-t) + 56px); transform: translateX(-50%); background: var(--ink-b);
  border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; font-size: 12px; opacity: 0; transition: opacity .25s; white-space: nowrap; }
.toast.on { opacity: 1; }
.box { position: fixed; border: 1px solid var(--paper); background: rgba(239,230,210,0.12); display: none; }

.help { z-index: 30; pointer-events: auto; position: fixed; inset: 0; display: grid; place-items: center; background: rgba(10,9,7,0.55);
  padding: var(--edge-t) max(16px, env(safe-area-inset-right, 0px)) var(--edge-b) max(16px, env(safe-area-inset-left, 0px)); }
.help .sheet { background: #1f1a14; border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; max-width: 640px; width: 100%; max-height: 100%; overflow: auto; font-size: 13px; }
.help h2 { font-family: var(--display); font-weight: 700; font-size: 20px; margin: 0 0 4px; letter-spacing: 0.04em; text-wrap: balance; }
.help p { margin: 0 0 10px; color: var(--paper-dim); line-height: 1.6; }
.help .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.help h3 { font-size: 12px; letter-spacing: 0.12em; color: var(--gold); margin: 0 0 6px; font-weight: 500; }
.help dl { display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; margin: 0; line-height: 1.45; }
.help dt { color: var(--paper); white-space: nowrap; font-weight: 500; }
.help dd { margin: 0; color: var(--paper-dim); }
.help kbd { font: 11px var(--ui); border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; padding: 0 5px; }
.help .close { margin-top: 12px; min-height: 40px; padding: 0 18px; border-radius: 8px; background: var(--paper); color: var(--ink) !important; border: 0; font-weight: 700; }
.rotate { z-index: 40; pointer-events: auto; position: fixed; inset: 0; display: none; place-items: center; background: var(--ink); text-align: center; padding: 24px; }
.rotate .k { font-family: var(--display); font-size: 64px; color: var(--takeda); line-height: 1; margin-bottom: 12px; }
@media (orientation: portrait) and (max-width: 760px) { .rotate { display: grid; } }
.floats { position: fixed; inset: 0; overflow: hidden; }
.ft { position: absolute; left: 0; top: 0; font-family: var(--display); font-weight: 700; font-size: 15px; letter-spacing: 0.06em;
  background: rgba(20,18,16,0.62); padding: 0 7px; border-radius: 5px; line-height: 22px;
  color: var(--paper); text-shadow: 0 1px 2px #000, 0 0 6px rgba(0,0,0,0.6); white-space: nowrap; will-change: transform; }
.ft.hit { color: #f2c46b; }
.ft.bad { color: #f08a7e; font-size: 17px; }
.ft.good { color: #a9d39a; }
/* 美術：肖像、家紋、圖示（art.ts；沒有圖檔時退回漢字與色塊） */
.strip .km { width: 15px; height: 15px; opacity: 0.9; }
.card .kan, .info .k { position: relative; background-size: cover; background-position: center 18%; }
.card .kan .kj, .info .k .kj { font-style: normal; }
.card .kan.pic .kj, .info .k.pic .kj { position: absolute; right: -4px; bottom: -4px; width: 15px; height: 15px; border-radius: 4px; font-size: 10px; line-height: 15px; text-align: center;
  background: var(--sc); color: var(--paper); box-shadow: 0 0 0 1px var(--ink); }
.card .kan.pic .kj.ico, .info .k.pic .kj.ico { width: 18px; height: 18px; right: -5px; bottom: -5px; border-radius: 50%; background: var(--ink) center/cover no-repeat; box-shadow: 0 0 0 1px var(--gold); }
.setup .dep .dbox .p img.ti { width: 14px; height: 14px; border-radius: 50%; vertical-align: -3px; margin-right: 3px; }
:root.hasframe .end .sheet { border: 30px solid transparent; border-image: var(--frame) 125 fill / 30px stretch; border-radius: 0; background: transparent; padding: 8px 14px; }
.info .k.pic { width: 34px; height: 34px; border-radius: 6px; }
.info .act .ic { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; flex: none; }
.setup, .end { background-size: cover; background-position: center; }
.setup .sheet, .end .sheet { background: rgba(31,26,20,0.9); }
.setup .clan b { display: flex; align-items: center; gap: 7px; }
.setup .pp { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; object-position: center 18%; border: 1px solid var(--line); flex: none; }
.setup .chip { display: inline-flex; align-items: center; gap: 6px; }
.setup .chip .pp { width: 22px; height: 22px; }
.end h2 { display: flex; align-items: center; gap: 10px; }
.end h2 .pp { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; object-position: center 18%; border: 1px solid var(--gold); }
.end th .km { width: 14px; height: 14px; vertical-align: -2px; margin-right: 3px; }
@media (prefers-reduced-motion: reduce) { .toast { transition: none; } }
`;

// 側欄圖示（內嵌 SVG 線稿，currentColor）
const IC: Record<string, string> = {
  form: '<circle cx="6" cy="6" r="1.8"/><circle cx="12" cy="6" r="1.8"/><circle cx="18" cy="6" r="1.8"/><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/><circle cx="6" cy="18" r="1.8"/><circle cx="12" cy="18" r="1.8"/><circle cx="18" cy="18" r="1.8"/>',
  halt: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M8 12h8"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.2"/>',
  retreat: '<path d="M18 20V10a4 4 0 0 0-4-4H6"/><path d="M9 3L6 6l3 3"/>',
  skill: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  cmd: '<path d="M5 21V4"/><path d="M5 4h12l-3 4 3 4H5"/>',
  cam: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  vis: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  snd: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6"/>',
};
const ico = (k: string) => `<svg class="li" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`;
const railBtn = (id: string, k: string, label: string, kanji: string, title: string, cls = '', pressed?: boolean) =>
  `<button id="${id}"${cls ? ` class="${cls}"` : ''} aria-label="${label}"${pressed !== undefined ? ` aria-pressed="${pressed}"` : ''} title="${title}">${ico(k)}<small class="lb">${kanji}</small></button>`;
const ICON_PAUSE = '<svg viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1.5" width="3.5" height="11" rx="1"/><rect x="8.5" y="1.5" width="3.5" height="11" rx="1"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z"/></svg>';

export type HudCallbacks = {
  onSelectCard: (id: number, add: boolean) => void;
  onFocusCard: (id: number) => void;
  onPause: () => void;
  onSpeed: (s: number) => void;
  onFormation: () => void;
  onHalt: () => void;
  onBoxMode: () => void;
  onSkill: () => void;
  onRetreat: () => void;
};

export class Hud {
  root: HTMLElement; box: HTMLElement;
  private cards = new Map<number, HTMLButtonElement>();
  private clock!: HTMLElement; private fps!: HTMLElement; private armyBars: HTMLElement[] = [];
  private pauseBtn!: HTMLButtonElement; private speedBtn!: HTMLButtonElement;
  private toastEl!: HTMLElement; private toastT = 0;
  private helpEl!: HTMLElement;
  private lastPaused: boolean | null = null; private lastSpeed = 0;
  speeds = [0.5, 1, 2, 3];
  private infoEl!: HTMLElement; private infoKey = ''; onInfoClose: () => void = () => {};
  onInfoAct: (act: string) => void = () => {};
  onCancelPrompt: () => void = () => {};
  private retreatBtn!: HTMLButtonElement; private holdEl!: HTMLElement;
  private promptEl!: HTMLElement; private skillBtn!: HTMLButtonElement; private ninCard: HTMLButtonElement | null = null;
  private av: HTMLElement[] = []; private bars: HTMLElement[] = [];
  onCmd: () => void = () => {};
  onSound: () => void = () => {};
  onLead: (act: string) => void = () => {};
  setLead(name: string | null) { const el = this.root.querySelector<HTMLElement>('.lead')!; if (!name) { el.hidden = true; return; } el.querySelector('.nm')!.textContent = `${name}・視角`; el.hidden = false; }
  setSound(on: boolean) { const b = this.root.querySelector('#b-snd')!; b.setAttribute('aria-pressed', String(on)); b.innerHTML = `${ico(on ? 'snd' : 'mute')}<small class="lb">${on ? '音' : '靜'}</small>`; b.classList.toggle('on', on); }
  setDaimyo(on: boolean) { this.root.classList.toggle('daimyo', on); }
  setCmdOpen(on: boolean) { const b = this.root.querySelector('#b-cmd')!; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); }
  // 軍師建議卡
  showAdvice(html: string, onYes: () => void, onNo: () => void) {
    const el = this.root.querySelector<HTMLElement>('.advice')!;
    el.innerHTML = `${html}<div class="bt"><button type="button">准</button><button type="button">否</button></div>`;
    const [y, n] = el.querySelectorAll('button'); y.onclick = onYes; n.onclick = onNo;
    el.hidden = false;
  }
  hideAdvice() { this.root.querySelector<HTMLElement>('.advice')!.hidden = true; }
  // 決策卡：發言人＋情境＋2～4 個選項（rec＝軍師建議）
  showDecision(html: string, opts: { label: string; hint?: string; rec?: boolean }[], onPick: (i: number) => void) {
    const el = this.root.querySelector<HTMLElement>('.advice')!; el.classList.add('dec');
    el.innerHTML = `${html}<div class="bt">${opts.map((o, i) => `<button type="button" class="${o.rec ? 'rec' : ''}" data-i="${i}">${o.label}${o.rec ? '<small>軍師建議</small>' : ''}${o.hint ? `<em>${o.hint}</em>` : ''}</button>`).join('')}</div>`;
    el.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.onclick = () => onPick(+b.dataset.i!); });
    el.hidden = false;
  }
  hideDecision() { const el = this.root.querySelector<HTMLElement>('.advice')!; el.hidden = true; el.classList.remove('dec'); }
  // 情報讀數（情報 v2）：察覺／識別／洞悉的敵軍數與已知地形秘密
  setIntel(html: string | null) { const el = this.root.querySelector<HTMLElement>('.intel')!; if (html === null) { el.hidden = true; return; } el.hidden = false; if (el.innerHTML !== html) el.innerHTML = html; }
  private formBtn!: HTMLButtonElement; private haltBtn!: HTMLButtonElement; private boxBtn!: HTMLButtonElement;

  constructor(units: Unit[], cb: HudCallbacks) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.root = document.getElementById('hud')!;
    this.root.innerHTML = `
      <div class="strip" aria-label="雙方軍勢與剩餘時間">
        ${img(kamon(0), 'km')}<span class="side" style="color:#e3a39c">武田</span><span class="av" id="av0">100</span>
        <span class="bar r" title="軍勢"><i style="background:var(--takeda)"></i><b class="tk c"></b><b class="tk h"></b></span>
        <span class="clock">10:00</span>
        <span class="bar" title="軍勢"><i style="background:var(--uesugi)"></i><b class="tk c"></b><b class="tk h"></b></span>
        <span class="av" id="av1">100</span><span class="side" style="color:#a9bde0">上杉</span>${img(kamon(1), 'km')}
      </div>
      <div class="rail">
        <button id="b-pause" aria-label="暫停" aria-pressed="false" title="暫停（空白鍵）">${ICON_PAUSE}</button>
        <button id="b-speed" aria-label="遊戲速度" title="切換速度">1×</button>
        <button id="b-help" aria-label="操作說明" title="操作說明">？</button>
        <span class="sep"></span>
        ${railBtn('b-form', 'form', '切換陣型', '陣', '切換陣型（F）')}
        ${railBtn('b-halt', 'halt', '停止', '停', '停止（H）')}
        ${railBtn('b-box', 'box', '框選', '框', '框選（觸控用）', '', false)}
        ${railBtn('b-retreat', 'retreat', '撤退', '退', '選取部隊有序撤退（T）')}
        ${railBtn('b-skill', 'skill', '武將技', '技', '選取部隊施放武將技（R）')}
        ${railBtn('b-cmd', 'cmd', '大名令', '令', '大名令：馳援、集中弓火、騎兵繞後、全軍整頓', 'c', false)}
        ${railBtn('b-cam', 'cam', '導播鏡頭', '鏡', '導播鏡頭：自動跟隨戰況', 'w', true)}
        ${railBtn('b-vis', 'vis', '視野', '全', '切換視野：全知／武田／上杉', 'w')}
        ${railBtn('b-snd', 'snd', '音效', '音', '音效開關', 'w', true)}
      </div>
      <div class="cards" role="toolbar" aria-label="部隊"></div>
      <div class="info" hidden aria-live="polite"></div>
      <div class="prompt" hidden><span></span><button type="button" id="b-cancel">取消</button></div>
      <div class="advice" hidden></div>
      <div class="lead" hidden><span class="nm"></span><button type="button" data-l="charge">衝鋒</button><button type="button" data-l="skill">武將技</button><button type="button" data-l="cry">鬨聲</button><button type="button" data-l="retreat">撤退</button><button type="button" class="x2" data-l="exit">返回俯瞰</button></div>
      <div class="intel" hidden></div>
      <div class="setup" hidden></div>
      <div class="feed" aria-live="polite"></div>
      <div class="hold" hidden></div>
      <div class="end" hidden></div>
      <div class="fps"></div>
      <div class="box"></div>
      <div class="toast" role="status"></div>
      <div class="help" hidden>
        <div class="sheet" role="dialog" aria-label="操作說明">
          <h2>決戰・M6 原型</h2>
          <p><b>勝負</b>：任一方軍勢低於 25 總崩潰或全軍覆沒即分勝負；開戰 5 分鐘後若 90 秒沒有任何接戰且軍勢差 15 以上，落後方退卻；10 分鐘到時軍勢高者勝。<b>據點</b>：不是勝利條件，只給增益：村落派援軍、寺廟讓附近友軍士氣 +10、補給點回補箭矢；點地圖上的據點可看效果與佔領進度。<b>撤退</b>（右側「退」或 T）：部隊脫離接戰退到主將附近，撤退中不還手，但不會連累友軍士氣、也不扣軍勢。上杉軍由 AI 指揮，戰場有迷霧；潰走的部隊重整後士氣最多回到 50，再潰走即潰滅。選取部隊後在左下面板施放武將技、鬨聲，大將另有軍略；「忍」旗牌可選忍者偵察並施放忍術。</p>
          <div class="cols">
            <div><h3>滑鼠與鍵盤</h3><dl>
              <dt>左鍵點選</dt><dd>選取部隊；<kbd>Shift</kbd> 加選；拖曳框選</dd>
              <dt>右鍵點地面</dt><dd>移動；連點兩下改為跑步</dd>
              <dt>右鍵點敵軍</dt><dd>攻擊（弓兵進入射程後射擊）；連點兩下全程跑步突擊</dd>
              <dt>左鍵點敵軍</dt><dd>查看敵軍資訊；滑鼠指著敵軍會顯示其正面、側面、背面</dd>
              <dt>右鍵拖曳</dt><dd>拉出陣線：長度 = 正面寬度，由左往右拉時面向前方</dd>
              <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>平移鏡頭（也可把滑鼠移到畫面邊緣）</dd>
              <dt><kbd>Q</kbd><kbd>E</kbd>、中鍵拖曳</dt><dd>旋轉鏡頭</dd>
              <dt>滾輪</dt><dd>縮放</dd>
              <dt><kbd>空白鍵</kbd></dt><dd>暫停，暫停中仍可下指令</dd>
              <dt><kbd>-</kbd> <kbd>=</kbd></dt><dd>速度 0.5× / 1× / 2× / 3×（右側按鈕也可切換）</dd>
              <dt><kbd>H</kbd></dt><dd>選取的部隊停下</dd>
              <dt><kbd>F</kbd></dt><dd>切換陣型：橫陣 → 密集陣（長槍為槍衾）→ 散開</dd>
              <dt><kbd>R</kbd> <kbd>C</kbd> <kbd>V</kbd></dt><dd>武將技（選取的部隊）、鬨聲、軍略</dd>
              <dt><kbd>N</kbd></dt><dd>選下一位忍者；選取忍者後右鍵移動</dd>
              <dt><kbd>T</kbd></dt><dd>選取的部隊有序撤退</dd>
              <dt><kbd>Ctrl</kbd>＋數字</dt><dd>把選取的部隊編成一組；按數字選取，連按兩下移動鏡頭</dd>
              <dt><kbd>Ctrl</kbd>＋<kbd>A</kbd></dt><dd>選取全軍</dd>
            </dl></div>
            <div><h3>手機與平板</h3><dl>
              <dt>點部隊或旗牌</dt><dd>選取；再點一次取消</dd>
              <dt>點地面</dt><dd>選取中的部隊移動；連點兩下跑步</dd>
              <dt>點敵軍</dt><dd>有選取時攻擊（連點兩下突擊）；沒選取時查看資訊</dd>
              <dt>長按後拖曳</dt><dd>拉出陣線</dd>
              <dt>單指拖曳</dt><dd>平移鏡頭</dd>
              <dt>雙指</dt><dd>捏合縮放、轉動旋轉</dd>
              <dt>雙擊旗牌</dt><dd>鏡頭移到該部隊</dd>
              <dt>點旗牌</dt><dd>加入或移出選取（可多選）</dd>
              <dt>右側「框」</dt><dd>按下後拖曳，框選多隊</dd>
              <dt>右側「陣」「停」「退」「技」</dt><dd>切換陣型；停止；有序撤退；施放武將技</dd>
              <dt>點據點</dt><dd>沒有選取部隊時，查看據點效果與佔領進度</dd>
              <dt>「忍」旗牌</dt><dd>點一下選下一位忍者，連點兩下鏡頭移過去；之後點地面移動</dd>
            </dl></div>
          </div>
          <button class="close" id="b-close">開始</button>
        </div>
      </div>
      <div class="rotate"><div><div class="k">決</div><p>請將手機轉為橫向</p></div></div>`;
    this.box = this.root.querySelector('.box')!;
    this.clock = this.root.querySelector('.clock')!;
    this.fps = this.root.querySelector('.fps')!;
    this.armyBars = [...this.root.querySelectorAll<HTMLElement>('.strip .bar i')];
    this.bars = [...this.root.querySelectorAll<HTMLElement>('.strip .bar')];
    this.av = [this.root.querySelector('#av0')!, this.root.querySelector('#av1')!];
    this.infoEl = this.root.querySelector('.info')!;
    this.infoEl.addEventListener('click', e => { if ((e.target as HTMLElement).closest('.x')) this.onInfoClose(); });
    // 面板每 0.25 秒重繪，用 pointerdown 才不會在重繪時漏掉點擊
    this.infoEl.addEventListener('pointerdown', e => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
      if (b && !b.disabled) { e.preventDefault(); this.onInfoAct(b.dataset.act!); }
    });
    this.promptEl = this.root.querySelector('.prompt')!;
    this.root.querySelector<HTMLButtonElement>('#b-cancel')!.onclick = () => this.onCancelPrompt();
    this.skillBtn = this.root.querySelector('#b-skill')!; this.skillBtn.onclick = () => cb.onSkill();
    this.root.querySelector<HTMLButtonElement>('#b-cmd')!.onclick = () => this.onCmd();
    this.root.querySelector<HTMLButtonElement>('#b-snd')!.onclick = () => this.onSound();
    this.root.querySelectorAll<HTMLButtonElement>('.lead button').forEach(b => { b.onclick = () => this.onLead(b.dataset.l!); });
    this.retreatBtn = this.root.querySelector('#b-retreat')!; this.retreatBtn.onclick = () => cb.onRetreat();
    this.holdEl = this.root.querySelector('.hold')!;
    this.toastEl = this.root.querySelector('.toast')!;
    this.helpEl = this.root.querySelector('.help')!;
    this.pauseBtn = this.root.querySelector('#b-pause')!;
    this.pauseBtn.onclick = () => cb.onPause();
    this.speedBtn = this.root.querySelector('#b-speed')!;
    this.speedBtn.onclick = () => { const L = [...this.speeds.filter(v => v >= 1), ...this.speeds.filter(v => v < 1)]; cb.onSpeed(L[(L.indexOf(this.lastSpeed) + 1) % L.length]); };
    this.root.querySelector<HTMLButtonElement>('#b-help')!.onclick = () => this.showHelp(true);
    this.formBtn = this.root.querySelector('#b-form')!; this.formBtn.onclick = () => cb.onFormation();
    this.haltBtn = this.root.querySelector('#b-halt')!; this.haltBtn.onclick = () => cb.onHalt();
    this.boxBtn = this.root.querySelector('#b-box')!; this.boxBtn.onclick = () => cb.onBoxMode();
    this.root.querySelector<HTMLButtonElement>('#b-close')!.onclick = () => this.showHelp(false);
    this.cb = cb;
    for (const u of units) this.addCard(u);
  }
  private cb!: HudCallbacks;
  // 部隊旗牌（援軍抵達時也用這個加入）
  addCard(u: Unit) {
    const cb = this.cb;
    const cardsEl = this.root.querySelector('.cards')!;
    const b = document.createElement('button'); b.className = 'card'; b.type = 'button';
    b.setAttribute('aria-label', `${TYPE_NAME[u.type]}・${u.cmd || '援軍'}`); b.title = `${TYPE_NAME[u.type]}・${u.cmd || '援軍'}`;
    b.innerHTML = `${kanBox('kan', KANJI[u.type], u.side === 0 ? 'var(--takeda)' : 'var(--uesugi)', portraitOf(u.cmd), unitIcon(u.type))}
      <span class="men">${u.men}</span><span class="mrt" hidden></span><span class="mor"><i></i></span><span class="rdy"></span>
      <span class="txt"><span class="t">${TYPE_NAME[u.type]}</span><span class="c">${u.cmd || '援軍'}</span></span>`;
    let last = 0;
    b.addEventListener('click', e => {
      const now = performance.now();
      const touch = (e as PointerEvent).pointerType === 'touch' || (e as PointerEvent).pointerType === 'pen';
      if (now - last < 350) cb.onFocusCard(u.id); else cb.onSelectCard(u.id, e.shiftKey || touch);
      last = now;
    });
    const nin = cardsEl.querySelector('.card.nin');
    if (nin) cardsEl.insertBefore(b, nin); else cardsEl.appendChild(b);
    this.cards.set(u.id, b);
  }
  showHelp(on: boolean) { this.helpEl.hidden = !on; if (on) this.root.querySelector<HTMLButtonElement>('#b-close')!.focus(); }
  helpOpen() { return !this.helpEl.hidden; }
  toast(msg: string) {
    this.toastEl.textContent = msg; this.toastEl.classList.add('on');
    clearTimeout(this.toastT); this.toastT = window.setTimeout(() => this.toastEl.classList.remove('on'), 1400);
  }
  update(t: number, army: [number, number], units: Unit[], selected: Set<number>, morale: (u: Unit) => number, paused: boolean, speed: number, form: string, boxMode: boolean, manual?: Set<number>) {
    this.formBtn.disabled = !form; const fl = this.formBtn.querySelector('.lb'); if (fl && fl.textContent !== (form || '陣')) fl.textContent = form || '陣';
    this.haltBtn.disabled = selected.size === 0; this.retreatBtn.disabled = selected.size === 0;
    this.boxBtn.setAttribute('aria-pressed', String(boxMode));
    const left = Math.max(0, 600 - t);
    this.clock.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    this.armyBars.forEach((b, i) => { b.style.width = `${this.armyExact[i] ? army[i] : army[i] > 66 ? 83 : army[i] > 33 ? 50 : 17}%`; });
    this.av.forEach((el, i) => {
      const v = army[i];
      if (!this.armyExact[i]) { el.textContent = v > 66 ? '強' : v > 33 ? '中' : '弱'; el.className = 'av'; el.title = '我方軍師不在，無法得知敵方確切軍勢'; return; }
      el.textContent = String(Math.round(v)); el.title = '';
      el.className = 'av' + (v < this.collapseAt ? ' crit' : v < this.collapseAt + 15 ? ' low' : v > 80 ? ' high' : '');
    });
    if (paused !== this.lastPaused) {
      this.lastPaused = paused;
      this.pauseBtn.setAttribute('aria-pressed', String(paused));
      this.pauseBtn.setAttribute('aria-label', paused ? '繼續' : '暫停');
      this.pauseBtn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    }
    if (speed !== this.lastSpeed) { this.lastSpeed = speed; this.speedBtn.textContent = `${speed}×`; }
    for (const u of units) {
      const c = this.cards.get(u.id); if (!c) continue;
      c.classList.toggle('sel', selected.has(u.id));
      c.classList.toggle('manual', !!manual?.has(u.id));
      c.hidden = u.state === 'gone' || u.state === 'shattered';
      c.classList.toggle('rout', u.state === 'rout');
      c.querySelector('.men')!.textContent = String(u.men);
      const mr = c.querySelector<HTMLElement>('.mrt')!; if (u.merit > 0) { mr.hidden = false; mr.textContent = '★'.repeat(Math.min(3, u.merit)); mr.title = `功績 ${u.merit}`; } else mr.hidden = true;
      const m = morale(u);
      const bar = c.querySelector<HTMLElement>('.mor i')!;
      bar.style.width = `${m}%`;
      bar.style.background = m >= 80 ? '#7fb36a' : m >= 50 ? '#c9b458' : m >= 25 ? '#d0803c' : '#c0392b';
    }
  }
  armyExact = [true, true]; collapseAt = 25;
  setArmyTicks(collapse: number, high: number) {
    this.collapseAt = collapse;
    this.bars.forEach((b, i) => {
      const prop = i === 0 ? 'right' : 'left';
      b.querySelector<HTMLElement>('.tk.c')!.style[prop] = `${collapse}%`;
      b.querySelector<HTMLElement>('.tk.h')!.style[prop] = `${high}%`;
      b.title = `軍勢：低於 ${collapse} 總崩潰；高於 ${high} 全軍士氣緩升`;
    });
  }
  setHold(side: number, left: number) {
    if (side < 0) { this.holdEl.hidden = true; return; }
    this.holdEl.hidden = false; this.holdEl.className = `hold s${side}`;
    this.holdEl.textContent = `${side === 0 ? '武田' : '上杉'}軍控制全部據點：${Math.ceil(left)} 秒後勝利`;
  }
  setSkillReady(enabled: boolean, ready: boolean) { this.skillBtn.disabled = !enabled; this.skillBtn.classList.toggle('ready', ready); }
  setCardReady(id: number, ready: boolean) { this.cards.get(id)?.classList.toggle('ready', ready); }
  prompt(text: string | null) { this.promptEl.hidden = text === null; if (text !== null) this.promptEl.querySelector('span')!.textContent = text; }
  // 忍者旗牌：點一下選下一位忍者，連點兩下鏡頭移過去
  addNinjaCard(onTap: (dbl: boolean) => void, clan?: string) {
    const b = document.createElement('button'); b.className = 'card nin'; b.type = 'button'; b.title = '忍者'; b.setAttribute('aria-label', '忍者');
    b.innerHTML = `${kanBox('kan', '忍', '#2a262e', clan ? ninjaPortrait(clan) : undefined)}<span class="men">0</span><span class="mor"><i style="background:#c9a227"></i></span><span class="rdy"></span><span class="txt"><span class="t">忍者眾</span><span class="c"></span></span>`;
    let last = 0;
    b.addEventListener('click', () => { const now = performance.now(); onTap(now - last < 350); last = now; });
    this.root.querySelector('.cards')!.appendChild(b); this.ninCard = b;
  }
  updateNinjaCard(alive: number, cdFrac: number, clanName: string, selected: boolean) {
    const b = this.ninCard; if (!b) return;
    b.querySelector('.men')!.textContent = String(alive);
    b.querySelector<HTMLElement>('.mor i')!.style.width = `${(1 - cdFrac) * 100}%`;
    b.querySelector('.c')!.textContent = clanName;
    b.classList.toggle('ready', alive > 0 && cdFrac <= 0); b.classList.toggle('sel', selected); b.hidden = alive === 0;
  }
  // 出陣前：選擇忍者眾
  showSetup(clans: { id: string; html: string }[], current: string, foe: string, onPick: (id: string) => void, onGo: () => void, onHelp: () => void) {
    const el = this.root.querySelector<HTMLElement>('.setup')!;
    el.innerHTML = `<div class="sheet" role="dialog" aria-label="出陣準備"><h2>川中島・出陣</h2>
      <p class="lead">你是武田信玄。選擇隨軍的忍者眾，再出陣。</p>
      <div class="clans">${clans.map(c => `<button type="button" class="clan" data-id="${c.id}" aria-pressed="${c.id === current}">${c.html}</button>`).join('')}</div>
      <div class="row2"><button type="button" class="go">出陣</button><button type="button" class="ghost">操作說明</button><span class="foe">${foe}</span></div></div>`;
    el.hidden = false;
    el.querySelectorAll<HTMLButtonElement>('.clan').forEach(b => b.onclick = () => {
      el.querySelectorAll('.clan').forEach(x => x.setAttribute('aria-pressed', String(x === b))); onPick(b.dataset.id!);
    });
    el.querySelector<HTMLButtonElement>('.go')!.onclick = () => { el.hidden = true; onGo(); };
    el.querySelector<HTMLButtonElement>('.ghost')!.onclick = () => onHelp();
  }
  setupOpen() { return !this.root.querySelector<HTMLElement>('.setup')!.hidden; }
  setWarExtra(html: string) { const el = this.root.querySelector<HTMLElement>('.war .extra'); if (el) el.innerHTML = html; }
  // 換將後重畫旗牌（肖像、名字）
  refreshCard(u: Unit) {
    const b = this.cards.get(u.id); if (!b) return;
    b.setAttribute('aria-label', `${TYPE_NAME[u.type]}・${u.cmd || '援軍'}`); b.title = `${TYPE_NAME[u.type]}・${u.cmd || '援軍'}`;
    b.querySelector('.kan')!.outerHTML = kanBox('kan', KANJI[u.type], u.side === 0 ? 'var(--takeda)' : 'var(--uesugi)', portraitOf(u.cmd), unitIcon(u.type));
    b.querySelector('.c')!.textContent = u.cmd || '援軍';
  }
  // 出陣畫面（含觀戰模式）
  showSetup2(o: {
    mode: 'play' | 'watch'; clans0: { id: string; html: string; short: string }[]; clan0: string; clans1: { id: string; short: string }[]; clan1: string;
    onMode: (m: 'play' | 'watch') => void; onPick0: (id: string) => void; onPick1: (id: string) => void; onGo: () => void; onHelp: () => void; onNew: () => void;
    bg?: string; // 背景插畫
    war?: { rows: { key: string; label: string; opts: { id: string; label: string }[]; cur: string; note?: string }[]; onPick: (key: string, id: string) => void;
      extra?: string; onExtra?: (act: string) => void }; // 軍議（大名模式）；extra 是配置與將領區塊（data-x 按鈕）
  }) {
    const el = this.root.querySelector<HTMLElement>('.setup')!;
    const play = o.mode === 'play';
    el.innerHTML = `<div class="sheet" role="dialog" aria-label="出陣準備"><h2>川中島・出陣</h2>
      <div class="modes"><button type="button" data-m="play" aria-pressed="${play}">親自指揮武田軍</button><button type="button" data-m="watch" aria-pressed="${!play}">觀戰：AI 對 AI</button></div>
      ${play ? `<div class="clans">${o.clans0.map(c => `<button type="button" class="clan" data-c0="${c.id}" aria-pressed="${c.id === o.clan0}">${c.html}</button>`).join('')}</div>
        ${o.war ? `<div class="war"><h3>軍議</h3>${o.war.rows.map(r => `<div class="pick"><span>${r.label}</span>${r.opts.map(x => `<button type="button" class="chip" data-w="${r.key}" data-v="${x.id}" aria-pressed="${x.id === r.cur}">${x.label}</button>`).join('')}${r.note ? `<p class="m">${r.note}</p>` : ''}</div>`).join('')}<div class="extra">${o.war.extra ?? ''}</div></div>` : ''}`
        : `<div class="pick"><span style="color:#e3a39c">武田忍者眾</span>${o.clans0.map(c => `<button type="button" class="chip" data-c0="${c.id}" aria-pressed="${c.id === o.clan0}">${c.short}</button>`).join('')}</div>
           <div class="pick"><span style="color:#a9bde0">上杉忍者眾</span>${o.clans1.map(c => `<button type="button" class="chip" data-c1="${c.id}" aria-pressed="${c.id === o.clan1}">${c.short}</button>`).join('')}</div>
           <p class="lead" style="display:block">雙方都由 AI 指揮。導播鏡頭會跟著戰況走，拖曳或縮放就改手動，10 秒後交回導播；點任一部隊可查看並跟隨。右側「視」切換全知或單方視野。</p>`}
      <div class="row2"><button type="button" class="go">${play ? '出陣' : '開始觀戰'}</button><button type="button" class="ghost" data-help>操作說明</button>${play ? '' : '<button type="button" class="ghost" data-new>換一場佈陣</button>'}<span class="foe">${play ? '敵方忍者眾：開戰後才知道' : ''}</span></div></div>`;
    el.style.backgroundImage = o.bg ? `linear-gradient(rgba(10,9,7,0.45), rgba(10,9,7,0.7)), url(${o.bg})` : '';
    el.hidden = false;
    el.querySelectorAll<HTMLButtonElement>('[data-m]').forEach(b => b.onclick = () => { if (b.dataset.m !== o.mode) o.onMode(b.dataset.m as 'play' | 'watch'); });
    el.querySelectorAll<HTMLButtonElement>('[data-c0]').forEach(b => b.onclick = () => o.onPick0(b.dataset.c0!));
    el.querySelectorAll<HTMLButtonElement>('[data-c1]').forEach(b => b.onclick = () => o.onPick1(b.dataset.c1!));
    el.querySelector<HTMLElement>('.war .extra')?.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-x]'); if (b && o.war?.onExtra) o.war.onExtra(b.dataset.x!); });
    el.querySelectorAll<HTMLButtonElement>('[data-w]').forEach(b => b.onclick = () => {
      el.querySelectorAll<HTMLButtonElement>(`[data-w="${b.dataset.w}"]`).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      o.war!.onPick(b.dataset.w!, b.dataset.v!);
    });
    el.querySelector<HTMLButtonElement>('.go')!.onclick = () => { el.hidden = true; o.onGo(); };
    el.querySelector<HTMLButtonElement>('[data-help]')!.onclick = () => o.onHelp();
    el.querySelector<HTMLButtonElement>('[data-new]')?.addEventListener('click', () => o.onNew());
  }
  setWatch(on: boolean, onCam: () => void, onVis: () => void) {
    this.root.classList.toggle('watch', on);
    this.root.querySelector<HTMLButtonElement>('#b-cam')!.onclick = onCam;
    this.root.querySelector<HTMLButtonElement>('#b-vis')!.onclick = onVis;
  }
  setWatchState(cam: boolean, vis: string) {
    const c = this.root.querySelector<HTMLButtonElement>('#b-cam')!; c.setAttribute('aria-pressed', String(cam));
    const v = this.root.querySelector<HTMLButtonElement>('#b-vis .lb')!; if (v.textContent !== vis) v.textContent = vis;
  }
  // 戰報（觀戰）
  feed(time: string, text: string, side: number, big = false) {
    const f = this.root.querySelector('.feed')!;
    const d = document.createElement('div'); d.className = `s${side}${big ? ' big' : ''}`;
    d.innerHTML = `<span class="tm">${time}</span>${text}`;
    f.prepend(d);
    while (f.children.length > 6) f.lastElementChild!.remove();
    setTimeout(() => d.classList.add('old'), 20000); setTimeout(() => d.remove(), 21500);
  }
  showEnd(html: string, buttons: { label: string; fn: () => void }[], bg?: string) {
    const el = this.root.querySelector<HTMLElement>('.end')!;
    el.innerHTML = `<div class="sheet" role="dialog" aria-label="戰果">${html}<div class="btns">${buttons.map((b, i) => `<button type="button" data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
    el.style.backgroundImage = bg ? `linear-gradient(rgba(10,9,7,0.5), rgba(10,9,7,0.72)), url(${bg})` : '';
    el.hidden = false;
    el.querySelectorAll<HTMLButtonElement>('[data-i]').forEach(b => b.onclick = () => buttons[+b.dataset.i!].fn());
  }
  hideEnd() { this.root.querySelector<HTMLElement>('.end')!.hidden = true; }
  // 軍勢變化：在對應的軍勢條下方浮出
  armyEvent(side: 0 | 1, d: number, label: string) {
    if (!this.armyExact[side]) return;
    const r = this.bars[side].getBoundingClientRect();
    const el = document.createElement('div'); el.className = `aev ${d < 0 ? 'neg' : 'pos'}`;
    const busy = this.root.querySelectorAll(`.aev[data-s="${side}"]`).length;
    if (busy >= 3) return;
    el.dataset.s = String(side);
    el.textContent = `${label} ${d > 0 ? '+' : '−'}${Math.abs(d) < 1 ? Math.abs(d).toFixed(1) : Math.round(Math.abs(d))}`;
    el.style.left = `${r.left + r.width / 2}px`; el.style.top = `${r.bottom + 30 + busy * 20}px`;
    this.root.appendChild(el); setTimeout(() => el.remove(), 2500);
  }
  setInfo(html: string | null) {
    if (html === null) { this.infoEl.hidden = true; this.infoKey = ''; return; }
    this.infoEl.hidden = false;
    if (html !== this.infoKey) { this.infoKey = html; this.infoEl.innerHTML = html; }
  }
  setFps(f: number, ms: number, men: number, calls: number, pr: number) {
    this.fps.innerHTML = `<b>${f.toFixed(0)} fps</b> · ${men} 人 · ${ms.toFixed(1)} ms · ${calls} draw · ${pr}×`;
    this.fps.classList.toggle('low', f < 30);
  }
}
