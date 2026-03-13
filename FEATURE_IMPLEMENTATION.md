# GlideClaw 新功能实现详解

## 概述

本文档详细说明了 GlideClaw 中新增的三项核心功能的实现细节：

1. **Agent 配置加载到对话消息**
2. **对话消息持久化到 SQLite**
3. **Web 页面查看消息和配置历史**

---

## 1. Agent 配置加载到对话消息

### 功能说明

用户每次与 AI 模型对话时，系统现在会：
- 从 SQLite 数据库加载对应 Agent 的配置信息（Soul、Identity 等）
- 构建系统级提示词（System Prompt）
- 将系统提示词、历史对话和用户输入组合成消息列表发送给 LLM

### 实现细节

**主要文件修改**：
- `src/cli.ts` - `cmdChat()` 函数

**关键代码**：

```typescript
// 初始化 AssistantManager
const meta = new MetaStore({ dbPath: cfg.dbPath });
const assistantMgr = new AssistantManager(meta, cfg);

// 加载默认助手配置
const assistantConfig = assistantMgr.getDefaultAssistantConfig();
const systemPrompt = assistantMgr.getSystemPrompt(assistantConfig.agent.id);

// 构建消息列表
const messages: ChatMessage[] = [
  { role: "system", content: systemPrompt },  // ✨ 新增系统提示词
  ...history,
  { role: "user", content: q },
];
```

**涉及组件**：

| 组件 | 功能 |
|------|------|
| `AssistantManager` | 管理 Agent 配置的加载和组装 |
| `MetaStore` | 从 SQLite 读取 Agent、Soul、Identity 数据 |
| `MemoryStore` | 管理对话消息历史 |

**数据流图**：

```
SQLite (agents/souls/identities)
        ↓
    MetaStore
        ↓
AssistantManager.getDefaultAssistantConfig()
        ↓
getSystemPrompt()
        ↓
组装 ChatMessage 列表 → LLM API
```

---

## 2. 对话消息持久化到 SQLite

### 功能说明

系统现在支持：
- **messages 表**：保存每条用户和 AI 的对话，包含 `agent_id` 字段以支持多 Agent 场景
- **config_history 表**：记录配置变更历史，便于审计和追踪

### 实现细节

#### 2.1 Messages 表

**表结构**：

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,              -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,           -- 消息内容
  tokens INTEGER,                  -- Token 数估计
  agent_id TEXT,                   -- ✨ 新增：Agent ID（支持多 Agent）
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_agent_id ON messages(agent_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
```

**数据保存方式**：

```typescript
// src/core/memory.ts
memory.saveMessage("user", q, { agentId: "glideclaw-default" });
memory.saveMessage("assistant", answer, { agentId: "glideclaw-default" });
```

#### 2.2 Config History 表

**表结构**：

```sql
CREATE TABLE config_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,          -- Agent ID
  field_name TEXT NOT NULL,        -- 配置字段名 (e.g., 'window_days', 'model')
  old_value TEXT,                  -- 旧值
  new_value TEXT,                  -- 新值
  change_reason TEXT,              -- 变更原因
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_config_history_agent_id ON config_history(agent_id);
CREATE INDEX idx_config_history_timestamp ON config_history(timestamp);
```

**数据保存示例**：

```typescript
// src/core/memory.ts
memory.saveConfigHistory(
  agentId,
  "window_days",
  "7",
  "14",
  "用户通过 config 命令更新了窗口天数"
);
```

### MemoryStore 新增 API

| 方法 | 功能 | 参数 |
|------|------|------|
| `saveMessage()` | 保存用户/AI 消息 | `(role, content, options)` |
| `saveConfigHistory()` | 记录配置变更 | `(agentId, fieldName, oldValue, newValue, reason)` |
| `getMessages()` | 查询消息 | `(agentId?, limit?)` |
| `getConfigHistory()` | 查询配置历史 | `(agentId, limitDays?)` |
| `getAllConfigHistory()` | 查询所有配置历史 | `(limitDays?, limit?)` |

---

## 3. Web 页面查看消息和配置历史

### 功能说明

通过 Web 管理界面，用户可以：
- **查看 messages 表**：显示所有对话消息，内容以预览形式展示
- **查看 config_history 表**：显示配置变更记录，旧值和新值分别展示
- **进行 CRUD 操作**：查看、编辑、删除记录

### 实现细节

#### 3.1 后端 API 扩展

**文件修改**：
- `src/cli.ts` - `cmdWeb()` 函数中的表列表
- `src/server.ts` - 表支持列表

**支持的表**：

```typescript
const supportedTables = [
  "agents", "users", "souls", "identities", "heartbeats", "change_history",
  "messages",        // ✨ 新增
  "config_history"   // ✨ 新增
];
```

**API 端点**：

| 端点 | 功能 |
|------|------|
| `GET /api/tables` | 获取所有支持的表 |
| `GET /api/table/{table}` | 获取表的所有行 |
| `POST /api/table/{table}` | 新增行 |
| `PUT /api/table/{table}/{id}` | 更新行 |
| `DELETE /api/table/{table}/{id}` | 删除行 |
| `GET /api/export/{table}` | 导出表数据为 JSON |

#### 3.2 前端 UI 优化

**文件修改**：
- `src/ui/script.js` - 添加特殊渲染逻辑
- `src/ui/style.css` - 添加 `.content-preview` 样式
- `src/ui/index.html` - 更新标题和描述

**特殊渲染**：

```javascript
// 为 messages 表提供特殊展示
function renderMessagesTable(rows) {
  // 对 content 字段进行截断（显示前100个字符）
  // 鼠标悬停时显示完整内容
}

// 为 config_history 表提供特殊展示
function renderConfigHistoryTable(rows) {
  // 对 old_value 和 new_value 进行截断
  // 清晰展示配置变更对比
}
```

**样式优化**：

```css
.content-preview {
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  background: #f9f9f9;
  padding: 4px 8px;
  border-radius: 4px;
}
```

---

## 4. 使用示例

### 4.1 CLI 中自动加载 Agent 配置

启动对话模式：

```bash
bun run src/cli.ts chat
```

对话时系统会：
1. 加载默认 Agent 配置
2. 构建系统提示词（来自 Soul 表）
3. 将对话保存到 messages 表（带 agentId）

### 4.2 查看消息和配置历史

启动 Web 管理界面：

```bash
bun run src/cli.ts web
```

访问 `http://localhost:8001`：

1. **查看 messages**：在表选择框选择 "messages"
   - 看到所有对话消息
   - 消息内容以预览形式显示（前100字符）
   - 可以编辑或删除记录
   - 可以导出为 JSON

2. **查看 config_history**：在表选择框选择 "config_history"
   - 看到所有配置变更
   - 显示旧值 → 新值的对比
   - 显示变更原因和时间戳
   - 可以查看完整历史

### 4.3 程序化操作

```typescript
import { MemoryStore } from "./src/core/memory";
import { MetaStore } from "./src/core/meta";
import { AssistantManager } from "./src/core/assistant";

// 保存消息
const memory = new MemoryStore({ dbPath: "./db/glideclaw.sqlite" });
memory.saveMessage("user", "你好", { agentId: "glideclaw-default" });

// 查询消息
const messages = memory.getMessages("glideclaw-default", 100);

// 记录配置变更
memory.saveConfigHistory(
  "glideclaw-default",
  "model",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "升级到更强大的模型"
);

// 查询配置历史
const history = memory.getConfigHistory("glideclaw-default", 30);
```

---

## 5. 数据库架构概览

```
glideclaw.sqlite
├── agents                 （原有）Agent 表
├── users                  （原有）用户表
├── souls                  （原有）Agent 灵魂/提示词
├── identities            （原有）Agent 身份
├── heartbeats            （原有）心跳任务
├── change_history        （原有）元数据变更日志
├── messages              ✨（新增）对话消息
└── config_history        ✨（新增）配置变更历史
```

---

## 6. 多 Agent 支持

系统设计支持多 Agent 场景：

```typescript
// 不同 Agent 的消息隔离
memory.saveMessage("user", "消息1", { agentId: "agent-1" });
memory.saveMessage("user", "消息2", { agentId: "agent-2" });

// 查询特定 Agent 的消息
const agent1Messages = memory.getMessages("agent-1", 100);
const agent2Messages = memory.getMessages("agent-2", 100);
```

---

## 7. 向后兼容性

- 现有的 `messages` 表已扩展，新增 `agent_id` 字段（可为 NULL）
- 旧代码仍可正常运行（不设置 `agentId` 时为 NULL）
- Web API 自动支持新表，无需修改调用代码

---

## 8. 测试验证

运行测试脚本验证新功能：

```bash
# 编译测试脚本
bun run test_new_features.ts
```

测试内容包括：
- ✓ Messages 表保存和查询
- ✓ Config History 表保存和查询
- ✓ MetaStore 表列表包含新表
- ✓ AssistantManager 配置加载

---

## 9. 性能考虑

### 数据库索引

已为关键查询字段添加索引：

```sql
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_agent_id ON messages(agent_id);
CREATE INDEX idx_config_history_agent_id ON config_history(agent_id);
CREATE INDEX idx_config_history_timestamp ON config_history(timestamp);
```

### 查询优化

- `getMessages()` 支持按 `agent_id` 过滤
- `getConfigHistory()` 支持按天数范围查询
- Web API 默认限制返回 200 条（导出时 10,000 条）

---

## 10. 未来改进方向

- [ ] 支持配置变更的回滚功能
- [ ] 添加消息搜索和过滤功能
- [ ] 支持导出为 CSV/Excel 格式
- [ ] 添加消息和配置的可视化分析
- [ ] 支持定时备份到外部存储
