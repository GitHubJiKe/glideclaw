import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type MetaTableName =
  | "agents"
  | "users"
  | "souls"
  | "identities"
  | "heartbeats"
  | "change_history"
  | "messages"
  | "config_history";

export type MetaOptions = {
  dbPath: string;
};

export class MetaStore {
  private db: Database;
  readonly dbPath: string;

  constructor(options: MetaOptions) {
    const dbPath = resolve(options.dbPath);
    mkdirSync(dirname(dbPath), { recursive: true });
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS souls (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        version TEXT,
        prompt TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (assistant_id) REFERENCES agents(id)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS identities (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (assistant_id) REFERENCES agents(id)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS heartbeats (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        description TEXT,
        cron_expression TEXT,
        enabled INTEGER DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (assistant_id) REFERENCES agents(id)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS change_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        row_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

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

    this.seedIfEmpty();
  }

  private seedIfEmpty() {
    const countAgents = this.db
      .query(`SELECT COUNT(1) as c FROM agents`)
      .get() as { c: number } | undefined;
    if (!countAgents || countAgents.c === 0) {
      const defaultAssistantId = "glideclaw-default";
      this.db
        .query(
          `INSERT INTO agents (id, name, description) VALUES (?, ?, ?)`,
        )
        .run(
          defaultAssistantId,
          "GlideClaw 默认助手",
          "一个基于 Bun + SQLite 的本地优先滚动上下文助手。",
        );

      this.db
        .query(
          `INSERT INTO souls (id, assistant_id, version, prompt) VALUES (?, ?, ?, ?)`,
        )
        .run(
          "glideclaw-soul-v1",
          defaultAssistantId,
          "v1",
          "你是一个轻量、节省 Token 的本地优先助手，擅长在有限上下文里给出高价值建议。",
        );

      this.db
        .query(
          `INSERT INTO identities (id, assistant_id, name, description) VALUES (?, ?, ?, ?)`,
        )
        .run(
          "glideclaw-identity-default",
          defaultAssistantId,
          "极简代码助手",
          "偏好直截了当的答案、最少依赖、可读性优先。",
        );

      this.db
        .query(
          `INSERT INTO heartbeats (id, assistant_id, event_type, description, cron_expression, enabled) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "hb-daily-memory-cleanup",
          defaultAssistantId,
          "daily_memory_cleanup",
          "每天执行一次内存清理，删除超过窗口期的旧消息",
          "0 0 * * *",
          1,
        );
      
      this.db
        .query(
          `INSERT INTO heartbeats (id, assistant_id, event_type, description, cron_expression, enabled) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "hb-hourly-context-check",
          defaultAssistantId,
          "hourly_context_check",
          "每小时检查一次上下文使用情况，确保不超出限制",
          "0 * * * *",
          1,
        );
    }

    const countUsers = this.db
      .query(`SELECT COUNT(1) as c FROM users`)
      .get() as { c: number } | undefined;
    if (!countUsers || countUsers.c === 0) {
      this.db
        .query(`INSERT INTO users (id, name, email) VALUES (?, ?, ?)`)
        .run("local-user", "本机用户", "");
    }
  }

  listTables(): MetaTableName[] {
    return ["agents", "users", "souls", "identities", "heartbeats", "change_history", "messages", "config_history"];
  }

  getRows(table: MetaTableName, limit = 100): any[] {
    const stmt = this.db.query(`SELECT * FROM ${table} ORDER BY rowid DESC LIMIT ?`);
    return stmt.all(limit);
  }

  getRowById(table: MetaTableName, id: string): any | undefined {
    const stmt = this.db.query(`SELECT * FROM ${table} WHERE id = ?`);
    return stmt.get(id);
  }

  insertRow(table: MetaTableName, data: Record<string, unknown>): string {
    const cols = Object.keys(data);
    if (!cols.includes("id")) {
      data.id = crypto.randomUUID();
      cols.push("id");
    }
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map((k) => (data as any)[k]);
    const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
    this.db.query(sql).run(...values);
    const id = String((data as any).id);
    this.appendChange(table, id, "insert", data);
    return id;
  }

  updateRow(
    table: MetaTableName,
    id: string,
    data: Record<string, unknown>,
  ): void {
    const cols = Object.keys(data);
    if (cols.length === 0) return;
    const setters = cols.map((k) => `${k} = ?`).join(", ");
    const values = cols.map((k) => (data as any)[k]);
    const sql = `UPDATE ${table} SET ${setters} WHERE id = ?`;
    this.db.query(sql).run(...values, id);
    this.appendChange(table, id, "update", data);
  }

  deleteRow(table: MetaTableName, id: string): void {
    this.db.query(`DELETE FROM ${table} WHERE id = ?`).run(id);
    this.appendChange(table, id, "delete", null);
  }

  private appendChange(
    table: MetaTableName,
    rowId: string,
    operation: "insert" | "update" | "delete",
    payload: unknown,
  ) {
    this.db
      .query(
        `INSERT INTO change_history (table_name, row_id, operation, payload) VALUES (?, ?, ?, ?)`,
      )
      .run(table, rowId, operation, payload ? JSON.stringify(payload) : null);
  }

  close() {
    this.db.close();
  }
}

