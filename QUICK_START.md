# GlideClaw 快速启动指南

## 🚀 快速开始

### 1. 启动 Meta Console 管理界面

```bash
# 设置 API_KEY 环境变量
export API_KEY="your-openai-api-key"

# 启动 web 服务器
bun run web

# 在浏览器中访问
# http://localhost:8001
```

### 2. 在管理界面中管理数据

Meta Console 提供了一个现代化的数据管理界面：

- **表选择**: 在左侧选择要管理的表（agents、users、souls、identities、heartbeats、change_history）
- **查看数据**: 右侧自动显示选中表的所有数据
- **新增数据**: 在左侧编辑器中输入 JSON 对象，点击"新增"
- **编辑数据**: 点击表格中的"编辑"按钮，自动填充编辑器
- **删除数据**: 点击表格中的"删除"按钮确认删除
- **导出数据**: 点击"导出 JSON"下载表数据

## 📖 核心概念

### 表结构

```
agents (助手)
  ├─ 包含应用的主要代理/助手信息
  └─ 每个助手可以有多个灵魂、身份和心跳任务

souls (灵魂)
  ├─ 包含系统提示词和版本管理
  └─ 用于定义助手的核心人设和行为

identities (身份)
  ├─ 包含角色定义和描述
  └─ 可以为同一个助手添加多个不同的身份

heartbeats (心跳/定时任务)
  ├─ 包含定时执行的任务
  └─ 支持 cron 表达式和启用/禁用

users (用户)
  └─ 包含用户基本信息

change_history (变更历史)
  └─ 记录所有表的修改操作，用于审计和恢复
```

## 💻 在代码中使用

### 获取助手配置

```typescript
import { AssistantManager } from "./src/core/assistant";
import { loadConfig } from "./src/core/config";
import { MetaStore } from "./src/core/meta";

const config = await loadConfig();
const meta = new MetaStore({ dbPath: config.dbPath });
const manager = new AssistantManager(meta, config);

// 获取默认助手
const defaultConfig = manager.getDefaultAssistantConfig();
console.log(defaultConfig?.agent.name); // "GlideClaw 默认助手"

// 获取系统提示词（用于 LLM）
const systemPrompt = manager.getSystemPrompt("glideclaw-default");
```

### 创建新助手

```typescript
// 创建新助手
const { agentId, soulId } = manager.createAssistant(
  "智能分析助手",
  "专门用于数据分析和报表生成"
);

// 为助手添加身份
manager.addIdentity(agentId, "数据分析师", "精通各种统计方法");

// 为助手添加心跳任务
manager.addHeartbeat(
  agentId,
  "daily_memory_cleanup",
  "每天清理旧的分析记录"
);

// 查看统计信息
const stats = manager.getStats();
console.log(stats);
```

### 使用心跳任务管理器

```typescript
const heartbeatManager = manager.getHeartbeatManager();

// 获取已注册的事件类型
const events = heartbeatManager.getRegisteredEventTypes();
// ["daily_memory_cleanup", "hourly_context_check"]

// 手动触发事件
await heartbeatManager.trigger("daily_memory_cleanup", heartbeatId, assistantId);

// 启动所有心跳任务
await manager.initialize();

// 停止所有心跳任务
await manager.cleanup();
```

## 📊 常见任务

### 导入数据

1. 在 Meta Console 中选择目标表
2. 在左侧编辑器中输入 JSON 对象
3. 点击"新增"按钮

示例（添加新用户）：
```json
{
  "id": "user-001",
  "name": "张三",
  "email": "zhangsan@example.com"
}
```

### 导出数据

1. 选择要导出的表
2. 点击"导出 JSON"
3. 浏览器会自动下载 JSON 文件

### 修改助手配置

1. 在 Meta Console 中选择 `souls` 表
2. 点击要编辑的灵魂对应的"编辑"按钮
3. 修改 `prompt` 字段
4. 点击"更新"按钮

## 🔧 环境变量配置

### CLI 使用

在 `~/.glideclawrc` 中配置：

```json
{
  "API_KEY": "sk-...",
  "MODEL": "gpt-4o-mini",
  "WINDOW_DAYS": 7,
  "MAX_TOKENS": 4096,
  "BASE_URL": "https://api.openai.com/v1",
  "DB_PATH": "db/glideclaw.sqlite"
}
```

或者使用环境变量：

```bash
export API_KEY="sk-..."
export MODEL="gpt-4o-mini"
export WINDOW_DAYS=7
export DB_PATH="db/glideclaw.sqlite"
```

## 📝 日志和调试

### 启用详细日志

```typescript
// 助手管理器会打印初始化和清理信息
// [Assistant] 助手管理器已初始化
// [Assistant] 助手管理器已清理

// 心跳任务会打印执行信息
// [Heartbeat] 执行日常内存清理
// [Heartbeat] 事件 daily_memory_cleanup 执行成功
```

### 获取系统统计信息

```typescript
const stats = manager.getStats();
console.log(JSON.stringify(stats, null, 2));
// {
//   agents: 1,
//   souls: 1,
//   identities: 1,
//   users: 1,
//   heartbeats: 2,
//   heartbeatStats: {
//     total: 2,
//     enabled: 2,
//     disabled: 0,
//     registeredHandlers: ["daily_memory_cleanup", "hourly_context_check"],
//     activeTimers: 0
//   }
// }
```

## 🎯 最佳实践

### 1. 系统提示词管理

为不同的任务创建不同的灵魂（souls）：

```typescript
// 创建分析助手
manager.createAssistant("数据分析", "专业数据分析");

// 创建编程助手  
manager.createAssistant("代码助手", "专业编程指导");

// 创建写作助手
manager.createAssistant("写作助手", "专业内容创作");
```

### 2. 身份角色设计

为不同场景创建不同的身份：

```typescript
// 同一个助手的不同身份
manager.addIdentity(agentId, "严肃分析师", "数据驱动，结论明确");
manager.addIdentity(agentId, "友善顾问", "温和耐心，循循善诱");
manager.addIdentity(agentId, "技术专家", "深入浅出，专业术语适度");
```

### 3. 定期维护任务

添加心跳任务来维持系统健康：

```typescript
// 日常清理
manager.addHeartbeat(agentId, "daily_memory_cleanup", "清理七天前的数据");

// 每小时检查
manager.addHeartbeat(agentId, "hourly_context_check", "检查上下文大小");

// 自定义任务
manager.addHeartbeat(agentId, "custom_analysis", "生成每日分析报告", "0 9 * * *");
```

## ❓ FAQ

### Q: 如何重置数据库？
A: 删除 `db/glideclaw.sqlite` 文件，下次启动时会自动重新初始化。

### Q: 能否备份数据？
A: 使用 Meta Console 中的"导出 JSON"功能导出所有表的数据，保存为 JSON 文件。

### Q: 如何禁用某个心跳任务？
A: 在 Meta Console 中编辑 `heartbeats` 表，将 `enabled` 字段改为 0。

### Q: 系统提示词有长度限制吗？
A: 没有数据库层面的限制，但 OpenAI API 有 token 限制。系统会自动管理上下文窗口。

### Q: 能否创建自定义的心跳事件？
A: 可以。在代码中调用 `heartbeatManager.registerHandler()` 注册自定义事件处理器。

## 📚 更多资源

- 完整实现总结: 查看 `IMPLEMENTATION_SUMMARY.md`
- NEXT_PLAN.md: 查看项目规划
- 源代码: `src/core/` 目录

---

**最后更新**: 2026年3月13日
**版本**: v0.1.0
