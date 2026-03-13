## GlideClaw

**GlideClaw** 是一个基于 **Bun + SQLite** 的本地优先（Local-first）AI CLI：用“滚动窗口记忆”只携带最近 \(N\) 天上下文进行对话，自动物理清理过期消息，尽量省 Token、轻量、可离线保留本地记录。

---

## 功能特性

- **滚动记忆（1-30 天）**：每次取历史前自动清理过期数据（SQLite 物理删除）
- **流式输出**：对接 OpenAI 兼容 `chat/completions` 的 SSE 流
- **本地持久化**：默认数据库文件 `db/glideclaw.sqlite`
- **多种配置来源**：`.env` / 环境变量 / `~/.glideclawrc`
- **现代化交互 CLI**：基于 `@clack/prompts`，并用 `chalk` 美化输出

---

## 环境要求

- **Bun**：建议 `>= 1.3.0`

---

## 安装

### 方式 A：本地开发运行

```bash
bun install
```

### 方式 B：发布到 npm 后安装（你发布后可用）

```bash
bun add -g glideclaw
```

---

## 配置

GlideClaw 会按优先级读取配置：

1. **环境变量 / `.env`**
2. **`~/.glideclawrc`**（JSON）

### `.env` 示例

参考 `.env.example`，常用字段如下：

- **`API_KEY`**：必填
- **`MODEL`**：默认 `gpt-4o-mini`（你也可以填 `deepseek-chat` 等）
- **`WINDOW_DAYS`**：记忆天数，范围 1-30，默认 7
- **`MAX_TOKENS`**：可选，发送前做粗略预估，超出会直接报错
- **`BASE_URL`**：默认 `https://api.openai.com/v1`，可改为第三方 OpenAI 兼容网关
- **`DB_PATH`**：可选，默认 `db/glideclaw.sqlite`

> 注意：`.env.example` **不会自动生效**，请复制成 `.env` 或设置环境变量。

### `~/.glideclawrc` 示例

```json
{
  "API_KEY": "sk-xxxx",
  "MODEL": "gpt-4o-mini",
  "WINDOW_DAYS": 7,
  "BASE_URL": "https://api.openai.com/v1",
  "DB_PATH": "db/glideclaw.sqlite"
}
```

---

## 使用方法

当前 CLI 入口为 `src/index.ts`（开发）或 `dist/index.js`（发布产物）。

### 查看帮助

```bash
bun run src/index.ts --help
```

### 初始化（推荐）

交互式写入 `~/.glideclawrc`：

```bash
bun run src/index.ts init
```

### 开始对话（循环模式）

```bash
bun run src/index.ts chat
```

- 输入 `/exit` 退出

### 修改记忆窗口天数（1-30）

```bash
bun run src/index.ts config
```

### 查看状态

```bash
bun run src/index.ts status
```

会显示：

- model / windowDays / baseUrl / dbPath
- dbSize（SQLite 文件大小）
- messages（消息条数）
- context 预估 token（用于粗略判断上下文规模）

### 清空本地对话记录（保留库文件）

```bash
bun run src/index.ts clear
```

> 清空只会 `DELETE FROM messages`，不会删除 SQLite 文件本身。

---

## 开发与测试

### 运行单测

```bash
bun test
```

---

## 构建与分发（Step 4）

### 构建 npm 可执行产物

```bash
bun run build
```

构建后产物为：

- `dist/index.js`（带 shebang：`#!/usr/bin/env bun`）

### 本地冒烟验证

```bash
bun run dist/index.js --help
```

---

## npm 发布说明

项目已配置：

- `bin`: `glideclaw -> dist/index.js`
- `prepublishOnly`: 发布前自动 `build` + `bun test`

发布流程（需要你本机具备 npm 权限）：

```bash
npm login
npm publish
```

---

## 常见问题（Troubleshooting）

### 1) 缺少 API_KEY

请在 `.env` / 环境变量 / `~/.glideclawrc` 中配置 `API_KEY`。

### 2) 运行时“无输出/卡住”

这通常与代理/网关的 SSE 分隔符或网络环境有关。当前实现已兼容 `\\n\\n` 与 `\\r\\n\\r\\n` 两种 SSE 边界；若仍卡住，请检查：

- `BASE_URL` 是否可访问
- API Key 是否有效
- 网络是否被公司代理拦截

---

## 安全提示

- **不要提交真实的 API Key**（请只放在 `.env` 或 `~/.glideclawrc`）
- 如果误泄露 key，请立即在提供商后台吊销并更换

