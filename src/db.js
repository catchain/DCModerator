import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { logger } from './utils/logger.js';

let db;

export function initDb() {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id    INTEGER NOT NULL,
      user_id    INTEGER NOT NULL,
      username   TEXT,
      first_name TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON messages (chat_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages (chat_id, user_id);

    CREATE TABLE IF NOT EXISTS warns (
      chat_id    INTEGER NOT NULL,
      user_id    INTEGER NOT NULL,
      count      INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (chat_id, user_id)
    );
  `);

  logger.info(`БД инициализирована: ${config.dbPath}`);
  return db;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Записывает засчитанное сообщение пользователя.
 */
export function recordMessage({ chatId, userId, username, firstName }) {
  db.prepare(
    `INSERT INTO messages (chat_id, user_id, username, first_name, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(chatId, userId, username || null, firstName || null, nowSec());
}

/**
 * Сколько всего засчитанных сообщений у пользователя (для определения "новичка").
 */
export function getUserMessageCount(chatId, userId) {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM messages WHERE chat_id = ? AND user_id = ?`)
    .get(chatId, userId);
  return row?.c ?? 0;
}

/**
 * Топ-N пользователей по числу сообщений за последние periodSec секунд.
 */
export function getTop(chatId, periodSec, limit = 10) {
  const since = nowSec() - periodSec;
  return db
    .prepare(
      `SELECT user_id,
              COUNT(*) AS cnt,
              MAX(username) AS username,
              MAX(first_name) AS first_name
       FROM messages
       WHERE chat_id = ? AND created_at >= ?
       GROUP BY user_id
       ORDER BY cnt DESC
       LIMIT ?`,
    )
    .all(chatId, since, limit);
}

/**
 * Увеличивает счётчик варнов и возвращает новое значение.
 */
export function addWarn(chatId, userId) {
  const ts = nowSec();
  db.prepare(
    `INSERT INTO warns (chat_id, user_id, count, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(chat_id, user_id)
     DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
  ).run(chatId, userId, ts);
  return getWarnCount(chatId, userId);
}

export function getWarnCount(chatId, userId) {
  const row = db
    .prepare(`SELECT count FROM warns WHERE chat_id = ? AND user_id = ?`)
    .get(chatId, userId);
  return row?.count ?? 0;
}

export function resetWarns(chatId, userId) {
  db.prepare(`DELETE FROM warns WHERE chat_id = ? AND user_id = ?`).run(chatId, userId);
}
