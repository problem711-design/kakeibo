package com.my.myapplication

import android.app.Activity
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
private lateinit var webView: WebView
private lateinit var dbHelper: DatabaseHelper
private lateinit var prefs: SharedPreferences

// E2: インポート確認用に読み込んだJSONを一時保持
private var pendingImportJson: String? = null

companion object {
private const val REQ_PICK_JSON  = 1001
private const val PREF_NAME      = "kakeibo_prefs"
private const val KEY_CUR_ACCT   = "current_account"
private const val KEY_ACCT_NAME  = "account_name_"
private val DEFAULT_NAMES = arrayOf("アカウント1", "アカウント2", "アカウント3")
}

private var currentAccount: Int = 1

/** 現在のアカウント名を返す */
private fun currentAccountName(): String =
prefs.getString("$KEY_ACCT_NAME$currentAccount", DEFAULT_NAMES[currentAccount - 1])
?: DEFAULT_NAMES[currentAccount - 1]

override fun onCreate(savedInstanceState: Bundle?) {
super.onCreate(savedInstanceState)
supportActionBar?.hide()

prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE)
currentAccount = prefs.getInt(KEY_CUR_ACCT, 1)
dbHelper = DatabaseHelper(this, if (currentAccount == 1) "KakeiboDB" else "KakeiboDB_$currentAccount")

webView = WebView(this).apply {
settings.javaScriptEnabled = true
settings.domStorageEnabled = true
webChromeClient = WebChromeClient()
addJavascriptInterface(WebAppInterface(), "DB")
loadUrl("file:///android_asset/index.html")
}
setContentView(webView)
}

// ファイルピッカー結果 → E2: まずメタ情報をJSに渡して確認
override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
super.onActivityResult(requestCode, resultCode, data)
if (requestCode == REQ_PICK_JSON && resultCode == Activity.RESULT_OK) {
val uri: Uri = data?.data ?: run {
webView.post { webView.evaluateJavascript("onImportFileResult(\"ERROR: ファイルが選択されませんでした\")", null) }
return
}
try {
val json = contentResolver.openInputStream(uri)?.bufferedReader()?.readText()
?: throw Exception("ファイルを読み込めませんでした")

// E2: メタ情報を解析してJSに確認を求める
val root        = JSONObject(json)
val fileAcct    = root.optString("account_name", "不明")
val exportedAt  = root.optString("exported_at",  "不明")
val recordCount = root.optInt("record_count", root.optJSONArray("expenses")?.length() ?: 0)
val curAcctName = currentAccountName()

pendingImportJson = json  // 確認後に使用

val meta = JSONObject().apply {
put("fileAccount",    fileAcct)
put("exportedAt",     exportedAt)
put("recordCount",    recordCount)
put("currentAccount", curAcctName)
}
val quoted = JSONObject.quote(meta.toString())
webView.post { webView.evaluateJavascript("onImportFileReady($quoted)", null) }

} catch (e: Exception) {
val quotedMsg = JSONObject.quote("ERROR: ${e.message ?: "不明なエラー"}")
webView.post { webView.evaluateJavascript("onImportFileResult($quotedMsg)", null) }
}
}
}

inner class WebAppInterface {
// ===== マスター =====
@JavascriptInterface fun getMaster(table: String): String = dbHelper.getMasterList(table)
@JavascriptInterface fun addMaster(table: String, name: String) { dbHelper.insertMaster(table, name) }
@JavascriptInterface fun updateMaster(table: String, id: Int, name: String) { dbHelper.updateMaster(table, id, name) }
@JavascriptInterface fun deleteMaster(table: String, id: Int) { dbHelper.deleteMaster(table, id) }

// ===== 支出 CRUD =====
@JavascriptInterface
fun save(dataJson: String): Boolean {
return try {
val o = JSONObject(dataJson)
val id = o.optInt("id", -1)
val name = o.optString("name", "")
val price = o.optString("price", "0")
val cId = o.optInt("category_id", 0)
val tIds = o.optString("tag_ids", "")
val date = o.optString("date", "")
val pts = o.optString("points", "0")
val cardId = o.optInt("card_id", 0)
val createdAt = o.optString("created_at", "")
if (id == -1) {
dbHelper.insertExpense(name, price, cId, tIds, date, pts, cardId) != -1L
} else {
dbHelper.updateExpense(id, name, price, cId, tIds, date, pts, cardId, createdAt)
true
}
} catch (e: Exception) { e.printStackTrace(); false }
}

// ===== 履歴 =====
@JavascriptInterface fun getRecords(offset: Int): String = dbHelper.getRecords(offset)
@JavascriptInterface fun deleteLog(id: Int) = dbHelper.deleteAndLogExpense(id)
@JavascriptInterface fun getActionLogs(type: String, offset: Int): String = dbHelper.getActionLogs(type, offset)
@JavascriptInterface fun restoreLogs(idsJson: String) {
val array = JSONArray(idsJson)
dbHelper.restoreLogs(IntArray(array.length()) { i -> array.getInt(i) })
}
@JavascriptInterface fun getTotal(mode: String): Int = dbHelper.getTotal(mode)
@JavascriptInterface fun getTotalByRange(dateFrom: String, dateTo: String): Int = dbHelper.getTotalByRange(dateFrom, dateTo)
@JavascriptInterface fun getFixedCostsList(): String = dbHelper.getFixedCostsList()
@JavascriptInterface fun getFixedCostsTotal(): Int = dbHelper.getFixedCostsTotal()
@JavascriptInterface fun addFixedCost(name: String, amount: Int) = dbHelper.addFixedCost(name, amount)
@JavascriptInterface fun updateFixedCost(id: Int, name: String, amount: Int) = dbHelper.updateFixedCost(id, name, amount)
@JavascriptInterface fun deleteFixedCost(id: Int) = dbHelper.deleteFixedCost(id)
@JavascriptInterface fun searchRecords(filterJson: String, offset: Int): String = dbHelper.searchRecords(filterJson, offset)

// ===== 設定 =====
@JavascriptInterface fun getSetting(key: String, default: String): String = dbHelper.getSetting(key, default)
@JavascriptInterface fun setSetting(key: String, value: String) = dbHelper.setSetting(key, value)

// ===== バックアップ =====
// E1/E3: アカウント名をファイル名・サブフォルダに使用
@JavascriptInterface fun exportToFile(): String = dbHelper.exportToFile(currentAccountName())
@JavascriptInterface fun importAll(jsonStr: String): String = dbHelper.importAll(jsonStr)

@JavascriptInterface fun openImportFilePicker() {
runOnUiThread {
val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
addCategory(Intent.CATEGORY_OPENABLE)
type = "*/*"
putExtra(android.provider.DocumentsContract.EXTRA_INITIAL_URI,
android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI)
}
startActivityForResult(intent, REQ_PICK_JSON)
}
}

// E2: ユーザーが確認ダイアログでOKを押した後に呼ぶ → 実際のインポート実行
@JavascriptInterface
fun confirmImport(): String {
val json = pendingImportJson
?: return "ERROR: インポートデータが見つかりません"
pendingImportJson = null
return dbHelper.importAll(json, currentAccountName())
}

// E2: キャンセル時にペンディングデータを破棄
@JavascriptInterface
fun cancelImport() {
pendingImportJson = null
}

// ===== 予算管理 (v32) =====
@JavascriptInterface
fun getBudgetForPeriod(periodFrom: String, periodTo: String): String =
dbHelper.getBudgetForPeriod(periodFrom, periodTo)

@JavascriptInterface
fun setBudgetBase(periodFrom: String, periodTo: String, amount: Int) =
dbHelper.setBudgetBase(periodFrom, periodTo, amount)

@JavascriptInterface
fun addBudgetExtra(periodFrom: String, name: String, amount: Int): Long =
dbHelper.addBudgetExtra(periodFrom, name, amount)

@JavascriptInterface
fun updateBudgetExtra(id: Int, name: String, amount: Int) =
dbHelper.updateBudgetExtra(id, name, amount)

@JavascriptInterface
fun deleteBudgetExtra(id: Int) = dbHelper.deleteBudgetExtra(id)

@JavascriptInterface
fun getBudgetHistory(limit: Int): String = dbHelper.getBudgetHistory(limit)

// ===== 固定費履歴 (v32) =====
@JavascriptInterface
fun getActiveFixedCostHistory(): String = dbHelper.getActiveFixedCostHistory()

@JavascriptInterface
fun getActiveFixedCostHistoryTotal(): Int = dbHelper.getActiveFixedCostHistoryTotal()

@JavascriptInterface
fun getFixedCostHistoryAt(periodFrom: String): String = dbHelper.getFixedCostHistoryAt(periodFrom)

@JavascriptInterface
fun addFixedCostHistory(name: String, amount: Int, categoryId: Int, validFrom: String): Long =
dbHelper.addFixedCostHistory(name, amount, categoryId, validFrom)

@JavascriptInterface
fun endFixedCostHistory(id: Int, validTo: String) = dbHelper.endFixedCostHistory(id, validTo)

@JavascriptInterface
fun changeFixedCostHistory(id: Int, name: String, amount: Int, categoryId: Int, validFrom: String) =
dbHelper.changeFixedCostHistory(id, name, amount, categoryId, validFrom)

// ===== アカウント管理 =====
@JavascriptInterface
fun getAccountInfo(): String {
val arr = JSONArray()
for (i in 1..3) {
arr.put(JSONObject().apply {
put("id",   i)
put("name", prefs.getString("$KEY_ACCT_NAME$i", DEFAULT_NAMES[i - 1]) ?: DEFAULT_NAMES[i - 1])
})
}
return JSONObject().apply {
put("current",  currentAccount)
put("accounts", arr)
}.toString()
}

@JavascriptInterface
fun switchAccount(accountId: Int) {
if (accountId < 1 || accountId > 3) return
if (accountId == currentAccount) return
currentAccount = accountId
prefs.edit().putInt(KEY_CUR_ACCT, currentAccount).apply()
dbHelper.close()
dbHelper = DatabaseHelper(this@MainActivity, if (currentAccount == 1) "KakeiboDB" else "KakeiboDB_$currentAccount")
val info = getAccountInfo()
val quoted = JSONObject.quote(info)
runOnUiThread {
webView.evaluateJavascript("onAccountSwitched($quoted)", null)
}
}

@JavascriptInterface
fun setAccountName(accountId: Int, name: String) {
if (accountId < 1 || accountId > 3 || name.isBlank()) return
prefs.edit().putString("$KEY_ACCT_NAME$accountId", name.trim()).apply()
if (accountId == currentAccount) {
val quoted = JSONObject.quote(name.trim())
runOnUiThread {
webView.evaluateJavascript("updateHeaderAccountName($quoted)", null)
}
}
}

@JavascriptInterface
fun resetAccount(accountId: Int) {
if (accountId < 1 || accountId > 3) return
val targetDbName = if (accountId == 1) "KakeiboDB" else "KakeiboDB_$accountId"
if (accountId == currentAccount) {
// 現在のアカウントをリセット
dbHelper.resetAccountData()
val info = getAccountInfo()
val quoted = JSONObject.quote(info)
runOnUiThread {
webView.evaluateJavascript("onAccountReset($quoted)", null)
}
} else {
// 別アカウントをリセット（一時的にDBを開いてリセット後に閉じる）
val tempDb = DatabaseHelper(this@MainActivity, targetDbName)
tempDb.resetAccountData()
tempDb.close()
val info = getAccountInfo()
val quoted = JSONObject.quote(info)
runOnUiThread {
webView.evaluateJavascript("onAccountReset($quoted)", null)
}
}
}

// ===== 分析用集計 =====
@JavascriptInterface
fun getMonthlyStats(months: Int): String = dbHelper.getMonthlyStats(months)

@JavascriptInterface
fun getMonthlyStatsFiltered(months: Int, filterJson: String): String =
dbHelper.getMonthlyStats(months, filterJson)

@JavascriptInterface
fun getMonthlyStatsByRange(dateFrom: String, dateTo: String): String =
dbHelper.getMonthlyStatsByRange(dateFrom, dateTo)

@JavascriptInterface
fun getMonthlyStatsByRangeFiltered(dateFrom: String, dateTo: String, filterJson: String): String =
dbHelper.getMonthlyStatsByRange(dateFrom, dateTo, filterJson)

@JavascriptInterface
fun getDailyStats(dateFrom: String, dateTo: String, filterJson: String): String =
dbHelper.getDailyStats(dateFrom, dateTo, filterJson)

@JavascriptInterface
fun getAllSettings(): String = dbHelper.getAllSettings()

@JavascriptInterface
fun getCategoryStats(filterJson: String): String = dbHelper.getCategoryStats(filterJson)

@JavascriptInterface
fun getCardPointStats(filterJson: String): String = dbHelper.getCardPointStats(filterJson)

@JavascriptInterface
fun getCostTagStats(filterJson: String): String = dbHelper.getCostTagStats(filterJson)

// ===== システム =====
@JavascriptInterface fun exitApp() { runOnUiThread { finish() } }
}

override fun onBackPressed() {
webView.evaluateJavascript("handleBack()", null)
}
}