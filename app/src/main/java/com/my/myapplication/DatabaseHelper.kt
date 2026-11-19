package com.my.myapplication

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

// =========================================================
//  DatabaseHelper  v32
//  v31→v32 の変更点:
//    - budget_periods テーブル追加（期間別基本予算）
//    - budget_extras  テーブル追加（臨時収入・賞与）
//    - fixed_cost_history テーブル追加（固定費変更履歴）
//    - 既存 fixed_costs データを fixed_cost_history に移行
// =========================================================

class DatabaseHelper(private val context: Context, dbName: String = "KakeiboDB")
: SQLiteOpenHelper(context, dbName, null, 34) {

// ----------------------------------------------------------
//  テーブル定義
// ----------------------------------------------------------
override fun onCreate(db: SQLiteDatabase) {
createAllTables(db)
insertInitialData(db)
}

override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
// ★ 破壊的 DROP は行わない。差分 ALTER / CREATE のみ。
if (oldVersion < 31) upgradeTo31(db)
if (oldVersion < 32) upgradeTo32(db)
if (oldVersion < 33) upgradeTo33(db)
if (oldVersion < 34) upgradeTo34(db)
}

private fun createAllTables(db: SQLiteDatabase) {
// マスターテーブル
db.execSQL("CREATE TABLE IF NOT EXISTS categories  (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)")
db.execSQL("CREATE TABLE IF NOT EXISTS custom_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)")
db.execSQL("CREATE TABLE IF NOT EXISTS point_cards (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)")
db.execSQL("CREATE TABLE IF NOT EXISTS cost_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)") // v33: 経費タグマスター
// cost_tags は ID を 10001〜 に固定してpoint_cardsとの衝突を防ぐ
db.execSQL("DELETE FROM sqlite_sequence WHERE name = 'cost_tags'")
db.execSQL("INSERT OR IGNORE INTO sqlite_sequence (name, seq) VALUES ('cost_tags', 9999)")

// 支出テーブル（tag_ids は後方互換のため残す）
db.execSQL("""
CREATE TABLE IF NOT EXISTS expenses (
id          INTEGER PRIMARY KEY AUTOINCREMENT,
name        TEXT,
price       INTEGER,
category_id INTEGER,
tag_ids     TEXT,
date        TEXT,
points      INTEGER DEFAULT 0,
card_id     INTEGER DEFAULT 0,
created_at  DATETIME DEFAULT (datetime('now','localtime')),
updated_at  DATETIME,
restored_at DATETIME
)
""")

// タグ正規化テーブル（v31 新規）
db.execSQL("""
CREATE TABLE IF NOT EXISTS expense_tags (
id         INTEGER PRIMARY KEY AUTOINCREMENT,
expense_id INTEGER NOT NULL,
tag_id     INTEGER NOT NULL
)
""")
db.execSQL("CREATE INDEX IF NOT EXISTS idx_et_expense ON expense_tags(expense_id)")
db.execSQL("CREATE INDEX IF NOT EXISTS idx_et_tag    ON expense_tags(tag_id)")

// 削除ログテーブル
db.execSQL("""
CREATE TABLE IF NOT EXISTS action_logs (
id            INTEGER PRIMARY KEY AUTOINCREMENT,
action_type   TEXT,
timestamp     DATETIME DEFAULT (datetime('now','localtime')),
original_data TEXT
)
""")

// 設定テーブル（v31 新規）
db.execSQL("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")

// 固定費テーブル（v31 後方互換のため残す）
db.execSQL("""
CREATE TABLE IF NOT EXISTS fixed_costs (
id          INTEGER PRIMARY KEY AUTOINCREMENT,
name        TEXT NOT NULL,
amount      INTEGER NOT NULL DEFAULT 0,
category_id INTEGER DEFAULT 0,
is_active   INTEGER DEFAULT 1,
created_at  DATETIME DEFAULT (datetime('now','localtime'))
)
""")

// ── v32 新規テーブル ──
db.execSQL("""
CREATE TABLE IF NOT EXISTS budget_periods (
period_from TEXT PRIMARY KEY,
period_to   TEXT NOT NULL,
amount      INTEGER NOT NULL DEFAULT 0,
created_at  DATETIME DEFAULT (datetime('now','localtime'))
)
""")
db.execSQL("""
CREATE TABLE IF NOT EXISTS budget_extras (
id          INTEGER PRIMARY KEY AUTOINCREMENT,
period_from TEXT NOT NULL,
name        TEXT NOT NULL,
amount      INTEGER NOT NULL DEFAULT 0,
created_at  DATETIME DEFAULT (datetime('now','localtime'))
)
""")
db.execSQL("""
CREATE TABLE IF NOT EXISTS fixed_cost_history (
id          INTEGER PRIMARY KEY AUTOINCREMENT,
name        TEXT NOT NULL,
amount      INTEGER NOT NULL DEFAULT 0,
category_id INTEGER DEFAULT 0,
valid_from  TEXT NOT NULL,
valid_to    TEXT,
created_at  DATETIME DEFAULT (datetime('now','localtime'))
)
""")
}

// ----------------------------------------------------------
//  v31 → v32 マイグレーション
// ----------------------------------------------------------
private fun upgradeTo32(db: SQLiteDatabase) {
db.execSQL("""
CREATE TABLE IF NOT EXISTS budget_periods (
period_from TEXT PRIMARY KEY,
period_to   TEXT NOT NULL,
amount      INTEGER NOT NULL DEFAULT 0,
created_at  DATETIME DEFAULT (datetime('now','localtime'))
)
""")
db.execSQL("""
CREATE TABLE IF NOT EXISTS budget_extras (
id          INTEGER PRIMARY KEY AUTOINCREMENT,
period_from TEXT NOT NULL,
name        TEXT NOT NULL,
amount      INTEGER NOT NULL DEFAULT 0,
created_at  DATETIME DEFAULT (datetime('now','localtime'))
)
""")
db.execSQL("""
CREATE TABLE IF NOT EXISTS fixed_cost_history (
id          INTEGER PRIMARY KEY AUTOINCREMENT,
name        TEXT NOT NULL,
amount      INTEGER NOT NULL DEFAULT 0,
category_id INTEGER DEFAULT 0,
valid_from  TEXT NOT NULL,
valid_to    TEXT,
created_at  DATETIME DEFAULT (datetime('now','localtime'))
)
""")

// 既存 fixed_costs（is_active=1）→ fixed_cost_history に移行
// valid_from="2000-01-01" = 当初から有効、valid_to=NULL = 現在も有効
val fcCursor = db.rawQuery(
"SELECT name, amount, category_id FROM fixed_costs WHERE is_active=1", null
)
while (fcCursor.moveToNext()) {
db.insert("fixed_cost_history", null, ContentValues().apply {
put("name",        fcCursor.getString(0))
put("amount",      fcCursor.getInt(1))
put("category_id", fcCursor.getInt(2))
put("valid_from",  "2000-01-01")
put("valid_to",    null as String?)
})
}
fcCursor.close()
}

// ----------------------------------------------------------
//  v30 → v31 安全マイグレーション
// ----------------------------------------------------------
private fun upgradeTo33(db: SQLiteDatabase) {
// v33: 経費タグマスター（売上管理モード用）
db.execSQL("CREATE TABLE IF NOT EXISTS cost_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)")
}

private fun upgradeTo34(db: SQLiteDatabase) {
// v34: cost_tags の ID を 10001〜 に強制してpoint_cardsとの衝突を解消
// cost_tags はテスト段階のため一旦クリアして高IDから再採番
db.execSQL("DELETE FROM cost_tags")
// sqlite_sequenceが存在しない場合もあるのでUPSERT
db.execSQL("DELETE FROM sqlite_sequence WHERE name = 'cost_tags'")
db.execSQL("INSERT INTO sqlite_sequence (name, seq) VALUES ('cost_tags', 9999)")
// point_cards を参照していた可能性のあるexpenses上のcard_idは
// cost_tags側では 1〜9999 が存在しなくなるため自動的に無効化される
}

private fun upgradeTo31(db: SQLiteDatabase) {
// 新テーブルを追加（既存テーブルには一切触れない）
db.execSQL("""
CREATE TABLE IF NOT EXISTS expense_tags (
id INTEGER PRIMARY KEY AUTOINCREMENT,
expense_id INTEGER NOT NULL,
tag_id INTEGER NOT NULL
)
""")
db.execSQL("CREATE INDEX IF NOT EXISTS idx_et_expense ON expense_tags(expense_id)")
db.execSQL("CREATE INDEX IF NOT EXISTS idx_et_tag    ON expense_tags(tag_id)")
db.execSQL("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
db.execSQL("""
CREATE TABLE IF NOT EXISTS fixed_costs (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT NOT NULL,
amount INTEGER NOT NULL DEFAULT 0,
category_id INTEGER DEFAULT 0,
is_active INTEGER DEFAULT 1,
created_at DATETIME DEFAULT (datetime('now','localtime'))
)
""")

// 既存の tag_ids データを expense_tags に移行
migrateTagIds(db)
}

private fun migrateTagIds(db: SQLiteDatabase) {
val cursor = db.rawQuery("SELECT id, tag_ids FROM expenses WHERE tag_ids IS NOT NULL AND tag_ids != ''", null)
db.beginTransaction()
try {
while (cursor.moveToNext()) {
val expId = cursor.getInt(0)
val tagIds = cursor.getString(1) ?: continue
tagIds.split(",").filter { it.isNotBlank() }.forEach { tid ->
val tagId = tid.trim().toIntOrNull() ?: return@forEach
// 重複挿入防止
val exists = db.rawQuery(
"SELECT 1 FROM expense_tags WHERE expense_id=? AND tag_id=?",
arrayOf(expId.toString(), tagId.toString())
)
if (!exists.moveToFirst()) {
db.insert("expense_tags", null, ContentValues().apply {
put("expense_id", expId)
put("tag_id", tagId)
})
}
exists.close()
}
}
db.setTransactionSuccessful()
} finally {
cursor.close()
db.endTransaction()
}
}

// ----------------------------------------------------------
//  初期データ
// ----------------------------------------------------------
private fun insertInitialData(db: SQLiteDatabase) {
val tables = mapOf(
"categories"  to arrayOf("食費","飲料費","交遊費","日用品","趣味","医療費","防災費","交通費","衣類"),
"custom_tags" to arrayOf("外食","酒","水分補給","デート","飲み会","付き合い","ライブ","サークル","ポイント10倍","保存食","菓子類"),
"point_cards" to arrayOf("ワオンカード","Tポイントカード","ウェルシア","楽天カード")
)
tables.forEach { (table, data) ->
val cur = db.rawQuery("SELECT count(*) FROM $table", null)
cur.moveToFirst()
val count = cur.getInt(0)
cur.close()
if (count == 0) data.forEach { name ->
db.insert(table, null, ContentValues().apply { put("name", name) })
}
}
}

// ----------------------------------------------------------
//  マスター操作
// ----------------------------------------------------------
/** 固定費: 追加 */
fun addFixedCost(name: String, amount: Int) {
writableDatabase.insertWithOnConflict("fixed_costs", null,
ContentValues().apply {
put("name", name)
put("amount", amount)
put("is_active", 1)
}, SQLiteDatabase.CONFLICT_REPLACE)
}

/** 固定費: 更新 */
fun updateFixedCost(id: Int, name: String, amount: Int) {
writableDatabase.update("fixed_costs",
ContentValues().apply { put("name", name); put("amount", amount) },
"id=?", arrayOf(id.toString()))
}

/** 固定費: 削除 */
fun deleteFixedCost(id: Int) {
writableDatabase.delete("fixed_costs", "id=?", arrayOf(id.toString()))
}

// ----------------------------------------------------------
//  予算期間管理 (budget_periods / budget_extras)
// ----------------------------------------------------------

/** 指定期間の予算情報（基本予算＋臨時収入リスト）を返す */
fun getBudgetForPeriod(periodFrom: String, periodTo: String): String {
val db = readableDatabase
val baseCur = db.rawQuery(
"SELECT amount FROM budget_periods WHERE period_from=?", arrayOf(periodFrom)
)
val baseAmount = if (baseCur.moveToFirst()) baseCur.getInt(0) else -1
baseCur.close()

val extrasCur = db.rawQuery(
"SELECT id, name, amount FROM budget_extras WHERE period_from=? ORDER BY id",
arrayOf(periodFrom)
)
val extras = JSONArray()
while (extrasCur.moveToNext()) {
extras.put(JSONObject().apply {
put("id",     extrasCur.getInt(0))
put("name",   extrasCur.getString(1))
put("amount", extrasCur.getInt(2))
})
}
extrasCur.close()

val extraTotal = (0 until extras.length()).sumOf { extras.getJSONObject(it).getInt("amount") }
return JSONObject().apply {
put("periodFrom",   periodFrom)
put("periodTo",     periodTo)
put("baseAmount",   baseAmount)   // -1 = 未設定
put("extras",       extras)
put("extraTotal",   extraTotal)
put("totalAmount",  if (baseAmount >= 0) baseAmount + extraTotal else -1)
}.toString()
}

/** 基本予算を保存（upsert） */
fun setBudgetBase(periodFrom: String, periodTo: String, amount: Int) {
writableDatabase.insertWithOnConflict("budget_periods", null,
ContentValues().apply {
put("period_from", periodFrom)
put("period_to",   periodTo)
put("amount",      amount)
}, SQLiteDatabase.CONFLICT_REPLACE)
}

/** 臨時収入追加 */
fun addBudgetExtra(periodFrom: String, name: String, amount: Int): Long =
writableDatabase.insert("budget_extras", null, ContentValues().apply {
put("period_from", periodFrom)
put("name",        name)
put("amount",      amount)
})

/** 臨時収入更新 */
fun updateBudgetExtra(id: Int, name: String, amount: Int) {
writableDatabase.update("budget_extras",
ContentValues().apply { put("name", name); put("amount", amount) },
"id=?", arrayOf(id.toString()))
}

/** 臨時収入削除 */
fun deleteBudgetExtra(id: Int) {
writableDatabase.delete("budget_extras", "id=?", arrayOf(id.toString()))
}

/** 予算履歴一覧（降順）を返す */
fun getBudgetHistory(limit: Int = 36): String {
val db = readableDatabase
val cur = db.rawQuery(
"SELECT period_from, period_to, amount FROM budget_periods ORDER BY period_from DESC LIMIT ?",
arrayOf(limit.toString())
)
val result = JSONArray()
while (cur.moveToNext()) {
val pf    = cur.getString(0)
val pt    = cur.getString(1)
val base  = cur.getInt(2)
val exCur = db.rawQuery(
"SELECT COALESCE(SUM(amount),0) FROM budget_extras WHERE period_from=?", arrayOf(pf)
)
val extra = if (exCur.moveToFirst()) exCur.getInt(0) else 0
exCur.close()
result.put(JSONObject().apply {
put("periodFrom",  pf)
put("periodTo",    pt)
put("baseAmount",  base)
put("extraAmount", extra)
put("totalAmount", base + extra)
})
}
cur.close()
return result.toString()
}

// ----------------------------------------------------------
//  固定費履歴管理 (fixed_cost_history)
// ----------------------------------------------------------

/** 指定日時点で有効な固定費一覧 */
fun getFixedCostHistoryAt(periodFrom: String): String {
val cur = readableDatabase.rawQuery("""
SELECT id, name, amount, category_id, valid_from
FROM fixed_cost_history
WHERE valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)
ORDER BY id
""", arrayOf(periodFrom, periodFrom))
val result = JSONArray()
while (cur.moveToNext()) {
result.put(JSONObject().apply {
put("id",         cur.getInt(0))
put("name",       cur.getString(1))
put("amount",     cur.getInt(2))
put("categoryId", cur.getInt(3))
put("validFrom",  cur.getString(4))
})
}
cur.close()
return result.toString()
}

/** 現在有効な固定費一覧（valid_to IS NULL） */
fun getActiveFixedCostHistory(): String {
val cur = readableDatabase.rawQuery("""
SELECT id, name, amount, category_id, valid_from
FROM fixed_cost_history WHERE valid_to IS NULL ORDER BY id
""", null)
val result = JSONArray()
while (cur.moveToNext()) {
result.put(JSONObject().apply {
put("id",         cur.getInt(0))
put("name",       cur.getString(1))
put("amount",     cur.getInt(2))
put("categoryId", cur.getInt(3))
put("validFrom",  cur.getString(4))
})
}
cur.close()
return result.toString()
}

/** 現在有効な固定費の合計 */
fun getActiveFixedCostHistoryTotal(): Int {
val cur = readableDatabase.rawQuery(
"SELECT COALESCE(SUM(amount),0) FROM fixed_cost_history WHERE valid_to IS NULL", null
)
val total = if (cur.moveToFirst()) cur.getInt(0) else 0
cur.close()
return total
}

/** 固定費を新規追加（validFrom から有効） */
fun addFixedCostHistory(name: String, amount: Int, categoryId: Int, validFrom: String): Long =
writableDatabase.insert("fixed_cost_history", null, ContentValues().apply {
put("name",        name)
put("amount",      amount)
put("category_id", categoryId)
put("valid_from",  validFrom)
put("valid_to",    null as String?)
})

/** 固定費を終了（validTo を設定） */
fun endFixedCostHistory(id: Int, validTo: String) {
writableDatabase.update("fixed_cost_history",
ContentValues().apply { put("valid_to", validTo) },
"id=?", arrayOf(id.toString()))
}

/**
* 固定費の金額/名前を変更（旧レコード終了 → 新レコード作成）
* validFrom = 変更が適用される期間の開始日
*/
fun changeFixedCostHistory(id: Int, name: String, amount: Int, categoryId: Int, validFrom: String) {
val db = writableDatabase
db.beginTransaction()
try {
db.update("fixed_cost_history",
ContentValues().apply { put("valid_to", validFrom) },
"id=? AND valid_to IS NULL", arrayOf(id.toString()))
db.insert("fixed_cost_history", null, ContentValues().apply {
put("name",        name)
put("amount",      amount)
put("category_id", categoryId)
put("valid_from",  validFrom)
put("valid_to",    null as String?)
})
db.setTransactionSuccessful()
} finally { db.endTransaction() }
}

fun getMasterList(table: String): String {
val list = JSONArray()
val cursor = readableDatabase.rawQuery("SELECT id, name FROM $table ORDER BY id", null)
while (cursor.moveToNext()) {
list.put(JSONObject().apply {
put("id",   cursor.getInt(0))
put("name", cursor.getString(1))
})
}
cursor.close()
return list.toString()
}

fun insertMaster(table: String, name: String) =
writableDatabase.insert(table, null, ContentValues().apply { put("name", name) })

fun updateMaster(table: String, id: Int, name: String) =
writableDatabase.update(table, ContentValues().apply { put("name", name) }, "id=?", arrayOf(id.toString()))

fun deleteMaster(table: String, id: Int) =
writableDatabase.delete(table, "id=?", arrayOf(id.toString()))

// ----------------------------------------------------------
//  支出 CRUD
// ----------------------------------------------------------
fun insertExpense(n: String?, p: Any, categoryId: Any, tIds: String?, d: String?, pts: Any, cardId: Any): Long {
val db = writableDatabase
val cv = ContentValues().apply {
put("name",        n ?: "")
put("price",       p.toString().toIntOrNull() ?: 0)
put("category_id", categoryId.toString().toIntOrNull() ?: 0)
put("tag_ids",     tIds ?: "")
put("date",        d ?: "")
put("points",      pts.toString().toIntOrNull() ?: 0)
put("card_id",     cardId.toString().toIntOrNull() ?: 0)
}
val newId = db.insert("expenses", null, cv)
if (newId > 0) syncExpenseTags(db, newId.toInt(), tIds)
return newId
}

fun updateExpense(id: Int, n: String?, p: Any, categoryId: Any, tIds: String?, d: String?, pts: Any, cardId: Any, createdAt: String?) {
val db = writableDatabase
val now = localNow(db)
val cv = ContentValues().apply {
put("name",        n ?: "")
put("price",       p.toString().toIntOrNull() ?: 0)
put("category_id", categoryId.toString().toIntOrNull() ?: 0)
put("tag_ids",     tIds ?: "")
put("date",        d ?: "")
put("points",      pts.toString().toIntOrNull() ?: 0)
put("card_id",     cardId.toString().toIntOrNull() ?: 0)
if (!createdAt.isNullOrEmpty()) put("created_at", createdAt)
put("updated_at", now)
}
db.update("expenses", cv, "id=?", arrayOf(id.toString()))
syncExpenseTags(db, id, tIds)
}

/** expense_tags を tag_ids と同期 */
private fun syncExpenseTags(db: SQLiteDatabase, expenseId: Int, tIds: String?) {
db.delete("expense_tags", "expense_id=?", arrayOf(expenseId.toString()))
tIds?.split(",")?.filter { it.isNotBlank() }?.forEach { tid ->
val tagId = tid.trim().toIntOrNull() ?: return@forEach
db.insert("expense_tags", null, ContentValues().apply {
put("expense_id", expenseId)
put("tag_id",     tagId)
})
}
}

// ----------------------------------------------------------
//  通常履歴取得（ページング）
// ----------------------------------------------------------
fun getRecords(offset: Int): String {
val sql = """
SELECT e.*, c.name as cat_name, COALESCE(pc.name, ct.name) as card_name,
CASE WHEN ct.id IS NOT NULL THEN 1 ELSE 0 END as is_cost_tag
FROM expenses e
LEFT JOIN categories  c  ON e.category_id = c.id
LEFT JOIN point_cards pc ON e.card_id = pc.id
LEFT JOIN cost_tags   ct ON e.card_id = ct.id
ORDER BY e.date DESC, e.id DESC
LIMIT 20 OFFSET ?
"""
return buildExpenseList(readableDatabase.rawQuery(sql, arrayOf(offset.toString())))
}

// ----------------------------------------------------------
//  複合検索
// ----------------------------------------------------------
/**
* filterJson の構造:
* {
*   "categoryIds":  [1,2],          // 空配列=全件
*   "tagIds":       [3,5],          // 空配列=全件
*   "memo":         "部分一致文字列", // "" =フィルタなし
*   "cardIds":      [1],            // 空配列=全件
*   "periodPreset": "MONTH",        // MONTH|PREV_MONTH|3M|6M|1Y|ALL
*   "dateFrom":     "2026-01-01",   // periodPreset が CUSTOM の時のみ使用
*   "dateTo":       "2026-03-31",
*   "sorts": [                      // 空=デフォルト(date DESC)
*     {"field":"date",   "order":"DESC"},
*     {"field":"price",  "order":"ASC"}
*   ],
*   "isDeleteHistory": false
* }
*/
fun searchRecords(filterJson: String, offset: Int): String {
val f = JSONObject(filterJson)
val isDelete = f.optBoolean("isDeleteHistory", false)
return if (isDelete) searchDeletedRecords(f, offset) else searchExpenses(f, offset)
}

private fun searchExpenses(f: JSONObject, offset: Int): String {
val args = mutableListOf<String>()
val where = mutableListOf<String>()

// カテゴリ
val catIds = f.optJSONArray("categoryIds")
if (catIds != null && catIds.length() > 0) {
val ph = (0 until catIds.length()).joinToString(",") { "?" }
where.add("e.category_id IN ($ph)")
(0 until catIds.length()).forEach { args.add(catIds.getInt(it).toString()) }
}

// タグ（expense_tags 経由）
val tagIds = f.optJSONArray("tagIds")
if (tagIds != null && tagIds.length() > 0) {
val ph = (0 until tagIds.length()).joinToString(",") { "?" }
where.add("EXISTS (SELECT 1 FROM expense_tags et WHERE et.expense_id=e.id AND et.tag_id IN ($ph))")
(0 until tagIds.length()).forEach { args.add(tagIds.getInt(it).toString()) }
}

// メモ部分一致
val memo = f.optString("memo", "")
if (memo.isNotBlank()) {
where.add("e.name LIKE ?")
args.add("%$memo%")
}

// カード
val cardIds = f.optJSONArray("cardIds")
if (cardIds != null && cardIds.length() > 0) {
val ph = (0 until cardIds.length()).joinToString(",") { "?" }
where.add("e.card_id IN ($ph)")
(0 until cardIds.length()).forEach { args.add(cardIds.getInt(it).toString()) }
}

// 期間
val periodClause = buildPeriodClause(f, "e.date", args)
if (periodClause.isNotEmpty()) where.add(periodClause)

val whereStr = if (where.isEmpty()) "" else "WHERE ${where.joinToString(" AND ")}"
val orderStr = buildOrderClause(f)

val sql = """
SELECT e.*, c.name as cat_name, COALESCE(pc.name, ct.name) as card_name,
CASE WHEN ct.id IS NOT NULL THEN 1 ELSE 0 END as is_cost_tag
FROM expenses e
LEFT JOIN categories  c  ON e.category_id = c.id
LEFT JOIN point_cards pc ON e.card_id = pc.id
LEFT JOIN cost_tags   ct ON e.card_id = ct.id
$whereStr
$orderStr
LIMIT 20 OFFSET ?
"""
args.add(offset.toString())
return buildExpenseList(readableDatabase.rawQuery(sql, args.toTypedArray()))
}

private fun searchDeletedRecords(f: JSONObject, offset: Int): String {
// action_logs の original_data (JSON TEXT) に対してフィルタ
// 簡易実装：全件取得後 JSON パースでフィルタ（削除履歴は通常少ない）
val list = JSONArray()
val cursor = readableDatabase.rawQuery(
"SELECT id, timestamp, original_data FROM action_logs WHERE action_type='DELETE' ORDER BY id DESC",
null
)
val catIds  = f.optJSONArray("categoryIds")?.let { j -> (0 until j.length()).map { j.getInt(it) }.toSet() }
val tagIds  = f.optJSONArray("tagIds")?.let { j -> (0 until j.length()).map { j.getInt(it) }.toSet() }
val cardIds = f.optJSONArray("cardIds")?.let { j -> (0 until j.length()).map { j.getInt(it) }.toSet() }
val memo    = f.optString("memo","")
val (dateFrom, dateTo) = buildPeriodRange(f)

var matched = 0
var skipped = 0
while (cursor.moveToNext()) {
val logId  = cursor.getInt(0)
val ts     = cursor.getString(1)
val dataObj = runCatching { JSONObject(cursor.getString(2)) }.getOrNull() ?: continue

// フィルタ判定
if (catIds != null && catIds.isNotEmpty() && !catIds.contains(dataObj.optInt("category_id"))) continue
if (cardIds != null && cardIds.isNotEmpty() && !cardIds.contains(dataObj.optInt("card_id"))) continue
if (memo.isNotBlank() && !dataObj.optString("name","").contains(memo)) continue
if (tagIds != null && tagIds.isNotEmpty()) {
val expTags = dataObj.optString("tag_ids","").split(",").mapNotNull { it.trim().toIntOrNull() }.toSet()
if (expTags.intersect(tagIds).isEmpty()) continue
}
val expDate = dataObj.optString("date","")
if (dateFrom.isNotEmpty() && expDate < dateFrom) continue
if (dateTo.isNotEmpty() && expDate > dateTo) continue

// ページング
if (skipped < offset) { skipped++; continue }
if (matched >= 20) break

val cardIdVal = dataObj.optInt("card_id")
val pcName = getMasterName("point_cards", cardIdVal)
val ctName = if (pcName.isEmpty() && cardIdVal > 0) getMasterName("cost_tags", cardIdVal) else ""
list.put(JSONObject().apply {
put("id",        logId)
put("timestamp", ts)
put("original",  dataObj)
put("category",  getMasterName("categories",  dataObj.optInt("category_id")))
put("card",      pcName.ifEmpty { ctName })
put("is_cost_tag", if (ctName.isNotEmpty()) 1 else 0)
put("tags",      resolveTagNames(dataObj.optString("tag_ids")))
})
matched++
}
cursor.close()
return list.toString()
}

private fun buildPeriodClause(f: JSONObject, col: String, args: MutableList<String>): String {
val preset = f.optString("periodPreset","ALL")
if (preset == "CUSTOM") {
val from = f.optString("dateFrom","")
val to   = f.optString("dateTo","")
val parts = mutableListOf<String>()
if (from.isNotEmpty()) { parts.add("$col >= ?"); args.add(from) }
if (to.isNotEmpty())   { parts.add("$col <= ?"); args.add(to) }
return parts.joinToString(" AND ")
}
return when (preset) {
"MONTH"      -> "$col >= date('now','start of month','localtime') AND $col <= date('now','localtime')"
"PREV_MONTH" -> "$col >= date('now','start of month','-1 month','localtime') AND $col < date('now','start of month','localtime')"
"3M"         -> "$col >= date('now','-3 months','localtime')"
"6M"         -> "$col >= date('now','-6 months','localtime')"
"1Y"         -> "$col >= date('now','-1 year','localtime')"
else         -> "" // ALL
}
}

private fun buildPeriodRange(f: JSONObject): Pair<String,String> {
val preset = f.optString("periodPreset","ALL")
if (preset == "CUSTOM") return Pair(f.optString("dateFrom",""), f.optString("dateTo",""))
val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault())
.format(java.util.Date())
val cal = java.util.Calendar.getInstance()
return when (preset) {
"MONTH" -> {
cal.set(java.util.Calendar.DAY_OF_MONTH, 1)
val from = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(cal.time)
Pair(from, today)
}
"PREV_MONTH" -> {
cal.add(java.util.Calendar.MONTH, -1)
cal.set(java.util.Calendar.DAY_OF_MONTH, 1)
val from = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(cal.time)
cal.set(java.util.Calendar.DAY_OF_MONTH, cal.getActualMaximum(java.util.Calendar.DAY_OF_MONTH))
val to = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(cal.time)
Pair(from, to)
}
"3M"  -> { cal.add(java.util.Calendar.MONTH, -3);  Pair(java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(cal.time), today) }
"6M"  -> { cal.add(java.util.Calendar.MONTH, -6);  Pair(java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(cal.time), today) }
"1Y"  -> { cal.add(java.util.Calendar.YEAR,  -1);  Pair(java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(cal.time), today) }
else  -> Pair("","") // ALL
}
}

private fun buildOrderClause(f: JSONObject): String {
val sorts = f.optJSONArray("sorts")
if (sorts == null || sorts.length() == 0) return "ORDER BY e.date DESC, e.id DESC"
val allowedFields = mapOf(
"date"    to "e.date",
"created" to "e.created_at",
"price"   to "e.price",
"points"  to "e.points"
)
val parts = (0 until sorts.length()).mapNotNull { i ->
val s     = sorts.getJSONObject(i)
val field = allowedFields[s.optString("field")] ?: return@mapNotNull null
val order = if (s.optString("order","DESC").uppercase() == "ASC") "ASC" else "DESC"
"$field $order"
}
return if (parts.isEmpty()) "ORDER BY e.date DESC, e.id DESC"
else "ORDER BY ${parts.joinToString(", ")}"
}

// ----------------------------------------------------------
//  通常の削除ログ取得（ページング）
// ----------------------------------------------------------
fun getActionLogs(type: String, offset: Int): String {
val list = JSONArray()
val cursor = readableDatabase.rawQuery(
"SELECT id, timestamp, original_data FROM action_logs WHERE action_type=? ORDER BY id DESC LIMIT 20 OFFSET ?",
arrayOf(type, offset.toString())
)
while (cursor.moveToNext()) {
val logId   = cursor.getInt(0)
val ts      = cursor.getString(1)
val dataObj = runCatching { JSONObject(cursor.getString(2)) }.getOrNull() ?: continue
val cardIdVal = dataObj.optInt("card_id")
val pcName = getMasterName("point_cards", cardIdVal)
val ctName = if (pcName.isEmpty() && cardIdVal > 0) getMasterName("cost_tags", cardIdVal) else ""
list.put(JSONObject().apply {
put("id",        logId)
put("timestamp", ts)
put("original",  dataObj)
put("category",  getMasterName("categories",  dataObj.optInt("category_id")))
put("card",      pcName.ifEmpty { ctName })
put("is_cost_tag", if (ctName.isNotEmpty()) 1 else 0)
put("tags",      resolveTagNames(dataObj.optString("tag_ids")))
})
}
cursor.close()
return list.toString()
}

// ----------------------------------------------------------
//  削除・復元
// ----------------------------------------------------------
// ----------------------------------------------------------
//  アカウントリセット（支出・予算・固定費・設定を全削除）
//  マスターデータ（カテゴリ・タグ・カード）は保持
// ----------------------------------------------------------
fun resetAccountData() {
val db = writableDatabase
db.beginTransaction()
try {
db.execSQL("DELETE FROM expenses")
db.execSQL("DELETE FROM expense_tags")
db.execSQL("DELETE FROM action_logs")
db.execSQL("DELETE FROM budget_periods")
db.execSQL("DELETE FROM budget_extras")
db.execSQL("DELETE FROM fixed_cost_history")
db.execSQL("DELETE FROM fixed_costs")
db.execSQL("DELETE FROM settings")
db.setTransactionSuccessful()
} finally {
db.endTransaction()
}
}

fun deleteAndLogExpense(id: Int) {
val db = writableDatabase
val cursor = db.rawQuery("SELECT * FROM expenses WHERE id=?", arrayOf(id.toString()))
if (cursor.moveToFirst()) {
val json = JSONObject()
(0 until cursor.columnCount).forEach { i -> json.put(cursor.getColumnName(i), cursor.getString(i) ?: "") }
db.insert("action_logs", null, ContentValues().apply {
put("action_type",   "DELETE")
put("original_data", json.toString())
})
}
cursor.close()
db.delete("expense_tags", "expense_id=?", arrayOf(id.toString()))
db.delete("expenses", "id=?", arrayOf(id.toString()))
}

fun restoreLogs(logIds: IntArray) {
val db = writableDatabase
db.beginTransaction()
try {
logIds.forEach { logId ->
val cursor = db.rawQuery("SELECT original_data FROM action_logs WHERE id=?", arrayOf(logId.toString()))
if (cursor.moveToFirst()) {
val o = JSONObject(cursor.getString(0))
val newId = db.insert("expenses", null, ContentValues().apply {
put("name",        o.optString("name"))
put("price",       o.optInt("price"))
put("category_id", o.optInt("category_id"))
put("tag_ids",     o.optString("tag_ids"))
put("date",        o.optString("date"))
put("points",      o.optInt("points"))
put("card_id",     o.optInt("card_id"))
put("created_at",  o.optString("created_at"))
put("restored_at", localNow(db))
})
if (newId > 0) syncExpenseTags(db, newId.toInt(), o.optString("tag_ids"))
db.delete("action_logs", "id=?", arrayOf(logId.toString()))
}
cursor.close()
}
db.setTransactionSuccessful()
} finally { db.endTransaction() }
}

// ----------------------------------------------------------
//  集計
// ----------------------------------------------------------
fun getTotal(mode: String): Int {
val query = when (mode) {
"MONTH" -> "SELECT SUM(price) FROM expenses WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime')"
"WEEK"  -> "SELECT SUM(price) FROM expenses WHERE strftime('%Y-%W', date) = strftime('%Y-%W', 'now', 'localtime')"
"YEAR"  -> "SELECT SUM(price) FROM expenses WHERE strftime('%Y', date) = strftime('%Y', 'now', 'localtime')"
else    -> "SELECT SUM(price) FROM expenses"
}
val cursor = readableDatabase.rawQuery(query, null)
val total = if (cursor.moveToFirst()) cursor.getInt(0) else 0
cursor.close()
return total
}

/** 日付範囲指定の支出合計 */
fun getTotalByRange(dateFrom: String, dateTo: String): Int {
val cursor = readableDatabase.rawQuery(
"SELECT COALESCE(SUM(price),0) FROM expenses WHERE date >= ? AND date <= ?",
arrayOf(dateFrom, dateTo)
)
val total = if (cursor.moveToFirst()) cursor.getInt(0) else 0
cursor.close()
return total
}

/** 固定費一覧（is_active=1のみ）JSON配列 */
fun getFixedCostsList(): String {
val cursor = readableDatabase.rawQuery(
"SELECT id, name, amount, category_id FROM fixed_costs WHERE is_active=1 ORDER BY id",
null
)
val result = JSONArray()
while (cursor.moveToNext()) {
result.put(JSONObject().apply {
put("id",         cursor.getInt(0))
put("name",       cursor.getString(1))
put("amount",     cursor.getInt(2))
put("categoryId", cursor.getInt(3))
})
}
cursor.close()
return result.toString()
}

/** 固定費合計（is_active=1のみ）*/
fun getFixedCostsTotal(): Int {
val cursor = readableDatabase.rawQuery(
"SELECT COALESCE(SUM(amount),0) FROM fixed_costs WHERE is_active=1",
null
)
val total = if (cursor.moveToFirst()) cursor.getInt(0) else 0
cursor.close()
return total
}

// ----------------------------------------------------------
//  設定テーブル
// ----------------------------------------------------------
fun getSetting(key: String, default: String = ""): String {
val cursor = readableDatabase.rawQuery("SELECT value FROM settings WHERE key=?", arrayOf(key))
val v = if (cursor.moveToFirst()) cursor.getString(0) else default
cursor.close()
return v
}

fun setSetting(key: String, value: String) {
writableDatabase.insertWithOnConflict("settings",null,
ContentValues().apply { put("key",key); put("value",value) },
SQLiteDatabase.CONFLICT_REPLACE)
}

// ----------------------------------------------------------
//  エクスポート（JSON）
// ----------------------------------------------------------
fun exportAll(accountName: String = ""): String {
val db   = readableDatabase
val root = JSONObject()
root.put("version",      31)
root.put("exported_at",  localNow(writableDatabase))
root.put("account_name", accountName)   // E2: インポート確認用メタ情報

// 各テーブルを全件シリアライズ
listOf("expenses","categories","custom_tags","point_cards","cost_tags","action_logs",
"fixed_costs","fixed_cost_history","budget_periods","budget_extras","settings").forEach { table ->
val arr    = JSONArray()
val cursor = db.rawQuery("SELECT * FROM $table", null)
while (cursor.moveToNext()) {
val obj = JSONObject()
(0 until cursor.columnCount).forEach { i ->
obj.put(cursor.getColumnName(i), cursor.getString(i) ?: JSONObject.NULL)
}
arr.put(obj)
}
cursor.close()
root.put(table, arr)
}

// E2: レコード件数をメタ情報に追加
root.put("record_count", root.optJSONArray("expenses")?.length() ?: 0)

return root.toString(2)
}

/**
* エクスポート JSON をファイルに保存して表示用パスを返す。
* accountName: ファイル名とサブフォルダに使用（例: "家"）
*/
fun exportToFile(accountName: String = ""): String {
return try {
// E1: ファイル名 = kakeibo_<アカウント名>_<日付>.json
val datePart  = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(java.util.Date())
val safeName  = accountName.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "backup" }
val fileName  = "kakeibo_${safeName}_${datePart}.json"
val jsonData  = exportAll(accountName)

// E3: Download/KakeiboBackup/<アカウント名>/ に保存
val subFolder = "KakeiboBackup/$safeName"
val values = android.content.ContentValues().apply {
put(android.provider.MediaStore.Downloads.DISPLAY_NAME, fileName)
put(android.provider.MediaStore.Downloads.MIME_TYPE,    "application/json")
put(android.provider.MediaStore.Downloads.RELATIVE_PATH, "Download/$subFolder")
put(android.provider.MediaStore.Downloads.IS_PENDING,   1)
}
val uri = context.contentResolver.insert(
android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
) ?: return "ERROR: MediaStore URI の取得に失敗しました"

context.contentResolver.openOutputStream(uri)?.use { out ->
out.write(jsonData.toByteArray(Charsets.UTF_8))
}

values.clear()
values.put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
context.contentResolver.update(uri, values, null, null)

"Downloads/$subFolder/$fileName"
} catch (e: Exception) {
"ERROR: ${e.message}"
}
}

// ----------------------------------------------------------
//  インポート（JSON）
// ----------------------------------------------------------
/**
* バックアップ JSON を渡して全データを復元。
* 既存データは上書き前に自動バックアップ。
* 戻り値: "" = 成功 / エラーメッセージ = 失敗
*/
fun importAll(jsonStr: String, accountName: String = ""): String {
return try {
val root = JSONObject(jsonStr)
val db   = writableDatabase

// インポート前に現在のデータをDownloadsに自動バックアップ
// フォルダ: KakeiboBackup/インポート前バックアップ/
// ファイル名: kakeibo_<アカウント名>_<日付>.json（通常エクスポートと同じ命名）
try {
val datePart = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(java.util.Date())
val safeName = accountName.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "backup" }
val fileName = "kakeibo_${safeName}_${datePart}.json"
val jsonData = exportAll(accountName)

val subFolder = "KakeiboBackup/インポート前バックアップ"
val values = android.content.ContentValues().apply {
put(android.provider.MediaStore.Downloads.DISPLAY_NAME, fileName)
put(android.provider.MediaStore.Downloads.MIME_TYPE,    "application/json")
put(android.provider.MediaStore.Downloads.RELATIVE_PATH, "Download/$subFolder")
put(android.provider.MediaStore.Downloads.IS_PENDING,   1)
}
val uri = context.contentResolver.insert(
android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
)
if (uri != null) {
context.contentResolver.openOutputStream(uri)?.use { out ->
out.write(jsonData.toByteArray(Charsets.UTF_8))
}
values.clear()
values.put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
context.contentResolver.update(uri, values, null, null)
}
} catch (_: Exception) {}

db.beginTransaction()
try {
// ★ 完全置換: 全テーブルをクリーンにしてからバックアップを復元
db.execSQL("DELETE FROM expense_tags")
db.execSQL("DELETE FROM expenses")
db.execSQL("DELETE FROM action_logs")
db.execSQL("DELETE FROM budget_periods")
db.execSQL("DELETE FROM budget_extras")
db.execSQL("DELETE FROM fixed_cost_history")
db.execSQL("DELETE FROM fixed_costs")
if (root.has("settings")) {
db.execSQL("DELETE FROM settings")
}
// AUTOINCREMENT のカウンタをリセット
db.execSQL("DELETE FROM sqlite_sequence WHERE name IN ('expenses','action_logs','expense_tags','budget_extras','fixed_cost_history','fixed_costs')")

// マスターテーブル（バックアップに配列が存在すれば置換、空の旧データは既存保持）
listOf("categories","custom_tags","point_cards","cost_tags").forEach { table ->
root.optJSONArray(table)?.let { arr ->
if (table == "cost_tags" || arr.length() > 0) {
db.execSQL("DELETE FROM $table")
db.execSQL("DELETE FROM sqlite_sequence WHERE name = ?", arrayOf(table))
}
for (i in 0 until arr.length()) {
val o = arr.getJSONObject(i)
// id が文字列でも数値でも安全に取得
val id = o.opt("id").toString().toIntOrNull() ?: continue
db.insertWithOnConflict(table, null,
ContentValues().apply {
put("id",   id)
put("name", o.optString("name"))
}, SQLiteDatabase.CONFLICT_REPLACE)
}
}
}

// cost_tags の採番開始位置が 10001〜（seq >= 9999）になるよう保証
val ctSeqCur = db.rawQuery("SELECT COALESCE(MAX(id), 9999) FROM cost_tags", null)
val maxCtId = if (ctSeqCur.moveToFirst()) maxOf(9999, ctSeqCur.getInt(0)) else 9999
ctSeqCur.close()
db.execSQL("DELETE FROM sqlite_sequence WHERE name = 'cost_tags'")
db.execSQL("INSERT INTO sqlite_sequence (name, seq) VALUES ('cost_tags', ?)", arrayOf(maxCtId.toString()))

// 支出テーブル（全削除済みなので INSERT のみ）
root.optJSONArray("expenses")?.let { arr ->
for (i in 0 until arr.length()) {
val o  = arr.getJSONObject(i)
val id = o.opt("id").toString().toIntOrNull() ?: continue
// "null" 文字列を空文字に正規化
fun s(key: String) = o.optString(key).let { if (it == "null") "" else it }
fun n(key: String) = o.opt(key).toString().toIntOrNull() ?: 0
db.insert("expenses", null, ContentValues().apply {
put("id",          id)
put("name",        s("name"))
put("price",       n("price"))
put("category_id", n("category_id"))
put("tag_ids",     s("tag_ids"))
put("date",        s("date"))
put("points",      n("points"))
put("card_id",     n("card_id"))
put("created_at",  s("created_at"))
put("updated_at",  s("updated_at"))
val ra = s("restored_at")
if (ra.isNotEmpty()) put("restored_at", ra)
})
syncExpenseTags(db, id, s("tag_ids"))
}
}

// action_logs
root.optJSONArray("action_logs")?.let { arr ->
for (i in 0 until arr.length()) {
val o  = arr.getJSONObject(i)
val id = o.opt("id").toString().toIntOrNull() ?: continue
db.insert("action_logs", null, ContentValues().apply {
put("id",            id)
put("action_type",   o.optString("action_type"))
put("timestamp",     o.optString("timestamp"))
put("original_data", o.optString("original_data"))
})
}
}

// budget_periods
root.optJSONArray("budget_periods")?.let { arr ->
for (i in 0 until arr.length()) {
val o = arr.getJSONObject(i)
fun s(k: String) = o.optString(k).let { if (it == "null") "" else it }
val pf = s("period_from")
if (pf.isEmpty()) continue
db.insertWithOnConflict("budget_periods", null,
ContentValues().apply {
put("period_from", pf)
put("period_to",   s("period_to"))
put("amount",      o.opt("amount").toString().toIntOrNull() ?: 0)
put("created_at",  s("created_at"))
}, SQLiteDatabase.CONFLICT_REPLACE)
}
}

// budget_extras
root.optJSONArray("budget_extras")?.let { arr ->
for (i in 0 until arr.length()) {
val o = arr.getJSONObject(i)
fun s(k: String) = o.optString(k).let { if (it == "null") "" else it }
val id = o.opt("id").toString().toIntOrNull() ?: continue
db.insert("budget_extras", null, ContentValues().apply {
put("id",          id)
put("period_from", s("period_from"))
put("name",        s("name"))
put("amount",      o.opt("amount").toString().toIntOrNull() ?: 0)
put("created_at",  s("created_at"))
})
}
}

// fixed_costs（旧バージョン互換およびエクスポートデータ完全復元）
root.optJSONArray("fixed_costs")?.let { arr ->
for (i in 0 until arr.length()) {
val o = arr.getJSONObject(i)
fun s(k: String) = o.optString(k).let { if (it == "null") "" else it }
val id = o.opt("id").toString().toIntOrNull() ?: continue
db.insert("fixed_costs", null, ContentValues().apply {
put("id",          id)
put("name",        s("name"))
put("amount",      o.opt("amount").toString().toIntOrNull() ?: 0)
put("category_id", o.opt("category_id").toString().toIntOrNull() ?: 0)
put("is_active",   o.opt("is_active").toString().toIntOrNull() ?: 1)
put("created_at",  s("created_at"))
})
}
}

// fixed_cost_history
val fchArr = root.optJSONArray("fixed_cost_history")
if (fchArr != null) {
for (i in 0 until fchArr.length()) {
val o = fchArr.getJSONObject(i)
fun s(k: String) = o.optString(k).let { if (it == "null") "" else it }
val id = o.opt("id").toString().toIntOrNull() ?: continue
val vt = s("valid_to").ifBlank { null }
db.insert("fixed_cost_history", null, ContentValues().apply {
put("id",          id)
put("name",        s("name"))
put("amount",      o.opt("amount").toString().toIntOrNull() ?: 0)
put("category_id", o.opt("category_id").toString().toIntOrNull() ?: 0)
put("valid_from",  s("valid_from"))
put("valid_to",    vt)
put("created_at",  s("created_at"))
})
}
} else {
// v31以前のバックアップ互換: fixed_costs (is_active=1) を fixed_cost_history に移行
val fcCur = db.rawQuery("SELECT name, amount, category_id FROM fixed_costs WHERE is_active=1", null)
while (fcCur.moveToNext()) {
db.insert("fixed_cost_history", null, ContentValues().apply {
put("name",        fcCur.getString(0))
put("amount",      fcCur.getInt(1))
put("category_id", fcCur.getInt(2))
put("valid_from",  "2000-01-01")
put("valid_to",    null as String?)
})
}
fcCur.close()
}

// settings
root.optJSONArray("settings")?.let { arr ->
for (i in 0 until arr.length()) {
val o = arr.getJSONObject(i)
val k = o.optString("key")
if (k.isNotEmpty()) {
db.insertWithOnConflict("settings", null,
ContentValues().apply { put("key", k); put("value", o.optString("value")) },
SQLiteDatabase.CONFLICT_REPLACE)
}
}
}

db.setTransactionSuccessful()
} finally { db.endTransaction() }
""
} catch (e: Exception) {
"IMPORT_ERROR: ${e.message}"
}
}

// ----------------------------------------------------------
//  内部ユーティリティ
// ----------------------------------------------------------
private fun buildExpenseList(cursor: android.database.Cursor): String {
val list = JSONArray()
while (cursor.moveToNext()) {
val obj = JSONObject()
(0 until cursor.columnCount).forEach { i ->
obj.put(cursor.getColumnName(i), cursor.getString(i) ?: "")
}
obj.put("category", cursor.getString(cursor.getColumnIndexOrThrow("cat_name")) ?: "未分類")
obj.put("card",     cursor.getString(cursor.getColumnIndexOrThrow("card_name")) ?: "")
obj.put("tags",     resolveTagNames(cursor.getString(cursor.getColumnIndexOrThrow("tag_ids"))))
list.put(obj)
}
cursor.close()
return list.toString()
}

// ----------------------------------------------------------
//  分析用集計
// ----------------------------------------------------------

/** 直近 N ヶ月の月別支出合計＋カテゴリ内訳 */
/** 直近N月の月別支出集計（filterJson対応） */
fun getMonthlyStats(months: Int, filterJson: String = "{}"): String {
val f      = JSONObject(filterJson)
val catIds = f.optJSONArray("categoryIds")
val tagIds = f.optJSONArray("tagIds")
val memo   = f.optString("memo", "")
val excludeCost = f.optBoolean("excludeCostTags", false)
val onlyCost    = f.optBoolean("onlyCostTags", false)

val extraArgs  = mutableListOf<String>()
val extraWhere = mutableListOf<String>()
if (catIds != null && catIds.length() > 0) {
val ph = (0 until catIds.length()).joinToString(",") { "?" }
extraWhere.add("e.category_id IN ($ph)")
(0 until catIds.length()).forEach { extraArgs.add(catIds.getInt(it).toString()) }
}
if (tagIds != null && tagIds.length() > 0) {
val ph = (0 until tagIds.length()).joinToString(",") { "?" }
extraWhere.add("EXISTS (SELECT 1 FROM expense_tags et WHERE et.expense_id=e.id AND et.tag_id IN ($ph))")
(0 until tagIds.length()).forEach { extraArgs.add(tagIds.getInt(it).toString()) }
}
if (memo.isNotBlank()) {
extraWhere.add("e.name LIKE ?")
extraArgs.add("%$memo%")
}
if (excludeCost) {
extraWhere.add("e.card_id NOT IN (SELECT id FROM cost_tags)")
} else if (onlyCost) {
extraWhere.add("e.card_id IN (SELECT id FROM cost_tags)")
}
val extraWhereStr = if (extraWhere.isEmpty()) "" else "AND ${extraWhere.joinToString(" AND ")}"

val result = JSONArray()
val db = readableDatabase
val cal = java.util.Calendar.getInstance()
for (i in 0 until months) {
val year  = cal.get(java.util.Calendar.YEAR)
val month = cal.get(java.util.Calendar.MONTH) + 1
val ym    = "%04d-%02d".format(year, month)

val totArgs = mutableListOf(ym) + extraArgs
val totCur = db.rawQuery(
"SELECT COALESCE(SUM(e.price),0) FROM expenses e WHERE strftime('%Y-%m', e.date)=? $extraWhereStr",
totArgs.toTypedArray()
)
val total = if (totCur.moveToFirst()) totCur.getInt(0) else 0
totCur.close()

// breakdown（タグ絞り込み時も同じ条件で集計）
val brkArgs = mutableListOf(ym) + extraArgs
val brkCur = db.rawQuery("""
SELECT c.id, c.name, COALESCE(SUM(e.price),0) as amt
FROM expenses e
LEFT JOIN categories c ON e.category_id = c.id
WHERE strftime('%Y-%m', e.date) = ? $extraWhereStr
GROUP BY e.category_id ORDER BY amt DESC
""", brkArgs.toTypedArray())
val breakdown = JSONArray()
while (brkCur.moveToNext()) {
breakdown.put(JSONObject().apply {
put("catId",   brkCur.getInt(0))
put("catName", brkCur.getString(1) ?: "未分類")
put("amount",  brkCur.getInt(2))
})
}
brkCur.close()

result.put(JSONObject().apply {
put("month",     ym)
put("total",     total)
put("breakdown", breakdown)
})
cal.add(java.util.Calendar.MONTH, -1)
}
return result.toString()
}

/** 指定日付範囲内の月別支出集計（filterJson対応） */
fun getMonthlyStatsByRange(dateFrom: String, dateTo: String, filterJson: String = "{}"): String {
val f      = JSONObject(filterJson)
val catIds = f.optJSONArray("categoryIds")
val tagIds = f.optJSONArray("tagIds")
val memo   = f.optString("memo", "")
val excludeCost = f.optBoolean("excludeCostTags", false)
val onlyCost    = f.optBoolean("onlyCostTags", false)

val extraArgs  = mutableListOf<String>()
val extraWhere = mutableListOf<String>()
if (catIds != null && catIds.length() > 0) {
val ph = (0 until catIds.length()).joinToString(",") { "?" }
extraWhere.add("e.category_id IN ($ph)")
(0 until catIds.length()).forEach { extraArgs.add(catIds.getInt(it).toString()) }
}
if (tagIds != null && tagIds.length() > 0) {
val ph = (0 until tagIds.length()).joinToString(",") { "?" }
extraWhere.add("EXISTS (SELECT 1 FROM expense_tags et WHERE et.expense_id=e.id AND et.tag_id IN ($ph))")
(0 until tagIds.length()).forEach { extraArgs.add(tagIds.getInt(it).toString()) }
}
if (memo.isNotBlank()) {
extraWhere.add("e.name LIKE ?")
extraArgs.add("%$memo%")
}
if (excludeCost) {
extraWhere.add("e.card_id NOT IN (SELECT id FROM cost_tags)")
} else if (onlyCost) {
extraWhere.add("e.card_id IN (SELECT id FROM cost_tags)")
}
val extraWhereStr = if (extraWhere.isEmpty()) "" else "AND ${extraWhere.joinToString(" AND ")}"

val result  = JSONArray()
val db      = readableDatabase
val sdf     = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault())
val parsedFrom = runCatching { sdf.parse(dateFrom) }.getOrNull() ?: return "[]"
val parsedTo   = runCatching { sdf.parse(dateTo) }.getOrNull()   ?: return "[]"
val calFrom = java.util.Calendar.getInstance().also { it.time = parsedFrom }
val calTo   = java.util.Calendar.getInstance().also { it.time = parsedTo }
calFrom.set(java.util.Calendar.DAY_OF_MONTH, 1)
calTo.set(java.util.Calendar.DAY_OF_MONTH, 1)

val months = mutableListOf<String>()
val cur = java.util.Calendar.getInstance().also { it.time = calFrom.time }
while (!cur.after(calTo)) {
months.add("%04d-%02d".format(cur.get(java.util.Calendar.YEAR), cur.get(java.util.Calendar.MONTH) + 1))
cur.add(java.util.Calendar.MONTH, 1)
}

for (ym in months) {
val monthFrom = maxOf("$ym-01", dateFrom)
val monthTo   = minOf("$ym-31", dateTo)

val totArgs = mutableListOf(monthFrom, monthTo) + extraArgs
val totCur = db.rawQuery(
"SELECT COALESCE(SUM(e.price),0) FROM expenses e WHERE e.date >= ? AND e.date <= ? $extraWhereStr",
totArgs.toTypedArray()
)
val total = if (totCur.moveToFirst()) totCur.getInt(0) else 0
totCur.close()

val brkArgs = mutableListOf(monthFrom, monthTo) + extraArgs
val brkCur = db.rawQuery("""
SELECT c.id, c.name, COALESCE(SUM(e.price),0) as amt
FROM expenses e
LEFT JOIN categories c ON e.category_id = c.id
WHERE e.date >= ? AND e.date <= ? $extraWhereStr
GROUP BY e.category_id ORDER BY amt DESC
""", brkArgs.toTypedArray())
val breakdown = JSONArray()
while (brkCur.moveToNext()) {
breakdown.put(JSONObject().apply {
put("catId",   brkCur.getInt(0))
put("catName", brkCur.getString(1) ?: "未分類")
put("amount",  brkCur.getInt(2))
})
}
brkCur.close()

result.put(JSONObject().apply {
put("month",     ym)
put("total",     total)
put("breakdown", breakdown)
})
}
return result.toString()
}

/** 設定を全件JSON取得（アカウント切替時のUI再描画用） */
fun getAllSettings(): String {
val obj = JSONObject()
val cursor = readableDatabase.rawQuery("SELECT key, value FROM settings", null)
while (cursor.moveToNext()) obj.put(cursor.getString(0), cursor.getString(1))
cursor.close()
return obj.toString()
}

/** カテゴリ別集計（期間指定）*/
/** 日別支出集計（日ごとの合計。最大366日）*/
fun getDailyStats(dateFrom: String, dateTo: String, filterJson: String = "{}"): String {
val f = JSONObject(filterJson)
val catIds = f.optJSONArray("categoryIds")
val tagIds = f.optJSONArray("tagIds")
val memo   = f.optString("memo", "")
val excludeCost = f.optBoolean("excludeCostTags", false)
val onlyCost    = f.optBoolean("onlyCostTags", false)

val extraArgs  = mutableListOf<String>()
val extraWhere = mutableListOf<String>()
if (catIds != null && catIds.length() > 0) {
val ph = (0 until catIds.length()).joinToString(",") { "?" }
extraWhere.add("e.category_id IN ($ph)")
(0 until catIds.length()).forEach { extraArgs.add(catIds.getInt(it).toString()) }
}
if (tagIds != null && tagIds.length() > 0) {
val ph = (0 until tagIds.length()).joinToString(",") { "?" }
extraWhere.add("EXISTS (SELECT 1 FROM expense_tags et WHERE et.expense_id=e.id AND et.tag_id IN ($ph))")
(0 until tagIds.length()).forEach { extraArgs.add(tagIds.getInt(it).toString()) }
}
if (memo.isNotBlank()) {
extraWhere.add("e.name LIKE ?")
extraArgs.add("%$memo%")
}
if (excludeCost) {
extraWhere.add("e.card_id NOT IN (SELECT id FROM cost_tags)")
} else if (onlyCost) {
extraWhere.add("e.card_id IN (SELECT id FROM cost_tags)")
}
val extraWhereStr = if (extraWhere.isEmpty()) "" else "AND ${extraWhere.joinToString(" AND ")}"

val sdf   = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault())
val from  = runCatching { sdf.parse(dateFrom) }.getOrNull() ?: return "[]"
val to    = runCatching { sdf.parse(dateTo) }.getOrNull()   ?: return "[]"
val db    = readableDatabase
val result= JSONArray()
val cal   = java.util.Calendar.getInstance().also { it.time = from }
val calTo = java.util.Calendar.getInstance().also { it.time = to }
var count = 0
while (!cal.after(calTo) && count < 366) {
val dateStr = sdf.format(cal.time)
val qArgs   = mutableListOf(dateStr) + extraArgs
val cur = db.rawQuery(
"SELECT COALESCE(SUM(e.price),0) FROM expenses e WHERE e.date=? $extraWhereStr",
qArgs.toTypedArray()
)
val total = if (cur.moveToFirst()) cur.getInt(0) else 0
cur.close()
result.put(JSONObject().apply { put("date", dateStr); put("total", total) })
cal.add(java.util.Calendar.DAY_OF_MONTH, 1)
count++
}
return result.toString()
}

/** カテゴリ別集計（期間・タグ・カテゴリ指定）*/
fun getCategoryStats(filterJson: String): String {
val f = JSONObject(filterJson)
val dateFrom = f.optString("dateFrom", "")
val dateTo   = f.optString("dateTo",   "")
val tagIds   = f.optJSONArray("tagIds")
val catIds   = f.optJSONArray("categoryIds")
val memo     = f.optString("memo", "")
val excludeCost = f.optBoolean("excludeCostTags", false)
val onlyCost    = f.optBoolean("onlyCostTags", false)

val args  = mutableListOf<String>()
val where = mutableListOf<String>()
if (dateFrom.isNotEmpty()) { where.add("e.date >= ?"); args.add(dateFrom) }
if (dateTo.isNotEmpty())   { where.add("e.date <= ?"); args.add(dateTo)   }
if (tagIds != null && tagIds.length() > 0) {
val ph = (0 until tagIds.length()).joinToString(",") { "?" }
where.add("EXISTS (SELECT 1 FROM expense_tags et WHERE et.expense_id=e.id AND et.tag_id IN ($ph))")
(0 until tagIds.length()).forEach { args.add(tagIds.getInt(it).toString()) }
}
if (catIds != null && catIds.length() > 0) {
val ph = (0 until catIds.length()).joinToString(",") { "?" }
where.add("e.category_id IN ($ph)")
(0 until catIds.length()).forEach { args.add(catIds.getInt(it).toString()) }
}
if (memo.isNotBlank()) {
where.add("e.name LIKE ?")
args.add("%$memo%")
}
if (excludeCost) {
where.add("e.card_id NOT IN (SELECT id FROM cost_tags)")
} else if (onlyCost) {
where.add("e.card_id IN (SELECT id FROM cost_tags)")
}
val whereStr = if (where.isEmpty()) "" else "WHERE ${where.joinToString(" AND ")}"

val cursor = readableDatabase.rawQuery("""
SELECT c.id, c.name, COALESCE(SUM(e.price),0) as amt, COUNT(e.id) as cnt
FROM expenses e
LEFT JOIN categories c ON e.category_id = c.id
$whereStr
GROUP BY e.category_id ORDER BY amt DESC
""", args.toTypedArray())

val result = JSONArray()
while (cursor.moveToNext()) {
result.put(JSONObject().apply {
put("catId",   cursor.getInt(0))
put("catName", cursor.getString(1) ?: "未分類")
put("amount",  cursor.getInt(2))
put("count",   cursor.getInt(3))
})
}
cursor.close()
return result.toString()
}

/** カード別ポイント集計（カテゴリ内訳付き）*/
fun getCardPointStats(filterJson: String): String {
val f = JSONObject(filterJson)
val dateFrom = f.optString("dateFrom", "")
val dateTo   = f.optString("dateTo",   "")
val catIds   = f.optJSONArray("categoryIds")
val tagIds   = f.optJSONArray("tagIds")
val memo     = f.optString("memo", "")

val args  = mutableListOf<String>()
val where = mutableListOf<String>(
"e.card_id > 0",
"e.card_id < 10000",
"e.card_id NOT IN (SELECT id FROM cost_tags)"
)
if (dateFrom.isNotEmpty()) { where.add("e.date >= ?"); args.add(dateFrom) }
if (dateTo.isNotEmpty())   { where.add("e.date <= ?"); args.add(dateTo)   }
if (catIds != null && catIds.length() > 0) {
val ph = (0 until catIds.length()).joinToString(",") { "?" }
where.add("e.category_id IN ($ph)")
(0 until catIds.length()).forEach { args.add(catIds.getInt(it).toString()) }
}
if (tagIds != null && tagIds.length() > 0) {
val ph = (0 until tagIds.length()).joinToString(",") { "?" }
where.add("EXISTS (SELECT 1 FROM expense_tags et WHERE et.expense_id=e.id AND et.tag_id IN ($ph))")
(0 until tagIds.length()).forEach { args.add(tagIds.getInt(it).toString()) }
}
if (memo.isNotBlank()) {
where.add("e.name LIKE ?")
args.add("%$memo%")
}
val whereStr = "WHERE ${where.joinToString(" AND ")}"

// カード × カテゴリ の一括クエリ
val cursor = readableDatabase.rawQuery("""
SELECT pc.id   AS card_id,   pc.name AS card_name,
c.id    AS cat_id,    c.name  AS cat_name,
COALESCE(SUM(e.points),0) AS pts,
COALESCE(SUM(e.price),0)  AS price,
COUNT(e.id) AS cnt
FROM expenses e
LEFT JOIN point_cards pc ON e.card_id  = pc.id
LEFT JOIN categories  c  ON e.category_id = c.id
$whereStr
GROUP BY e.card_id, e.category_id
ORDER BY card_id, pts DESC
""", args.toTypedArray())

// カードごとに集計
val cardMap = LinkedHashMap<Int, JSONObject>()
while (cursor.moveToNext()) {
val cardId   = cursor.getInt(0)
val cardName = cursor.getString(1) ?: "不明"
val catName  = cursor.getString(3) ?: "未分類"
val pts      = cursor.getInt(4)
val price    = cursor.getInt(5)
val cnt      = cursor.getInt(6)

val card = cardMap.getOrPut(cardId) {
JSONObject().apply {
put("cardId",     cardId)
put("cardName",   cardName)
put("totalPts",   0)
put("totalPrice", 0)
put("count",      0)
put("breakdown",  JSONArray())
}
}
card.put("totalPts",   card.getInt("totalPts")   + pts)
card.put("totalPrice", card.getInt("totalPrice") + price)
card.put("count",      card.getInt("count")      + cnt)
card.getJSONArray("breakdown").put(JSONObject().apply {
put("catName", catName)
put("pts",     pts)
put("price",   price)
})
}
cursor.close()

val result = JSONArray()
cardMap.values.sortedByDescending { it.getInt("totalPts") }.forEach { result.put(it) }
return result.toString()
}

private fun resolveTagNames(ids: String?): String {
if (ids.isNullOrEmpty()) return ""
val idList = ids.split(",").filter { it.isNotBlank() }
if (idList.isEmpty()) return ""
val ph     = idList.joinToString(",") { "?" }
val cursor = readableDatabase.rawQuery("SELECT name FROM custom_tags WHERE id IN ($ph)", idList.toTypedArray())
val names  = mutableListOf<String>()
while (cursor.moveToNext()) names.add(cursor.getString(0))
cursor.close()
return names.joinToString(",")
}

private fun getMasterName(table: String, id: Int): String {
val cursor = readableDatabase.rawQuery("SELECT name FROM $table WHERE id=?", arrayOf(id.toString()))
val name   = if (cursor.moveToFirst()) cursor.getString(0) else ""
cursor.close()
return name
}

private fun localNow(db: SQLiteDatabase): String {
val cursor = db.rawQuery("SELECT datetime('now','localtime')", null)
val v = if (cursor.moveToFirst()) cursor.getString(0) else ""
cursor.close()
return v
}

/** 最古の支出日付（YYYY-MM-DD）を1クエリで返す（未登録時は ""） */
fun getEarliestExpenseDate(): String {
val cursor = readableDatabase.rawQuery("SELECT MIN(date) FROM expenses WHERE date IS NOT NULL AND date != ''", null)
val d = if (cursor.moveToFirst()) (cursor.getString(0) ?: "") else ""
cursor.close()
return d
}

// ----------------------------------------------------------
//  経費タグ集計（売上管理モード用: cost_tags マスターを参照）
// ----------------------------------------------------------
fun getCostTagStats(filterJson: String): String {
val f = JSONObject(filterJson)
val dateFrom = f.optString("dateFrom", "")
val dateTo   = f.optString("dateTo",   "")
val catIds   = f.optJSONArray("categoryIds")
val tagIds   = f.optJSONArray("tagIds")
val memo     = f.optString("memo", "")

val args  = mutableListOf<String>()
val where = mutableListOf<String>("e.card_id > 0")
if (dateFrom.isNotEmpty()) { where.add("e.date >= ?"); args.add(dateFrom) }
if (dateTo.isNotEmpty())   { where.add("e.date <= ?"); args.add(dateTo)   }
if (catIds != null && catIds.length() > 0) {
val ph = (0 until catIds.length()).joinToString(",") { "?" }
where.add("e.category_id IN ($ph)")
(0 until catIds.length()).forEach { args.add(catIds.getInt(it).toString()) }
}
if (tagIds != null && tagIds.length() > 0) {
val ph = (0 until tagIds.length()).joinToString(",") { "?" }
where.add("EXISTS (SELECT 1 FROM expense_tags et WHERE et.expense_id=e.id AND et.tag_id IN ($ph))")
(0 until tagIds.length()).forEach { args.add(tagIds.getInt(it).toString()) }
}
if (memo.isNotBlank()) { where.add("e.name LIKE ?"); args.add("%$memo%") }

// cost_tags に存在する card_id のみ対象
where.add("e.card_id IN (SELECT id FROM cost_tags)")
val whereStr = "WHERE ${where.joinToString(" AND ")}"

val cursor = readableDatabase.rawQuery("""
SELECT ct.id   AS card_id,   ct.name AS card_name,
c.id    AS cat_id,    c.name  AS cat_name,
COALESCE(SUM(e.points),0) AS pts,
COALESCE(SUM(e.price),0)  AS price,
COUNT(e.id) AS cnt
FROM expenses e
LEFT JOIN cost_tags  ct ON e.card_id      = ct.id
LEFT JOIN categories c  ON e.category_id  = c.id
$whereStr
GROUP BY e.card_id, e.category_id
ORDER BY card_id, price DESC
""", args.toTypedArray())

val cardMap = LinkedHashMap<Int, JSONObject>()
while (cursor.moveToNext()) {
val cardId   = cursor.getInt(0)
val cardName = cursor.getString(1) ?: "不明"
val catName  = cursor.getString(3) ?: "未分類"
val pts      = cursor.getInt(4)
val price    = cursor.getInt(5)
val cnt      = cursor.getInt(6)

val card = cardMap.getOrPut(cardId) {
JSONObject().apply {
put("cardId",     cardId)
put("cardName",   cardName)
put("totalPts",   0)
put("totalPrice", 0)
put("count",      0)
put("breakdown",  JSONArray())
}
}
card.put("totalPts",   card.getInt("totalPts")   + pts)
card.put("totalPrice", card.getInt("totalPrice") + price)
card.put("count",      card.getInt("count")      + cnt)
card.getJSONArray("breakdown").put(JSONObject().apply {
put("catName", catName)
put("pts",     pts)
put("price",   price)
})
}
cursor.close()

val result = JSONArray()
cardMap.values.sortedByDescending { it.getInt("totalPrice") }.forEach { result.put(it) }
return result.toString()
}
}