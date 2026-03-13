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
  agentId?: string;
};

export type SaveConfigHistoryOptions = {
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
        agent_id TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON messages(agent_id);`);

    // 数据库迁移：如果 messages 表存在但没有 agent_id 列，则添加
    try {
      this.db.run(`ALTER TABLE messages ADD COLUMN agent_id TEXT;`);
    } catch {
      // 列已存在，忽略错误
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS config_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        field_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        change_reason TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_config_history_agent_id ON config_history(agent_id);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_config_history_timestamp ON config_history(timestamp);`);
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
          `INSERT INTO messages (role, content, tokens, agent_id, timestamp) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(role, content, t, options.agentId ?? null, options.timestamp);
      return;
    }
    this.db.query(`INSERT INTO messages (role, content, tokens, agent_id) VALUES (?, ?, ?, ?)`).run(
      role,
      content,
      t,
      options.agentId ?? null,
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

  saveConfigHistory(
    agentId: string,
    fieldName: string,
    oldValue: string | null,
    newValue: string | null,
    changeReason?: string,
    options: SaveConfigHistoryOptions = {},
  ) {
    if (options.timestamp) {
      this.db
        .query(
          `INSERT INTO config_history (agent_id, field_name, old_value, new_value, change_reason, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(agentId, fieldName, oldValue, newValue, changeReason ?? null, options.timestamp);
      return;
    }
    this.db
      .query(
        `INSERT INTO config_history (agent_id, field_name, old_value, new_value, change_reason) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(agentId, fieldName, oldValue, newValue, changeReason ?? null);
  }

  getConfigHistory(agentId: string, limitDays: number = 30): Array<any> {
    const rows = this.db
      .query(
        `SELECT id, agent_id, field_name, old_value, new_value, change_reason, timestamp
         FROM config_history
         WHERE agent_id = ? AND timestamp >= datetime('now', '-' || ? || ' days')
         ORDER BY timestamp DESC, id DESC`,
      )
      .all(agentId, limitDays) as Array<any>;

    return rows;
  }

  getAllConfigHistory(limitDays: number = 30, limit: number = 1000): Array<any> {
    const rows = this.db
      .query(
        `SELECT id, agent_id, field_name, old_value, new_value, change_reason, timestamp
         FROM config_history
         WHERE timestamp >= datetime('now', '-' || ? || ' days')
         ORDER BY timestamp DESC, id DESC
         LIMIT ?`,
      )
      .all(limitDays, limit) as Array<any>;

    return rows;
  }

  getMessages(agentId?: string, limit: number = 1000): Array<any> {
    let rows: Array<any>;
    
    if (agentId) {
      const stmt = this.db.query(
        `SELECT id, role, content, tokens, agent_id, timestamp
         FROM messages
         WHERE agent_id = ?
         ORDER BY timestamp DESC, id DESC
         LIMIT ?`,
      );
      rows = stmt.all(agentId, limit) as Array<any>;
    } else {
      const stmt = this.db.query(
        `SELECT id, role, content, tokens, agent_id, timestamp
         FROM messages
         ORDER BY timestamp DESC, id DESC
         LIMIT ?`,
      );
      rows = stmt.all(limit) as Array<any>;
    }

    return rows;
  }

  close() {
    this.db.close();
  }
}

