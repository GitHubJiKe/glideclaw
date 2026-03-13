import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ChatMessage, ChatRole } from "../types/chat";
import { estimateTokensFromText } from "../utils/tokens";

export type MemoryOptions = {
  dbPath?: string;
};

export type SaveMessageOptions = {
  tokens?: number;
  /**
   * SQLite 可解析的时间字符串（例如: "2026-03-01 12:00:00" 或 ISO 字符串）
   * 主要用于测试或导入历史。
   */
  timestamp?: string;
};

export class MemoryStore {
  private db: Database;
  readonly dbPath: string;

  constructor(options: MemoryOptions = {}) {
    const dbPath = resolve(options.dbPath ?? "db/glideclaw.sqlite");
    mkdirSync(dirname(dbPath), { recursive: true });

    this.dbPath = dbPath;
    this.db = new Database(dbPath);

    this.init();
  }

  private init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tokens INTEGER,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);`);
  }

  cleanupOldMessages(windowDays: number) {
    this.db
      .query(
        `DELETE FROM messages WHERE timestamp < datetime('now', '-' || ? || ' days')`,
      )
      .run(windowDays);
  }

  saveMessage(role: ChatRole, content: string, options: SaveMessageOptions = {}) {
    const t = options.tokens ?? estimateTokensFromText(content);
    if (options.timestamp) {
      this.db
        .query(
          `INSERT INTO messages (role, content, tokens, timestamp) VALUES (?, ?, ?, ?)`,
        )
        .run(role, content, t, options.timestamp);
      return;
    }
    this.db.query(`INSERT INTO messages (role, content, tokens) VALUES (?, ?, ?)`).run(
      role,
      content,
      t,
    );
  }

  getContext(limitDays: number): ChatMessage[] {
    this.cleanupOldMessages(limitDays);
    const rows = this.db
      .query(
        `SELECT role, content
         FROM messages
         WHERE timestamp >= datetime('now', '-' || ? || ' days')
         ORDER BY timestamp ASC, id ASC`,
      )
      .all(limitDays) as Array<{ role: string; content: string }>;

    return rows.map((r) => ({
      role: (r.role as ChatRole) ?? "user",
      content: r.content ?? "",
    }));
  }

  getHistory(): ChatMessage[] {
    const rows = this.db
      .query(`SELECT role, content FROM messages ORDER BY timestamp ASC, id ASC`)
      .all() as Array<{ role: string; content: string }>;

    return rows.map((r) => ({ role: r.role as ChatRole, content: r.content }));
  }

  clearAll() {
    this.db.run(`DELETE FROM messages;`);
  }

  countMessages(): number {
    const row = this.db.query(`SELECT COUNT(1) as c FROM messages`).get() as
      | { c: number }
      | undefined;
    return row?.c ?? 0;
  }

  close() {
    this.db.close();
  }
}

