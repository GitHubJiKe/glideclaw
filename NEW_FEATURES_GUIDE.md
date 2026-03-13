# GlideClaw 新功能快速指南

## 🎯 新增功能概览

这个更新为 GlideClaw 添加了三项核心功能：

| 功能 | 描述 | 优势 |
|------|------|------|
| **Agent 配置加载** | 对话时自动加载 Agent 的 Soul、Identity 等配置 | 提升对话的一致性和质量 |
| **消息持久化** | 所有对话消息保存到 `messages` 表（含 Agent ID） | 支持多 Agent 场景，便于审计 |
| **配置审计日志** | 配置变更记录到 `config_history` 表 | 追踪所有配置变更，便于回溯 |
| **Web 管理界面** | 支持在 Web 页面查看、编辑消息和配置历史 | 可视化管理数据，支持导出 |

---

## 📋 使用场景

### 场景 1：日常 AI 对话

```bash
# 初始化配置
bun run src/cli.ts init

# 开始对话
bun run src/cli.ts chat
```

**幕后发生了什么**：
1. ✓ 系统自动加载默认 Agent 配置
2. ✓ 读取 Soul 表的系统提示词
3. ✓ 每条消息自动保存到 `messages` 表
4. ✓ 带 `agent_id="glideclaw-default"`

### 场景 2：查看对话历史

```bash
# 启动 Web 管理界面
bun run src/cli.ts web
```

然后访问 `http://localhost:8001`：

1. 在左侧下拉框选择 **"messages"**
2. 查看所有对话记录
3. 点击行上的 **编辑** 可查看完整消息内容
4. 点击 **导出 JSON** 可备份数据

### 场景 3：追踪配置变更

在 Web 管理界面：

1. 选择 **"config_history"** 表
2. 查看所有配置变更记录
3. 每条记录显示：
   - 哪个字段被修改
   - 旧值 → 新值
   - 修改原因和时间

---

## 🗄️ 新增数据库表

### `messages` 表

保存每条对话消息。

**字段**：
```
id          INTEGER    消息 ID（自增）
role        TEXT       消息角色 (user/assistant/system)
content     TEXT       消息内容
tokens      INTEGER    Token 数估计
agent_id    TEXT       ✨ Agent ID（支持多 Agent）
timestamp   TEXT       创建时间
```

**查询示例**：

```sql
-- 查询特定 Agent 的最近消息
SELECT * FROM messages 
WHERE agent_id = 'glideclaw-default' 
ORDER BY timestamp DESC 
LIMIT 20;

-- 统计消息数
SELECT COUNT(*) FROM messages 
WHERE agent_id = 'glideclaw-default';
```

### `config_history` 表

记录配置变更历史。

**字段**：
```
id              INTEGER    记录 ID（自增）
agent_id        TEXT       Agent ID
field_name      TEXT       配置字段名 (e.g., 'model', 'window_days')
old_value       TEXT       旧值
new_value       TEXT       新值
change_reason   TEXT       变更原因
timestamp       TEXT       变更时间
```

**查询示例**：

```sql
-- 查询过去30天的配置变更
SELECT * FROM config_history 
WHERE agent_id = 'glideclaw-default' 
  AND timestamp >= datetime('now', '-30 days')
ORDER BY timestamp DESC;

-- 追踪某个字段的变更历史
SELECT old_value, new_value, change_reason, timestamp 
FROM config_history 
WHERE agent_id = 'glideclaw-default' AND field_name = 'model' 
ORDER BY timestamp DESC;
```

---

## 🔌 编程接口

### MemoryStore 新增方法

**保存消息**：
```typescript
memory.saveMessage(
  role: "user" | "assistant" | "system",
  content: string,
  options?: {
    agentId?: string;      // ✨ 新增
    tokens?: number;
    timestamp?: string;
  }
)
```

**查询消息**：
```typescript
// 查询特定 Agent 的消息
const messages = memory.getMessages(agentId, limit);

// 查询所有消息
const allMessages = memory.getMessages(undefined, limit);
```

**保存配置变更**：
```typescript
memory.saveConfigHistory(
  agentId: string,
  fieldName: string,
  oldValue: string | null,
  newValue: string | null,
  changeReason?: string,
  options?: { timestamp?: string }
)
```

**查询配置历史**：
```typescript
// 查询特定 Agent 的配置历史（过去 N 天）
const history = memory.getConfigHistory(agentId, limitDays);

// 查询所有配置历史
const allHistory = memory.getAllConfigHistory(limitDays, limit);
```

### AssistantManager 更新

**加载 Agent 配置**：
```typescript
const assistantMgr = new AssistantManager(meta, config);

// 获取默认 Agent 配置
const assistantConfig = assistantMgr.getDefaultAssistantConfig();

// 获取系统提示词
const systemPrompt = assistantMgr.getSystemPrompt(agentId);

// 获取特定 Agent 配置
const config = assistantMgr.getAssistantConfig(agentId);
```

---

## 🌐 Web API

### 获取表列表

```bash
curl http://localhost:8001/api/tables
```

响应：
```json
{
  "tables": [
    "agents", "users", "souls", "identities", 
    "heartbeats", "change_history", 
    "messages", "config_history"  ← 新增表
  ]
}
```

### 查询消息表

```bash
# 获取所有消息（前200条）
curl http://localhost:8001/api/table/messages

# 导出消息为 JSON
curl http://localhost:8001/api/export/messages > messages.json
```

### 查询配置历史

```bash
# 获取所有配置变更（前200条）
curl http://localhost:8001/api/table/config_history

# 导出配置历史为 JSON
curl http://localhost:8001/api/export/config_history > config_history.json
```

### 编辑消息/配置

```bash
# 更新消息
curl -X PUT http://localhost:8001/api/table/messages/123 \
  -H "Content-Type: application/json" \
  -d '{"content": "新内容"}'

# 删除消息
curl -X DELETE http://localhost:8001/api/table/messages/123
```

---

## 💻 典型工作流

### 工作流 1：日常对话 + 数据查看

```bash
# 1️⃣ 启动对话
bun run src/cli.ts chat
# 输入若干消息...
# Ctrl+C 退出

# 2️⃣ 启动 Web 查看
bun run src/cli.ts web
# 打开浏览器访问 http://localhost:8001

# 3️⃣ 在 Web 中查看
# - 选择 "messages" 表查看对话历史
# - 选择 "config_history" 表查看配置变更

# 4️⃣ 导出数据
# 点击 "导出 JSON" 按钮备份数据
```

### 工作流 2：多 Agent 管理

```typescript
// 为不同 Agent 保存消息
const agentId1 = "glideclaw-default";
const agentId2 = "my-custom-agent";

memory.saveMessage("user", "Agent1 的消息", { agentId: agentId1 });
memory.saveMessage("user", "Agent2 的消息", { agentId: agentId2 });

// 分别查询
const agent1Messages = memory.getMessages(agentId1, 100);
const agent2Messages = memory.getMessages(agentId2, 100);

// 在 Web 中都能查看和管理
```

### 工作流 3：审计配置变更

```typescript
// 记录配置变更
memory.saveConfigHistory(
  "glideclaw-default",
  "model",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "用户通过 config 命令升级模型"
);

// 在 Web 中查看完整的配置审计日志
// - 何时修改
// - 修改者是谁（reason 字段）
// - 旧值和新值对比
```

---

## 🎨 Web UI 特性

### Messages 表展示

| 特性 | 说明 |
|------|------|
| **内容预览** | 显示前100字符，鼠标悬停显示完整内容 |
| **时间戳** | 显示消息创建时间 |
| **Agent ID** | 显示属于哪个 Agent |
| **编辑功能** | 可修改消息内容（用于更正错误） |
| **删除功能** | 可删除不需要的消息 |
| **导出功能** | 导出为 JSON 备份 |

### Config History 表展示

| 特性 | 说明 |
|------|------|
| **变更对比** | 清晰显示旧值 → 新值 |
| **变更原因** | 显示为什么做这个变更 |
| **时间戳** | 显示何时做的变更 |
| **编辑功能** | 可更正记录中的错误 |
| **删除功能** | 可删除不需要的记录 |
| **导出功能** | 导出变更历史为 JSON |

---

## 🚀 最佳实践

### 1️⃣ 定期导出数据

```bash
# 每周导出备份
bun run src/cli.ts web &
sleep 2
curl http://localhost:8001/api/export/messages > backup-messages-$(date +%Y%m%d).json
curl http://localhost:8001/api/export/config_history > backup-config-$(date +%Y%m%d).json
```

### 2️⃣ 监控配置变更

```bash
# 定期检查配置变更
bun run -c "
  const memory = new (await import('./src/core/memory.ts')).MemoryStore();
  const history = memory.getAllConfigHistory(7, 100);
  console.table(history);
"
```

### 3️⃣ 清理过期消息

```bash
# CLI 中内置了自动清理
# 根据 WINDOW_DAYS 自动删除过期消息
bun run src/cli.ts chat  # 自动清理超过窗口期的消息
```

### 4️⃣ 不同用途的 Agent

```typescript
// 在 Web 中创建不同的 Agent
// 然后在对话时选择使用哪个 Agent

const assistantMgr = new AssistantManager(meta, config);

// 查询助手列表
const assistants = assistantMgr.getAllAssistants();
console.log(assistants);
// [
//   { id: "glideclaw-default", name: "默认助手", ... },
//   { id: "my-custom-agent", name: "自定义助手", ... }
// ]
```

---

## ❓ 常见问题

### Q1: 如何查看某个 Agent 的所有消息？

**Web 方式**：
1. 进入 Web 管理界面
2. 选择 "messages" 表
3. 在侧边栏编辑区输入过滤 SQL（如果支持）
4. 查看该 Agent 的消息

**代码方式**：
```typescript
const messages = memory.getMessages("glideclaw-default", 1000);
```

### Q2: 如何导出某个 Agent 的对话为 Markdown？

```typescript
const messages = memory.getMessages("glideclaw-default", 1000);
const md = messages.map(m => {
  if (m.role === "user") return `**用户**: ${m.content}`;
  if (m.role === "assistant") return `**AI**: ${m.content}`;
  return `*系统*: ${m.content}`;
}).join("\n\n");

console.log(md);
```

### Q3: 对话消息会自动清理吗？

**是的**。根据 `WINDOW_DAYS` 配置（默认7天）：
- 每次对话时自动清理过期消息
- 物理删除超过窗口期的数据
- 新添加的 `agent_id` 使得多 Agent 隔离管理

### Q4: config_history 表会无限增长吗？

**不会**。建议定期：
1. 在 Web 中导出为 JSON 备份
2. 删除过期的配置变更记录
3. 通过 SQLite 查询定期审计

---

## 📚 更多资源

- **完整文档**：查看 `FEATURE_IMPLEMENTATION.md`
- **源代码**：
  - `src/core/memory.ts` - MemoryStore 实现
  - `src/core/meta.ts` - MetaStore 支持新表
  - `src/core/assistant.ts` - AssistantManager
  - `src/cli.ts` - CLI 集成
  - `src/ui/script.js` - Web UI 逻辑

---

## 🐛 反馈和改进

发现问题或有改进建议？请通过以下方式反馈：
- 提交 GitHub Issue
- 发送 Pull Request
- 在讨论区留言

---

**enjoy your AI assistant! 🚀**
