// ===== アプリ共通ステート =====
let selCId = null, selTIds = new Set(), selCardId = null, isCard = false, editId = -1, originalCreatedAt = "", mode = 'SAVE', selItems = new Set();
let currentOffset = 0;
let isInitialized   = false;
let settingsDirty    = false;
let _loadingSettings = false;  // loadSettingsFromDB 実行中は dirty を立てない
let isMemoOpen = false;

// ===== アカウントステート =====
let acctInfo = { current: 1, accounts: [
{id:1, name:"アカウント1"},
{id:2, name:"アカウント2"},
{id:3, name:"アカウント3"}
]};

// ===== 分析ステート =====
let anTab        = 'trend';
let anPreset     = 'MONTH';
let anUseClosing = null;  // null=設定タブと同期、true/false=分析タブで上書き
let anShowFixed    = false; // 固定費をグラフ/集計に反映するか
let anHideNoBudget    = false; // 予算消化率：未設定月を除外するか
let _anEarliestDate   = null;  // 最古の支出記録日（キャッシュ）
let anDateFrom   = '';
let anDateTo     = '';
let anCatIds     = [];
let anTagIds     = [];
let anMemo       = '';   // 分析タブのメモ絞り込み
let anChart      = null;  // Chart.js インスタンス
let anPtsBreakdown = false; // ポイントタブのカテゴリ内訳表示フラグ

// ===== 設定ステート（S が唯一の真実の源泉）=====
function _defaultSettings() {
return {
displayMode : 'SIMPLE',
periodUnit  : 'MONTH',
seasonType  : 'Q',
simpleView  : 'EXP',
pointsOn    : true,
pointsMode  : 'TOP3',
pointsCards : [],       // 選択カードIDリスト
fixedOn     : false,
fixedMode   : 'BUDGET',   // 'ADD'=支出加算, 'BUDGET'=予算減算, 'NONE'=表示のみ
closingOn   : false,
periodStartDay: '25',  // 予算期間の起点日（旧 closingDay/payday/budgetLink を統合）
appStartMonth : '',    // 利用開始月 YYYY-MM（集計・集計除外の下限）
baseBudget  : '',
budgetMode  : 'BM_AUTO',
rankingOn   : false,
rankTargets : [],
rankOrder   : 'HIGH',
rankNoZero  : false,
compareOn   : false,
cmpTargets  : [],
cmpPercent  : false,
bizMode     : false,    // true = 売上管理モード
};
}
let S = _defaultSettings();
// 後方互換エイリアス（既存コードが参照する変数）
Object.defineProperty(window,'sDisplayMode', {get:()=>S.displayMode, set:v=>{S.displayMode=v;}});
// periodStartDay の後方互換エイリアス（旧 budgetLink アクセスのため）
Object.defineProperty(window,'sBudgetLink', {get:()=>S.periodStartDay, set:v=>{S.periodStartDay=v;}});
Object.defineProperty(window,'sPeriodStartDay',{get:()=>S.periodStartDay,set:v=>{S.periodStartDay=v;}});
Object.defineProperty(window,'sBudgetMode',  {get:()=>S.budgetMode,  set:v=>{S.budgetMode=v;}});
Object.defineProperty(window,'sRankOrder',   {get:()=>S.rankOrder,   set:v=>{S.rankOrder=v;}});
Object.defineProperty(window,'sPointsMode',  {get:()=>S.pointsMode,  set:v=>{S.pointsMode=v;}});
Object.defineProperty(window,'sPointsCardSel',{get:()=>new Set(S.pointsCards), set:v=>{S.pointsCards=[...v];}});
Object.defineProperty(window,'sRankTargets', {get:()=>new Set(S.rankTargets),  set:v=>{S.rankTargets=[...v];}});
Object.defineProperty(window,'sCmpTargets',  {get:()=>new Set(S.cmpTargets),   set:v=>{S.cmpTargets=[...v];}});
Object.defineProperty(window,'sRankingOn',   {get:()=>S.rankingOn,  set:v=>{S.rankingOn=v;}});
Object.defineProperty(window,'sCompareOn',   {get:()=>S.compareOn,  set:v=>{S.compareOn=v;}});
Object.defineProperty(window,'sRankNoZero',  {get:()=>S.rankNoZero, set:v=>{S.rankNoZero=v;}});
Object.defineProperty(window,'sCmpPercent',  {get:()=>S.cmpPercent, set:v=>{S.cmpPercent=v;}});
Object.defineProperty(window,'sClosingOn',   {get:()=>S.closingOn,  set:v=>{S.closingOn=v;}});
Object.defineProperty(window,'sFixedOn',     {get:()=>S.fixedOn,    set:v=>{S.fixedOn=v;}});
Object.defineProperty(window,'sPointsOn',    {get:()=>S.pointsOn,   set:v=>{S.pointsOn=v;}});

// ===== 売上管理モード ヘルパー =====
function isBizMode() {
return S.bizMode === true || S.bizMode === 'true';
}
// 売上/支出 の表示文字列を返す
function _bizLabel(bizText, defaultText) {
return isBizMode() ? bizText : defaultText;
}

// ===== バイブレーション =====
function vibe() {
try { if (navigator.vibrate) navigator.vibrate(45); } catch(e) {}
}

// ===== バックボタン階層処理 =====
// MainActivity の onBackPressed() から呼ばれる
function handleBack() {
// --- 優先度1: bm-sub（管理UI内の追加・編集ポップアップ）が開いている ---
const bmSub = document.getElementById('bm-sub');
if (bmSub && bmSub.style.display === 'flex') {
_bmCloseSub();
return;
}
// --- 優先度2: bm-modal（予算・固定費管理UI）が開いている ---
const bmModal = document.getElementById('bm-modal');
if (bmModal) {
closeBudgetManagerModal();
return;
}
// --- 優先度3: app-modal が開いている ---
const appModal = document.getElementById('app-modal');
if (appModal && appModal.style.display === 'flex') {
closeModal();
return;
}
// --- 優先度4: 各種モーダルが開いている ---
const srchModal = document.getElementById('search-modal');
if (srchModal && srchModal.style.display === 'flex') { closeSearch(); return; }
const anModal = document.getElementById('an-filter-modal');
if (anModal && anModal.style.display === 'flex') { closeAnFilter(); return; }
const acctDd = document.getElementById('acct-dropdown');
if (acctDd && acctDd.style.display !== 'none') { closeAcctDropdown(); return; }
// --- 優先度5: 履歴タブで選択中 ---
const histView = document.getElementById('view-history');
if (histView && histView.style.display === 'block' && selItems.size > 0) {
showModal("確認", "選択を解除しますか？", false, (r) => {
if (!r) return;
clearSelections();
});
return;
}
// --- 優先度6: 入力タブ以外にいる ---
const inputView = document.getElementById('view-input');
if (!inputView || inputView.style.display !== 'block') {
const settingsView = document.getElementById('view-settings');
if (settingsView && settingsView.style.display === 'block' && settingsDirty) {
showModal("設定の変更", "変更した設定を適用しますか？\n（キャンセルで設定画面に戻ります）", false, (r) => {
if (r) { saveSettingsToDB(); } else { settingsDirty = false; }
doNav('input');
});
return;
}
doNav('input');
return;
}
// --- 優先度7: 入力タブにいる → 終了確認 ---
showModal("アプリを終了", "KAKEIBO PROを終了しますか？", false, (r) => {
if (r) { try { DB.exitApp(); } catch(e) {} }
});
}

// 後方互換（直接呼ばれる箇所のため残す）
function showExitDialog() { handleBack(); }

// ===== 初期化 =====
window.onload = () => { resetDate(); attemptInitialization(); };

function attemptInitialization() {
if (typeof DB !== "undefined") { initApp(); } else { setTimeout(attemptInitialization, 200); }
}

function _escHtml(s) {
return String(s ?? '')
.replace(/&/g, '&amp;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
.replace(/"/g, '&quot;')
.replace(/'/g, '&#39;');
}

function initApp() {
if (isInitialized) return;
isInitialized = true;
try { initSettingsUI(); }     catch(e) { console.error('initSettingsUI:', e); }
// 初回起動判定: settings が全く未保存 → 初期設定を適用
try {
const _existing = JSON.parse(DB.getAllSettings() || '{}');
if (Object.keys(_existing).length === 0) {
_applyInitialSettings();
} else {
loadSettingsFromDB();
}
} catch(e) { console.error('loadSettingsFromDB:', e); }
try { initAccount(); }        catch(e) { console.error('initAccount:', e); }
try { refresh(); }            catch(e) { console.error('refresh:', e); }
try { _autoRolloverBudgetIfNeeded(); } catch(e) { console.error('autoRollover:', e); }
try { updateSummary(); }      catch(e) { console.error('updateSummary:', e); }
try { _renderBmCurrentSummary(); } catch(e) {}
setTimeout(() => {
try { renderInfoPanel(); } catch(e) { console.error('renderInfoPanel:', e); }
// BM_MONTHLY / BM_ONCE: 期間開始日チェック
try { checkBudgetPeriodStart(); } catch(e) {}
}, 300);
}

// ===== BM_AUTO 自動繰り越し =====
function _autoRolloverBudgetIfNeeded(periodOverride) {
if (typeof DB === 'undefined') return false;
if ((S.budgetMode || 'BM_AUTO') !== 'BM_AUTO') return false;
if (typeof DB.getBudgetForPeriod !== 'function') return false;
const period = periodOverride || getCurrentPeriod();
let info;
try {
info = JSON.parse(DB.getBudgetForPeriod(period.from, period.to));
} catch(e) { return false; }
if (info.baseAmount >= 0) return false; // 既に設定済み

const curDays = Math.round((_parseYmd(period.to) - _parseYmd(period.from)) / 86400000) + 1;
const spanBucket = days => days <= 10 ? 'W' : days <= 35 ? 'M' : days <= 200 ? 'S' : 'Y';
const curBucket = spanBucket(curDays);

let rolledAmount = -1;
try {
const hist = JSON.parse(DB.getBudgetHistory(36) || '[]');
for (const bp of hist) {
if (!bp.periodFrom || bp.periodFrom >= period.from) continue;
if (bp.baseAmount === undefined || bp.baseAmount < 0) continue;
const bpDays = Math.round((_parseYmd(bp.periodTo) - _parseYmd(bp.periodFrom)) / 86400000) + 1;
if (spanBucket(bpDays) === curBucket) {
rolledAmount = bp.baseAmount;
break;
}
}
if (rolledAmount < 0 && hist.length === 0) {
// v31以前からの移行フォールバック（budget_periodsが空のときのみ）
const legacy = parseInt(S.baseBudget);
if (!isNaN(legacy) && legacy >= 0 && S.baseBudget !== '') {
rolledAmount = legacy;
}
}
} catch(e) {}

if (rolledAmount >= 0) {
DB.setBudgetBase(period.from, period.to, rolledAmount);
S.baseBudget = String(rolledAmount);
try { DB.setSetting('baseBudget', String(rolledAmount)); } catch(e) {}
return true;
}
return false;
}

// ===== 期間開始チェック（BM_MONTHLY / BM_ONCE / BM_AUTO）=====
function checkBudgetPeriodStart() {
if (typeof DB === 'undefined') return;
const mode = S.budgetMode || 'BM_AUTO';
if (mode === 'BM_AUTO') {
if (_autoRolloverBudgetIfNeeded()) {
updateSummary();
_renderBmCurrentSummary();
}
return;
}

const period = getCurrentPeriod();
let lastChecked = S._bmLastChecked || '';
if (!lastChecked) {
try { lastChecked = DB.getSetting('bmLastChecked', '') || ''; } catch(e) {}
}
if (lastChecked === period.from) return;  // 同じ期間は1回のみ

// 予算が設定されているか確認
let hasBudget = false;
try {
const info = JSON.parse(DB.getBudgetForPeriod(period.from, period.to));
hasBudget = info.baseAmount >= 0 || info.totalAmount >= 0;
} catch(e) {}

S._bmLastChecked = period.from;
try { DB.setSetting('bmLastChecked', period.from); } catch(e) {}

// 未設定のときだけ通知
if (!hasBudget) {
const msgText = mode === 'BM_MONTHLY'
? `新しい期間（${period.label}）が始まりました。<br>予算を設定してください。`
: `新しい期間（${period.label}）が始まりました。<br>今期の予算を設定してください。`;
showModal('💰 予算の設定', msgText, false, (r) => {
if (r) { setTimeout(() => openBudgetManagerModal(), 200); }
else {
// キャンセル → 支出額/売上額のみ表示に切り替え
S.simpleView = 'EXP';
DB.setSetting('simpleView', 'EXP');
const svEl = document.getElementById('set-simple-view');
if (svEl) svEl.value = 'EXP';
updateSummary();
}
});
document.getElementById('modal-ok').innerText = '設定する';
}
}

// ===== 日付 =====
function resetDate() {
const t = new Date();
t.setMinutes(t.getMinutes() - t.getTimezoneOffset());
const val = t.toISOString().split('T')[0];
document.getElementById('date').value = val;
updateDateLabel(val);
}

function updateDateLabel(val) {
if (!val) return;
const parts = val.split('-');
document.getElementById('dateLabel').innerText = `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

function openDatePicker() {
const inp = document.getElementById('date');
inp.style.display = 'block';
inp.style.position = 'absolute';
inp.style.opacity = '0';
inp.style.width = '1px';
inp.style.height = '1px';
inp.focus();
inp.click();
}

function onDateChange() {
updateDateLabel(document.getElementById('date').value);
document.getElementById('date').style.display = 'none';
}

// ===== タイムスタンプ整形 =====
function formatCreatedAt(ts) {
if (!ts) return '';
try {
const d = new Date(ts.replace(' ', 'T'));
if (isNaN(d.getTime())) return '';
const y   = d.getFullYear();
const m   = d.getMonth() + 1;
const day = d.getDate();
const h   = String(d.getHours()).padStart(2, '0');
const min = String(d.getMinutes()).padStart(2, '0');
return `${y}/${m}/${day} ${h}:${min}`;
} catch(e) { return ''; }
}

// ===== メモトグル =====
function toggleMemo() {
isMemoOpen = !isMemoOpen;
document.getElementById('memoArea').style.display = isMemoOpen ? 'block' : 'none';
document.getElementById('memoToggleBtn').innerText = isMemoOpen ? 'メモ ×' : 'メモ ＋';
}

// ===== 日付・締め日・シーズン共通計算ヘルパー =====
function _pad2(n) { return String(n).padStart(2, '0'); }
function _ymd(d) { return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`; }
function _todayYmd() { return _ymd(new Date()); }
function _parseYmd(s) { return new Date(s + 'T00:00:00'); }
function _lastDayOfMonth(y, m) { return new Date(y, m, 0).getDate(); } // m=1-indexed

// 締日（closeY年closeM月anchor日）を月末とする1期間の {from, to, closeY, closeM} を返す
// 開始日 = 前月の締日の翌日（anchor>=28でも日付が重複・欠損しない）
function _calcClosingPeriodForMonth(closeY, closeM, anchor) {
const py = closeM === 1 ? closeY - 1 : closeY;
const pm = closeM === 1 ? 12 : closeM - 1;
const prevCloseDay = Math.min(anchor, _lastDayOfMonth(py, pm));
const fromDate = new Date(py, pm - 1, prevCloseDay + 1);
const toDay = Math.min(anchor, _lastDayOfMonth(closeY, closeM));
const toDate = new Date(closeY, closeM - 1, toDay);
return {
from: _ymd(fromDate),
to:   _ymd(toDate),
closeY,
closeM,
label: `${fromDate.getMonth() + 1}/${fromDate.getDate()}〜${toDate.getMonth() + 1}/${toDate.getDate()}`
};
}

// 任意の日付 dateObj (Date) が属する締め期間を返す
function _calcClosingPeriodForDate(dateObj, anchorOverride) {
const anchor = parseInt(anchorOverride ?? S.periodStartDay) || 25;
const cy = dateObj.getFullYear(), cm = dateObj.getMonth() + 1;
const cDay = Math.min(anchor, _lastDayOfMonth(cy, cm));
if (dateObj.getDate() <= cDay) {
return _calcClosingPeriodForMonth(cy, cm, anchor);
}
const ny = cm === 12 ? cy + 1 : cy;
const nm = cm === 12 ? 1 : cm + 1;
return _calcClosingPeriodForMonth(ny, nm, anchor);
}

// 現在の期間開始日 currentFrom ("YYYY-MM-DD") から1期前の締め期間を返す
function _calcPrevClosingPeriod(currentFrom, anchorOverride) {
const anchor = parseInt(anchorOverride ?? S.periodStartDay) || 25;
const d = _parseYmd(currentFrom);
d.setDate(d.getDate() - 1);
return _calcClosingPeriodForDate(d, anchor);
}

// 現在の期間終了日 currentTo ("YYYY-MM-DD") から1期後の締め期間を返す
function _calcNextClosingPeriod(currentTo, anchorOverride) {
const anchor = parseInt(anchorOverride ?? S.periodStartDay) || 25;
const d = _parseYmd(currentTo);
d.setDate(d.getDate() + 1);
return _calcClosingPeriodForDate(d, anchor);
}

// シーズン期間計算（dateObj 基準、dir=0 で現在、±1 で前後シーズン）
function _calcSeasonPeriod(dateObj, seasonType, useClosing, anchor, dir = 0) {
let refY, refM;
if (useClosing) {
const cp = _calcClosingPeriodForDate(dateObj, anchor);
refY = cp.closeY;
refM = cp.closeM;
} else {
refY = dateObj.getFullYear();
refM = dateObj.getMonth() + 1;
}

let startY, startM, endY, endM, label;
if (seasonType === 'H') {
let idx = refM <= 6 ? 0 : 1;
let totalH = refY * 2 + idx + dir;
startY = Math.floor(totalH / 2);
const hIdx = ((totalH % 2) + 2) % 2;
startM = hIdx === 0 ? 1 : 7;
endY = startY;
endM = hIdx === 0 ? 6 : 12;
label = `${startY}年 ${hIdx === 0 ? '上半期' : '下半期'}`;
} else if (seasonType === 'FY') {
const curFyStart = refM >= 4 ? refY : refY - 1;
startY = curFyStart + dir;
startM = 4;
endY = startY + 1;
endM = 3;
label = `${startY}年度`;
} else {
// 'Q': 四半期
const qIdx = Math.floor((refM - 1) / 3);
const totalQ = refY * 4 + qIdx + dir;
startY = Math.floor(totalQ / 4);
const q = ((totalQ % 4) + 4) % 4;
startM = q * 3 + 1;
endY = startY;
endM = startM + 2;
label = `${startY}年 Q${q + 1}`;
}

if (useClosing) {
const pStart = _calcClosingPeriodForMonth(startY, startM, anchor);
const pEnd   = _calcClosingPeriodForMonth(endY, endM, anchor);
return { from: pStart.from, to: pEnd.to, label, mode: 'SEASON' };
}
return {
from: `${startY}-${_pad2(startM)}-01`,
to:   `${endY}-${_pad2(endM)}-${_pad2(_lastDayOfMonth(endY, endM))}`,
label,
mode: 'SEASON'
};
}

// 固定費の参照月初日 (YYYY-MM-01) を統一計算
function _getFixedLookupDate(periodFrom, periodTo, useClosing) {
if (useClosing && periodFrom && periodTo) {
const from = _parseYmd(periodFrom);
const to   = _parseYmd(periodTo);
const mid  = new Date((from.getTime() + to.getTime()) / 2);
return `${mid.getFullYear()}-${_pad2(mid.getMonth() + 1)}-01`;
}
return periodFrom ? periodFrom.slice(0, 7) + '-01' : `${new Date().getFullYear()}-${_pad2(new Date().getMonth() + 1)}-01`;
}

// 現在期間に応じた固定費合計を取得（月・締めは1期分、シーズン・年は対象月数を合算）
function _getPeriodFixedTotal(period) {
if (!S.fixedOn || typeof DB === 'undefined') return 0;
try {
if (typeof DB.getFixedCostHistoryAt !== 'function') {
return DB.getFixedCostsTotal() || 0;
}
if (period.mode === 'SEASON' || period.mode === 'YEAR') {
let total = 0;
if (S.closingOn && period.mode === 'SEASON') {
const anchor = parseInt(S.periodStartDay) || 25;
let cur = _calcClosingPeriodForDate(_parseYmd(period.from), anchor);
for (let i = 0; i < 24 && cur.from <= period.to; i++) {
const lookup = _getFixedLookupDate(cur.from, cur.to, true);
const items = JSON.parse(DB.getFixedCostHistoryAt(lookup) || '[]');
total += items.reduce((s, x) => s + x.amount, 0);
cur = _calcNextClosingPeriod(cur.to, anchor);
}
} else {
let y = parseInt(period.from.slice(0, 4)), m = parseInt(period.from.slice(5, 7));
const endY = parseInt(period.to.slice(0, 4)), endM = parseInt(period.to.slice(5, 7));
while (y < endY || (y === endY && m <= endM)) {
const items = JSON.parse(DB.getFixedCostHistoryAt(`${y}-${_pad2(m)}-01`) || '[]');
total += items.reduce((s, x) => s + x.amount, 0);
m++; if (m > 12) { m = 1; y++; }
}
}
return total;
}
const lookup = _getFixedLookupDate(period.from, period.to, S.closingOn);
const items = JSON.parse(DB.getFixedCostHistoryAt(lookup) || '[]');
return items.reduce((s, x) => s + x.amount, 0);
} catch(e) {
return typeof DB.getFixedCostsTotal === 'function' ? (DB.getFixedCostsTotal() || 0) : 0;
}
}

// ===== 期間計算エンジン =====
/**
* 設定(S)に基づいて現在の集計期間 {from, to, label} を返す
* from/to: "YYYY-MM-DD" 形式
*/
function getCurrentPeriod() {
const now = new Date();

// ── 今週（月曜〜日曜） ──
if (S.periodUnit === 'WEEK') {
const dow = now.getDay(); // 0=日, 1=月...
const diffToMon = (dow === 0) ? -6 : 1 - dow; // 月曜への差分
const mon = new Date(now); mon.setDate(now.getDate() + diffToMon);
const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
const from  = _ymd(mon);
const to    = _ymd(sun);
const label = `${mon.getMonth()+1}/${mon.getDate()}〜${sun.getMonth()+1}/${sun.getDate()}`;
return { from, to, label, mode: 'WEEK' };
}

// ── 今年（1/1〜12/31） ──
if (S.periodUnit === 'YEAR') {
const y    = now.getFullYear();
return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y}年`, mode: 'YEAR' };
}

// ── シーズン（四半期・半期・年度） ──
if (S.periodUnit === 'SEASON') {
const anchor = parseInt(S.periodStartDay) || 25;
return _calcSeasonPeriod(now, S.seasonType || 'Q', !!S.closingOn, anchor, 0);
}

// ── 締め日連動OFF → 月初基準（1日〜月末） ──
if (!S.closingOn) {
const y = now.getFullYear(), m = now.getMonth() + 1;
const from = `${y}-${_pad2(m)}-01`;
const to   = `${y}-${_pad2(m)}-${_pad2(_lastDayOfMonth(y, m))}`;
return { from, to, label: `${m}月`, mode: 'MONTH' };
}

// ── 締め日/給与日ベースの期間計算 ──
const anchor = parseInt(S.periodStartDay) || 25;
const cp = _calcClosingPeriodForDate(now, anchor);
return { from: cp.from, to: cp.to, label: cp.label, mode: 'CLOSING' };
}

// ===== サマリー更新 =====
function updateSummary() {
if (typeof DB === 'undefined') return;
try {
const period = getCurrentPeriod();
_autoRolloverBudgetIfNeeded(period);

const _rawExpTotal = DB.getTotalByRange(period.from, period.to) || 0;
const _expenseAmt  = isBizMode() ? _getExpenseTotalForRange(period.from, period.to) : 0;
// 純売上 = raw − 経費エントリ除去 − 経費額控除 = raw − 2*expenseAmt（マイナス許可）
const expTotal     = isBizMode()
? _rawExpTotal - 2 * _expenseAmt
: _rawExpTotal;

// 固定費: 対象期間時点で有効な fixed_cost_history を参照
const fixedTotal = _getPeriodFixedTotal(period);

// 予算: budget_periods ベース（未設定=-1）
let baseBudget = -1;
if (typeof DB.getBudgetForPeriod === 'function') {
try {
const budgetInfo = JSON.parse(DB.getBudgetForPeriod(period.from, period.to));
baseBudget = budgetInfo.totalAmount ?? -1;
} catch(e) {}
} else {
const parsed = parseInt(S.baseBudget);
if (!isNaN(parsed) && S.baseBudget !== '') baseBudget = parsed;
}

const _biz = isBizMode();
const effectiveBudget = (S.fixedOn && S.fixedMode === 'BUDGET' && baseBudget >= 0)
? (_biz ? Math.max(0, baseBudget + fixedTotal) : Math.max(0, baseBudget - fixedTotal))
: Math.max(0, baseBudget);
const displayTotal = (S.fixedOn && S.fixedMode === 'ADD')
? (_biz ? expTotal - fixedTotal : expTotal + fixedTotal)
: expTotal;
// bizMode: 売上が目標を超えたら達成（remain > 0 が good）
const remain = _biz ? displayTotal - effectiveBudget : effectiveBudget - displayTotal;
const over   = remain < 0;

// 期間ラベル
const periodLabel = document.getElementById('summary-period-label');
if (periodLabel) {
periodLabel.innerText = `${period.label}の${_bizLabel('売上', '支出')}`;
}

// 要素取得（HTMLに全IDが静的に存在する前提）
const totalEl     = document.getElementById('summary-total');
const budgetRowEl = document.getElementById('summary-budget-row');
const remainEl    = document.getElementById('summary-budget-remain');
const ofEl        = document.getElementById('summary-budget-of');
const barFillEl   = document.getElementById('summary-bar-fill');
const noBudgetEl  = document.getElementById('summary-no-budget');

// 予算未設定警告（EXP以外で予算未設定の場合）
const hasBudget   = baseBudget >= 0;
const needBudget  = (S.simpleView !== 'EXP') && !hasBudget;
if (noBudgetEl) noBudgetEl.style.display = needBudget ? 'block' : 'none';

// ── simpleView 分岐 ──
if (S.simpleView === 'REMAIN') {
if (totalEl)     totalEl.style.display = 'none';
if (budgetRowEl) budgetRowEl.classList.add('remain-only');
if (hasBudget) {
if (budgetRowEl) budgetRowEl.style.display = 'block';
_fillBudgetRow(remainEl, ofEl, barFillEl, remain, effectiveBudget, displayTotal, over);
} else {
if (budgetRowEl) budgetRowEl.style.display = 'none';
}

} else if (S.simpleView === 'EXP') {
if (totalEl) {
totalEl.style.display = 'block';
totalEl.innerText = (displayTotal < 0 ? '\u2212\u00a5 ' : '\u00a5 ') + Math.abs(displayTotal).toLocaleString();
totalEl.style.color = (_biz && displayTotal < 0) ? '#ef4444' : '';
}
if (budgetRowEl) { budgetRowEl.style.display = 'none'; budgetRowEl.classList.remove('remain-only'); }

} else {
// BOTH
if (totalEl) {
totalEl.style.display = 'block';
totalEl.innerText = (displayTotal < 0 ? '\u2212\u00a5 ' : '\u00a5 ') + Math.abs(displayTotal).toLocaleString();
totalEl.style.color = (_biz && displayTotal < 0) ? '#ef4444' : '';
}
if (budgetRowEl) budgetRowEl.classList.remove('remain-only');
if (hasBudget) {
if (budgetRowEl) budgetRowEl.style.display = 'block';
_fillBudgetRow(remainEl, ofEl, barFillEl, remain, effectiveBudget, displayTotal, over);
} else {
if (budgetRowEl) budgetRowEl.style.display = 'none';
}
}

// 固定費サブ表示
const fixedSubEl = document.getElementById('summary-fixed-sub');
const fixedValEl = document.getElementById('summary-fixed-val');
if (S.fixedOn && S.fixedMode !== 'BUDGET' && fixedTotal > 0) {
const label = isBizMode() ? (S.fixedMode === 'ADD' ? '控除固定費' : '固定費（参考）') : (S.fixedMode === 'ADD' ? 'うち固定費' : '固定費（参考）');
const labelSub = fixedSubEl?.querySelector('.summary-fixed-label');
if (labelSub) labelSub.innerText = label;
if (fixedValEl) fixedValEl.innerText = `¥ ${fixedTotal.toLocaleString()}`;
if (fixedSubEl) fixedSubEl.style.display = 'flex';
} else {
if (fixedSubEl) fixedSubEl.style.display = 'none';
}
_renderBmCurrentSummary();
} catch(e) { console.error('updateSummary:', e); }
}

function _fillBudgetRow(remainEl, ofEl, barFillEl, remain, effectiveBudget, displayTotal, over) {
const rawPct = effectiveBudget > 0 ? Math.round((displayTotal / effectiveBudget) * 100) : (displayTotal > 0 ? 100 : 0);
const pct = Math.max(0, Math.min(100, rawPct));
const biz = isBizMode();
// バークラスを先に決定して remainEl の色と同期させる
const barClass = biz
? (rawPct >= 100 ? 'biz-over' : rawPct >= 85 ? '' : rawPct >= 60 ? 'warn' : 'over')
: (rawPct >= 100 ? 'over'     : rawPct >= 80 ? 'warn' : '');
// remainEl のカラークラス（バーと同じ基準）
const remainColorClass = barClass ? (' ' + barClass) : '';
if (remainEl) {
if (biz) {
remainEl.innerText = over
? `▲ ¥ ${Math.abs(remain).toLocaleString()}`
: `+¥ ${Math.abs(remain).toLocaleString()}`;
} else {
remainEl.innerText = over
? `▲ ¥ ${Math.abs(remain).toLocaleString()}`
: `¥ ${remain.toLocaleString()}`;
}
remainEl.className = 'summary-budget-remain' + remainColorClass;
}
if (ofEl) ofEl.innerText = biz
? `/ 目標 ¥ ${effectiveBudget.toLocaleString()}`
: `/ ¥ ${effectiveBudget.toLocaleString()}`;
if (barFillEl) {
barFillEl.style.width = `${pct}%`;
barFillEl.className = 'summary-bar-fill' + (barClass ? ' ' + barClass : '');
}
}

function _barClass(spent, budget) {
if (budget <= 0) return '';
const pct = spent / budget * 100;
return pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
}

// ===== 固定費合計バッジ更新（設定タブ用）=====
function updateFixedTotalBadge() {
if (typeof DB === 'undefined') return;
try {
const el = document.getElementById('fixed-total-display');
if (!el) return;
if (S.fixedOn) {
const period = getCurrentPeriod();
const total = _getPeriodFixedTotal(period);
el.innerText = `合計 ¥${total.toLocaleString()}`;
el.style.display = 'inline-flex';
} else {
el.style.display = 'none';
}
} catch(e) {}
}

// ===== 設定タブ5「現在期間の予算サマリー」描画 =====
function _renderBmCurrentSummary() {
const el = document.getElementById('bm-current-summary');
if (!el || typeof DB === 'undefined') return;
try {
const period = getCurrentPeriod();
const info = typeof DB.getBudgetForPeriod === 'function'
? JSON.parse(DB.getBudgetForPeriod(period.from, period.to))
: { baseAmount: -1, extraTotal: 0, totalAmount: -1 };
const modeNames = { BM_AUTO: '毎月自動更新', BM_MONTHLY: '毎月手動入力', BM_ONCE: '今期のみ設定' };
const modeText = modeNames[S.budgetMode] || '毎月自動更新';
const baseText = info.baseAmount >= 0
? `¥${info.baseAmount.toLocaleString()}`
: '<span style="color:#e67e22;">未設定</span>';
const extraHtml = info.extraTotal > 0
? ` / 臨時 +¥${info.extraTotal.toLocaleString()}` : '';
const fixedTotal = _getPeriodFixedTotal(period);
const fixedHtml = S.fixedOn
? `<div style="font-size:11px;color:#64748b;margin-top:4px;">固定費（${_escHtml(period.label)}）: ¥${fixedTotal.toLocaleString()}</div>`
: '';
el.innerHTML =
`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">` +
`<span style="font-size:12px;font-weight:700;color:#1e293b;">${_escHtml(period.label)} の予算</span>` +
`<span style="font-size:11px;color:#0984e3;background:#e0f2fe;padding:2px 8px;border-radius:999px;font-weight:600;">${modeText}</span>` +
`</div>` +
`<div style="font-size:13px;color:#334155;">${_bizLabel('目標', '基本予算')}: <b>${baseText}</b>${extraHtml}</div>` +
fixedHtml;
el.style.display = 'block';
} catch(e) {
el.style.display = 'none';
}
}

// ===== 入力タブ インフォパネル描画 =====
function renderInfoPanel() {
if (typeof DB === 'undefined') return;
const panel     = document.getElementById('input-info-panel');
const rankBlock = document.getElementById('info-ranking-block');
const ptsBlock  = document.getElementById('info-points-block');
const cmpBlock  = document.getElementById('info-compare-block');
if (!panel) return;

const anyOn = S.rankingOn || S.pointsOn || S.compareOn;
panel.style.display = anyOn ? 'block' : 'none';

try {
const period = getCurrentPeriod();
const biz = isBizMode();

// ─── ランキング（カテゴリ・タグを2カラム表示）───
if (S.rankingOn && rankBlock) {
const rankCat = S.rankTargets.includes('category');
const rankTag = S.rankTargets.includes('tag');
rankBlock.style.display = (rankCat || rankTag) ? 'block' : 'none';

if (rankCat || rankTag) {
const parts = [rankCat ? 'カテゴリ' : '', rankTag ? 'タグ' : ''].filter(Boolean).join('・');
const titleEl = document.getElementById('info-ranking-title');
if (titleEl) titleEl.innerText = `${period.label} ${parts}ランキング TOP3`;

// カテゴリ集計（bizMode時は経費タグを除外）
let catRows = [], tagRows = [];
if (rankCat) {
const filter = JSON.stringify({ dateFrom: period.from, dateTo: period.to, excludeCostTags: biz });
catRows = JSON.parse(DB.getCategoryStats(filter))
.filter(r => !S.rankNoZero || r.amount > 0)
.sort((a,b) => S.rankOrder==='LOW' ? a.amount-b.amount : b.amount-a.amount)
.slice(0, 3)
.map(r => ({ name: r.catName, amount: r.amount }));
}
if (rankTag) {
const allTags = JSON.parse(DB.getMaster('custom_tags') || '[]');
for (const tag of allTags) {
const tf = JSON.stringify({ dateFrom: period.from, dateTo: period.to, tagIds: [tag.id], excludeCostTags: biz });
const cs = JSON.parse(DB.getCategoryStats(tf));
const total = cs.reduce((s,r) => s+r.amount, 0);
if (!S.rankNoZero || total > 0) tagRows.push({ name: tag.name, amount: total });
}
tagRows.sort((a,b) => S.rankOrder==='LOW' ? a.amount-b.amount : b.amount-a.amount);
tagRows = tagRows.slice(0, 3);
}

if (rankCat && rankTag) {
const catMax = catRows.length > 0 ? Math.max(...catRows.map(r=>r.amount)) : 1;
const tagMax = tagRows.length > 0 ? Math.max(...tagRows.map(r=>r.amount)) : 1;
const catHtml = catRows.map((r,i) => _rankRowHtml2col(r.name, r.amount, catMax, i)).join('') || '<div class="rank-empty">データなし</div>';
const tagHtml = tagRows.map((r,i) => _rankRowHtml2col(r.name, r.amount, tagMax, i)).join('') || '<div class="rank-empty">データなし</div>';
document.getElementById('info-ranking-list').innerHTML = `
<div class="info-2col">
<div class="info-2col-block">
<div class="info-rank-sub-title">カテゴリ</div>${catHtml}
</div>
<div class="info-2col-divider"></div>
<div class="info-2col-block">
<div class="info-rank-sub-title">タグ</div>${tagHtml}
</div>
</div>`;
} else {
const rows = rankCat ? catRows : tagRows;
const maxAmt = rows.length > 0 ? Math.max(...rows.map(r=>r.amount)) : 1;
document.getElementById('info-ranking-list').innerHTML =
rows.map((r,i) => _rankRowHtml(r.name, r.amount, maxAmt, i)).join('') || '<div class="rank-empty">データなし</div>';
}
}
} else {
if (rankBlock) rankBlock.style.display = 'none';
}

// ─── ポイント / 経費使用額（bizMode切り替え）───
if (S.pointsOn && ptsBlock) {
ptsBlock.style.display = 'block';

const _ptsTitleEl = document.getElementById('info-pts-block-title');
if (_ptsTitleEl) {
_ptsTitleEl.textContent = (period.label || '今期') + (biz ? ' 経費使用額' : ' 獲得ポイント');
}

try {
const ptFilter = JSON.stringify({ dateFrom: period.from, dateTo: period.to });
const ptData   = biz
? JSON.parse(DB.getCostTagStats(ptFilter))
: JSON.parse(DB.getCardPointStats(ptFilter));

if (biz) {
const expTags = JSON.parse(DB.getMaster('cost_tags') || '[]');
const expTagMap = {};
expTags.forEach(t => { expTagMap[t.id] = t.name; });
const expIds = new Set(expTags.map(t => Number(t.id)));

let expRows = [];
if (S.pointsMode === 'SELECT' && S.pointsCards.length > 0) {
expRows = S.pointsCards.slice(0, 3).map(tid => {
const found = ptData.find(r => Number(r.cardId) === Number(tid));
return { name: expTagMap[tid] || `経費${tid}`, amt: found ? (found.totalPrice || 0) : 0 };
});
} else {
expRows = [...ptData]
.filter(r => expIds.has(Number(r.cardId)))
.map(r => ({ name: expTagMap[r.cardId] || r.cardName || `経費${r.cardId}`, amt: r.totalPrice || 0 }))
.sort((a, b) => b.amt - a.amt)
.slice(0, 3);
}

document.getElementById('info-points-list').innerHTML = expRows.length > 0
? expRows.map(r => `<div class="info-pts-row">
<span class="info-pts-card">${_escHtml(r.name)}</span>
<span class="info-pts-val">¥${r.amt.toLocaleString()}</span>
</div>`).join('')
: '<div class="rank-empty">経費タグ未登録</div>';

} else {
const allCards = JSON.parse(DB.getMaster('point_cards') || '[]');
const cardMap  = {};
allCards.forEach(c => { cardMap[c.id] = c.name; });

let ptRows = [];
if (S.pointsMode === 'SELECT' && S.pointsCards.length > 0) {
ptRows = S.pointsCards.slice(0, 3).map(cid => {
const found = ptData.find(r => Number(r.cardId) === Number(cid));
return { name: cardMap[cid] || `カード${cid}`, pts: found ? (found.totalPts || found.points || 0) : 0 };
});
} else {
ptRows = [...ptData]
.map(r => ({ name: cardMap[r.cardId] || r.cardName || `カード${r.cardId}`, pts: r.totalPts || r.points || 0 }))
.sort((a, b) => b.pts - a.pts)
.slice(0, 3);
}

document.getElementById('info-points-list').innerHTML = ptRows.length > 0
? ptRows.map(r => `<div class="info-pts-row">
<span class="info-pts-card">${_escHtml(r.name)}</span>
<span class="info-pts-val">+${r.pts.toLocaleString()}pt</span>
</div>`).join('')
: '<div class="rank-empty">データなし</div>';
}
} catch(e) {
document.getElementById('info-points-list').innerHTML = '<div class="rank-empty">データなし</div>';
console.error('points/expense render:', e);
}
} else {
if (ptsBlock) ptsBlock.style.display = 'none';
}

// ─── 前期間比較（支出+残予算は1カラム / カテゴリ+タグは2カラム）───
if (S.compareOn && cmpBlock) {
cmpBlock.style.display = 'block';

let prevPeriod;
const useClosing = S.closingOn === true || S.closingOn === 'true';
if (period.mode === 'SEASON') {
const anchor = parseInt(S.periodStartDay) || 25;
prevPeriod = _calcSeasonPeriod(new Date(), S.seasonType || 'Q', useClosing, anchor, -1);
} else if (period.mode === 'YEAR') {
const py = parseInt(period.from.slice(0, 4)) - 1;
prevPeriod = { from: `${py}-01-01`, to: `${py}-12-31`, label: `${py}年`, mode: 'YEAR' };
} else if (useClosing && period.mode === 'CLOSING') {
const p = _calcPrevClosingPeriod(period.from);
prevPeriod = { from: p.from, to: p.to, label: p.label, mode: 'CLOSING' };
} else if (period.mode === 'MONTH') {
const fd = _parseYmd(period.from);
let py = fd.getFullYear(), pm = fd.getMonth(); // 1-indexed previous month (0 -> Dec prev year)
if (pm === 0) { pm = 12; py--; }
prevPeriod = {
from: `${py}-${_pad2(pm)}-01`,
to:   `${py}-${_pad2(pm)}-${_pad2(_lastDayOfMonth(py, pm))}`,
label: `${pm}月`,
mode: 'MONTH'
};
} else {
const fromD  = _parseYmd(period.from), toD = _parseYmd(period.to);
const days   = Math.round((toD - fromD) / 86400000) + 1;
const prevTo = new Date(fromD); prevTo.setDate(prevTo.getDate() - 1);
const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days + 1);
prevPeriod = { from: _ymd(prevFrom), to: _ymd(prevTo), label: '', mode: period.mode };
}

const prevFromStr = prevPeriod.from;
const prevToStr   = prevPeriod.to;
const prevFrom = _parseYmd(prevFromStr);
const prevTo   = _parseYmd(prevToStr);
const prevLabel = `${prevFrom.getMonth()+1}/${prevFrom.getDate()}〜${prevTo.getMonth()+1}/${prevTo.getDate()}`;
const titleEl = document.getElementById('info-compare-title');
if (titleEl) titleEl.innerText = `前期間比較（${prevLabel}）`;

const cmpItems = S.cmpTargets.length > 0 ? S.cmpTargets : ['expense'];
const _curRaw  = DB.getTotalByRange(period.from, period.to) || 0;
const _prevRaw = DB.getTotalByRange(prevFromStr, prevToStr) || 0;
const _curExp  = biz ? _getExpenseTotalForRange(period.from, period.to) : 0;
const _prevExp = biz ? _getExpenseTotalForRange(prevFromStr, prevToStr) : 0;
const curFixed  = _getPeriodFixedTotal(period);
const prevFixed = _getPeriodFixedTotal(prevPeriod);

let curTotal  = biz ? (_curRaw - 2 * _curExp) : _curRaw;
let prevTotal = biz ? (_prevRaw - 2 * _prevExp) : _prevRaw;
if (S.fixedOn && S.fixedMode === 'ADD') {
curTotal  = biz ? (curTotal - curFixed) : (curTotal + curFixed);
prevTotal = biz ? (prevTotal - prevFixed) : (prevTotal + prevFixed);
}

let html = '';

// 支出額・残予算は通常行
if (cmpItems.includes('expense')) {
html += _cmpRowHtml(biz ? '純売上' : '支出合計', curTotal, prevTotal, biz);
}
if (cmpItems.includes('remain')) {
let curBase = -1, prevBase = -1;
try {
const ci = JSON.parse(DB.getBudgetForPeriod(period.from, period.to));
curBase = ci.totalAmount ?? -1;
const pi = JSON.parse(DB.getBudgetForPeriod(prevFromStr, prevToStr));
prevBase = pi.totalAmount ?? -1;
} catch(e) {}
if (curBase >= 0) {
const curEff  = (S.fixedOn && S.fixedMode === 'BUDGET')
? (biz ? Math.max(0, curBase + curFixed) : Math.max(0, curBase - curFixed)) : curBase;
const prevBaseResolved = prevBase >= 0 ? prevBase : curBase;
const prevEff = (S.fixedOn && S.fixedMode === 'BUDGET')
? (biz ? Math.max(0, prevBaseResolved + prevFixed) : Math.max(0, prevBaseResolved - prevFixed)) : prevBaseResolved;
const curRem  = biz ? (curTotal - curEff) : (curEff - curTotal);
const prevRem = biz ? (prevTotal - prevEff) : (prevEff - prevTotal);
html += _cmpRowHtml(biz ? '目標差額' : '残予算', curRem, prevRem, true);
}
}

// カテゴリ・タグは2カラム
const hasCat = cmpItems.includes('category');
const hasTag = cmpItems.includes('tag');

if (hasCat && hasTag) {
const curCats  = JSON.parse(DB.getCategoryStats(JSON.stringify({ dateFrom: period.from, dateTo: period.to, excludeCostTags: biz })));
const prevCats = JSON.parse(DB.getCategoryStats(JSON.stringify({ dateFrom: prevFromStr, dateTo: prevToStr, excludeCostTags: biz })));
const prevCatMap = {}; prevCats.forEach(r => { prevCatMap[r.catName] = r.amount; });
const catCmpHtml = curCats.filter(r=>r.amount>0).slice(0,3)
.map(r => _cmpRowHtml2col(r.catName, r.amount, prevCatMap[r.catName]||0, biz)).join('') || '<div class="rank-empty">データなし</div>';

const allTags = JSON.parse(DB.getMaster('custom_tags') || '[]');
const tagCmpRows = [];
for (const tag of allTags) {
const curA  = JSON.parse(DB.getCategoryStats(JSON.stringify({ dateFrom: period.from, dateTo: period.to, tagIds: [tag.id], excludeCostTags: biz }))).reduce((s,r)=>s+r.amount,0);
const prevA = JSON.parse(DB.getCategoryStats(JSON.stringify({ dateFrom: prevFromStr, dateTo: prevToStr, tagIds: [tag.id], excludeCostTags: biz }))).reduce((s,r)=>s+r.amount,0);
if (curA > 0 || prevA > 0) tagCmpRows.push({ name: tag.name, cur: curA, prev: prevA });
}
tagCmpRows.sort((a,b)=>b.cur-a.cur);
const tagCmpHtml = tagCmpRows.slice(0,3).map(r => _cmpRowHtml2col(r.name, r.cur, r.prev, biz)).join('') || '<div class="rank-empty">データなし</div>';

html += `<div class="info-2col" style="margin-top:6px;">
<div class="info-2col-block">
<div class="info-rank-sub-title">カテゴリ</div>${catCmpHtml}
</div>
<div class="info-2col-divider"></div>
<div class="info-2col-block">
<div class="info-rank-sub-title">タグ</div>${tagCmpHtml}
</div>
</div>`;
} else if (hasCat) {
const curCats  = JSON.parse(DB.getCategoryStats(JSON.stringify({ dateFrom: period.from, dateTo: period.to, excludeCostTags: biz })));
const prevCats = JSON.parse(DB.getCategoryStats(JSON.stringify({ dateFrom: prevFromStr, dateTo: prevToStr, excludeCostTags: biz })));
const prevCatMap = {}; prevCats.forEach(r => { prevCatMap[r.catName] = r.amount; });
html += curCats.filter(r=>r.amount>0).slice(0,3).map(r => _cmpRowHtml(r.catName, r.amount, prevCatMap[r.catName]||0, biz)).join('');
} else if (hasTag) {
const allTags = JSON.parse(DB.getMaster('custom_tags') || '[]');
for (const tag of allTags) {
const curA  = JSON.parse(DB.getCategoryStats(JSON.stringify({ dateFrom: period.from, dateTo: period.to, tagIds: [tag.id], excludeCostTags: biz }))).reduce((s,r)=>s+r.amount,0);
const prevA = JSON.parse(DB.getCategoryStats(JSON.stringify({ dateFrom: prevFromStr, dateTo: prevToStr, tagIds: [tag.id], excludeCostTags: biz }))).reduce((s,r)=>s+r.amount,0);
if (curA > 0 || prevA > 0) html += _cmpRowHtml(tag.name, curA, prevA, biz);
}
}

document.getElementById('info-compare-list').innerHTML = html || '<div class="rank-empty">データなし</div>';
} else {
if (cmpBlock) cmpBlock.style.display = 'none';
}
} catch(e) { console.error('renderInfoPanel:', e); }
}

// ランキング行（1カラム用・バー付き）
function _rankRowHtml(name, amount, maxAmt, i) {
const pct   = maxAmt > 0 ? Math.round((amount / maxAmt) * 100) : 0;
const medal = ['🥇','🥈','🥉'][i] || `${i+1}.`;
return `<div class="info-rank-row">
<span class="info-rank-medal">${medal}</span>
<div class="info-rank-info">
<span class="info-rank-name">${_escHtml(name)}</span>
<div class="rank-bar-wrap"><div class="rank-bar-fill" style="width:${pct}%"></div></div>
</div>
<span class="info-rank-amt">¥${amount.toLocaleString()}</span>
</div>`;
}

// ランキング行（2カラム用・バーなし・コンパクト）
function _rankRowHtml2col(name, amount, maxAmt, i) {
const medal = ['🥇','🥈','🥉'][i] || `${i+1}.`;
return `<div class="info-rank-row-sm">
<span class="info-rank-medal-sm">${medal}</span>
<span class="info-rank-name-sm">${_escHtml(name)}</span>
<span class="info-rank-amt-sm">¥${amount.toLocaleString()}</span>
</div>`;
}

// 比較行（1カラム用）
function _cmpRowHtml(label, curVal, prevVal, higherIsBetter = false) {
const diff = curVal - prevVal;
const pct  = prevVal !== 0 ? Math.round((diff / Math.abs(prevVal)) * 100) : 0;
const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
const cls  = diff === 0 ? '' : (higherIsBetter ? (diff > 0 ? 'cmp-down' : 'cmp-up') : (diff > 0 ? 'cmp-up' : 'cmp-down'));
const diffStr = S.cmpPercent ? `${sign}${Math.abs(pct)}%` : `${sign}¥${Math.abs(diff).toLocaleString()}`;
const valStr = curVal < 0 ? `−¥${Math.abs(curVal).toLocaleString()}` : `¥${curVal.toLocaleString()}`;
return `<div class="info-cmp-row">
<span class="info-cmp-label">${_escHtml(label)}</span>
<span class="info-cmp-val">${valStr}</span>
<span class="info-cmp-diff ${cls}">${diffStr}</span>
</div>`;
}

// 比較行（2カラム用・コンパクト）
function _cmpRowHtml2col(name, curVal, prevVal, higherIsBetter = false) {
const diff = curVal - prevVal;
const pct  = prevVal !== 0 ? Math.round((diff / Math.abs(prevVal)) * 100) : 0;
const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
const cls  = diff === 0 ? '' : (higherIsBetter ? (diff > 0 ? 'cmp-down' : 'cmp-up') : (diff > 0 ? 'cmp-up' : 'cmp-down'));
const diffStr = S.cmpPercent ? `${sign}${Math.abs(pct)}%` : `${sign}¥${Math.abs(diff).toLocaleString()}`;
return `<div class="info-cmp-row-sm">
<span class="info-cmp-label-sm">${_escHtml(name)}</span>
<span class="info-cmp-diff-sm ${cls}">${diffStr}</span>
</div>`;
}

// 後方互換
function renderRanking() { renderInfoPanel(); }

// ===== マスター再描画 =====
function refresh() {
if (typeof DB === "undefined") return;
try {
const cats = JSON.parse(DB.getMaster('categories') || "[]");
document.getElementById('categoryGrid').innerHTML = cats.map(c =>
`<div class="tile ${selCId===c.id?'selected':''}" onclick="vibe();selCId=${c.id};refresh()">${_escHtml(c.name)}</div>`
).join('');
const tags = JSON.parse(DB.getMaster('custom_tags') || "[]");
document.getElementById('tagArea').innerHTML = tags.map(t =>
`<div class="tag ${selTIds.has(t.id)?'selected':''}" onclick="vibe();toggleTag(${t.id})">${_escHtml(t.name)}</div>`
).join('');
const _cardTable = isBizMode() ? 'cost_tags' : 'point_cards';
const cards = JSON.parse(DB.getMaster(_cardTable) || "[]");
document.getElementById('cardArea').innerHTML = cards.map(c =>
`<div class="tag ${selCardId===c.id?'selected':''}" onclick="vibe();selCardId=${c.id};refresh()">${_escHtml(c.name)}</div>`
).join('');
} catch (e) { console.error(e); }
}

function toggleTag(id) { if (selTIds.has(id)) selTIds.delete(id); else selTIds.add(id); refresh(); }

function toggleCardUse() {
isCard = !isCard;
const btn = document.getElementById('cardBtn');
btn.classList.toggle('on', isCard);
// ボタンテキストはON時もモードに応じたラベルを保持
btn.textContent = isBizMode() ? '経費' : 'CARD';
document.getElementById('pointSection').style.display = isCard ? 'block' : 'none';
// 経費モード時はポイント入力を非表示
const _ptsWrap = document.getElementById('points-input-wrap');
if (_ptsWrap) _ptsWrap.style.display = (isCard && !isBizMode()) ? 'block' : 'none';
}

// ===== 設定UI初期化 =====
function initSettingsUI() {
S = _defaultSettings();
applySettingsToDOM();
refreshPointsCardUI();
settingsDirty = false;
}
function markSettingsDirty() { if (!_loadingSettings) settingsDirty = true; }

// 初回起動・リセット後の初期設定をDBへ書き込んでDOMに反映
function _applyInitialSettings() {
S.displayMode   = 'SIMPLE';
S.simpleView    = 'EXP';
S.closingOn     = false;
S.fixedOn       = false;
S.periodUnit    = 'MONTH';
S.appStartMonth = '';
try {
DB.setSetting('displayMode',   'SIMPLE');
DB.setSetting('simpleView',    'EXP');
DB.setSetting('closingOn',     'false');
DB.setSetting('fixedOn',       'false');
DB.setSetting('periodUnit',    'MONTH');
DB.setSetting('appStartMonth', '');
} catch(e) { console.error('_applyInitialSettings:', e); }
applySettingsToDOM();
settingsDirty = false;
_clearEarliestDateCache();
}

// DBから設定を読み込んで S に格納し DOM に反映
function loadSettingsFromDB() {
if (typeof DB === 'undefined') return;
_loadingSettings = true;
try {
const d = _defaultSettings();             // デフォルト値
const raw = DB.getAllSettings() || '{}';
const db  = JSON.parse(raw);              // DB保存値

// S を完全上書き（DB値があればDB値、なければデフォルト）
S.displayMode   = db.displayMode   || d.displayMode;
S.periodUnit    = db.periodUnit    || d.periodUnit;
S.seasonType    = db.seasonType    || d.seasonType;
S.simpleView    = db.simpleView === 'REM' ? 'REMAIN' : (db.simpleView || d.simpleView);
S.pointsOn      = (db.pointsOn !== undefined && db.pointsOn !== '') ? db.pointsOn !== 'false' : d.pointsOn;
S.pointsMode    = db.pointsMode    || d.pointsMode;
S.pointsCards   = db.pointsCards ? db.pointsCards.split(',').map(Number).filter(Boolean) : [];
S.fixedOn       = db.fixedOn   === 'true';
S.fixedMode     = db.fixedMode     || d.fixedMode;
S.closingOn     = (db.closingOn !== undefined && db.closingOn !== '') ? db.closingOn === 'true' : d.closingOn;
S._bmLastChecked = db.bmLastChecked || '';
// 後方互換移行：旧 closingDay/payday/budgetLink → periodStartDay に統合
if (db.periodStartDay) {
S.periodStartDay = db.periodStartDay;
} else if (db.budgetLink === 'BL_SALARY' && db.payday) {
S.periodStartDay = db.payday;
} else if (db.closingDay) {
S.periodStartDay = db.closingDay;
} else {
S.periodStartDay = d.periodStartDay;
}
S.appStartMonth = db.appStartMonth  || '';
S.baseBudget    = db.baseBudget    !== undefined ? db.baseBudget : d.baseBudget;
S.budgetMode    = db.budgetMode    || d.budgetMode;
S.rankingOn     = db.rankingOn === 'true';
S.rankTargets   = db.rankTargets   ? db.rankTargets.split(',').filter(Boolean)   : [];
S.rankOrder     = db.rankOrder     || d.rankOrder;
S.rankNoZero    = db.rankNoZero    === 'true';
S.compareOn     = db.compareOn     === 'true';
S.cmpTargets    = db.cmpTargets    ? db.cmpTargets.split(',').filter(Boolean)    : [];
S.cmpPercent    = db.cmpPercent    === 'true';
S.bizMode       = db.bizMode       === 'true';

applySettingsToDOM();
refreshPointsCardUI();
} catch(e) { console.error('loadSettingsFromDB:', e); }
finally {
_loadingSettings = false;
settingsDirty = false;
}
}

// S の内容を DOM に反映（_loadingSettings ガード外から呼んではいけない）
function applySettingsToDOM() {
// setRadioDOM を先頭に定義（const のTDZバグ修正）
const setRadioDOM = (group, val) => {
const prefix = 'dot-'+group+'-';
document.querySelectorAll('[id^="'+prefix+'"]').forEach(el => el.classList.toggle('active', el.id===prefix+val));
};
const sd = (id, v) => { const el = document.getElementById(id); if(el) el.style.display = v; };

// 表示モード
['SIMPLE','DETAIL'].forEach(v => {
const d = document.getElementById('dot-mode-'+v); if(d) d.classList.toggle('active', v===S.displayMode);
});
sd('group-detail-settings', S.displayMode==='DETAIL' ? 'block' : 'none');

// 期間・表示内容
const pu = document.getElementById('set-period-unit'); if(pu) pu.value = S.periodUnit;
const st = document.getElementById('set-season-type'); if(st) st.value = S.seasonType;
const sv = document.getElementById('set-simple-view'); if(sv) sv.value = S.simpleView;
const bm = document.getElementById('set-biz-mode'); if(bm) bm.value = String(S.bizMode);
toggleSettingUI();

// ポイント
_setToggle('toggle-points', S.pointsOn);
sd('group-points-opts', S.pointsOn ? 'block' : 'none');
['TOP3','SELECT'].forEach(v => {
const d = document.getElementById('dot-pts-'+v); if(d) d.classList.toggle('active', v===S.pointsMode);
});
sd('group-pts-card-select', S.pointsMode==='SELECT' ? 'block' : 'none');

// 固定費
_setToggle('toggle-fixed', S.fixedOn);
sd('group-fixed',         S.fixedOn ? 'block'       : 'none');
sd('fixed-total-display', S.fixedOn ? 'inline-flex' : 'none');
setRadioDOM('fixed-mode', S.fixedMode);

// 予算期間の起点日
_setToggle('toggle-closing', S.closingOn);
sd('group-closing', S.closingOn ? 'block' : 'none');
const psd = document.getElementById('period-start-day-val'); if(psd) psd.value = S.periodStartDay;
const bbv = document.getElementById('base-budget');          if(bbv) bbv.value = S.baseBudget;
_updatePeriodPreview();
const _asmEl = document.getElementById('app-start-month-val'); if(_asmEl) _asmEl.value = S.appStartMonth || '';
_updateStartMonthDisplay();

// ラジオ系
setRadioDOM('budget-mode', S.budgetMode);
setRadioDOM('rank-order',  S.rankOrder);

// 詳細モード設定
setCheckBox('check-ranking', S.rankingOn);
sd('group-ranking', S.rankingOn ? 'block' : 'none');
['category','tag'].forEach(k => {
const el = document.getElementById('btn-rank-'+k);
if(el) el.classList.toggle('selected', S.rankTargets.includes(k));
});
setCheckBox('check-rank-nozero', S.rankNoZero);

setCheckBox('check-compare', S.compareOn);
sd('group-compare', S.compareOn ? 'block' : 'none');
['expense','remain','category','tag'].forEach(k => {
const el = document.getElementById('btn-cmp-'+k);
if(el) el.classList.toggle('selected', S.cmpTargets.includes(k));
});
setCheckBox('check-cmp-percent', S.cmpPercent);

// 売上管理モードのUI切り替え
_applyBizModeUI();

// 設定反映後にUI更新
try { updateSummary(); }          catch(e) { console.error('updateSummary in apply:', e); }
try { updateFixedTotalBadge(); }  catch(e) {}
try { _renderBmCurrentSummary(); } catch(e) {}
try { renderInfoPanel(); }        catch(e) { console.error('renderInfoPanel in apply:', e); }
}

// ===================================================
// 売上管理モード：UI文言・色の一括切り替え
// ===================================================
function _applyBizModeUI() {
const biz = isBizMode();

// ── 設定タブ：固定費ラベル切り替え ──
const fixAddTitle = document.querySelector('#dot-fixed-mode-ADD')?.parentElement?.querySelector('.radio-title-sm');
const fixAddDesc  = document.querySelector('#dot-fixed-mode-ADD')?.parentElement?.querySelector('.radio-desc');
const fixBudTitle = document.querySelector('#dot-fixed-mode-BUDGET')?.parentElement?.querySelector('.radio-title-sm');
const fixBudDesc  = document.querySelector('#dot-fixed-mode-BUDGET')?.parentElement?.querySelector('.radio-desc');
if (fixAddTitle) fixAddTitle.textContent = biz ? '固定費を売上から減額' : '支出額に加算';
if (fixAddDesc)  fixAddDesc.textContent  = biz ? '純売上 = 売上 ー 固定費' : '今月の支出 = 実支出 ＋ 固定費';
if (fixBudTitle) fixBudTitle.textContent = biz ? '固定費を予算に加算'   : '予算額から減算';
if (fixBudDesc)  fixBudDesc.textContent  = biz ? '目標売上 = 設定予算 ＋ 固定費' : '使える予算 = 設定予算 − 固定費';

// ── 分析タブ：タブ名切り替え ──
const tabTrend  = document.getElementById('an-tab-trend');
const tabBudget = document.getElementById('an-tab-budget');
if (tabTrend)  tabTrend.textContent  = biz ? '売上推移'  : '支出推移';
if (tabBudget) tabBudget.textContent = biz ? '予算達成率' : '予算消化率';

// ── 入力タブ テキスト切り替え ──
const cardBtn = document.getElementById('cardBtn');
if (cardBtn && !cardBtn.classList.contains('on')) cardBtn.textContent = biz ? '経費' : 'CARD';
const cardAreaLabel = document.getElementById('card-area-label');
if (cardAreaLabel) cardAreaLabel.textContent = biz ? '経費種類' : '使用カード';
const cardEditLink = document.getElementById('card-edit-link');
if (cardEditLink) cardEditLink.textContent = biz ? '経費編集' : 'カード編集';

// ── 設定タブ テキスト切り替え ──
const tplEl = document.getElementById('toggle-points-label');
if (tplEl) tplEl.textContent = biz ? '使用経費を表示' : '獲得ポイントを表示';
const ptsTop3El = document.getElementById('pts-opt-top3');
if (ptsTop3El) ptsTop3El.textContent = biz ? '経費使用額 トップ3' : '獲得ポイント トップ3';
const ptsSelectEl = document.getElementById('pts-opt-select');
if (ptsSelectEl) ptsSelectEl.textContent = biz ? '経費タグから選択（3つまで）' : 'カードタグから選択（3つまで）';
const ptsCardSelLabel = document.getElementById('pts-card-select-label');
if (ptsCardSelLabel) ptsCardSelLabel.textContent = biz ? '表示する経費タグを選択' : '表示するカードを選択';

// ── 分析タブ pts タブ名 ──
const tabPts = document.getElementById('an-tab-pts');
if (tabPts) tabPts.textContent = biz ? '経費' : 'ポイント';

// ── pts card select エリアを再描画（cost_tags / point_cards 切り替え）──
refreshPointsCardUI();
// 経費モード時はポイント入力欄を非表示
const _ptsWrapBiz = document.getElementById('points-input-wrap');
if (_ptsWrapBiz) _ptsWrapBiz.style.display = (!biz && document.getElementById('cardBtn')?.classList.contains('on')) ? 'block' : 'none';

// 表示内容 select のオプションテキスト切り替え
const svEl = document.getElementById('set-simple-view');
if (svEl && svEl.options.length >= 3) {
svEl.options[0].text = biz ? '売上額のみ'        : '支出額のみ';
svEl.options[1].text = biz ? '残予算のみ'        : '残予算のみ';
svEl.options[2].text = biz ? '売上額 & 残予算'   : '支出額 & 残予算';
}

// 予算残りラベル
const budLabelEl = document.getElementById('summary-budget-label');
if (budLabelEl) budLabelEl.textContent = biz ? '予算まで' : '予算残り';

// 比較対象ボタン
const cmpExpBtn = document.getElementById('btn-cmp-expense');
const cmpRemBtn = document.getElementById('btn-cmp-remain');
if (cmpExpBtn) cmpExpBtn.textContent = biz ? '売上額' : '支出額';
if (cmpRemBtn) cmpRemBtn.textContent = biz ? '目標差額' : '残予算額';

// ランキングの「トップの基準」説明文
const rankHighEl = document.querySelector('#dot-rank-order-HIGH')?.parentElement?.querySelector('span');
const rankLowEl  = document.querySelector('#dot-rank-order-LOW')?.parentElement?.querySelector('span');
if (rankHighEl) rankHighEl.textContent = biz ? '売上額の多い順をトップとして扱う' : '支出額の多い順をトップとして扱う';
if (rankLowEl)  rankLowEl.textContent  = biz ? '売上額の少ない順をトップとして扱う' : '支出額の少ない順をトップとして扱う';

// ランキング除外オプション
const rankNzEl = document.querySelector('#check-rank-nozero')?.nextElementSibling;
if (rankNzEl) rankNzEl.textContent = biz ? '売上額ゼロのカテゴリ・タグを除外' : '支出額ゼロのカテゴリ・タグを除外';
}

// トグルを「目的の状態」に直接セットする内部ヘルパー
function _setToggle(id, wantOn) {
const el = document.getElementById(id);
if (!el) return;
const isOn = el.classList.contains('on');
if (isOn !== wantOn) el.classList.toggle('on', wantOn);
const knob = el.querySelector('.toggle-knob');
// knob の位置は CSS の .on クラスで制御されているので追加操作不要
}

// 設定をDBに保存（S オブジェクトだけを参照・DOM は一切読まない）
function saveSettingsToDB() {
if (typeof DB === 'undefined') return;
// 保存前に DOM → S の同期（数値入力系のみ DOM が正）
const psd = document.getElementById('period-start-day-val'); if(psd) S.periodStartDay = psd.value || '25';
const bbv = document.getElementById('base-budget');                if(bbv) S.baseBudget = bbv.value || '';
const asmInput = document.getElementById('app-start-month-val');   if(asmInput) S.appStartMonth = asmInput.value || '';
try {
DB.setSetting('displayMode',     S.displayMode);
DB.setSetting('periodUnit',      S.periodUnit);
DB.setSetting('seasonType',      S.seasonType);
DB.setSetting('simpleView',      S.simpleView);
DB.setSetting('pointsOn',        String(S.pointsOn));
DB.setSetting('pointsMode',      S.pointsMode);
DB.setSetting('pointsCards',     S.pointsCards.join(','));
DB.setSetting('fixedOn',         String(S.fixedOn));
DB.setSetting('fixedMode',       S.fixedMode);
DB.setSetting('appStartMonth',    S.appStartMonth);
DB.setSetting('closingOn',        String(S.closingOn));
DB.setSetting('periodStartDay',   S.periodStartDay);
DB.setSetting('baseBudget',       S.baseBudget);
DB.setSetting('budgetMode',      S.budgetMode);
DB.setSetting('rankingOn',       String(S.rankingOn));
DB.setSetting('rankTargets',     S.rankTargets.join(','));
DB.setSetting('rankOrder',       S.rankOrder);
DB.setSetting('rankNoZero',      String(S.rankNoZero));
DB.setSetting('compareOn',       String(S.compareOn));
DB.setSetting('cmpTargets',      S.cmpTargets.join(','));
DB.setSetting('cmpPercent',      String(S.cmpPercent));
DB.setSetting('bizMode',          String(S.bizMode));
settingsDirty = false;
} catch(e) { console.error('saveSettingsToDB:', e); }
}

function setDisplayMode(val) {
S.displayMode = val; markSettingsDirty();
['SIMPLE','DETAIL'].forEach(v => { const d = document.getElementById('dot-mode-'+v); if(d) d.classList.toggle('active', v===val); });
document.getElementById('group-detail-settings').style.display = (val==='DETAIL') ? 'block' : 'none';
}

function setPointsMode(val) {
S.pointsMode = val; markSettingsDirty();
['TOP3','SELECT'].forEach(v => { const d = document.getElementById('dot-pts-'+v); if(d) d.classList.toggle('active', v===val); });
document.getElementById('group-pts-card-select').style.display = (val==='SELECT') ? 'block' : 'none';
}

function setFixedMode(val) {
S.fixedMode = val; markSettingsDirty();
['ADD','BUDGET','NONE'].forEach(v => {
const d = document.getElementById('dot-fixed-mode-'+v); if(d) d.classList.toggle('active', v===val);
});
updateSummary();
}

function refreshPointsCardUI() {
if (typeof DB === "undefined") return;
try {
// bizMode: 経費タグを表示、通常: カードタグを表示
const _table = isBizMode() ? 'cost_tags' : 'point_cards';
const cards = JSON.parse(DB.getMaster(_table) || "[]");
document.getElementById('pts-card-area').innerHTML = cards.map(c =>
`<div class="tag sel-btn ${S.pointsCards.includes(c.id)?'selected':''}" onclick="vibe();togglePointsCard(${c.id})">${_escHtml(c.name)}</div>`
).join('');
} catch(e) { console.error(e); }
}

function togglePointsCard(id) {
const idx = S.pointsCards.indexOf(id);
if (idx >= 0) { S.pointsCards.splice(idx, 1); }
else { if (S.pointsCards.length >= 3) return; S.pointsCards.push(id); }
markSettingsDirty();
refreshPointsCardUI();
}

function toggleDetailCheck(id) {
const el = document.getElementById(id); if (!el) return;
const next = !el.classList.contains('checked');
setCheckBox(id, next);
if (id==='check-ranking')    { S.rankingOn  = next; document.getElementById('group-ranking').style.display = next?'block':'none'; }
if (id==='check-compare')    { S.compareOn  = next; document.getElementById('group-compare').style.display = next?'block':'none'; }
if (id==='check-rank-nozero') S.rankNoZero  = next;
if (id==='check-cmp-percent') S.cmpPercent  = next;
if (id==='check-fixed-add')         S.fixedAdd        = next;
if (id==='check-fixed-budget')      S.fixedBudget     = next;
if (id==='check-fixed-summary-box') S.fixedSummaryBox = next;
markSettingsDirty();
}

function setCheckBox(id, checked) {
const el = document.getElementById(id); if (!el) return;
if (checked) {
el.classList.add('checked');
el.innerHTML = '<svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4l3 3 6-6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
} else { el.classList.remove('checked'); el.innerHTML = ''; }
}

function toggleSelBtn(group, key) {
const el  = document.getElementById(`btn-${group}-${key}`); if (!el) return;
const arr = group === 'rank' ? S.rankTargets : S.cmpTargets;
const idx = arr.indexOf(key);
if (idx >= 0) { arr.splice(idx, 1); el.classList.remove('selected'); }
else           { arr.push(key);      el.classList.add('selected');    }
markSettingsDirty();
try { renderInfoPanel(); } catch(e) {}
}

function setRadioSm(group, val) {
// budget-link グループは periodStartDay に統合済み
if (group==='budget-mode') S.budgetMode = val;
if (group==='rank-order')  S.rankOrder  = val;
const prefix='dot-'+group+'-';
document.querySelectorAll('[id^="'+prefix+'"]').forEach(el => el.classList.toggle('active', el.id===prefix+val));
markSettingsDirty();
try { updateSummary(); }   catch(e) {}
try { renderInfoPanel(); } catch(e) {}
}

// ===== 予算期間プレビュー更新 =====
function _updatePeriodPreview() {
const el = document.getElementById('period-preview');
if (!el) return;
if (!S.closingOn) { el.style.display = 'none'; return; }
const anchor = parseInt(S.periodStartDay) || 25;
const cp = _calcClosingPeriodForDate(new Date(), anchor);
el.innerHTML =
'毎月 <strong>' + anchor + '日の翌日</strong> 〜 翌月 <strong>' + anchor + '日</strong> が1期間<br>' +
'<span style="color:#64748b;">（例: ' + cp.from.replace(/-/g, '/') + ' 〜 ' + cp.to.replace(/-/g, '/') + '）</span>';
el.style.display = 'block';
}

// ===== 利用開始月 UI =====
function _updateStartMonthDisplay() {
const el = document.getElementById('app-start-month-display');
if (!el) return;
if (S.appStartMonth) {
const [y, m] = S.appStartMonth.split('-');
el.textContent = y + '年' + parseInt(m) + '月から集計';
el.style.color = '#0984e3';
} else {
el.textContent = '未設定（全期間を集計）';
el.style.color = '#94a3b8';
}
}

function saveAppStartMonth() {
const el = document.getElementById('app-start-month-val');
if (!el) return;
const val = el.value || '';
S.appStartMonth = val;
try { DB.setSetting('appStartMonth', val); } catch(e) {}
_clearEarliestDateCache();
_updateStartMonthDisplay();
showToast('利用開始月を保存しました');
}

function clearAppStartMonth() {
S.appStartMonth = '';
const el = document.getElementById('app-start-month-val');
if (el) el.value = '';
try { DB.setSetting('appStartMonth', ''); } catch(e) {}
_clearEarliestDateCache();
_updateStartMonthDisplay();
showToast('利用開始月をクリアしました');
}

// ===== 利用開始月ガード =====
// inputYM: 'YYYY-MM' 形式、onProceed: 通過後に実行するコールバック
function _checkStartMonthGuard(inputYM, onProceed) {
if (!S.appStartMonth || !inputYM) { onProceed(); return; }
if (inputYM >= S.appStartMonth)   { onProceed(); return; }

const [iy, im] = inputYM.split('-');
const inputLabel = iy + '年' + parseInt(im) + '月';
const [sy, sm]  = S.appStartMonth.split('-');
const startLabel = sy + '年' + parseInt(sm) + '月';

const proceedAction = () => {
S.appStartMonth = inputYM;
try { DB.setSetting('appStartMonth', inputYM); } catch(e) {}
_clearEarliestDateCache();
const el = document.getElementById('app-start-month-val');
if (el) el.value = inputYM;
_updateStartMonthDisplay();
onProceed();
};

// bm-modal が開いている場合は bm-sub（z-index:9100）を使う
const bmSub = document.getElementById('bm-sub');
if (bmSub) {
_bmShowSub(
'<div class="bm-sub-box">' +
'<div class="bm-sub-title">⚠️ 利用開始月より前の日付</div>' +
'<div style="font-size:13px;color:#475569;margin-bottom:14px;line-height:1.6;">' +
'入力日（<strong>' + inputLabel + '</strong>）は利用開始月（' + startLabel + '）より前です。<br>' +
'利用開始月を更新しますか？</div>' +
'<div class="bm-sub-btns">' +
'<button onclick="vibe();_bmCloseSub()" class="bm-sub-cancel">取り消す</button>' +
'<button onclick="vibe();_guardProceedFromSub()" class="bm-sub-ok" style="background:#0984e3;">' + inputLabel + 'に更新して保存</button>' +
'</div></div>'
);
// グローバルに一時保存（bm-subボタンから参照）
window._guardPendingAction = proceedAction;
} else {
// 通常モーダル（bm-modal が閉じている場合）
const bodyHtml =
'<p style="margin:0 0 12px;font-size:14px;line-height:1.6;">' +
'入力日（<strong>' + inputLabel + '</strong>）は現在の利用開始月（' + startLabel + '）より前です。</p>' +
'<div style="display:flex;flex-direction:column;gap:8px;">' +
'<button onclick="closeModal()" style="padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;font-size:14px;cursor:pointer;">入力を取り消す</button>' +
'<button id="guard-proceed-btn" style="padding:12px;border:none;border-radius:10px;background:#0984e3;color:white;font-size:14px;font-weight:600;cursor:pointer;">' +
inputLabel + ' を利用開始月として更新して保存</button>' +
'</div>';
document.getElementById('modal-title').innerText = '⚠️ 利用開始月より前の日付';
document.getElementById('modal-body').innerHTML  = bodyHtml;
document.getElementById('app-modal').style.display = 'flex';
document.querySelector('.modal-btns').style.display = 'none';
document.getElementById('guard-proceed-btn').onclick = () => {
closeModal();
proceedAction();
};
}
}

// bm-sub 上の「更新して保存」ボタンから呼ばれる
function _guardProceedFromSub() {
_bmCloseSub();
if (typeof window._guardPendingAction === 'function') {
window._guardPendingAction();
window._guardPendingAction = null;
}
}

function toggleSwitch(toggleId, groupId) {
const next = !document.getElementById(toggleId).classList.contains('on');
updateToggleVisual(toggleId, next);
const g = document.getElementById(groupId); if (g) g.style.display=next?'block':'none';
if (toggleId==='toggle-closing') S.closingOn = next;
if (toggleId==='toggle-points')  { S.pointsOn = next; if(!next) document.getElementById('group-pts-card-select').style.display='none'; }
markSettingsDirty();
try { updateSummary(); }   catch(e) {}
try { renderInfoPanel(); } catch(e) {}
}

function toggleFixedMain() {
const next = !document.getElementById('toggle-fixed').classList.contains('on');
updateToggleVisual('toggle-fixed', next);
S.fixedOn = next;
document.getElementById('group-fixed').style.display=next?'block':'none';
document.getElementById('fixed-total-display').style.display=next?'inline-flex':'none';
updateSummary();
markSettingsDirty();
}

function updateToggleVisual(toggleId, isOn) {
const el=document.getElementById(toggleId); if(el) el.classList.toggle('on',isOn);
}

function toggleSettingUI() {
const pu = document.getElementById('set-period-unit');
if (!pu) return;
const p = pu.value;
S.periodUnit = p;
const row = document.getElementById('row-season-preset');
if (row) row.style.display = (p==='SEASON') ? 'flex' : 'none';
}
// select/input の onchange から呼ばれるハンドラ
// カード編集 or 経費編集 をモードで切り替え
function openCardOrExpenseEdit() {
openMasterEdit(isBizMode() ? 'cost_tags' : 'point_cards');
}

function onBizModeChange() {
const el = document.getElementById('set-biz-mode');
if (!el) return;
S.bizMode = el.value === 'true';
markSettingsDirty();
_applyBizModeUI();
refresh();
try { updateSummary(); } catch(e) {}
try { renderInfoPanel(); } catch(e) {}
if (document.getElementById('view-analytics')?.style.display !== 'none') renderAnalytics();
}

function onSettingSelectChange(id) {
const el = document.getElementById(id); if (!el) return;
if (id === 'set-period-unit')  { S.periodUnit  = el.value; toggleSettingUI(); }
if (id === 'set-season-type')  { S.seasonType  = el.value; }
if (id === 'set-simple-view')  { S.simpleView  = el.value; }
if (id === 'period-start-day-val') { S.periodStartDay = el.value; _updatePeriodPreview(); }
if (id === 'base-budget')      { S.baseBudget   = el.value; }
markSettingsDirty();
// 即時反映
try { updateSummary(); }     catch(e) {}
try { updateFixedTotalBadge(); } catch(e) {}
try { renderInfoPanel(); }   catch(e) {}
}

// ===== モーダル =====
function closeModal() {
document.getElementById('app-modal').style.display='none';
// ガードダイアログで非表示にした modal-btns を復元
const mb = document.querySelector('.modal-btns');
if (mb) mb.style.display = '';
}

function showModal(title, body, isPrompt, callback) {
const mb = document.querySelector('.modal-btns');
if (mb) mb.style.display = '';
document.getElementById('modal-title').innerText = title;
document.getElementById('modal-body').innerHTML = body + (isPrompt
? '<input type="text" id="m-input" style="width:100%;margin-top:10px;padding:12px;box-sizing:border-box;border:1px solid #ccc;border-radius:8px;">'
: '');
document.getElementById('app-modal').style.display = 'flex';
// ★ 常にOKボタンのテキストをリセット（openImportModal等で書き換えた後も正常に戻す）
document.getElementById('modal-ok').innerText = 'OK';
document.getElementById('modal-ok').onclick = () => {
vibe();
const v = isPrompt ? document.getElementById('m-input').value : true;
closeModal();
if (callback) callback(v);
};
}

function openMasterEdit(table) {
if (table === 'fixed_costs') { openFixedCostsEdit(); return; }
let data = [];
try { data = JSON.parse(DB.getMaster(table) || '[]'); } catch(e) { data = []; }
let h = `<div style="max-height:300px;overflow-y:auto">` + data.map(item => `
<div style="display:flex;gap:5px;margin-bottom:10px;align-items:center;">
<input type="text" value="${_escHtml(item.name)}" id="m-${item.id}" style="flex:1;padding:8px;font-size:14px;">
<button onclick="vibe();handleMasterUpdate('${table}',${item.id})" style="background:var(--primary);color:white;border:none;padding:8px;border-radius:6px;">更</button>
<button onclick="vibe();handleMasterDelete('${table}',${item.id})" style="background:var(--danger);color:white;border:none;padding:8px;border-radius:6px;">消</button>
</div>`).join('') +
`</div><button onclick="vibe();addM('${table}')" style="width:100%;padding:12px;background:var(--dark);color:white;border:none;border-radius:8px;margin-top:10px;">+ 追加</button>`;
const _titles = { categories:'カテゴリ編集', custom_tags:'タグ編集', point_cards:'カード編集', cost_tags:'経費タグ編集' };
const _title = _titles[table] || 'マスター編集';
showModal(_title, h, false, () => { refresh(); if(table==='point_cards'||table==='cost_tags') refreshPointsCardUI(); });
}

// 固定費専用編集UI（名前＋金額）
function openFixedCostsEdit() {
const data = JSON.parse(DB.getFixedCostsList() || "[]");
let h = `<div style="max-height:320px;overflow-y:auto">`;
if (data.length === 0) h += `<div style="color:var(--text-sub);text-align:center;padding:12px;">固定費がまだ登録されていません</div>`;
h += data.map(item => `
<div style="margin-bottom:10px;padding:10px;background:#f8f9fa;border-radius:8px;">
<div style="display:flex;gap:5px;margin-bottom:6px;align-items:center;">
<input type="text" value="${_escHtml(item.name)}" id="fc-name-${item.id}" placeholder="名称" style="flex:1;padding:7px;font-size:13px;border:1px solid #ddd;border-radius:6px;">
<button onclick="vibe();handleFixedCostDelete(${item.id})" style="background:var(--danger);color:white;border:none;padding:8px;border-radius:6px;font-size:12px;">削除</button>
</div>
<div style="display:flex;gap:5px;align-items:center;">
<span style="font-size:12px;color:var(--text-sub);white-space:nowrap;">¥</span>
<input type="number" value="${item.amount}" id="fc-amt-${item.id}" placeholder="月額" style="flex:1;padding:7px;font-size:13px;border:1px solid #ddd;border-radius:6px;">
<button onclick="vibe();handleFixedCostUpdate(${item.id})" style="background:var(--primary);color:white;border:none;padding:8px 12px;border-radius:6px;font-size:12px;">更新</button>
</div>
</div>`).join('');
h += `</div><button onclick="vibe();addFixedCost()" style="width:100%;padding:12px;background:var(--dark);color:white;border:none;border-radius:8px;margin-top:10px;">+ 固定費を追加</button>`;
showModal("固定費の編集", h, false, () => { updateFixedTotalBadge(); updateSummary(); });
}

function handleFixedCostUpdate(id) {
const name = document.getElementById(`fc-name-${id}`)?.value?.trim();
const amt  = parseInt(document.getElementById(`fc-amt-${id}`)?.value) || 0;
if (!name) return;
DB.updateFixedCost(id, name, amt);
openFixedCostsEdit();
}
function handleFixedCostDelete(id) {
showModal('確認', '削除しますか？', false, (r) => {
if (r) { DB.deleteFixedCost(id); openFixedCostsEdit(); }
});
}
function addFixedCost() {
showModal('固定費を追加', '名称を入力してください', true, (name) => {
if (!name) return;
DB.addFixedCost(name, 0);
openFixedCostsEdit();
});
}

function handleMasterUpdate(table, id) {
const n = document.getElementById(`m-${id}`).value;
if (n) { DB.updateMaster(table, id, n); openMasterEdit(table); }
}
function handleMasterDelete(table, id) {
showModal('確認', '削除しますか？', false, (r) => { if(r) { DB.deleteMaster(table,id); openMasterEdit(table); } });
}
function addM(table) {
showModal("新規追加", "名前を入力", true, (n) => { if(n) { DB.addMaster(table,n); openMasterEdit(table); } });
}

// ===== 保存 =====
function saveData() {
const a = document.getElementById('amount').value;
if (!a || !selCId) return showModal("エラー", "金額とカテゴリは必須です", false);
const payload = {
id: editId,
name: document.getElementById('itemName').value,
price: parseInt(a),
category_id: selCId,
tag_ids: Array.from(selTIds).join(','),
date: document.getElementById('date').value,
points: document.getElementById('points').value || "0",
card_id: isCard ? (selCardId || 0) : 0,
created_at: originalCreatedAt
};
const _sdDate = payload.date ? payload.date.slice(0, 7) : '';
_checkStartMonthGuard(_sdDate, () => {
if (DB.save(JSON.stringify(payload))) {
_clearEarliestDateCache();
// 初回支出検知: appStartMonth 未設定かつ保存後の月次データが1件のみ
let _isFirstEntry = false;
if (!S.appStartMonth && payload.date) {
try {
const _monthly = JSON.parse(DB.getMonthlyStatsFiltered(120, '{}'));
const _withData = _monthly.filter(m => (m.total || 0) > 0);
_isFirstEntry = _withData.length === 1;
} catch(e) {}
}
if (_isFirstEntry) {
const _ym = payload.date.slice(0, 7);
S.appStartMonth = _ym;
try { DB.setSetting('appStartMonth', _ym); } catch(e) {}
_clearEarliestDateCache();
const _asmEl = document.getElementById('app-start-month-val');
if (_asmEl) _asmEl.value = _ym;
_updateStartMonthDisplay();
const [, _mm, _dd] = payload.date.split('-');
const _dateLabel = parseInt(_mm) + '月' + parseInt(_dd) + '日';
const _ymLabel   = parseInt(_ym.slice(0,4)) + '年' + parseInt(_ym.slice(5)) + '月';
showModal(
'ダウンロードありがとうございます！',
_dateLabel + ' の支出を記録しました。<br><br>' +
'<strong>' + _ymLabel + '</strong> を利用開始月として登録しました。<br><br>' +
'<span style="font-size:12px;color:#64748b;">設定画面の「利用開始月」からいつでも変更できます。</span>',
false,
() => { clearForm(); updateSummary(); renderInfoPanel(); nav('input'); }
);
} else {
showModal("完了", "保存しました", false, () => { clearForm(); updateSummary(); renderInfoPanel(); nav('input'); });
}
} else {
showModal("エラー", "保存に失敗しました。", false);
}
});
}

function clearForm() {
document.getElementById('amount').value = "";
document.getElementById('itemName').value = "";
document.getElementById('points').value = "";
selCId=null; selTIds.clear(); selCardId=null; isCard=false; editId=-1; originalCreatedAt="";
const cardBtn = document.getElementById('cardBtn');
if (cardBtn) {
cardBtn.classList.remove('on');
cardBtn.textContent = isBizMode() ? '経費' : 'CARD';
}
document.getElementById('pointSection').style.display = 'none';
const _ptsWrap = document.getElementById('points-input-wrap');
if (_ptsWrap) _ptsWrap.style.display = 'none';
document.getElementById('save-btn').innerText = "保存";
isMemoOpen=false;
document.getElementById('memoArea').style.display = 'none';
document.getElementById('memoToggleBtn').innerText = 'メモ ＋';
resetDate(); refresh();
}

// ===== ナビ =====
function nav(m) {
// 予算未設定ブロック（EXP以外の設定で予算未設定のまま設定タブ以外へ移動しようとした場合）
if (m !== 'settings') {
let hasBudget = false;
try {
const period = getCurrentPeriod();
_autoRolloverBudgetIfNeeded(period);
if (typeof DB !== 'undefined' && typeof DB.getBudgetForPeriod === 'function') {
const info   = JSON.parse(DB.getBudgetForPeriod(period.from, period.to));
hasBudget    = info.totalAmount >= 0;
} else {
hasBudget = (parseInt(S.baseBudget) || 0) >= 0 && S.baseBudget !== '';
}
} catch(e) {}
if (S.simpleView !== 'EXP' && !hasBudget) {
showModal(
'⚠️ 基本月予算が未設定です',
'現在の表示設定には予算額が必要です。<br><br>' +
'設定5「予算・固定費の管理」で予算を設定するか、<br>' +
'設定2「表示内容」を「支出額のみ」に変更してください。',
false,
() => { nav('settings'); }
);
// モーダルのOKラベルを変更
const okBtn = document.getElementById('modal-ok');
if (okBtn) okBtn.innerText = '設定へ';
return;
}
}

// 設定タブから離脱する場合で未適用の変更がある場合
const settingsView = document.getElementById('view-settings');
if (settingsView && settingsView.style.display === 'block' && m !== 'settings' && settingsDirty) {
showModal("設定の変更", "変更した設定を適用しますか？\n（キャンセルで設定画面に戻ります）", false, (r) => {
if (r) { saveSettingsToDB(); } else { settingsDirty = false; }
_doNavWithSelCheck(m);
});
return;
}
_doNavWithSelCheck(m);
}
function _doNavWithSelCheck(m) {
if (selItems.size > 0) {
showModal("確認", "選択を解除しますか？", false, (r) => { if(r) { clearSelections(); doNav(m); } });
} else { doNav(m); }
}

function doNav(m) {
document.getElementById('view-input').style.display     = (m==='input'     ? 'block' : 'none');
document.getElementById('view-history').style.display   = (m==='history'   ? 'block' : 'none');
document.getElementById('view-analytics').style.display = (m==='analytics' ? 'block' : 'none');
document.getElementById('view-settings').style.display  = (m==='settings'  ? 'block' : 'none');
document.getElementById('float-input').style.display    = (m==='input'     ? 'flex'  : 'none');
document.getElementById('nav-in').classList.toggle('active',  m==='input');
document.getElementById('nav-hi').classList.toggle('active',  m==='history');
document.getElementById('nav-an').classList.toggle('active',  m==='analytics');
document.getElementById('nav-set').classList.toggle('active', m==='settings');
if (m==='history')   { currentOffset=0; document.getElementById('displayArea').innerHTML=""; subTab(mode); }
if (m==='analytics') { renderAnalytics(); setTimeout(_fixSummaryScrollHeight, 80); }
if (m==='input')     { renderInfoPanel(); }
updateFab();
}

function subTab(m) {
if (mode!==m && selItems.size>0) {
showModal("確認", "選択を解除して切り替えますか？", false, (r) => { if(r) { clearSelections(); doSubTab(m); } });
} else { doSubTab(m); }
}

function doSubTab(m) {
mode=m; currentOffset=0; document.getElementById('displayArea').innerHTML="";
document.getElementById('tab-save').classList.toggle('active',   m==='SAVE');
document.getElementById('tab-delete').classList.toggle('active', m==='DELETE');
// タブ切替で検索状態もクリア
if (searchMode) clearSearch(); else loadMore();
updateFab();
}

// ===== 履歴読み込み =====
let _histRecordMap = {};

function loadMore() {
try {
if (currentOffset === 0) _histRecordMap = {};
let dataRaw;
if (searchMode) {
// 検索フィルタを使用
const f = Object.assign({}, searchFilter, { isDeleteHistory: mode === 'DELETE' });
if (f.useCustom) { f.periodPreset = 'CUSTOM'; }
// sortsが空 or useSort=false の場合はソートなし（DB側デフォルト）
if (!f.useSort) f.sorts = [];
dataRaw = DB.searchRecords(JSON.stringify(f), currentOffset);
} else {
dataRaw = mode==='SAVE' ? DB.getRecords(currentOffset) : DB.getActionLogs('DELETE', currentOffset);
}
const data = JSON.parse(dataRaw || "[]");
if (data.length===0) {
document.getElementById('loadMoreBtn').style.display='none';
if (currentOffset===0) document.getElementById('displayArea').innerHTML="<p style='text-align:center;color:#64748b;padding:20px;'>履歴はありません</p>";
return;
}
const html = data.map(d => buildHistItem(d)).join('');
document.getElementById('displayArea').innerHTML += html;
currentOffset += 20;
document.getElementById('loadMoreBtn').style.display = data.length===20 ? 'block' : 'none';
} catch(e) {
console.error("LoadMore Error:", e);
document.getElementById('displayArea').innerHTML = "<p style='color:red;padding:20px;'>データ形式エラーが発生しました</p>";
}
}

function buildHistItem(d) {
const item = mode==='SAVE' ? d : d.original;
if (!item) return "";
if (mode === 'SAVE') _histRecordMap[d.id] = d;

const dateDisplay = _escHtml((item.date || "2026-01-01").replace(/-/g, '/'));
const tsRaw = item.created_at || '';
const tsDisplay = formatCreatedAt(tsRaw);
const tsHtml = tsDisplay ? `<span class="hist-ts">登録 ${_escHtml(tsDisplay)}</span>` : '';

// カテゴリ名
const catName = _escHtml(d.category || '未分類');

// タグ：カンマ区切りのタグ名文字列
const tagsHtml = d.tags
? d.tags.split(',').filter(t => t.trim()).map(t => `<span class="hist-tag-inline">#${_escHtml(t.trim())}</span>`).join('')
: '';

// カード・ポイント / 経費タグ（支出額の下）
const isCostTag = Number(d.is_cost_tag) === 1 || Number(item.card_id) >= 10000;
const cardHtml = (item.card_id > 0)
? (isCostTag
? `<span class="hist-card">🏷️ ${_escHtml(d.card || '経費')}</span>`
: `<span class="hist-card">💳 ${_escHtml(d.card || 'カード')} +${item.points || 0}pt</span>`)
: '';

// 備考（入力がある場合のみ）
const memoHtml = item.name
? `<div class="hist-memo">📝 ${_escHtml(item.name)}</div>`
: '';

const clickHandler = mode==='SAVE'
? `vibe();editRequestById(${Number(d.id)})`
: '';

return `
<div class="hist-item" style="border-left:4px solid ${mode==='SAVE'?'var(--primary)':'#94a3b8'}">
<input type="checkbox" class="hist-check" onchange="toggleSel(${d.id},this.checked)" ${selItems.has(d.id)?'checked':''}>
<div class="hist-content" onclick="${clickHandler}">
<div class="hist-row">
<div class="hist-left">
<div class="hist-date-row">
<span class="hist-date">${dateDisplay}</span>
${tsHtml}
</div>
<div class="hist-cat-tag-row">
<span class="hist-cat-name">${catName}</span>
${tagsHtml}
</div>
${memoHtml}
</div>
<div class="hist-right">
<span class="hist-price-main">¥${parseInt(item.price||0).toLocaleString()}</span>
${cardHtml}
</div>
</div>
</div>
</div>`;
}

// ===== 選択・FAB（ヘッダー内コンパクト表示に統合） =====
function toggleSel(id, c) { if(c) selItems.add(id); else selItems.delete(id); updateFab(); }

// 選択解除（内部状態 + DOM の両方をクリア）
function clearSelections() {
selItems.clear();
// ネイティブ checkbox の checked プロパティを直接 false にする
document.querySelectorAll('.hist-check').forEach(el => { el.checked = false; });
// ヘッダーの選択中テキストも即クリア
const sc = document.getElementById('select-count');
if (sc) sc.innerText = '';
updateFab();
}

function updateFab() {
const s   = document.getElementById('select-count');
const fab = document.getElementById('actionFab');
// view-history が実際に表示されているかで判定
const histView = document.getElementById('view-history');
const isHist = histView && histView.style.display === 'block';

// 履歴タブ外またはselItemsが空なら必ず非表示
if (!isHist || selItems.size === 0) {
s.innerText = '';
if (fab) fab.style.display = 'none';
return;
}

const label = mode==='SAVE' ? '削除' : '復元';
s.innerText = `${selItems.size}件選択中`;
if (fab) {
fab.style.display = 'flex';
fab.innerHTML = `${selItems.size}件<br>${label}`;
fab.style.background = mode==='SAVE' ? 'var(--danger)' : 'var(--primary)';
fab.style.boxShadow = mode==='SAVE'
? '0 4px 14px rgba(255,82,82,0.4)'
: '0 4px 14px rgba(102,187,106,0.4)';
}
}

function batchAction() {
const ids = Array.from(selItems);
const label = mode==='SAVE' ? '削除' : '復元';
showModal("確認", `${ids.length}件を${label}しますか？`, false, (r) => {
if (r) {
if (mode==='SAVE') ids.forEach(id => DB.deleteLog(id));
else DB.restoreLogs(JSON.stringify(ids));
_clearEarliestDateCache();
selItems.clear(); doSubTab(mode); updateSummary();
}
});
}

function editRequestById(id) {
const item = _histRecordMap[id];
if (item) editRequest(item);
}

function editRequest(item) {
showModal("編集", "編集画面へ移動しますか？", false, (r) => { if(r) fill(item); });
}

function fill(item) {
editId=parseInt(item.id); originalCreatedAt=item.created_at;
document.getElementById('amount').value = item.price;
document.getElementById('date').value = item.date; updateDateLabel(item.date);
document.getElementById('itemName').value = item.name || "";
if (item.name) {
isMemoOpen=true;
document.getElementById('memoArea').style.display='block';
document.getElementById('memoToggleBtn').innerText='メモ ×';
} else {
isMemoOpen=false;
document.getElementById('memoArea').style.display='none';
document.getElementById('memoToggleBtn').innerText='メモ ＋';
}
selCId=parseInt(item.category_id);
selTIds=new Set(item.tag_ids ? item.tag_ids.split(',').filter(x=>x).map(Number) : []);
isCard=(item.card_id>0); selCardId=isCard ? parseInt(item.card_id) : null;
document.getElementById('points').value = item.points || "";
const cardBtn = document.getElementById('cardBtn');
if (cardBtn) {
cardBtn.classList.toggle('on', isCard);
cardBtn.textContent = isBizMode() ? '経費' : 'CARD';
}
document.getElementById('pointSection').style.display = isCard ? 'block' : 'none';
const _ptsWrap = document.getElementById('points-input-wrap');
if (_ptsWrap) _ptsWrap.style.display = (isCard && !isBizMode()) ? 'block' : 'none';
doNav('input');
document.getElementById('save-btn').innerText = "更新/復元";
refresh();
}

// ================================================================
//  検索・並べ替え
// ================================================================
let searchMode   = false;   // 検索結果表示中か
let searchFilter = {
categoryIds:  [],
tagIds:       [],
memo:         '',
cardIds:      [],
periodPreset: 'ALL',
dateFrom:     '',
dateTo:       '',
useCustom:    false,
useSort:      false,
sorts:        [],         // [{field,order}, ...] 最大4件
isDeleteHistory: false
};

const SORT_LABELS = { date:'支出日', price:'支出額', created:'登録日', points:'獲得Pt' };

// ---------- 開く ----------
function openSearch() {
if (selItems.size > 0) {
showModal("確認", "選択を解除して絞込み画面を開きますか？", false, (r) => {
if (!r) return;
clearSelections(); // DOM も含めてクリア
_doOpenSearch();
});
} else {
_doOpenSearch();
}
}
function _doOpenSearch() {
searchFilter.isDeleteHistory = (mode === 'DELETE');
document.getElementById('srch-title').innerText =
searchFilter.isDeleteHistory ? '削除履歴を絞り込む' : '保存履歴を絞り込む';
renderSrchChips();
document.getElementById('search-modal').style.display = 'flex';
}
function closeSearch() { document.getElementById('search-modal').style.display = 'none'; }

// ---------- チップ描画 ----------
function renderSrchChips() {
if (typeof DB === 'undefined') return;
try {
const cats  = JSON.parse(DB.getMaster('categories')  || '[]');
const tags  = JSON.parse(DB.getMaster('custom_tags') || '[]');
const cardTable = isBizMode() ? 'cost_tags' : 'point_cards';
const cards = JSON.parse(DB.getMaster(cardTable) || '[]');

document.getElementById('srch-cat-area').innerHTML = cats.map(c =>
`<div class="srch-chip ${searchFilter.categoryIds.includes(c.id)?'selected':''}"
onclick="vibe();toggleSrchId('categoryIds',${c.id},this)">${_escHtml(c.name)}</div>`
).join('');
document.getElementById('srch-tag-area').innerHTML = tags.map(t =>
`<div class="srch-chip ${searchFilter.tagIds.includes(t.id)?'selected':''}"
onclick="vibe();toggleSrchId('tagIds',${t.id},this)">${_escHtml(t.name)}</div>`
).join('');
document.getElementById('srch-card-area').innerHTML = cards.map(c =>
`<div class="srch-chip ${searchFilter.cardIds.includes(c.id)?'selected':''}"
onclick="vibe();toggleSrchId('cardIds',${c.id},this)">${_escHtml(c.name)}</div>`
).join('');
} catch(e) { console.error(e); }

// メモ
document.getElementById('srch-memo').value = searchFilter.memo;

// プリセット
document.querySelectorAll('#srch-preset-area .srch-period-chip').forEach(el => {
el.classList.toggle('selected', el.dataset.v === searchFilter.periodPreset);
});

// カスタム期間
const useCustom = searchFilter.useCustom;
setCheckBox('srch-chk-custom', useCustom);
document.getElementById('srch-custom-period').style.display = useCustom ? 'block' : 'none';
document.getElementById('srch-date-from').value = searchFilter.dateFrom;
document.getElementById('srch-date-to').value   = searchFilter.dateTo;
updatePresetDisabled(useCustom);

// ソート
const useSort = searchFilter.useSort;
setCheckBox('srch-chk-sort', useSort);
document.getElementById('srch-sort-area').style.display = useSort ? 'block' : 'none';
renderSortList();
updateSortAddButtons(); // ★ 再開時にボタンの有効/無効を必ず再計算
}

function toggleSrchId(key, id, el) {
const arr = searchFilter[key];
const idx = arr.indexOf(id);
if (idx >= 0) { arr.splice(idx,1); el.classList.remove('selected'); }
else          { arr.push(id);      el.classList.add('selected');    }
}

function setSrchPreset(v) {
searchFilter.periodPreset = v;
document.querySelectorAll('#srch-preset-area .srch-period-chip').forEach(el =>
el.classList.toggle('selected', el.dataset.v === v)
);
}

function toggleSrchCustomPeriod() {
searchFilter.useCustom = !searchFilter.useCustom;
setCheckBox('srch-chk-custom', searchFilter.useCustom);
document.getElementById('srch-custom-period').style.display = searchFilter.useCustom ? 'block' : 'none';
updatePresetDisabled(searchFilter.useCustom);
}

function updatePresetDisabled(disabled) {
const area = document.getElementById('srch-preset-area');
area.style.opacity = disabled ? '0.35' : '1';
area.style.pointerEvents = disabled ? 'none' : '';
}

function toggleSrchSort() {
searchFilter.useSort = !searchFilter.useSort;
setCheckBox('srch-chk-sort', searchFilter.useSort);
document.getElementById('srch-sort-area').style.display = searchFilter.useSort ? 'block' : 'none';
}

// ---------- ソート条件 ----------
function addSort(field) {
if (searchFilter.sorts.length >= 4) return;
if (searchFilter.sorts.some(s => s.field === field)) return; // 重複不可
searchFilter.sorts.push({ field, order: 'DESC' });
renderSortList();
updateSortAddButtons();
}

function removeSort(idx) {
searchFilter.sorts.splice(idx, 1);
renderSortList();
updateSortAddButtons();
}

function toggleSortOrder(idx) {
const s = searchFilter.sorts[idx];
s.order = s.order === 'DESC' ? 'ASC' : 'DESC';
renderSortList();
}

function renderSortList() {
const list = document.getElementById('srch-sort-list');
if (!list) return;
if (searchFilter.sorts.length === 0) {
list.innerHTML = '<div style="font-size:11px;color:var(--text-sub);padding:4px 0;">（条件なし）</div>';
return;
}
list.innerHTML = searchFilter.sorts.map((s, i) => `
<div class="srch-sort-item">
<span class="srch-sort-priority">${i+1}</span>
<span class="srch-sort-name">${SORT_LABELS[s.field]||s.field}</span>
<button class="srch-sort-order-btn" onclick="vibe();toggleSortOrder(${i})">${s.order==='DESC'?'↓ 降順':'↑ 昇順'}</button>
<button class="srch-sort-del-btn"   onclick="vibe();removeSort(${i})">✕</button>
</div>`).join('');
}

function updateSortAddButtons() {
const usedFields = new Set(searchFilter.sorts.map(s => s.field));
const full = searchFilter.sorts.length >= 4;
document.querySelectorAll('.srch-sort-field-btn').forEach(btn => {
const used = usedFields.has(btn.dataset.f) || full;
btn.classList.toggle('disabled', used);
btn.style.opacity = used ? '0.35' : '1';
btn.style.pointerEvents = used ? 'none' : '';
});
}

// ---------- 実行・リセット ----------
function execSearch() {
// フォームの値を収集
searchFilter.memo     = document.getElementById('srch-memo').value.trim();
searchFilter.dateFrom = document.getElementById('srch-date-from').value;
searchFilter.dateTo   = document.getElementById('srch-date-to').value;
closeSearch();
searchMode = true;
currentOffset = 0;
document.getElementById('displayArea').innerHTML = '';
document.getElementById('srch-active-bar').style.display = 'flex';
// アクティブバーのチップ更新
_updateSearchActiveChips();
document.getElementById('tab-search').classList.add('active');
loadMore();
}

function clearSearch() {
searchMode = false;
searchFilter = {
categoryIds:[], tagIds:[], memo:'', cardIds:[],
periodPreset:'ALL', dateFrom:'', dateTo:'',
useCustom:false, useSort:false, sorts:[],
isDeleteHistory: (mode === 'DELETE')
};
document.getElementById('srch-active-bar').style.display = 'none';
document.getElementById('tab-search').classList.remove('active');
currentOffset = 0;
document.getElementById('displayArea').innerHTML = '';
loadMore();
}

function resetSearch() {
searchFilter.categoryIds  = [];
searchFilter.tagIds       = [];
searchFilter.memo         = '';
searchFilter.cardIds      = [];
searchFilter.periodPreset = 'ALL';
searchFilter.dateFrom     = '';
searchFilter.dateTo       = '';
searchFilter.useCustom    = false;
searchFilter.useSort      = false;
searchFilter.sorts        = [];
renderSrchChips();
}

// ================================================================
//  予算・固定費管理モーダル
// ================================================================

// モーダル内の現在選択期間
let _bmPeriodFrom = '';
let _bmPeriodTo   = '';

function openBudgetManagerModal() {
const period = getCurrentPeriod();
_bmPeriodFrom = period.from;
_bmPeriodTo   = period.to;
const html = `<div id="bm-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9000;display:flex;align-items:flex-end;"><div style="background:#f8fafc;width:100%;max-height:92vh;border-radius:20px 20px 0 0;overflow:hidden;display:flex;flex-direction:column;position:relative;"><div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px 12px;background:#fff;border-bottom:1px solid #e2e8f0;"><div style="font-size:15px;font-weight:700;color:#1e293b;">予算・固定費管理</div><button onclick="vibe();closeBudgetManagerModal()" style="background:none;border:none;font-size:22px;color:#94a3b8;line-height:1;padding:0 4px;">×</button></div><div style="background:#fff;padding:10px 16px;border-bottom:1px solid #e2e8f0;"><div style="font-size:11px;color:#64748b;margin-bottom:6px;">対象期間</div><div style="display:flex;gap:8px;align-items:center;"><button onclick="vibe();bmPrevPeriod()" style="background:#f1f5f9;border:none;border-radius:8px;padding:6px 12px;font-size:13px;color:#475569;">◀</button><div style="flex:1;text-align:center;font-size:13px;font-weight:600;color:#1e293b;" id="bm-period-label"></div><button onclick="vibe();bmNextPeriod()" style="background:#f1f5f9;border:none;border-radius:8px;padding:6px 12px;font-size:13px;color:#475569;">▶</button></div></div><div style="overflow-y:auto;flex:1;padding:14px 16px;" id="bm-content"></div><div id="bm-sub" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,0.45);z-index:9100;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;"></div></div></div>`;
document.body.insertAdjacentHTML('beforeend', html);
_bmRender();
}

function closeBudgetManagerModal() {
document.getElementById('bm-modal')?.remove();
updateSummary();
updateFixedTotalBadge();
_renderBmCurrentSummary();
renderInfoPanel();
if (document.getElementById('view-analytics')?.style.display === 'block') renderAnalytics();
}

function _bmShowSub(html) {
const sub = document.getElementById('bm-sub');
if (!sub) return;
sub.innerHTML = html;
sub.style.display = 'flex';
}
function _bmCloseSub() {
const sub = document.getElementById('bm-sub');
if (sub) { sub.style.display = 'none'; sub.innerHTML = ''; }
}

function _bmRender() {
const labelEl = document.getElementById('bm-period-label');
if (labelEl) {
const fd = _parseYmd(_bmPeriodFrom), td = _parseYmd(_bmPeriodTo);
const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
labelEl.innerText = fd.getFullYear() === td.getFullYear()
? `${fd.getFullYear()}年 ${fmt(fd)}〜${fmt(td)}`
: `${fd.getFullYear()}/${fmt(fd)}〜${td.getFullYear()}/${fmt(td)}`;
}
let budgetInfo = { baseAmount: -1, extras: [], extraTotal: 0, totalAmount: -1 };
try { budgetInfo = JSON.parse(DB.getBudgetForPeriod(_bmPeriodFrom, _bmPeriodTo)); } catch(e) {}
const fixedLookup = _getFixedLookupDate(_bmPeriodFrom, _bmPeriodTo, !!S.closingOn);
let fixedItems = [];
try { fixedItems = JSON.parse(DB.getFixedCostHistoryAt(fixedLookup)); } catch(e) {}
const fixedTotal = fixedItems.reduce((s, x) => s + x.amount, 0);
const extras  = budgetInfo.extras || [];
const baseAmt = budgetInfo.baseAmount;
const curMode = S.budgetMode || 'BM_AUTO';
const content = document.getElementById('bm-content');
if (!content) return;

const modeOpts = [
['BM_AUTO',    '毎月自動更新',  '設定額を毎期間継続'],
['BM_MONTHLY', '毎月手動入力',  '期間開始時に予算管理画面を表示'],
['BM_ONCE',    '今期のみ設定',  '次期は未設定（手動入力を促す）'],
].map(([val, label, desc]) =>
`<label class="bm-mode-opt${curMode===val?' active':''}" onclick="vibe();bmSetMode('${val}')"><div class="bm-mode-radio${curMode===val?' on':''}"></div><div><div style="font-size:13px;font-weight:600;color:#1e293b;">${label}</div><div style="font-size:11px;color:#64748b;">${desc}</div></div></label>`
).join('');

const extraRows = extras.length === 0
? '<div style="font-size:12px;color:#94a3b8;padding:6px 0;">臨時収入はありません</div>'
: extras.map(e =>
`<div class="bm-item"><div class="bm-item-name">${_escHtml(e.name)}</div><div class="bm-item-amount">+¥ ${e.amount.toLocaleString()}</div><button onclick="vibe();bmEditExtra(${e.id},'${_escJsAttr(e.name)}',${e.amount})" class="bm-item-edit">編集</button><button onclick="vibe();bmDeleteExtra(${e.id})" class="bm-item-del">削除</button></div>`
).join('');

const fixedRows = fixedItems.length === 0
? '<div style="font-size:12px;color:#94a3b8;padding:6px 0;">固定費はありません</div>'
: fixedItems.map(f =>
`<div class="bm-item"><div class="bm-item-name">${_escHtml(f.name)}</div><div class="bm-item-amount">¥ ${f.amount.toLocaleString()}</div><button onclick="vibe();bmEditFixed(${f.id},'${_escJsAttr(f.name)}',${f.amount},'${_escJsAttr(f.validFrom)}')" class="bm-item-edit">編集</button><button onclick="vibe();bmDeleteFixed(${f.id},'${_escJsAttr(f.name)}')" class="bm-item-del">削除</button></div>`
).join('');

content.innerHTML =
`<div class="bm-section"><div class="bm-section-title">予算の更新方法</div><div style="display:flex;flex-direction:column;gap:6px;">${modeOpts}</div></div>` +
`<div class="bm-section"><div class="bm-section-title">基本予算</div><div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;"><input type="number" id="bm-base-input" placeholder="0" value="${baseAmt >= 0 ? baseAmt : ''}" style="flex:1;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;font-weight:600;"><span style="font-size:13px;color:#64748b;">円</span><button onclick="vibe();bmSaveBase()" class="bm-btn-primary">保存</button></div>${baseAmt < 0 ? '<div style="font-size:11px;color:#e67e22;margin-top:2px;">⚠️ この期間の予算が未設定です</div>' : ''}</div>` +
(() => {
const _bmBiz = isBizMode();
const _extraGray = _bmBiz ? 'opacity:0.38;pointer-events:none;user-select:none;' : '';
const _extraNote = _bmBiz ? '<div style="font-size:11px;color:#94a3b8;margin-top:2px;">売上管理モードでは使用しません</div>' : '';
return `<div class="bm-section" style="${_extraGray}"><div class="bm-section-title" style="display:flex;justify-content:space-between;align-items:center;"><span>臨時収入・賞与</span>${_bmBiz ? '' : '<button onclick="vibe();bmAddExtra()" class="bm-btn-add">＋ 追加</button>'}</div>${_extraNote}<div id="bm-extras-list">${extraRows}</div><div class="bm-total-row"><span>基本予算</span><span>¥ ${baseAmt >= 0 ? baseAmt.toLocaleString() : '—'}</span></div>${extras.length > 0 ? `<div class="bm-total-row"><span>臨時収入計</span><span>+ ¥ ${budgetInfo.extraTotal.toLocaleString()}</span></div>` : ''}<div class="bm-total-row bm-total-grand"><span>合計予算</span><span>${budgetInfo.totalAmount >= 0 ? '¥ ' + budgetInfo.totalAmount.toLocaleString() : '—'}</span></div></div>`;
})() +
`<div class="bm-section"><div class="bm-section-title" style="display:flex;justify-content:space-between;align-items:center;"><span>固定費・定期支出</span><button onclick="vibe();bmAddFixed()" class="bm-btn-add">＋ 追加</button></div><div id="bm-fixed-list">${fixedRows}</div><div class="bm-total-row bm-total-grand"><span>固定費合計</span><span>¥ ${fixedTotal.toLocaleString()}</span></div></div>`;
}

function _escQ(s) { return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function _escJsAttr(s) { return _escHtml(_escQ(s)); }

function bmPrevPeriod() { _bmMovePeriod(-1); }
function bmNextPeriod() { _bmMovePeriod(+1); }

function _bmMovePeriod(dir) {
const unit = S.periodUnit || 'MONTH';
if (unit === 'WEEK') {
const f = _parseYmd(_bmPeriodFrom); f.setDate(f.getDate() + dir * 7);
const t = _parseYmd(_bmPeriodTo);   t.setDate(t.getDate() + dir * 7);
_bmPeriodFrom = _ymd(f);
_bmPeriodTo   = _ymd(t);
} else if (unit === 'YEAR') {
const y = parseInt(_bmPeriodFrom.slice(0, 4)) + dir;
_bmPeriodFrom = `${y}-01-01`;
_bmPeriodTo   = `${y}-12-31`;
} else if (unit === 'SEASON') {
const anchor = parseInt(S.periodStartDay) || 25;
const p = _calcSeasonPeriod(_parseYmd(_bmPeriodFrom), S.seasonType || 'Q', !!S.closingOn, anchor, dir);
_bmPeriodFrom = p.from;
_bmPeriodTo   = p.to;
} else if (S.closingOn) {
const p = dir < 0 ? _calcPrevClosingPeriod(_bmPeriodFrom) : _calcNextClosingPeriod(_bmPeriodTo);
_bmPeriodFrom = p.from;
_bmPeriodTo   = p.to;
} else {
let ny = parseInt(_bmPeriodFrom.slice(0, 4)), nm = parseInt(_bmPeriodFrom.slice(5, 7)) + dir;
if (nm < 1)  { nm += 12; ny--; }
if (nm > 12) { nm -= 12; ny++; }
_bmPeriodFrom = `${ny}-${_pad2(nm)}-01`;
_bmPeriodTo   = `${ny}-${_pad2(nm)}-${_pad2(_lastDayOfMonth(ny, nm))}`;
}
_bmRender();
}

function bmSetMode(mode) {
S.budgetMode = mode;
try { DB.setSetting('budgetMode', mode); } catch(e) {}
if (mode === 'BM_AUTO') {
_autoRolloverBudgetIfNeeded({ from: _bmPeriodFrom, to: _bmPeriodTo });
}
_bmRender();
_renderBmCurrentSummary();
}

function bmSaveBase() {
const raw = document.getElementById('bm-base-input')?.value?.trim() ?? '';
const val = Number(raw);
if (raw === '' || isNaN(val) || val < 0) {
showToast('0以上の金額を入力してください');
return;
}
const intVal = Math.round(val);
_checkStartMonthGuard(_bmPeriodFrom.slice(0, 7), () => {
try {
DB.setBudgetBase(_bmPeriodFrom, _bmPeriodTo, intVal);
if (_bmPeriodFrom === getCurrentPeriod().from) {
S.baseBudget = String(intVal);
try { DB.setSetting('baseBudget', String(intVal)); } catch(e) {}
}
_bmRender();
updateSummary();
_renderBmCurrentSummary();
} catch(e) { alert('保存に失敗しました'); }
});
}

function bmAddExtra()          { _bmExtraDialog(null, '', 0); }
function bmEditExtra(id, n, a) { _bmExtraDialog(id, n, a); }
function _bmExtraDialog(id, name, amount) {
const isNew = !id;
_bmShowSub(
`<div class="bm-sub-box">` +
`<div class="bm-sub-title">${isNew ? '臨時収入を追加' : '臨時収入を編集'}</div>` +
`<div class="bm-sub-field"><div class="bm-sub-label">名称（例：夏季賞与、臨時収入）</div><input type="text" id="bex-name" value="${_escHtml(name)}" placeholder="名称" class="bm-sub-input"></div>` +
`<div class="bm-sub-field"><div class="bm-sub-label">金額（円）</div><input type="number" id="bex-amount" value="${amount||''}" placeholder="0" class="bm-sub-input"></div>` +
`<div class="bm-sub-btns"><button onclick="vibe();_bmCloseSub()" class="bm-sub-cancel">キャンセル</button><button onclick="vibe();_bmSaveExtra(${id||'null'})" class="bm-sub-ok">保存</button></div>` +
`</div>`
);
}
function _bmSaveExtra(id) {
const n = document.getElementById('bex-name')?.value?.trim();
const a = parseInt(document.getElementById('bex-amount')?.value) || 0;
if (!n) return;
try {
if (id) { DB.updateBudgetExtra(id, n, a); }
else     { DB.addBudgetExtra(_bmPeriodFrom, n, a); }
_bmCloseSub(); _bmRender(); updateSummary();
} catch(e) { alert('保存に失敗しました'); }
}
function bmDeleteExtra(id) {
_bmShowSub(
`<div class="bm-sub-box">` +
`<div class="bm-sub-title">削除の確認</div>` +
`<div style="font-size:13px;color:#475569;margin-bottom:18px;">この臨時収入を削除しますか？</div>` +
`<div class="bm-sub-btns"><button onclick="vibe();_bmCloseSub()" class="bm-sub-cancel">キャンセル</button><button onclick="vibe();_bmConfirmDeleteExtra(${id})" class="bm-sub-del">削除</button></div>` +
`</div>`
);
}
function _bmConfirmDeleteExtra(id) {
try { DB.deleteBudgetExtra(id); _bmCloseSub(); _bmRender(); updateSummary(); } catch(e) {}
}

function bmAddFixed()                      { _bmFixedDialog(null, '', 0, ''); }
function bmEditFixed(id, name, amount, vf) { _bmFixedDialog(id, name, amount, vf); }
function _bmFixedDialog(id, name, amount, existingVf) {
const isNew = !id;
const monthStart = _getFixedLookupDate(_bmPeriodFrom, _bmPeriodTo, !!S.closingOn);
const existingNote = (!isNew && existingVf) ? `（現在の適用開始: ${_escHtml(existingVf.slice(0, 7))}）` : '';
_bmShowSub(
`<div class="bm-sub-box">` +
`<div class="bm-sub-title">${isNew ? '固定費を追加' : '固定費を編集'}</div>` +
`<div class="bm-sub-field"><div class="bm-sub-label">名称</div><input type="text" id="bfc-name" value="${_escHtml(name)}" placeholder="家賃、電気代など" class="bm-sub-input"></div>` +
`<div class="bm-sub-field"><div class="bm-sub-label">金額（円）</div><input type="number" id="bfc-amount" value="${amount||''}" placeholder="0" class="bm-sub-input"></div>` +
`<div class="bm-sub-field"><div class="bm-sub-label">適用開始日（月初）<span style="font-size:10px;color:#94a3b8;"> 対象期間に連動</span></div><input type="month" id="bfc-from-month" value="${monthStart.slice(0,7)}" class="bm-sub-input"></div>` +
(!isNew ? `<div style="font-size:11px;color:#e67e22;margin:-4px 0 8px;">※ 変更前の履歴は保持されます${existingNote}</div>` : '') +
`<div class="bm-sub-btns"><button onclick="vibe();_bmCloseSub()" class="bm-sub-cancel">キャンセル</button><button onclick="vibe();_bmSaveFixed(${id||'null'})" class="bm-sub-ok">保存</button></div>` +
`</div>`
);
}
function _bmSaveFixed(id) {
const n  = document.getElementById('bfc-name')?.value?.trim();
const a  = parseInt(document.getElementById('bfc-amount')?.value) || 0;
const monthVal = document.getElementById('bfc-from-month')?.value;
let vfRaw = monthVal ? monthVal + '-01' : getCurrentPeriod().from;
if (S.appStartMonth && vfRaw.slice(0, 7) < S.appStartMonth) {
vfRaw = S.appStartMonth + '-01';
}
const vf = vfRaw;
if (!n || a <= 0) return;
_checkStartMonthGuard(monthVal || getCurrentPeriod().from.slice(0, 7), () => {
try {
if (!id) { DB.addFixedCostHistory(n, a, 0, vf); }
else      { DB.changeFixedCostHistory(id, n, a, 0, vf); }
_bmCloseSub(); _bmRender(); updateSummary(); updateFixedTotalBadge(); _renderBmCurrentSummary(); _clearEarliestDateCache();
} catch(e) { alert('保存に失敗しました'); }
});
}
function bmDeleteFixed(id, name) {
const bmTo = _parseYmd(_bmPeriodTo);
const defMonth = bmTo.getFullYear() + '-' + _pad2(bmTo.getMonth()+1);
_bmShowSub(
`<div class="bm-sub-box">` +
`<div class="bm-sub-title">削除の確認</div>` +
`<div style="font-size:13px;color:#475569;margin-bottom:6px;">「${_escHtml(name)}」を削除します。</div>` +
`<div class="bm-sub-field"><div class="bm-sub-label">終了月（翌月以降は計上されなくなります）</div><input type="month" id="bfc-end-month" value="${defMonth}" class="bm-sub-input"></div>` +
`<div class="bm-sub-btns"><button onclick="vibe();_bmCloseSub()" class="bm-sub-cancel">キャンセル</button><button onclick="vibe();_bmConfirmDeleteFixed(${id})" class="bm-sub-del">削除</button></div>` +
`</div>`
);
}
function _bmConfirmDeleteFixed(id) {
const monthVal = document.getElementById('bfc-end-month')?.value;
let endDate;
if (monthVal) {
const [y, m] = monthVal.split('-').map(Number);
const nextM = m === 12 ? 1 : m + 1;
const nextY = m === 12 ? y + 1 : y;
endDate = `${nextY}-${_pad2(nextM)}-01`;
} else {
endDate = _bmPeriodTo;
}
try { DB.endFixedCostHistory(id, endDate); _bmCloseSub(); _bmRender(); updateSummary(); updateFixedTotalBadge(); _renderBmCurrentSummary(); } catch(e) {}
}


// ================================================================
//  エクスポート・インポート
// ================================================================
function doExport() {
showModal('エクスポート確認', '全データをJSONファイルに保存します。<br><small style="color:var(--text-sub);">保存先: Downloads/KakeiboBackup/アカウント名/</small>', false, (r) => {
if (!r) return;
try {
const path = DB.exportToFile();
if (path.startsWith('ERROR')) {
showModal('エラー', 'エクスポートに失敗しました。<br>' + path, false);
} else {
showModal('完了', `エクスポートしました。<br><br><span style="font-size:11px;word-break:break-all;color:var(--text-sub);">${path}</span>`, false);
}
} catch(e) {
showModal('エラー', 'エクスポートに失敗しました。<br>' + e.message, false);
}
});
}

function openImportModal() {
const body = `<div style="font-size:13px;color:var(--dark);margin-bottom:6px;">
バックアップJSONファイルを選択してください。
</div>
<div style="font-size:12px;color:var(--text-sub);line-height:1.6;">
・ダウンロードフォルダが初期表示されます<br>
・ファイルの内容を確認してからインポートします<br>
・<b style="color:var(--danger);">既存データは上書きされます</b>
</div>`;
showModal('JSONインポート', body, false, (r) => {
if (!r) return;
try {
DB.openImportFilePicker();
} catch(e) {
showModal('エラー', 'ファイルピッカーを開けませんでした。<br>' + e.message, false);
}
});
}

// E2: MainActivity からファイル読み込み後に呼ばれる → 確認ダイアログ表示
function onImportFileReady(metaJson) {
try {
const meta = JSON.parse(metaJson);
const fileAcct   = _escHtml(meta.fileAccount    || '不明');
const exportedAt = _escHtml(meta.exportedAt     || '不明');
const count      = Number(meta.recordCount || 0);
const curAcct    = _escHtml(meta.currentAccount || '不明');

const isDiff = (meta.fileAccount || '不明') !== '不明' && meta.fileAccount !== meta.currentAccount;
const warnHtml = isDiff
? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12px;color:#856404;">
⚠️ ファイルのアカウント（<b>${fileAcct}</b>）と<br>
現在のアカウント（<b>${curAcct}</b>）が異なります
</div>`
: '';

const body = `
<div style="font-size:13px;line-height:1.8;">
<div style="display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding-bottom:6px;margin-bottom:6px;">
<span style="color:var(--text-sub);">ファイルのアカウント</span>
<b>${fileAcct}</b>
</div>
<div style="display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding-bottom:6px;margin-bottom:6px;">
<span style="color:var(--text-sub);">バックアップ日時</span>
<b style="font-size:11px;">${exportedAt}</b>
</div>
<div style="display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding-bottom:6px;margin-bottom:6px;">
<span style="color:var(--text-sub);">データ件数</span>
<b>${count.toLocaleString()}件</b>
</div>
<div style="display:flex;justify-content:space-between;padding-bottom:4px;">
<span style="color:var(--text-sub);">上書き先</span>
<b style="color:var(--danger);">${curAcct}</b>
</div>
${warnHtml}
</div>
<div style="font-size:11px;color:var(--text-sub);margin-top:10px;">
現在のデータは自動バックアップ後に上書きされます
</div>`;

showModal('インポート確認', body, false, (r) => {
if (!r) { try { DB.cancelImport(); } catch(e) {} return; }
try {
const result = DB.confirmImport();
if (!result || result === '') {
refreshAfterImport();
_clearEarliestDateCache(); showModal('インポート完了', 'データのインポートが完了しました。', false);
} else {
showModal('エラー', 'インポートに失敗しました。<br><span style="font-size:11px;">' + _escHtml(result) + '</span>', false);
}
} catch(e) {
showModal('エラー', 'インポートに失敗しました。<br>' + _escHtml(e.message), false);
}
});

const okBtn = document.getElementById('modal-ok');
if (okBtn) okBtn.innerText = 'インポート実行';

} catch(e) {
showModal('エラー', 'ファイルの解析に失敗しました。<br>' + _escHtml(e.message), false);
}
}

function onImportFileResult(result) {
if (!result) {
refreshAfterImport();
_clearEarliestDateCache(); showModal('インポート完了', 'データのインポートが完了しました。', false);
} else {
showModal('エラー', 'インポートに失敗しました。<br><span style="font-size:11px;">' + _escHtml(result) + '</span>', false);
}
}

function refreshAfterImport() {
try {
loadSettingsFromDB();
_clearEarliestDateCache();
updateFixedTotalBadge();
_renderBmCurrentSummary();

if (typeof refresh === 'function') refresh();
if (typeof updateSummary === 'function') updateSummary();
if (typeof renderInfoPanel === 'function') renderInfoPanel();
if (typeof refreshPointsCardUI === 'function') refreshPointsCardUI();

searchMode = false;
selItems.clear();
updateFab();
document.getElementById('srch-active-bar').style.display = 'none';
document.getElementById('tab-search').classList.remove('active');
const histView = document.getElementById('view-history');
if (histView && histView.style.display === 'block') {
currentOffset = 0;
document.getElementById('displayArea').innerHTML = '';
loadMore();
}
if (document.getElementById('view-analytics')?.style.display === 'block') renderAnalytics();
if (typeof initAccount === 'function') initAccount();
} catch(e) { console.error('refreshAfterImport:', e); }
}


// ===================================================
//  アカウント管理
// ===================================================
function initAccount() {
try {
acctInfo = JSON.parse(DB.getAccountInfo());
renderAcctHeader();
renderAcctSettings();
} catch(e) { console.error('initAccount:', e); }
}

function renderAcctHeader() {
const cur = acctInfo.accounts.find(a => a.id === acctInfo.current);
if (cur) document.getElementById('acct-label').innerText = cur.name;
}

function renderAcctSettings() {
const list = document.getElementById('acct-settings-list');
if (!list) return;
list.innerHTML = acctInfo.accounts.map(a => {
const isCur = a.id === acctInfo.current;
return `<div class="acct-setting-row ${isCur?'acct-setting-cur':''}">
<div style="display:flex;align-items:center;gap:8px;flex:1;">
<span class="acct-setting-dot ${isCur?'acct-dot-on':''}"></span>
<span id="acct-name-disp-${a.id}" class="acct-name-text">${_escHtml(a.name)}</span>
<input id="acct-name-input-${a.id}" class="acct-name-input" type="text"
value="${_escHtml(a.name)}" style="display:none;"
onblur="commitAcctName(${a.id})" onkeydown="if(event.key==='Enter')this.blur()">
</div>
<div style="display:flex;gap:6px;align-items:center;">
<button class="acct-edit-btn" onclick="vibe();startAcctRename(${a.id})">✏️</button>
${!isCur
? `<button class="acct-switch-btn" onclick="vibe();confirmSwitchAccount(${a.id})">切替</button>`
: '<span class="acct-cur-badge">使用中</span>'}
</div>
</div>`;
}).join('') +
`<div style="margin-top:14px;padding-top:12px;border-top:1px solid #fee2e2;">
<button onclick="vibe();openAccountResetModal()"
style="width:100%;padding:12px;border:1.5px solid #e11d48;border-radius:10px;
background:#fff1f2;color:#e11d48;font-size:13px;font-weight:600;cursor:pointer;">
🗑️ アカウントのリセット
</button>
<div style="font-size:11px;color:#94a3b8;margin-top:6px;line-height:1.5;">
支出・予算・固定費・設定を削除します。カテゴリ等のマスターは保持されます。
</div>
</div>`;
}

function toggleAcctDropdown() {
const dd = document.getElementById('acct-dropdown');
const arrow = document.getElementById('acct-arrow');
if (dd.style.display === 'none') {
const inner = document.getElementById('acct-dd-inner');
inner.innerHTML = acctInfo.accounts.map(a => {
const isCur = a.id === acctInfo.current;
return `<div class="acct-dd-item ${isCur?'acct-dd-cur':''}" onclick="vibe();${isCur?'closeAcctDropdown()':'confirmSwitchAccount('+a.id+')'}">
${isCur ? '✓ ' : ''}${_escHtml(a.name)}
</div>`;
}).join('');
dd.style.display = 'flex';
arrow.innerText = '▲';
} else {
closeAcctDropdown();
}
}

function closeAcctDropdown() {
document.getElementById('acct-dropdown').style.display = 'none';
document.getElementById('acct-arrow').innerText = '▼';
}

function confirmSwitchAccount(id) {
closeAcctDropdown();
const target = acctInfo.accounts.find(a => a.id === id);
if (!target) return;
const hasInput = document.getElementById('amount')?.value;
const hasSel   = selItems.size > 0;
const msgs = [];
if (hasInput || hasSel) msgs.push('入力中・選択中の内容は失われます。');
if (settingsDirty)      msgs.push('設定の変更は自動保存されます。');
const msg = `「${target.name}」に切り替えますか？` + (msgs.length ? '\n' + msgs.join('\n') : '');
showModal('アカウント切替', msg, false, (r) => {
if (!r) return;
if (settingsDirty) saveSettingsToDB(); // 切替前に現アカウントの設定を保存
try { DB.switchAccount(id); } catch(e) { showModal('エラー', e.message, false); }
});
}

// ===== アカウントリセット =====
function openAccountResetModal() {
const rows = acctInfo.accounts.map(a => {
const isCur = a.id === acctInfo.current;
return '<button onclick="vibe();selectAccountToReset(' + a.id + ')" style="' +
'display:block;width:100%;padding:13px 16px;margin-bottom:8px;' +
'border:2px solid ' + (isCur ? '#e11d48' : '#cbd5e1') + ';' +
'border-radius:12px;background:' + (isCur ? '#fff1f2' : '#f8fafc') + ';' +
'font-size:14px;font-weight:' + (isCur ? '700' : '500') + ';' +
'color:' + (isCur ? '#e11d48' : '#1e293b') + ';text-align:left;cursor:pointer;">' +
(isCur ? '⚠️ ' : '') + _escHtml(a.name) + (isCur ? '（使用中）' : '') +
'</button>';
}).join('');
const body =
'<p style="margin:0 0 14px;font-size:13px;color:#64748b;line-height:1.6;">' +
'リセットするとアカウントの支出・予算・固定費・設定がすべて削除されます。<br>' +
'カテゴリ・タグ・カードのマスターデータは保持されます。</p>' +
rows;
document.getElementById('modal-title').innerText = '🗑️ アカウントリセット';
document.getElementById('modal-body').innerHTML  = body;
document.getElementById('app-modal').style.display = 'flex';
document.querySelector('.modal-btns').style.display = 'none';
}

function selectAccountToReset(id) {
const target = acctInfo.accounts.find(a => a.id === id);
if (!target) return;
const isCur = id === acctInfo.current;
const body =
'<p style="margin:0 0 10px;font-size:14px;line-height:1.6;">' +
'<strong style="color:#e11d48;">' + _escHtml(target.name) + '</strong> のデータをすべて削除します。<br>' +
(isCur ? '<span style="font-size:12px;color:#e11d48;">⚠️ 現在使用中のアカウントです</span><br>' : '') +
'</p>' +
'<p style="font-size:13px;color:#64748b;margin:0 0 12px;">確認のため、アカウント名を入力してください。</p>' +
'<input id="reset-confirm-input" type="text" placeholder="' + _escHtml(target.name) + '" ' +
'style="width:100%;padding:12px;border:2px solid #e11d48;border-radius:10px;' +
'font-size:15px;box-sizing:border-box;margin-bottom:12px;">' +
'<div style="display:flex;gap:8px;">' +
'<button onclick="closeModal()" style="flex:1;padding:12px;border:1px solid #cbd5e1;' +
'border-radius:10px;background:#f8fafc;font-size:14px;cursor:pointer;">キャンセル</button>' +
'<button id="reset-execute-btn" data-acct-id="' + id + '" onclick="executeAccountReset(this)" ' +
'style="flex:1;padding:12px;border:none;border-radius:10px;background:#e11d48;' +
'color:white;font-size:14px;font-weight:700;cursor:pointer;">リセット実行</button>' +
'</div>';
document.getElementById('modal-title').innerText = '⚠️ 最終確認';
document.getElementById('modal-body').innerHTML  = body;
setTimeout(() => document.getElementById('reset-confirm-input')?.focus(), 100);
}

function executeAccountReset(btn) {
const id = parseInt(btn.dataset.acctId);
const target = acctInfo.accounts.find(a => a.id === id);
const expectedName = target?.name || '';
const input = document.getElementById('reset-confirm-input')?.value?.trim();
if (input !== expectedName) {
document.getElementById('reset-confirm-input').style.borderColor = '#ef4444';
document.getElementById('reset-confirm-input').placeholder = '名前が一致しません';
document.getElementById('reset-confirm-input').value = '';
return;
}
closeModal();
try {
DB.resetAccount(id);
} catch(e) {
showModal('エラー', 'リセットに失敗しました: ' + e.message, false);
}
}

function onAccountReset(infoJson) {
acctInfo = JSON.parse(infoJson);
_applyInitialSettings();
_clearEarliestDateCache();
selItems.clear();
currentOffset = 0;
document.getElementById('displayArea').innerHTML = '';
refresh();
updateSummary();
updateFixedTotalBadge();
_renderBmCurrentSummary();
renderInfoPanel();
renderAcctSettings();
if (document.getElementById('view-analytics')?.style.display === 'block') renderAnalytics();
showToast('アカウントをリセットしました');
}

function onAccountSwitched(infoJson) {
acctInfo = JSON.parse(infoJson);
renderAcctHeader();
renderAcctSettings();
loadSettingsFromDB();
_clearEarliestDateCache();
anUseClosing = null;
anPreset = 'MONTH';
anCatIds = [];
anTagIds = [];
anMemo = '';
anPtsBreakdown = false;
document.querySelectorAll('.an-period-chip').forEach(el =>
el.classList.toggle('selected', el.dataset.v === 'MONTH'));
const customArea = document.getElementById('an-custom-period');
if (customArea) customArea.style.display = 'none';
_updateAnActiveChips();
searchMode = false;
searchFilter = {
categoryIds:[], tagIds:[], memo:'', cardIds:[],
periodPreset:'ALL', dateFrom:'', dateTo:'',
useCustom:false, useSort:false, sorts:[],
isDeleteHistory: (mode === 'DELETE')
};
const srchBar = document.getElementById('srch-active-bar');
if (srchBar) srchBar.style.display = 'none';
document.getElementById('tab-search')?.classList.remove('active');
selItems.clear();
currentOffset = 0;
document.getElementById('displayArea').innerHTML = '';
refresh();
updateSummary();
updateFixedTotalBadge();
_renderBmCurrentSummary();
renderInfoPanel();
refreshPointsCardUI();
if (document.getElementById('view-history')?.style.display === 'block') loadMore();
if (document.getElementById('view-analytics')?.style.display === 'block') renderAnalytics();
}

function updateHeaderAccountName(name) {
document.getElementById('acct-label').innerText = name;
}

function startAcctRename(id) {
document.getElementById('acct-name-disp-'+id).style.display  = 'none';
const inp = document.getElementById('acct-name-input-'+id);
inp.style.display = 'inline-block';
inp.focus();
inp.select();
}

function commitAcctName(id) {
const inp  = document.getElementById('acct-name-input-'+id);
const name = inp.value.trim();
if (!name) { inp.value = acctInfo.accounts.find(a=>a.id===id)?.name || ''; }
else {
try {
DB.setAccountName(id, name);
// ローカルステートも更新
const a = acctInfo.accounts.find(a => a.id === id);
if (a) a.name = name;
} catch(e) {}
}
document.getElementById('acct-name-disp-'+id).innerText = name || acctInfo.accounts.find(a=>a.id===id)?.name;
document.getElementById('acct-name-disp-'+id).style.display = '';
inp.style.display = 'none';
}

// ===================================================
//  分析タブ
// ===================================================
function setAnTab(tab) {
anTab = tab;
document.querySelectorAll('.an-tab').forEach(el =>
el.classList.toggle('active', el.id === 'an-tab-' + tab));
renderAnalytics();
setTimeout(_fixSummaryScrollHeight, 80);
}

function setAnPreset(preset) {
anPreset = preset;
document.querySelectorAll('.an-period-chip').forEach(el =>
el.classList.toggle('selected', el.dataset.v === preset));
const customArea = document.getElementById('an-custom-period');
customArea.style.display = preset === 'CUSTOM' ? 'block' : 'none';
if (preset !== 'CUSTOM') renderAnalytics();
}

function getAnDateRange() {
const _rawRange = _getAnDateRangeRaw();
if (anPreset === 'CUSTOM') return _rawRange;
const _earliest = _getEarliestRecordDate();
if (anPreset === 'ALL') {
return { from: S.appStartMonth ? _earliest : '', to: _rawRange.to };
}
const clampedFrom = (!_rawRange.from || _rawRange.from < _earliest) ? _earliest : _rawRange.from;
if (_rawRange.to && clampedFrom > _rawRange.to) {
return _rawRange;
}
return { from: clampedFrom, to: _rawRange.to };
}
function _getAnDateRangeRaw() {
const useClosing = (anUseClosing !== null) ? anUseClosing : (S.closingOn === true || S.closingOn === 'true');
const now   = new Date();
const today = _todayYmd();

if (anPreset === 'CUSTOM') {
return {
from: document.getElementById('an-date-from')?.value || '',
to:   document.getElementById('an-date-to')?.value   || today
};
}
if (anPreset === 'ALL') return { from: '', to: '' };

// ── 締日連動ON：全プリセットを締日期間ベースで計算 ──────────────
if (useClosing) {
const anchor = parseInt(S.periodStartDay) || 25;
const p = _calcClosingPeriodForDate(now, anchor);
if (anPreset === 'MONTH')      return { from: p.from, to: p.to };
if (anPreset === 'PREV_MONTH') {
const prev = _calcPrevClosingPeriod(p.from, anchor);
return { from: prev.from, to: prev.to };
}
const nPeriods = anPreset === '3M' ? 3 : anPreset === '6M' ? 6 : 12;
let startFrom = p.from;
for (let i = 1; i < nPeriods; i++) {
startFrom = _calcPrevClosingPeriod(startFrom, anchor).from;
}
return { from: startFrom, to: p.to };
}

// ── 締日連動OFF：カレンダー月ベース ───────────────────────────
if (anPreset === 'MONTH') {
const y = now.getFullYear(), m = now.getMonth() + 1;
return {
from: `${y}-${_pad2(m)}-01`,
to:   `${y}-${_pad2(m)}-${_pad2(_lastDayOfMonth(y, m))}`
};
}
if (anPreset === 'PREV_MONTH') {
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const y = prev.getFullYear(), m = prev.getMonth() + 1;
return {
from: `${y}-${_pad2(m)}-01`,
to:   `${y}-${_pad2(m)}-${_pad2(_lastDayOfMonth(y, m))}`
};
}
const monthsBack = anPreset === '3M' ? 3 : anPreset === '6M' ? 6 : 12;
let startY = now.getFullYear(), startM = now.getMonth() + 1 - (monthsBack - 1);
while (startM < 1) { startM += 12; startY--; }
const endY = now.getFullYear(), endM = now.getMonth() + 1;
return {
from: `${startY}-${_pad2(startM)}-01`,
to:   `${endY}-${_pad2(endM)}-${_pad2(_lastDayOfMonth(endY, endM))}`
};
}

// 指定日を含む締日期間の開始日を返す（境界スナップ）
function _snapToClosingPeriodStart(dateStr, anchor) {
if (!dateStr) return dateStr;
return _calcClosingPeriodForDate(_parseYmd(dateStr), anchor).from;
}

// 固定費トグル
function toggleAnFixed() {
vibe();
anShowFixed = !anShowFixed;
_updateAnFixedBtn();
renderAnalytics();
}
function toggleAnNoBudget() {
vibe();
anHideNoBudget = !anHideNoBudget;
_updateAnNoBudgetBtn();
renderAnalytics();
}
function _updateAnNoBudgetBtn() {
const btn = document.getElementById('an-nobudget-btn');
if (!btn) return;
btn.style.display = (anTab === 'budget') ? '' : 'none';
btn.classList.toggle('an-closing-on', anHideNoBudget);
btn.querySelector('.an-nobudget-label').innerText =
anHideNoBudget ? '⛔ 未設定除外 ON' : '⛔ 未設定除外 OFF';
}
function _updateAnFixedBtn() {
const btn = document.getElementById('an-fixed-btn');
if (!btn) return;
// 固定費機能がOFFなら非表示
btn.style.display = (S.fixedOn === true || S.fixedOn === 'true') ? '' : 'none';
btn.classList.toggle('an-closing-on', anShowFixed);
btn.querySelector('.an-fixed-label').innerText = anShowFixed ? '💴 固定費 ON' : '💴 固定費 OFF';
}

// ===== 入力タブ：カテゴリ・タグ折り畳み =====
function toggleInputSection(areaId, btnId) {
const area = document.getElementById(areaId);
const btn  = document.getElementById(btnId);
if (!area || !btn) return;
const collapsed = area.style.display === 'none';
area.style.display = collapsed ? '' : 'none';
btn.textContent   = collapsed ? '▲' : '▼';
}

// 分析サマリースクロール領域の最大高さを動的計算

// =====================================================
// 集計スクロール領域の高さをピクセルで直接セット
// flex チェーンに依存せず Android WebView でも確実に動作させる
// =====================================================
function _fixSummaryScrollHeight() {
// #view-analytics の高さ（fixed: top30 〜 bottom65）から上部要素を引く。
// cardTop に依存しないため fold/unfold どちらでも正確に動作する。
requestAnimationFrame(function() {
const viewEl = document.getElementById('view-analytics');
if (!viewEl) return;
const viewH = viewEl.getBoundingClientRect().height; // innerHeight - 30(header) - 65(tabbar)

// 各上部要素の高さ（display:none なら getBCR は 0 を返す）
const filterCard = document.getElementById('an-filter-card');
const chartCard  = document.getElementById('an-chart-card');
// タブ行 = .an-tabs の親要素
const anTabsEl   = document.querySelector('.an-tabs');
const tabRowEl   = anTabsEl ? anTabsEl.parentElement : null;

const rcH = el => (el ? el.getBoundingClientRect().height : 0);

const filterH = rcH(filterCard);
const tabRowH = rcH(tabRowEl);
// chart-card が style.display='none' のとき getBCR().height は 0
const chartH  = rcH(chartCard);

// view の padding-top(8px) + 要素間のマージン合計(約8px) = 16
const usedH = filterH + tabRowH + chartH + 16;
const cardH = Math.max(80, viewH - usedH);

const card = document.getElementById('an-summary-card');
if (card) card.style.height = cardH + 'px';

// スクロール要素 = カード高さ - section-card padding(20px) - 合計行
const scrollEl = document.getElementById('an-scroll-body');
if (!scrollEl) return;
const totalRow = scrollEl.nextElementSibling;
const totalH   = totalRow ? totalRow.getBoundingClientRect().height : 0;
const scrollH  = Math.max(40, cardH - totalH - 20);

scrollEl.style.height                  = scrollH + 'px';
scrollEl.style.overflowY               = 'scroll';
scrollEl.style.webkitOverflowScrolling = 'touch';
scrollEl.style.display                 = 'block';
});
}

function _calcSummaryMaxH() {
const vh      = window.innerHeight;
const tabBarH = 65;
const cardH   = 52; // 合計行 or ヘッダー行の固定部分
const margin  = 8;

const filterCard = document.getElementById('an-filter-card');
const chartCard  = document.getElementById('an-chart-card');
const tabsEl     = document.querySelector('.an-tabs');

const elH = el => (el && el.style.display !== 'none')
? el.getBoundingClientRect().height : 0;

const usedH = elH(filterCard) + elH(tabsEl)
+ (chartCard && chartCard.style.display !== 'none' ? elH(chartCard) : 0)
+ tabBarH + cardH + margin * 4;

return Math.max(80, vh - usedH);
}

// フィルターエリア折り畳み
function toggleAnFilterCard() {
const body = document.getElementById('an-filter-body');
const btn  = document.getElementById('an-filter-fold-btn');
if (!body || !btn) return;
const collapsed = body.style.display === 'none';
body.style.display = collapsed ? '' : 'none';
btn.textContent = collapsed ? '▲' : '▼';
_fixSummaryScrollHeight();
}

// グラフエリア折り畳み
function toggleAnChartCard() {
const card = document.getElementById('an-chart-card');
const btn  = document.getElementById('an-chart-fold-btn');
if (!card || !btn) return;
const collapsed = card.style.display === 'none';
card.style.display = collapsed ? '' : 'none';
btn.textContent = collapsed ? '▲' : '▼';
// データ再取得不要 - レイアウト再計算のみ
_fixSummaryScrollHeight();
}

// 締日連動トグル
function toggleAnClosing() {
vibe();
const useClosing = (anUseClosing !== null) ? anUseClosing : (S.closingOn === true || S.closingOn === 'true');
anUseClosing = !useClosing;
_updateAnClosingBtn();
renderAnalytics();
}
function _updateAnClosingBtn() {
const btn = document.getElementById('an-closing-btn');
if (!btn) return;
const useClosing = (anUseClosing !== null) ? anUseClosing : (S.closingOn === true || S.closingOn === 'true');
const canUse = S.closingOn === true || S.closingOn === 'true' || anUseClosing;
btn.style.display = canUse ? '' : 'none';
btn.classList.toggle('an-closing-on', useClosing);
btn.title = useClosing ? '締日連動: ON（タップでOFF）' : '締日連動: OFF（タップでON）';
btn.querySelector('.an-closing-label').innerText = useClosing ? '📅 締日連動 ON' : '📅 締日連動 OFF';
}

// ===== 最古支出記録日を取得（キャッシュ付き）=====
function _getEarliestRecordDate() {
if (_anEarliestDate) return _anEarliestDate;
if (S.appStartMonth) {
_anEarliestDate = S.appStartMonth + '-01';
return _anEarliestDate;
}
try {
if (typeof DB.getEarliestExpenseDate === 'function') {
const d = DB.getEarliestExpenseDate();
if (d) {
_anEarliestDate = d.slice(0, 7) + '-01';
return _anEarliestDate;
}
}
} catch(e) {}
_anEarliestDate = _todayYmd().slice(0, 7) + '-01';
return _anEarliestDate;
}

function _clearEarliestDateCache() { _anEarliestDate = null; }

function _updateSearchActiveChips() {
const el = document.getElementById('srch-active-chips');
if (!el) return;
try {
const cats  = JSON.parse(DB.getMaster('categories')  || '[]');
const tags  = JSON.parse(DB.getMaster('custom_tags') || '[]');
const cards = JSON.parse(DB.getMaster('point_cards') || '[]');
const costs = JSON.parse(DB.getMaster('cost_tags')   || '[]');
const catMap = {}, tagMap = {}, cardMap = {};
cats.forEach(c  => { catMap[c.id]  = c.name; });
tags.forEach(t  => { tagMap[t.id]  = t.name; });
cards.forEach(c => { cardMap[c.id] = c.name; });
costs.forEach(c => { cardMap[c.id] = c.name; });

const PRESET_NAMES = { MONTH:'当月', PREV_MONTH:'前月', '3M':'3ヶ月', '6M':'半年', '1Y':'1年' };
const chips = [];
searchFilter.categoryIds.forEach(id => chips.push({ label: catMap[id] || `cat${id}`, type: 'cat' }));
searchFilter.tagIds.forEach(id       => chips.push({ label: tagMap[id]  || `tag${id}`, type: 'tag' }));
searchFilter.cardIds.forEach(id      => chips.push({ label: cardMap[id] || `card${id}`, type: 'card' }));
if (searchFilter.memo) chips.push({ label: `"${searchFilter.memo}"`, type: 'memo' });
if (searchFilter.useCustom) {
chips.push({ label: (searchFilter.dateFrom || '') + '〜' + (searchFilter.dateTo || ''), type: 'period' });
} else if (searchFilter.periodPreset !== 'ALL') {
chips.push({ label: PRESET_NAMES[searchFilter.periodPreset] || searchFilter.periodPreset, type: 'period' });
}
if (searchFilter.useSort && searchFilter.sorts.length)
chips.push({ label: '並替', type: 'sort' });

el.innerHTML = chips.map(c =>
`<span class="active-chip active-chip-${c.type}">${_escHtml(c.label)}</span>`
).join('') || '<span class="active-chip">全件</span>';
} catch(e) { el.innerHTML = '<span class="active-chip">絞込み中</span>'; }
}

function openAnFilter() {
const cats  = JSON.parse(DB.getMaster('categories')  || '[]');
const tags  = JSON.parse(DB.getMaster('custom_tags') || '[]');
document.getElementById('an-cat-area').innerHTML = cats.map(c =>
`<div class="srch-chip ${anCatIds.includes(c.id)?'selected':''}"
onclick="vibe();toggleAnId('anCatIds',${c.id},this)">${_escHtml(c.name)}</div>`).join('');
document.getElementById('an-tag-area').innerHTML = tags.map(t =>
`<div class="srch-chip ${anTagIds.includes(t.id)?'selected':''}"
onclick="vibe();toggleAnId('anTagIds',${t.id},this)">${_escHtml(t.name)}</div>`).join('');
const memoEl = document.getElementById('an-memo');
if (memoEl) memoEl.value = anMemo;
document.getElementById('an-filter-modal').style.display = 'flex';
}

function closeAnFilter() {
document.getElementById('an-filter-modal').style.display = 'none';
}

function resetAnFilter() {
anCatIds = []; anTagIds = []; anMemo = '';
document.querySelectorAll('#an-cat-area .srch-chip, #an-tag-area .srch-chip')
.forEach(el => el.classList.remove('selected'));
const memoEl = document.getElementById('an-memo');
if (memoEl) memoEl.value = '';
}

function resetAnFilterFull() {
resetAnFilter();
closeAnFilter();
_updateAnActiveChips();
renderAnalytics();
}

function toggleAnId(key, id, el) {
const arr = key === 'anCatIds' ? anCatIds : anTagIds;
const idx = arr.indexOf(id);
if (idx >= 0) { arr.splice(idx, 1); el.classList.remove('selected'); }
else           { arr.push(id);       el.classList.add('selected');    }
}

function applyAnFilter() {
const memoEl = document.getElementById('an-memo');
anMemo = memoEl ? memoEl.value.trim() : '';
closeAnFilter();
_updateAnActiveChips();
renderAnalytics();
}

function _updateAnActiveChips() {
const chipsEl = document.getElementById('an-active-chips');
const rowEl   = document.getElementById('an-active-chips-row');
const labelEl = document.getElementById('an-filter-label');
if (!chipsEl) return;
const hasFilter = anCatIds.length > 0 || anTagIds.length > 0 || !!anMemo;
if (rowEl) rowEl.style.display = hasFilter ? 'block' : 'none';
if (!hasFilter) {
if (labelEl) labelEl.innerText = 'カテゴリ・タグ：全て';
chipsEl.innerHTML = '';
return;
}
try {
const cats = JSON.parse(DB.getMaster('categories')  || '[]');
const tags = JSON.parse(DB.getMaster('custom_tags') || '[]');
const catMap = {}, tagMap = {};
cats.forEach(c => { catMap[c.id] = c.name; });
tags.forEach(t => { tagMap[t.id] = t.name; });
const chips = [];
anCatIds.forEach(id => chips.push({ label: catMap[id] || `cat${id}`, type: 'cat' }));
anTagIds.forEach(id => chips.push({ label: tagMap[id] || `tag${id}`, type: 'tag' }));
if (anMemo) chips.push({ label: `"${anMemo}"`, type: 'memo' });
chipsEl.innerHTML = chips.map(c =>
`<span class="active-chip active-chip-${c.type}">${_escHtml(c.label)}</span>`
).join('');
const parts = [];
if (anCatIds.length) parts.push(`カテゴリ${anCatIds.length}件`);
if (anTagIds.length) parts.push(`タグ${anTagIds.length}件`);
if (anMemo) parts.push('メモ');
if (labelEl) labelEl.innerText = `絞込み: ${parts.join('・')}`;
} catch(e) {}
}

function renderAnalytics() {
if (typeof DB === 'undefined') return;
const view = document.getElementById('view-analytics');
if (!view || view.style.display === 'none') return;
_updateAnClosingBtn();
_updateAnFixedBtn();
_updateAnNoBudgetBtn();
_updateAnPeriodBar();
if (anTab === 'trend')  renderTrendChart();
if (anTab === 'cat')    renderCatChart();
if (anTab === 'pts')    renderPtsChart();
if (anTab === 'budget') renderBudgetChart();
}

// 集計期間バー更新
function _updateAnPeriodBar() {
const el = document.getElementById('an-period-disp');
if (!el) return;
if (anPreset === 'ALL') { el.innerText = '期間: 全期間'; return; }
const range = getAnDateRange();
if (!range.from && !range.to) { el.innerText = ''; return; }
const fmt = s => s ? s.slice(5).replace('-', '/') : '';
const fromY = range.from ? range.from.slice(0, 4) : '';
el.innerText = `${fromY}年 ${fmt(range.from)} 〜 ${fmt(range.to)}`;
}

function destroyChart() {
// 経費タブのトグルを除去（他タブ遷移時に残らないように）
const tog = document.getElementById('exp-trend-toggle');
if (tog) tog.remove();
if (anChart) { anChart.destroy(); anChart = null; }
document.getElementById('an-empty').style.display = 'none';
document.getElementById('an-canvas').style.display = 'block';
}

function showAnEmpty() {
if (anChart) { anChart.destroy(); anChart = null; }
document.getElementById('an-empty').style.display = 'block';
document.getElementById('an-canvas').style.display = 'none';
document.getElementById('an-summary-content').innerHTML = '<div class="an-scroll-body" id="an-scroll-body"></div>';
_fixSummaryScrollHeight();
}

function _decideTrendGranularity(from, to) {
if (!from) return 'monthly';
const ms   = _parseYmd(to) - _parseYmd(from);
const days = Math.round(ms / 86400000) + 1;
if (days <= 62)  return 'daily';
if (days <= 120) return 'weekly';
return 'monthly';
}

function _aggregateWeekly(dailyData) {
const weeks = [];
let bucket = null;
const firstDay = _parseYmd(dailyData[0].date);
dailyData.forEach(d => {
const day = _parseYmd(d.date);
const weekNum = Math.floor(Math.round((day - firstDay) / 86400000) / 7);
if (!bucket || bucket.weekNum !== weekNum) {
bucket = { weekNum, label: d.date.slice(5).replace('-','/'), total: 0 };
weeks.push(bucket);
}
bucket.total += d.total;
});
return weeks;
}

// 支出推移（折れ線）
function renderTrendChart() {
try {
destroyChart();
const range = getAnDateRange();
const biz = isBizMode();
const baseFilter = { categoryIds: anCatIds, tagIds: anTagIds, memo: anMemo };
const filter = JSON.stringify(biz ? Object.assign({}, baseFilter, { excludeCostTags: true }) : baseFilter);
const expFilter = JSON.stringify(Object.assign({}, baseFilter, { onlyCostTags: true }));

const gran = _decideTrendGranularity(range.from, range.to);
let labels, data, unitLabel, rawData = null;
let rawMonthLabels = [];
let _trendGross = 0, _trendExpense = 0;

if (gran === 'daily') {
if (!range.from || (range.to && range.from > range.to)) { showAnEmpty(); return; }
const dailyGross = JSON.parse(DB.getDailyStats(range.from, range.to, filter));
if (!dailyGross || dailyGross.length === 0) { showAnEmpty(); return; }
const dailyExp = biz ? JSON.parse(DB.getDailyStats(range.from, range.to, expFilter)) : [];
labels = dailyGross.map(d => {
const parts = d.date.split('-');
return `${parseInt(parts[2])}日`;
});
_trendGross = dailyGross.reduce((s, d) => s + (d.total || 0), 0);
_trendExpense = biz ? dailyExp.reduce((s, d) => s + (d.total || 0), 0) : 0;
if (_trendGross === 0 && _trendExpense === 0) { showAnEmpty(); return; }
rawData = dailyGross.map((d, i) => (d.total || 0) - (biz ? (dailyExp[i]?.total || 0) : 0));
let cum = 0;
data = rawData.map(v => { cum += v; return cum; });
unitLabel = '日別';

} else if (gran === 'weekly') {
if (!range.from || (range.to && range.from > range.to)) { showAnEmpty(); return; }
const dailyGross = JSON.parse(DB.getDailyStats(range.from, range.to, filter));
if (!dailyGross || dailyGross.length === 0) { showAnEmpty(); return; }
const dailyExp = biz ? JSON.parse(DB.getDailyStats(range.from, range.to, expFilter)) : [];
_trendGross = dailyGross.reduce((s, d) => s + (d.total || 0), 0);
_trendExpense = biz ? dailyExp.reduce((s, d) => s + (d.total || 0), 0) : 0;
if (_trendGross === 0 && _trendExpense === 0) { showAnEmpty(); return; }
const weeksGross = _aggregateWeekly(dailyGross);
const weeksExp = biz ? _aggregateWeekly(dailyExp) : [];
labels = weeksGross.map(w => w.label + '〜');
rawData = weeksGross.map((w, i) => (w.total || 0) - (biz ? (weeksExp[i]?.total || 0) : 0));
let cum2 = 0;
data = rawData.map(v => { cum2 += v; return cum2; });
unitLabel = '週別';

} else {
let monthGrossRaw, monthExpRaw = [];
if (anPreset === 'ALL') {
monthGrossRaw = JSON.parse(DB.getMonthlyStatsFiltered(60, filter));
if (biz) monthExpRaw = JSON.parse(DB.getMonthlyStatsFiltered(60, expFilter));
if (S.appStartMonth) {
const startYm = S.appStartMonth.slice(0, 7);
monthGrossRaw = monthGrossRaw.filter(m => m.month >= startYm);
if (biz) monthExpRaw = monthExpRaw.filter(m => m.month >= startYm);
}
monthGrossRaw = [...monthGrossRaw].reverse();
if (biz) monthExpRaw = [...monthExpRaw].reverse();
} else if (range.from) {
if (range.to && range.from > range.to) { showAnEmpty(); return; }
monthGrossRaw = JSON.parse(DB.getMonthlyStatsByRangeFiltered(range.from, range.to, filter));
if (biz) monthExpRaw = JSON.parse(DB.getMonthlyStatsByRangeFiltered(range.from, range.to, expFilter));
} else {
monthGrossRaw = JSON.parse(DB.getMonthlyStatsFiltered(24, filter));
if (biz) monthExpRaw = JSON.parse(DB.getMonthlyStatsFiltered(24, expFilter));
monthGrossRaw = [...monthGrossRaw].reverse();
if (biz) monthExpRaw = [...monthExpRaw].reverse();
}
if (!monthGrossRaw || monthGrossRaw.length === 0) { showAnEmpty(); return; }

const extractMonthVal = m => {
if (anCatIds.length === 0) return m.total || 0;
if (m.breakdown) {
return m.breakdown.filter(b => anCatIds.includes(b.catId)).reduce((s, b) => s + b.amount, 0);
}
return m.total || 0;
};
const expMap = {};
monthExpRaw.forEach(m => { expMap[m.month] = extractMonthVal(m); });

rawMonthLabels = monthGrossRaw.map(m => m.month);
const filtered = monthGrossRaw.map(m => {
const g = extractMonthVal(m);
const e = biz ? (expMap[m.month] || 0) : 0;
_trendGross += g;
_trendExpense += e;
return { month: m.month, net: g - e };
});
if (_trendGross === 0 && _trendExpense === 0) { showAnEmpty(); return; }
labels = filtered.map(m => m.month.slice(5) + '月');
data = filtered.map(m => m.net);
unitLabel = '月別';
}

if (!data || data.length === 0) { showAnEmpty(); return; }

const trendDatasets = (() => {
const ds = [{
label: biz ? '売上' : '支出',
data,
borderColor: '#00b894',
backgroundColor: 'rgba(0,184,148,0.12)',
borderWidth: 2,
pointBackgroundColor: '#00b894',
pointRadius: data.length <= 31 ? 4 : data.length <= 60 ? 3 : 2,
pointHoverRadius: 6,
tension: 0.3,
fill: true,
}];
if (biz) {
try {
const hist = JSON.parse(DB.getBudgetHistory(60));
const fallback = parseInt(S.baseBudget) || 0;
let targetData;
if (gran === 'monthly') {
targetData = rawMonthLabels.map(ym => {
const mid = ym + '-15';
for (const bp of (hist || [])) {
if (bp.periodFrom <= mid && mid <= bp.periodTo) return bp.totalAmount;
}
return fallback;
});
} else {
let budgetVal = fallback;
if (hist && hist.length && range.from && range.to) {
let matched = false, sum = 0;
for (const bp of hist) {
if (bp.periodFrom <= range.to && bp.periodTo >= range.from) {
sum += bp.totalAmount; matched = true;
}
}
if (matched) budgetVal = sum;
}
targetData = data.map((_, i) => Math.round(budgetVal * (i + 1) / data.length));
}
if (targetData && targetData.some(v => v > 0)) {
ds.push({
label: '目標',
data: targetData,
borderColor: 'rgba(99,102,241,0.7)',
borderWidth: 1.5,
borderDash: [6, 4],
pointRadius: 0,
tension: 0,
fill: false,
});
}
} catch(e) {}
}
return ds;
})();

const ctx = document.getElementById('an-canvas').getContext('2d');
anChart = new Chart(ctx, {
type: 'line',
data: {
labels,
datasets: trendDatasets
},
options: {
responsive: true,
plugins: {
legend: { display: biz, labels: { font: { size: 11 }, boxWidth: 20 } },
tooltip: { callbacks: { label: ctx => {
const v = (ctx.parsed.y < 0 ? '−¥' : '¥') + Math.abs(ctx.parsed.y).toLocaleString();
if (ctx.dataset.label === '目標') return '目標 ' + v;
const lbl = gran === 'monthly' ? (biz ? '純売上' : '月別') : (biz ? '累計純売上' : '累計');
return lbl + ' ' + v;
}}}
},
scales: {
x: {
ticks: {
maxTicksLimit: 12,
maxRotation: 45,
font: { size: 10 }
}
},
y: {
beginAtZero: true,
ticks: { callback: v => (v < 0 ? '−¥' : '¥') + Math.abs(v).toLocaleString() }
}
}
}
});

const sumSrc  = rawData || data;
const total   = rawData ? data[data.length - 1] : data.reduce((s,v) => s + v, 0);
const nonZero = sumSrc.filter(v => v !== 0);
const avg     = nonZero.length > 0 ? Math.round(total / nonZero.length) : 0;
const max     = Math.max(...sumSrc);
const maxIdx  = sumSrc.indexOf(max);
const maxLabel = labels[maxIdx] || '';

const _trendBudgetVal = (() => {
if (!range.from || !range.to) return 0;
try {
const hist = JSON.parse(DB.getBudgetHistory(60));
if (!hist || !hist.length) return parseInt(S.baseBudget) || 0;
let bTotal = 0, matched = false;
for (const bp of hist) {
if (bp.periodFrom <= range.to && bp.periodTo >= range.from) {
bTotal += bp.totalAmount;
matched = true;
}
}
if (matched) return bTotal;
} catch(e) {}
return parseInt(S.baseBudget) || 0;
})();

const _trendFrom = range.from || getCurrentPeriod().from;
const _trendTo   = range.to   || getCurrentPeriod().to;
const fixedTotal = _anGetFixedTotalForRange(_trendFrom, _trendTo);
const fixedSub  = (fixedTotal > 0 && anShowFixed && S.fixedOn)
? (() => {
if (biz && S.fixedMode !== 'BUDGET') {
const net = total - fixedTotal;
const _netColor = (_trendBudgetVal > 0 && net < _trendBudgetVal) ? 'color:#ef4444;font-weight:700;' : '';
const netStr = (net < 0 ? '−¥' : '¥') + Math.abs(net).toLocaleString();
return `<div class="an-summary-item"><span class="an-summary-label">固定費控除後</span><span class="an-summary-val" style="${_netColor}">${netStr}<span style="font-size:11px;color:#94a3b8;">（−¥${fixedTotal.toLocaleString()}）</span></span></div>`;
} else if (biz && S.fixedMode === 'BUDGET') {
return `<div class="an-summary-item"><span class="an-summary-label">固定費（参考）</span><span class="an-summary-val">¥${fixedTotal.toLocaleString()}</span></div>`;
} else {
return `<div class="an-summary-item"><span class="an-summary-label">固定費込み</span><span class="an-summary-val">¥${(total + fixedTotal).toLocaleString()}<span style="font-size:11px;color:#94a3b8;">（+¥${fixedTotal.toLocaleString()}）</span></span></div>`;
}
})()
: '';

const _netSales    = biz ? (_trendGross - _trendExpense) : total;
const _trendUnder  = biz && _trendBudgetVal > 0 && _netSales < _trendBudgetVal;
const _totalColor  = _trendUnder ? 'color:#ef4444;font-weight:700;' : '';
const _expRow = (biz && _trendExpense > 0)
? `<div class="an-summary-item"><span class="an-summary-label">経費合計</span><span class="an-summary-val" style="color:#e17055;">¥${_trendExpense.toLocaleString()}</span></div>`
: '';
const _targetRow = biz && _trendBudgetVal > 0
? `<div class="an-summary-item"><span class="an-summary-label">目標</span><span class="an-summary-val" style="color:#6366f1;">¥${_trendBudgetVal.toLocaleString()}</span></div>`
: '';
const _rateRow = biz && _trendBudgetVal > 0
? (() => {
const r = Math.round(_netSales / _trendBudgetVal * 100);
const col = r >= 100 ? '#22c55e' : r >= 70 ? '#f39c12' : '#ef4444';
return `<div class="an-summary-item"><span class="an-summary-label">達成率</span><span class="an-summary-val" style="color:${col};font-weight:700;">${r}%</span></div>`;
})()
: '';
const fmtYen = v => (v < 0 ? '−¥' : '¥') + Math.abs(v).toLocaleString();
document.getElementById('an-summary-content').innerHTML = `
<div class="an-scroll-body" id="an-scroll-body">
<div class="an-summary-grid">
<div class="an-summary-item"><span class="an-summary-label">${biz ? '総売上' : '期間合計'}</span><span class="an-summary-val" style="${_totalColor}">${fmtYen(biz ? _trendGross : total)}</span></div>
${_expRow}
${_targetRow}
${_rateRow}
<div class="an-summary-item"><span class="an-summary-label">${unitLabel}平均</span><span class="an-summary-val">${fmtYen(avg)}</span></div>
<div class="an-summary-item"><span class="an-summary-label">最高</span><span class="an-summary-val">${_escHtml(maxLabel)} ${fmtYen(max)}</span></div>
${fixedSub}
</div>
</div>`;
_fixSummaryScrollHeight();
} catch(e) { console.error('renderTrendChart:', e); showAnEmpty(); }
}

// カテゴリ比率（ドーナツグラフ）
function renderCatChart() {
try {
destroyChart();
const range  = getAnDateRange();
const filter = JSON.stringify({
dateFrom: range.from, dateTo: range.to,
tagIds: anTagIds, categoryIds: anCatIds, memo: anMemo,
excludeCostTags: isBizMode()
});
const raw    = JSON.parse(DB.getCategoryStats(filter) || '[]');
let items = raw.filter(r => r.amount > 0);

const fixedTotal = _anGetFixedTotalForRange(
range.from || getCurrentPeriod().from,
range.to   || getCurrentPeriod().to
);
if (fixedTotal > 0 && anShowFixed && S.fixedOn) {
items = [...items, { catName: '固定費', amount: fixedTotal, isFixed: true }];
}
if (items.length === 0) { showAnEmpty(); return; }

const palette = ['#00b894','#0984e3','#fdcb6e','#e17055','#6c5ce7','#a29bfe','#fd79a8','#55efc4','#74b9ff','#fab1a0','#b2bec3'];
const labels  = items.map(r => r.catName);
const data    = items.map(r => r.amount);
const colors  = items.map((r, i) => r.isFixed ? '#636e72' : palette[i % palette.length]);
const total   = data.reduce((s,v) => s + v, 0);

const ctx = document.getElementById('an-canvas').getContext('2d');
anChart = new Chart(ctx, {
type: 'doughnut',
data: {
labels,
datasets: [{
data,
backgroundColor: colors,
borderWidth: 2,
borderColor: '#fff',
}]
},
options: {
responsive: true,
plugins: {
legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
tooltip: {
callbacks: {
label: ctx => {
const pct = ((ctx.parsed / total) * 100).toFixed(1);
return `¥${ctx.parsed.toLocaleString()} (${pct}%)`;
}
}
}
}
}
});

const rows = items.map((r, i) => {
const pct = ((r.amount / total) * 100).toFixed(1);
const col = colors[i];
const fixedMark = r.isFixed ? ' <span style="font-size:10px;color:#94a3b8;">固定</span>' : '';
return `<div class="an-cat-row">
<span class="an-cat-dot" style="background:${col}"></span>
<span class="an-cat-name">${_escHtml(r.catName)}${fixedMark}</span>
<span class="an-cat-pct">${pct}%</span>
<span class="an-cat-amt">¥${r.amount.toLocaleString()}</span>
</div>`;
}).join('');
document.getElementById('an-summary-content').innerHTML =
`<div class="an-scroll-body" id="an-scroll-body">`
+ `<div class="an-summary-total">合計: ¥${total.toLocaleString()}</div>${rows}`
+ `</div>`;
_fixSummaryScrollHeight();
} catch(e) { console.error('renderCatChart:', e); showAnEmpty(); }
}

// ポイント集計（棒グラフ＋カテゴリ内訳）
function togglePtsBreakdown() {
anPtsBreakdown = !anPtsBreakdown;
const btn = document.getElementById('btn-pts-breakdown');
if (btn) btn.classList.toggle('selected', anPtsBreakdown);
renderPtsChart();
}

// ===================================================
//  経費比率グラフ（売上管理モード用）
//  expense_tags でタグ付けされた取引の金額集計
// ===================================================
// ─── 経費タグ合計取得（expense_tags に紐付く取引金額を合算）───
function _getExpenseTotalForRange(fromStr, toStr) {
if (!fromStr || !toStr) return 0;
try {
const expTags = JSON.parse(DB.getMaster('cost_tags') || '[]');
if (!expTags.length) return 0;
// v34以降: cost_tags IDは10001〜（point_cardsとの衝突なし）
const expIds = new Set(expTags.map(t => Number(t.id)).filter(id => id > 0));
const filter = JSON.stringify({ dateFrom: fromStr, dateTo: toStr });
const raw = JSON.parse(DB.getCostTagStats(filter) || '[]');
return raw
.filter(r => expIds.has(Number(r.cardId)))
.reduce((s, r) => s + (r.totalPrice || 0), 0);
} catch(e) { return 0; }
}

// ─── 経費推移グラフ（折れ線）───
let _expTrendMode = 'ratio'; // 'ratio' | 'trend'

function _renderExpenseTrendToggle() {
const existing = document.getElementById('exp-trend-toggle');
if (existing) existing.remove();
const toggle = document.createElement('div');
toggle.id = 'exp-trend-toggle';
toggle.style.cssText = 'display:flex;gap:6px;margin:0 0 8px;';
toggle.innerHTML =
`<button onclick="switchExpenseView('ratio')"
style="flex:1;padding:6px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;
background:${_expTrendMode==='ratio'?'var(--primary)':'#f8fafc'};
color:${_expTrendMode==='ratio'?'#fff':'#64748b'};cursor:pointer;">比率</button>
<button onclick="switchExpenseView('trend')"
style="flex:1;padding:6px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;
background:${_expTrendMode==='trend'?'var(--primary)':'#f8fafc'};
color:${_expTrendMode==='trend'?'#fff':'#64748b'};cursor:pointer;">推移</button>`;
const canvas = document.getElementById('an-canvas');
if (canvas && canvas.parentElement) canvas.parentElement.insertBefore(toggle, canvas);
}

function switchExpenseView(mode) {
_expTrendMode = mode;
renderExpenseTagChart();
}

function renderExpenseTrendChart() {
destroyChart();
const range = getAnDateRange();
const costTags = JSON.parse(DB.getMaster('cost_tags') || '[]');
if (!costTags.length) {
showAnEmpty();
document.getElementById('an-summary-content').innerHTML =
'<div class="an-scroll-body" id="an-scroll-body"><div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;">💡 経費タグを登録してください</div></div>';
_fixSummaryScrollHeight();
return;
}
_renderExpenseTrendToggle();
const palette = ['#e17055','#fdcb6e','#6c5ce7','#00b894','#0984e3','#a29bfe','#fd79a8'];

let months = [];
if (range.from && range.to) {
let cur = _parseYmd(range.from.slice(0, 7) + '-01');
const end = _parseYmd(range.to.slice(0, 7) + '-01');
let guard = 0;
while (cur <= end && guard < 60) {
const y = cur.getFullYear(), m = cur.getMonth() + 1;
const from = `${y}-${_pad2(m)}-01`;
const to = `${y}-${_pad2(m)}-${_pad2(_lastDayOfMonth(y, m))}`;
months.push({ y, m, from, to });
cur = new Date(y, m, 1);
guard++;
}
} else {
const startYm = S.appStartMonth ? S.appStartMonth.slice(0, 7) : '';
for (let i = 5; i >= 0; i--) {
const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
const y = d.getFullYear(), m = d.getMonth() + 1;
const ym = `${y}-${_pad2(m)}`;
if (startYm && ym < startYm) continue;
months.push({ y, m, from: `${ym}-01`, to: `${ym}-${_pad2(_lastDayOfMonth(y, m))}` });
}
}
months = months.map(mo => ({
...mo,
label: months.length > 11 ? `${mo.y}/${mo.m}月` : `${mo.m}月`
}));
if (!months.length) { showAnEmpty(); return; }

const shownTags = costTags.slice(0, 7);
const datasets = shownTags.map((tag, i) => {
const data = months.map(mo => {
try {
const f = JSON.stringify({
dateFrom: mo.from, dateTo: mo.to,
categoryIds: anCatIds, tagIds: anTagIds, memo: anMemo
});
const raw = JSON.parse(DB.getCostTagStats(f) || '[]');
const found = raw.find(r => Number(r.cardId) === Number(tag.id));
return found ? (found.totalPrice || 0) : 0;
} catch(e) { return 0; }
});
return {
label: tag.name,
data,
borderColor: palette[i % palette.length],
backgroundColor: palette[i % palette.length] + '22',
tension: 0.3, fill: false, borderWidth: 2,
pointRadius: 3
};
});

const totalByMonth = months.map((_, mi) =>
datasets.reduce((s, ds) => s + (ds.data[mi] || 0), 0)
);
const grandTotal = totalByMonth.reduce((s, v) => s + v, 0);

const ctx = document.getElementById('an-canvas').getContext('2d');
anChart = new Chart(ctx, {
type: 'line',
data: { labels: months.map(m => m.label), datasets },
options: {
responsive: true,
plugins: {
legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 14 } },
tooltip: { callbacks: { label: c => c.dataset.label + ': ¥' + c.parsed.y.toLocaleString() } }
},
scales: {
y: { ticks: { callback: v => '¥' + v.toLocaleString() }, beginAtZero: true }
}
}
});

const rows = shownTags.map((tag, i) => {
const total = datasets[i].data.reduce((s, v) => s + v, 0);
const pct = grandTotal > 0 ? Math.round(total / grandTotal * 100) : 0;
return `<div class="an-cat-row">
<span class="an-cat-dot" style="background:${palette[i % palette.length]}"></span>
<span class="an-cat-name">${_escHtml(tag.name)}</span>
<span class="an-cat-pct">${pct}%</span>
<span class="an-cat-amt">¥${total.toLocaleString()}</span>
</div>`;
}).join('');

document.getElementById('an-summary-content').innerHTML =
'<div class="an-scroll-body" id="an-scroll-body">'
+ '<div class="an-summary-total">合計: ¥' + grandTotal.toLocaleString() + '</div>'
+ rows + '</div>';
_fixSummaryScrollHeight();
}

function renderExpenseTagChart() {
if (_expTrendMode === 'trend') { renderExpenseTrendChart(); return; }
try {
destroyChart();
const range  = getAnDateRange();
const filter = JSON.stringify({ dateFrom: range.from, dateTo: range.to, categoryIds: anCatIds, tagIds: anTagIds, memo: anMemo });

const expTags = JSON.parse(DB.getMaster('cost_tags') || '[]');
const tagNameMap = {};
expTags.forEach(t => { tagNameMap[t.id] = t.name; });

const raw = JSON.parse(DB.getCostTagStats(filter));
if (!raw || raw.length === 0) {
if (expTags.length === 0) {
showAnEmpty();
document.getElementById('an-empty').style.display = 'none';
document.getElementById('an-summary-content').innerHTML =
'<div class="an-scroll-body" id="an-scroll-body"><div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;">'
+ '💡 経費タグを登録して<br>記録に紐付けると経費比率が表示されます</div></div>';
_fixSummaryScrollHeight();
} else {
showAnEmpty();
_renderExpenseTrendToggle();
}
return;
}

const items = raw.map(r => ({
name: tagNameMap[r.cardId] || r.cardName || '不明',
amount: r.totalPrice || 0,
cardId: r.cardId
})).filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount);

if (items.length === 0) {
showAnEmpty();
if (expTags.length > 0) _renderExpenseTrendToggle();
return;
}

const totalAmt = items.reduce((s, r) => s + r.amount, 0);
const palette  = ['#e17055','#fdcb6e','#6c5ce7','#00b894','#0984e3','#a29bfe','#fd79a8'];
const colors   = items.map((_, i) => palette[i % palette.length]);

_renderExpenseTrendToggle();
const ctx = document.getElementById('an-canvas').getContext('2d');
anChart = new Chart(ctx, {
type: 'doughnut',
data: {
labels: items.map(r => r.name),
datasets: [{
data: items.map(r => r.amount),
backgroundColor: colors,
borderWidth: 2,
}]
},
options: {
responsive: true,
plugins: {
legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 14 } },
tooltip: { callbacks: { label: ctx => ctx.label + ': ¥' + ctx.parsed.toLocaleString() + ' (' + Math.round(ctx.parsed / totalAmt * 100) + '%)' } }
}
}
});

const rows = items.map((r, i) => {
const pct = totalAmt > 0 ? Math.round(r.amount / totalAmt * 100) : 0;
const col = colors[i];
return `<div class="an-cat-row">
<span class="an-cat-dot" style="background:${col}"></span>
<span class="an-cat-name">${_escHtml(r.name)}</span>
<span class="an-cat-pct">${pct}%</span>
<span class="an-cat-amt">¥${r.amount.toLocaleString()}</span>
</div>`;
}).join('');

document.getElementById('an-summary-content').innerHTML =
'<div class="an-scroll-body" id="an-scroll-body">'
+ '<div class="an-summary-total">合計: ¥' + totalAmt.toLocaleString() + '</div>'
+ rows + '</div>';
_fixSummaryScrollHeight();
} catch(e) { console.error('renderExpenseTagChart:', e); showAnEmpty(); }
}

function renderPtsChart() {
if (isBizMode()) { _expTrendMode = _expTrendMode || 'ratio'; renderExpenseTagChart(); return; }
try {
destroyChart();
const range  = getAnDateRange();
const filter = JSON.stringify({ dateFrom: range.from, dateTo: range.to, categoryIds: anCatIds, tagIds: anTagIds, memo: anMemo });
const raw    = JSON.parse(DB.getCardPointStats(filter));
if (!raw || raw.length === 0) { showAnEmpty(); return; }

const palette = ['#00b894','#0984e3','#fdcb6e','#e17055','#6c5ce7','#a29bfe','#fd79a8'];
const labels   = raw.map(r => r.cardName);
const data     = raw.map(r => r.totalPts);
const totalPts = data.reduce((s,v) => s + v, 0);

if (totalPts === 0) { showAnEmpty(); return; }

const ctx = document.getElementById('an-canvas').getContext('2d');
anChart = new Chart(ctx, {
type: 'bar',
data: {
labels,
datasets: [{
label: '獲得ポイント',
data,
backgroundColor: data.map((_, i) => palette[i % palette.length]),
borderRadius: 6,
}]
},
options: {
responsive: true,
plugins: {
legend: { display: false },
tooltip: { callbacks: { label: ctx => ctx.parsed.y.toLocaleString() + ' pt' } }
},
scales: {
y: { beginAtZero: true, ticks: { callback: v => v + 'pt' } }
}
}
});

const toggleBtn = `<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
<div id="btn-pts-breakdown" class="srch-chip${anPtsBreakdown?' selected':''}"
onclick="vibe();togglePtsBreakdown()" style="font-size:12px;padding:4px 12px;">
カテゴリ内訳
</div></div>`;

const cardRows = raw.map((r, i) => {
const col = palette[i % palette.length];
let breakdownHtml = '';
if (anPtsBreakdown && r.breakdown && r.breakdown.length > 0) {
const sorted = [...r.breakdown].filter(b => b.pts > 0).sort((a,b) => b.pts - a.pts);
const top5   = sorted.slice(0, 5);
const otherPts = sorted.slice(5).reduce((s,b) => s + b.pts, 0);
const bdRows = top5.map(b => {
const pct = r.totalPts > 0 ? ((b.pts / r.totalPts) * 100).toFixed(0) : 0;
return `<div class="an-pts-bd-row">
<span class="an-pts-bd-cat">${_escHtml(b.catName)}</span>
<span class="an-pts-bd-val">${b.pts.toLocaleString()}pt</span>
<span class="an-pts-bd-pct">${pct}%</span>
</div>`;
}).join('');
const otherRow = otherPts > 0 ? `<div class="an-pts-bd-row">
<span class="an-pts-bd-cat">その他</span>
<span class="an-pts-bd-val">${otherPts.toLocaleString()}pt</span>
<span class="an-pts-bd-pct">${((otherPts/r.totalPts)*100).toFixed(0)}%</span>
</div>` : '';
breakdownHtml = `<div class="an-pts-breakdown">${bdRows}${otherRow}</div>`;
}
return `<div class="an-pts-card-row">
<div class="an-cat-row">
<span class="an-cat-dot" style="background:${col}"></span>
<span class="an-cat-name">${_escHtml(r.cardName)}</span>
<span class="an-cat-pct">${r.totalPts.toLocaleString()}pt</span>
<span class="an-cat-amt">¥${r.totalPrice.toLocaleString()}</span>
</div>
${breakdownHtml}
</div>`;
}).join('');

document.getElementById('an-summary-content').innerHTML =
`<div class="an-scroll-body" id="an-scroll-body">`
+ `${toggleBtn}<div class="an-summary-total">合計: ${totalPts.toLocaleString()}pt</div>${cardRows}`
+ `</div>`;
_fixSummaryScrollHeight();
} catch(e) { console.error('renderPtsChart:', e); showAnEmpty(); }
}

// ===================================================
//  予算達成率グラフ
// ===================================================
// ===================================================
//  予算達成率グラフ（全面改訂版）
// ===================================================
function renderBudgetChart() {
try {
destroyChart();
const range  = getAnDateRange();
const filter = JSON.stringify({ categoryIds: anCatIds, tagIds: anTagIds, memo: anMemo });

// 予算グラフ専用の粒度判定：preset基準（日数ではなくユーザー意図で分岐）
// MONTH / PREV_MONTH / 短いCUSTOM(62日以内) → 日別ペースグラフ
// 3M以上 / ALL → 月別達成率グラフ
const useDailyMode = (anPreset === 'MONTH' || anPreset === 'PREV_MONTH') ||
(anPreset === 'CUSTOM' && range.from && range.to &&
Math.round((_parseYmd(range.to) - _parseYmd(range.from)) / 86400000) + 1 <= 62);

if (useDailyMode) {
_renderBudgetDaily(range, filter);
} else {
_renderBudgetMonthly(range, filter);
}
} catch(e) { console.error('renderBudgetChart:', e); showAnEmpty(); }
}

// ── 共通：budget_periods から指定期間をカバーする予算を取得 ──
// 締日連動でも month 文字列でも照合できるよう2段階マッチ
function _findBudgetForPeriod(budgetHistory, dateFrom, dateTo) {
// 1) period_from/to が完全に重なるものを探す
for (const bp of budgetHistory) {
if (bp.periodFrom <= dateTo && bp.periodTo >= dateFrom) {
return { amount: bp.totalAmount, periodFrom: bp.periodFrom, periodTo: bp.periodTo };
}
}
return null;
}

// ── 固定費ヘルパー ──────────────────────────────────────────────
//
// 固定費は「月単位・固定額」として扱う（日割りしない）
// 締日連動ON時：予算期間の過半数日数を占めるカレンダー月の固定費を使用
//   例) 12/26〜1/25 → 31日中26日が1月 → 1月の固定費
// 締日連動OFF時：表示開始月のカレンダー月の固定費
//
// periodFrom: 予算期間の開始日 (YYYY-MM-DD)
// periodTo:   予算期間の終了日 (YYYY-MM-DD)
// useClosing: 締日連動フラグ
function _anGetFixedForPeriod(periodFrom, periodTo, useClosing) {
if (!anShowFixed || !S.fixedOn) return 0;
const lookupDate = _getFixedLookupDate(periodFrom, periodTo, useClosing);
try {
const items = JSON.parse(DB.getFixedCostHistoryAt(lookupDate));
return items.reduce((s, x) => s + x.amount, 0);
} catch(e) { return 0; }
}

function _anFixedMode() {
return (S.fixedMode === 'BUDGET') ? 'BUDGET' : 'ADD';
}

function _anGetFixedTotal(dateFrom) {
if (!anShowFixed || !S.fixedOn) return 0;
const useClosing = (anUseClosing !== null) ? anUseClosing : (S.closingOn === true || S.closingOn === 'true');
const p = getCurrentPeriod();
return _anGetFixedForPeriod(dateFrom || p.from, p.to, useClosing);
}

function _anGetFixedTotalForRange(fromStr, toStr) {
if (!anShowFixed || !S.fixedOn || !fromStr || !toStr) return 0;
const useClosing = (anUseClosing !== null) ? anUseClosing : (S.closingOn === true || S.closingOn === 'true');

if (useClosing && anPreset !== 'CUSTOM') {
const anchor = parseInt(S.periodStartDay) || 25;
let cur = _calcClosingPeriodForDate(_parseYmd(fromStr), anchor);
let total = 0;
for (let i = 0; i < 60; i++) {
if (cur.from > toStr) break;
total += _anGetFixedForPeriod(cur.from, cur.to, true);
cur = _calcNextClosingPeriod(cur.to, anchor);
}
return total;
}

const from = _parseYmd(fromStr);
const to   = _parseYmd(toStr);
let total = 0;
let y = from.getFullYear(), mo = from.getMonth() + 1;
const endY = to.getFullYear(), endMo = to.getMonth() + 1;
while (y < endY || (y === endY && mo <= endMo)) {
const lookupDate = `${y}-${_pad2(mo)}-01`;
try {
const items = JSON.parse(DB.getFixedCostHistoryAt(lookupDate));
total += items.reduce((s, x) => s + x.amount, 0);
} catch(e) {}
mo++; if (mo > 12) { mo = 1; y++; }
}
return total;
}

// ── 日別モード（当月/前月/指定62日以内）──
function _renderBudgetDaily(range, filter) {
const period      = getCurrentPeriod();
const displayFrom = range.from || period.from;
const displayTo   = range.to   || period.to;
const _bDaily     = isBizMode();

let budgetHistory = [];
try { budgetHistory = JSON.parse(DB.getBudgetHistory(60)); } catch(e) {}

let found = null;
for (const bp of budgetHistory) {
if (bp.periodFrom <= displayFrom && bp.periodTo >= displayFrom) {
found = bp; break;
}
}
if (!found) {
for (const bp of budgetHistory) {
if (bp.periodFrom <= displayTo && bp.periodTo >= displayFrom) {
if (!found || bp.periodFrom > found.periodFrom) found = bp;
}
}
}

if (!found || found.totalAmount < 0) {
showAnEmpty();
document.getElementById('an-empty').style.display = 'block';
document.getElementById('an-empty').innerText = 'この期間の予算が設定されていません。「予算・固定費管理」から設定してください。';
document.getElementById('an-summary-content').innerHTML = '<div class="an-scroll-body" id="an-scroll-body"></div>';
_fixSummaryScrollHeight();
return;
}

const budgetAmount     = found.totalAmount;
const budgetPeriodFrom = found.periodFrom;
const budgetPeriodTo   = found.periodTo;

const useClosing = (anUseClosing !== null) ? anUseClosing : (S.closingOn === true || S.closingOn === 'true');
const fixedTotal = _anGetFixedForPeriod(budgetPeriodFrom, budgetPeriodTo, useClosing);
const fixedMode  = _anFixedMode();
const showFixed  = fixedTotal > 0 && anShowFixed && S.fixedOn;

const effectiveBudget = (showFixed && fixedMode === 'BUDGET')
? (_bDaily ? (budgetAmount + fixedTotal) : Math.max(0, budgetAmount - fixedTotal))
: budgetAmount;
const totalDays   = Math.max(1, Math.round((_parseYmd(budgetPeriodTo) - _parseYmd(budgetPeriodFrom)) / 86400000) + 1);
const dailyBudget = effectiveBudget / totalDays;

const displayOffsetDays = Math.max(0,
Math.round((_parseYmd(displayFrom) - _parseYmd(budgetPeriodFrom)) / 86400000)
);

const filterObj = JSON.parse(filter || '{}');
const grossFilter = JSON.stringify(_bDaily ? Object.assign({}, filterObj, { excludeCostTags: true }) : filterObj);
const dailyGross = JSON.parse(DB.getDailyStats(displayFrom, displayTo, grossFilter));
if (!dailyGross.length) { showAnEmpty(); return; }
const dailyExp = _bDaily
? JSON.parse(DB.getDailyStats(displayFrom, displayTo, JSON.stringify(Object.assign({}, filterObj, { onlyCostTags: true }))))
: [];

const dailyNet = dailyGross.map((d, i) => ({
date: d.date,
gross: d.total || 0,
exp: _bDaily ? (dailyExp[i]?.total || 0) : 0,
total: (d.total || 0) - (_bDaily ? (dailyExp[i]?.total || 0) : 0)
}));

const fixedAddOffset = (showFixed && fixedMode === 'ADD')
? (_bDaily ? -fixedTotal : fixedTotal)
: 0;

let cumSpent = fixedAddOffset;
const cumSeries = [];
const paceData  = [];
const labels    = [];

dailyNet.forEach((d, i) => {
cumSpent += d.total;
cumSeries.push(cumSpent);
const elapsed   = displayOffsetDays + i + 1;
const cumBudget = dailyBudget * elapsed;
paceData.push(cumBudget > 0 ? Math.round((cumSpent / cumBudget) * 1000) / 10 : 100);

const md = d.date.slice(5).replace('-', '/');
const step = Math.ceil(dailyNet.length / 10);
labels.push(dailyNet.length <= 14 || (i + 1) % step === 0 || i === 0 || i === dailyNet.length - 1 ? md : '');
});

const today    = _todayYmd();
const todayIdx = dailyNet.findIndex(d => d.date === today);
const pointColors  = paceData.map(v => _bDaily ? (v >= 100 ? '#22c55e' : v >= 70 ? '#f39c12' : '#ef4444') : (v > 100 ? '#ef4444' : '#22c55e'));
const pointBorders = paceData.map(v => _bDaily ? (v >= 100 ? '#16a34a' : v >= 70 ? '#d68910' : '#dc2626') : (v > 100 ? '#dc2626' : '#16a34a'));

const ctx = document.getElementById('an-canvas').getContext('2d');
anChart = new Chart(ctx, {
type: 'line',
data: {
labels,
datasets: [
{
label: '設定予算比率（%）',
data: paceData,
segment: { borderColor: ctx => _bDaily ? (paceData[ctx.p1DataIndex] >= 100 ? '#22c55e' : '#ef4444') : (paceData[ctx.p1DataIndex] > 100 ? '#ef4444' : '#22c55e') },
backgroundColor: 'transparent',
pointBackgroundColor: pointColors,
pointBorderColor:     pointBorders,
pointRadius: paceData.map((_, i) => (i === todayIdx || i === paceData.length - 1) ? 4 : 2),
borderWidth: 2.5,
tension: 0.3,
fill: false,
},
{
label: '予算通り（100%）',
data: new Array(paceData.length).fill(100),
borderColor: 'rgba(99,102,241,0.5)',
borderWidth: 1.5,
borderDash: [6, 4],
pointRadius: 0,
fill: false,
tension: 0,
}
]
},
options: {
responsive: true,
maintainAspectRatio: true,
plugins: {
legend: { display: false },
tooltip: {
callbacks: {
title: items => dailyNet[items[0].dataIndex]?.date || '',
label: ctx => {
if (ctx.datasetIndex === 1) return null;
const i    = ctx.dataIndex;
const cumS = cumSeries[i];
const cumB = Math.round(dailyBudget * (displayOffsetDays + i + 1));
const diff = _bDaily ? (cumS - cumB) : (cumB - cumS);
const diffLbl = _bDaily ? (diff >= 0 ? '超過達成' : '未達') : (diff >= 0 ? '余裕' : '超過');
return [
(_bDaily ? ` 達成率: ${paceData[i]}%` : ` 消化ペース: ${paceData[i]}%`),
(_bDaily ? ` 累計純売上: ${cumS < 0 ? '−' : ''}¥${Math.abs(cumS).toLocaleString()}` : ` 累計支出: ¥${cumS.toLocaleString()}`),
` 按分${_bDaily ? '目標' : '予算'}: ¥${cumB.toLocaleString()}`,
` ${diffLbl}: ${diff >= 0 ? '+' : '▲'} ¥${Math.abs(diff).toLocaleString()}`
];
}
}
}
},
scales: {
x: { grid: { display: false }, ticks: { font: { size: 10 } } },
y: {
ticks: { font: { size: 10 }, callback: v => v + '%' },
grid: { color: ctx => ctx.tick.value === 100 ? 'rgba(99,102,241,0.3)' : 'rgba(0,0,0,0.06)' }
}
}
}
});

const lastRate      = paceData[paceData.length - 1] || 0;
const _grossSalesF  = dailyNet.reduce((s, d) => s + d.gross, 0);
const _dailyExpense = _bDaily ? dailyNet.reduce((s, d) => s + d.exp, 0) : 0;
const cumSpentF     = _bDaily ? (_grossSalesF - _dailyExpense) : _grossSalesF;
const elapsed2      = displayOffsetDays + dailyNet.length;
const cumBudgetF    = Math.round((budgetAmount / totalDays) * elapsed2);

const rateClass = _bDaily
? (lastRate >= 100 ? 'ok' : lastRate >= 70 ? 'warn' : 'over')
: (lastRate > 100 ? 'over' : lastRate > 90 ? 'warn' : 'ok');
const rateLabel = _bDaily
? (lastRate >= 100 ? '✅ 目標達成ペース' : lastRate >= 70 ? '⚡ やや未達' : '⚠️ 目標未達ペース')
: (lastRate > 100 ? '⚠️ 予算超過ペース' : lastRate > 90 ? '⚡ やや注意' : '✅ 良いペース');

const bpLabel = `${budgetPeriodFrom.slice(5).replace('-','/')}〜${budgetPeriodTo.slice(5).replace('-','/')}（${totalDays}日間）`;

let spentCardLabel = _bDaily ? '純売上' : '累計支出';
let spentCardSub   = `按分${_bDaily ? '目標' : '予算'} ¥${Math.round(dailyBudget * elapsed2).toLocaleString()}`;
let spentCardExtra = '';
if (_bDaily && _dailyExpense > 0) {
spentCardExtra += `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">総売上¥${_grossSalesF.toLocaleString()}−経費¥${_dailyExpense.toLocaleString()}</div>`;
}

let marginBase    = cumBudgetF;
let marginSpent   = cumSpentF;
let marginSubText = _bDaily
? `月目標 ¥${budgetAmount.toLocaleString()}`
: `月予算 ¥${budgetAmount.toLocaleString()}`;

if (showFixed) {
if (fixedMode === 'ADD') {
if (_bDaily) {
spentCardExtra += `<div style="font-size:12px;color:#64748b;margin-top:4px;">−¥${fixedTotal.toLocaleString()}<span style="font-size:10px;color:#94a3b8;">（固定費）</span></div>`;
marginSpent = cumSpentF - fixedTotal;
} else {
spentCardExtra += `<div style="font-size:12px;color:#64748b;margin-top:4px;">+¥${fixedTotal.toLocaleString()}<span style="font-size:10px;color:#94a3b8;">（固定費）</span></div>`;
marginSpent = cumSpentF + fixedTotal;
}
} else {
if (_bDaily) {
const netBudget = budgetAmount + fixedTotal;
marginBase = Math.round(netBudget / totalDays * elapsed2);
marginSubText = `月目標 ¥${netBudget.toLocaleString()}（目標 ¥${budgetAmount.toLocaleString()}+固定費 ¥${fixedTotal.toLocaleString()}）`;
} else {
const netBudget = Math.max(0, budgetAmount - fixedTotal);
marginBase = Math.round(netBudget / totalDays * elapsed2);
marginSubText = `月予算 ¥${netBudget.toLocaleString()}（予算 ¥${budgetAmount.toLocaleString()}−固定費 ¥${fixedTotal.toLocaleString()}）`;
}
}
}

const diff      = _bDaily ? (marginSpent - marginBase) : (marginBase - marginSpent);
const diffClass = diff >= 0 ? '#22c55e' : '#ef4444';
const diffLabel = _bDaily ? (diff >= 0 ? '超過達成' : '未達') : (diff >= 0 ? '余裕' : '超過');
const diffSign  = diff >= 0 ? '+' : '▲';

document.getElementById('an-summary-content').innerHTML = `
<div class="an-scroll-body" id="an-scroll-body">
<div style="font-size:11px;color:#64748b;margin-bottom:8px;">${_bDaily ? '目標' : '予算'}期間: ${bpLabel}</div>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
<div class="bud-stat-card">
<div class="bud-stat-label">${_bDaily ? '達成率' : '消化ペース'}</div>
<div class="bud-stat-val"><span class="bud-rate ${rateClass}" style="font-size:16px;padding:4px 12px;">${lastRate}%</span></div>
<div class="bud-stat-sub">${rateLabel}</div>
</div>
<div class="bud-stat-card">
<div class="bud-stat-label">${spentCardLabel}</div>
<div class="bud-stat-val" style="font-size:16px;font-weight:700;${(_bDaily && marginSpent < 0) ? 'color:#ef4444;' : ''}">${marginSpent < 0 ? '\u2212\u00a5' : '\u00a5'}${Math.abs(marginSpent).toLocaleString()}</div>
${spentCardExtra}
<div class="bud-stat-sub">${spentCardSub}</div>
</div>
<div class="bud-stat-card">
<div class="bud-stat-label">${diffLabel}</div>
<div class="bud-stat-val" style="font-size:16px;font-weight:700;color:${diffClass};">${diffSign} ¥${Math.abs(diff).toLocaleString()}</div>
<div class="bud-stat-sub" style="font-size:10px;line-height:1.4;">${marginSubText}</div>
</div>
</div>
</div>`;
_fixSummaryScrollHeight();
}

function _renderBudgetMonthly(range, filter) {
const useClosing = (anUseClosing !== null)
? anUseClosing : (S.closingOn === true || S.closingOn === 'true');
const _bmd = isBizMode();
const anchor = parseInt(S.periodStartDay) || 25;

let periods = [];

if (useClosing && anPreset !== 'CUSTOM') {
let curStart = range.from
? _snapToClosingPeriodStart(range.from, anchor)
: _snapToClosingPeriodStart(_getEarliestRecordDate(), anchor);
const rangeEnd = range.to || _calcClosingPeriodForDate(new Date(), anchor).to;
let cp = _calcClosingPeriodForDate(_parseYmd(curStart), anchor);
for (let guard = 0; guard < 60; guard++) {
if (cp.from > rangeEnd) break;
const actualTo = cp.to <= rangeEnd ? cp.to : rangeEnd;
const labelRef = anchor >= 15 ? _parseYmd(cp.to) : _parseYmd(cp.from);
const label = _pad2(labelRef.getMonth() + 1) + '月';
periods.push({
from: cp.from, to: actualTo,
fullFrom: cp.from, fullTo: cp.to,
label, labelYear: labelRef.getFullYear()
});
if (actualTo >= rangeEnd) break;
cp = _calcNextClosingPeriod(cp.to, anchor);
}
} else {
const from = range.from || _getEarliestRecordDate();
const now = new Date();
const curMonthEnd = `${now.getFullYear()}-${_pad2(now.getMonth()+1)}-${_pad2(_lastDayOfMonth(now.getFullYear(), now.getMonth()+1))}`;
const to = range.to || curMonthEnd;
let y = parseInt(from.slice(0, 4)), mo = parseInt(from.slice(5, 7));
const endY = parseInt(to.slice(0, 4)), endMo = parseInt(to.slice(5, 7));
for (let guard = 0; guard < 60; guard++) {
if (y > endY || (y === endY && mo > endMo)) break;
const monthEnd = _lastDayOfMonth(y, mo);
const periodFrom = `${y}-${_pad2(mo)}-01`;
const periodTo   = `${y}-${_pad2(mo)}-${_pad2(monthEnd)}`;
const actualFrom = periodFrom > from ? periodFrom : from;
const actualTo   = periodTo   < to   ? periodTo   : to;
periods.push({
from: actualFrom, to: actualTo,
fullFrom: periodFrom, fullTo: periodTo,
label: _pad2(mo) + '月', labelYear: y
});
mo++; if (mo > 12) { mo = 1; y++; }
}
}

if (!periods.length) { showAnEmpty(); return; }

let budgetHistory = [];
try { budgetHistory = JSON.parse(DB.getBudgetHistory(60)); } catch(e) {}

const fixedMode = _anFixedMode();
const showFixed = anShowFixed && S.fixedOn;
const filterObj = JSON.parse(filter || '{}');
const grossFilter = JSON.stringify(_bmd ? Object.assign({}, filterObj, { excludeCostTags: true }) : filterObj);
const expFilter   = JSON.stringify(Object.assign({}, filterObj, { onlyCostTags: true }));

const months2 = periods.map(period => {
let _grossSpent = 0, _expAmt = 0;
try {
const dailyG = JSON.parse(DB.getDailyStats(period.from, period.to, grossFilter));
_grossSpent = dailyG.reduce((s, d) => s + (d.total || 0), 0);
if (_bmd) {
const dailyE = JSON.parse(DB.getDailyStats(period.from, period.to, expFilter));
_expAmt = dailyE.reduce((s, d) => s + (d.total || 0), 0);
}
} catch(e) {}
const _rawSpent = _grossSpent + _expAmt;
const spent = _bmd ? (_grossSpent - _expAmt) : _grossSpent;

const midDate = new Date((_parseYmd(period.fullFrom || period.from).getTime() + _parseYmd(period.fullTo || period.to).getTime()) / 2);
const midStr = _ymd(midDate);
let budget = -1;
for (const bp of budgetHistory) {
if (bp.periodFrom === period.from) { budget = bp.totalAmount; break; }
}
if (budget < 0) {
for (const bp of budgetHistory) {
if (bp.periodFrom <= midStr && midStr <= bp.periodTo) { budget = bp.totalAmount; break; }
}
}
if (budget < 0) {
for (const bp of budgetHistory) {
if (bp.periodFrom <= period.from && period.from <= bp.periodTo) { budget = bp.totalAmount; break; }
if (bp.periodFrom.slice(0, 7) === period.from.slice(0, 7)) { budget = bp.totalAmount; break; }
}
}

let fixedAmt = 0;
if (showFixed) {
fixedAmt = _anGetFixedForPeriod(period.fullFrom || period.from, period.fullTo || period.to, useClosing);
}

const effBudget = (fixedMode === 'BUDGET' && budget > 0)
? (_bmd ? Math.max(0, budget + fixedAmt) : Math.max(0, budget - fixedAmt))
: budget;
const effSpent = (fixedMode === 'ADD')
? (_bmd ? spent - fixedAmt : spent + fixedAmt)
: spent;
const effDiff = effBudget > 0 ? (_bmd ? effSpent - effBudget : effBudget - effSpent) : null;
const effRate = effBudget > 0 ? Math.round((effSpent / effBudget) * 100) : null;
return {
label: period.label,
labelYear: period.labelYear,
from: period.from, to: period.to,
budget, spent, fixedAmt,
rawSpent: _rawSpent, grossSpent: _grossSpent, expenseAmt: _expAmt,
effBudget, effSpent, effDiff, effRate,
effOver: effBudget > 0 && (_bmd ? effSpent < effBudget : effSpent > effBudget)
};
});

if (!months2.some(m => m.spent !== 0 || m.rawSpent > 0 || m.budget > 0)) { showAnEmpty(); return; }

const displayMonths = months2;
const calcMonths    = anHideNoBudget
? months2.filter(m => m.budget > 0)
: months2;
if (!displayMonths.length) { showAnEmpty(); return; }

// ── グラフ描画（months2 から直接） ───────────────────────
const labels    = displayMonths.map(m => m.label);
const rateData  = displayMonths.map(m => m.effRate);
const _bizMd = isBizMode();
const barColors = displayMonths.map(m => {
if (m.effRate === null) return 'rgba(148,163,184,0.6)';
if (_bizMd) {
// 売上管理: 低達成率=赤, 高達成率=緑
if (m.effRate >= 100) return 'rgba(34,197,94,0.88)';
if (m.effRate >= 85)  return 'rgba(249,115,22,0.85)';
if (m.effRate >= 70)  return 'rgba(251,191,36,0.85)';
return 'rgba(239,68,68,0.88)';
} else {
// 家計簿: 低消化率=緑, 高消化率=赤
if (m.effRate <= 70)  return 'rgba(34,197,94,0.80)';
if (m.effRate <= 90)  return 'rgba(251,191,36,0.85)';
if (m.effRate <= 100) return 'rgba(249,115,22,0.85)';
return 'rgba(239,68,68,0.88)';
}
});

const ctx = document.getElementById('an-canvas').getContext('2d');
anChart = new Chart(ctx, {
type: 'bar',
data: {
labels,
datasets: [
{
label: isBizMode() ? '予算達成率（%）' : '予算消化率（%）',
data: rateData,
backgroundColor: barColors,
borderColor: barColors.map(c => c.replace(/[\d.]+\)$/, '1)')),
borderWidth: 1,
borderRadius: 5,
order: 2,
},
{
label: '予算通り（100%）',
data: new Array(displayMonths.length).fill(100),
type: 'line',
borderColor: 'rgba(99,102,241,0.6)',
borderWidth: 1.5,
borderDash: [6, 4],
pointRadius: 0,
fill: false,
order: 1,
}
]
},
options: {
responsive: true,
maintainAspectRatio: true,
plugins: {
legend: { display: false },
tooltip: {
callbacks: {
label: ctx => {
if (ctx.datasetIndex === 1) return null;
const m = displayMonths[ctx.dataIndex];
const lines = [];
if (m.effRate !== null) lines.push(' ' + (isBizMode() ? '達成率' : '消化率') + ': ' + m.effRate + '%');
lines.push(' ' + (isBizMode() ? '売上' : '実支出') + ': \u00a5' + m.effSpent.toLocaleString());
if (m.effBudget > 0) lines.push(' 予算: \u00a5' + m.effBudget.toLocaleString());
else lines.push(' 予算: 未設定');
return lines;
}
}
}
},
scales: {
x: { grid: { display: false }, ticks: { font: { size: 10 } } },
y: {
beginAtZero: true,
ticks: { font: { size: 10 }, callback: v => v + '%' },
grid: {
color: ctx => ctx.tick.value === 100 ? 'rgba(99,102,241,0.3)' : 'rgba(0,0,0,0.06)'
}
}
}
}
});

// ── サマリーテーブル ────────────────────────────────────────
const totalBudget = calcMonths.reduce((s, m) => s + (m.effBudget > 0 ? m.effBudget : 0), 0);
const totalSpent  = calcMonths.reduce((s, m) => s + m.effSpent, 0);
const totalRate   = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : null;

const budHeader = _bizMd
? (showFixed && fixedMode === 'BUDGET' ? '予算（+固定費）' : '目標予算')
: (showFixed && fixedMode === 'BUDGET' ? '予算（\u2212固定費）' : '予算');
const spentHeader = _bizMd
? (showFixed && fixedMode === 'ADD' ? '純売上（−固定費）' : '純売上')
: (showFixed && fixedMode === 'ADD' ? '実支出（+固定費）' : '実支出');

// ── 年ヘッダー生成ヘルパー ─────────────────────────────────
// 3ヶ月以上の集計で年が変わるタイミングに区切り行を挿入
// シーズンプリセット実装後は anPreset を参照してラベルを変える
const _needYearHeader = displayMonths.length >= 3;

function _yearHeaderLabel(year, preset) {
// 将来のシーズンプリセット対応（例: 'SEASON_H1_2024' 等）
if (typeof preset === 'string') {
if (preset.includes('Q1')) return year + '年 第1四半期 (1〜3月)';
if (preset.includes('Q2')) return year + '年 第2四半期 (4〜6月)';
if (preset.includes('Q3')) return year + '年 第3四半期 (7〜9月)';
if (preset.includes('Q4')) return year + '年 第4四半期 (10〜12月)';
if (preset.includes('H1') || preset.includes('上半期')) return year + '年 上半期 (1〜6月)';
if (preset.includes('H2') || preset.includes('下半期')) return year + '年 下半期 (7〜12月)';
if (preset.includes('FY_H1') || preset.includes('年度上')) return year + '年度 上半期 (4〜9月)';
if (preset.includes('FY_H2') || preset.includes('年度下')) return year + '年度 下半期 (10〜3月)';
}
return year + '年';
}

let _prevYear = null;
const rows = displayMonths.map(m => {
const _mYear = m.labelYear != null ? m.labelYear : (m.to ? parseInt(m.to.slice(0, 4)) : (m.from ? parseInt(m.from.slice(0, 4)) : null));
let yearHeaderHtml = '';
if (_needYearHeader && _mYear !== null && _mYear !== _prevYear) {
yearHeaderHtml =
'<tr style="background:#f1f5f9;">'
+ '<td colspan="5" style="padding:5px 8px;font-size:13px;font-weight:700;'
+ 'color:#475569;letter-spacing:0.5px;border-bottom:2px solid #cbd5e1;">'
+ _yearHeaderLabel(_mYear, anPreset)
+ '</td></tr>';
_prevYear = _mYear;
}
const rc = m.effRate === null ? 'none' : _bizMd
? (m.effRate >= 100 ? 'ok' : m.effRate >= 70 ? 'warn' : 'over')
: (m.effRate > 100 ? 'over' : m.effRate >= 90 ? 'warn' : 'ok');
const rateCell = m.effRate !== null
? '<span class="bud-rate ' + rc + '">' + m.effRate + '%</span>'
: '<span class="bud-rate none">\u2014</span>';

// ── セル共通関数: メイン行 + サブ行（空でも min-height を確保）──
const _cellHtml = (main, ...subs) => {
const subHtml = subs.filter(Boolean).join('');
return '<div class="bud-cell-main">' + main + '</div>'
+ '<div class="bud-cell-sub">' + subHtml + '</div>';
};

// 予算セル
let budMain = m.effBudget > 0
? '\u00a5' + m.effBudget.toLocaleString()
: '<span style="color:#94a3b8;">未設定</span>';
let budSub = '';
if (showFixed && fixedMode === 'BUDGET' && m.fixedAmt > 0) {
budSub = _bizMd
? '\u00a5' + m.budget.toLocaleString() + '+固定費\u00a5' + m.fixedAmt.toLocaleString()
: '\u00a5' + m.budget.toLocaleString() + '\u2212固定費\u00a5' + m.fixedAmt.toLocaleString();
}
const budCell = _cellHtml(budMain, budSub);

// 売上/支出セル
const _spentNeg = _bizMd && m.effSpent < 0;
const _spentColor = _spentNeg ? 'color:#ef4444;' : '';
const spentMain = (_spentNeg ? '\u2212\u00a5' : '\u00a5') + Math.abs(m.effSpent).toLocaleString()
+ (_spentNeg ? '<span style="font-size:10px;color:#ef4444;"> (−)</span>' : '');
let spentSub1 = '';
let spentSub2 = '';
if (_bizMd && m.expenseAmt > 0) {
spentSub1 = '総売上\u00a5' + m.grossSpent.toLocaleString() + '\u2212経費\u00a5' + m.expenseAmt.toLocaleString();
}
if (showFixed && fixedMode === 'ADD' && m.fixedAmt > 0) {
spentSub2 = _bizMd
? '純売上前\u00a5' + m.spent.toLocaleString() + '\u2212固定費\u00a5' + m.fixedAmt.toLocaleString()
: '実支出\u00a5' + m.spent.toLocaleString() + '+固定費\u00a5' + m.fixedAmt.toLocaleString();
}
const spentCell = _cellHtml(`<span style="${_spentColor}">${spentMain}</span>`, spentSub1, spentSub2);

const _diffBad = _bizMd ? m.effDiff < 0 : m.effDiff < 0;  // biz: 未達(effDiff<0)=赤
const diffCell = m.effDiff !== null
? '<span style="color:' + (_diffBad ? '#ef4444' : '#22c55e') + ';font-weight:600;">'
+ (_bizMd ? (m.effDiff >= 0 ? '+' : '\u25b2') : (m.effDiff < 0 ? '\u25b2' : '+'))
+ ' \u00a5' + Math.abs(m.effDiff).toLocaleString() + '</span>'
: '\u2014';

// 予算未設定除外ON時：未設定月はアンバー系でハイライト（集計除外を明示）
const isExcluded = anHideNoBudget && m.budget <= 0;
const rowStyle = isExcluded
? ' style="background:#fffbeb;opacity:0.65;"'
: '';
const excludedBadge = isExcluded
? '<span style="font-size:9px;color:#d97706;background:#fef3c7;border:1px solid #fcd34d;border-radius:4px;padding:1px 3px;margin-left:3px;">除</span>'
: '';
return yearHeaderHtml + '<tr class="' + (m.effOver ? 'bud-row-over' : '') + '"' + rowStyle + '>'
+ '<td class="bud-td-month">' + m.label + excludedBadge + '</td>'
+ '<td class="bud-td">' + budCell + '</td>'
+ '<td class="bud-td">' + spentCell + '</td>'
+ '<td class="bud-td">' + diffCell + '</td>'
+ '<td class="bud-td">' + rateCell + '</td>'
+ '</tr>';
}).join('');

const trClass = totalRate === null ? 'ok' : _bizMd
? (totalRate >= 100 ? 'ok' : totalRate >= 70 ? 'warn' : 'over')
: (totalRate > 100 ? 'over' : totalRate >= 90 ? 'warn' : 'ok');
const totalRateHtml = totalRate !== null
? '<span class="bud-rate ' + trClass + '">' + totalRate + '%</span>' : '\u2014';

const _totalBad  = _bizMd ? totalSpent < totalBudget : totalSpent > totalBudget;
const _totalDiff = _bizMd ? totalSpent - totalBudget : totalBudget - totalSpent;
const totalDiff = totalBudget > 0
? '<span style="color:' + (_totalBad ? '#ef4444' : '#22c55e') + ';font-weight:700;">'
+ (_totalBad ? '\u25b2' : '+') + ' \u00a5' + Math.abs(_totalDiff).toLocaleString() + '</span>'
: '\u2014';


// 2テーブル方式: 月別行スクロール + 合計行固定
// colgroup で同じ列幅を指定して整合させる
const _colg = '<colgroup><col style="width:22%"><col style="width:22%">'
+ '<col style="width:22%"><col style="width:19%"><col style="width:15%"></colgroup>';

// CSS flex:1 で #an-summary-content が縦幅を自動確保するため JS 計算は不要
const _t1 =
'<div class="an-scroll-body" id="an-scroll-body">'
+ '<table class="bud-table" style="width:100%;">' + _colg
+ '<thead><tr>'
+ '<th class="bud-th">期間</th><th class="bud-th">' + budHeader + '</th>'
+ '<th class="bud-th">' + spentHeader + '</th><th class="bud-th">差額</th><th class="bud-th">' + (_bizMd ? '達成率' : '消化率') + '</th>'
+ '</tr></thead>'
+ '<tbody>' + rows + '</tbody>'
+ '</table></div>';

const _t2 =
'<div style="flex-shrink:0;border-top:2px solid #cbd5e1;">'
+ '<table class="bud-table" style="width:100%;">' + _colg
+ '<tbody><tr style="background:#f1f5f9;">'
+ '<td class="bud-td" style="font-weight:700;">合計</td>'
+ '<td class="bud-td">' + (totalBudget > 0 ? '\u00a5' + totalBudget.toLocaleString() : '\u2014') + '</td>'
+ '<td class="bud-td" style="font-weight:700;' + (totalSpent < 0 ? 'color:#ef4444;' : '') + '">' + (totalSpent < 0 ? '\u2212\u00a5' : '\u00a5') + Math.abs(totalSpent).toLocaleString() + '</td>'
+ '<td class="bud-td">' + totalDiff + '</td>'
+ '<td class="bud-td">' + totalRateHtml + '</td>'
+ '</tr></tbody></table></div>';

document.getElementById('an-summary-content').innerHTML = _t1 + _t2;
_fixSummaryScrollHeight();
}