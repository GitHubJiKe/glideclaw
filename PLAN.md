这套详细实施技术方案将围绕 **Bun + SQLite + OpenAI API** 架构展开。它不仅是一个开发指南，更是一份可以直接输入给 AI 编程工具（如 Cursor, Windsurf 或 Copilot）的 **Prompt 指令集**。

---

## 项目名称：GlideClaw

**核心理念：** 逻辑滚动、内存节约、本地优先、极客驱动。

---

## 1. 初始化与项目结构 (Step 1)

### 环境准备

* 安装 Bun: `curl -fsSL https://bun.sh/install | bash`
* 初始化项目:
```bash
mkdir glideclaw && cd glideclaw
bun init -y
bun add zod dotenv chalk @clack/prompts openai
bun add -d @types/bun

```



### 目录结构设计

```text
glideclaw/
├── src/
│   ├── index.ts          # CLI 入口
│   ├── core/             # 核心逻辑
│   │   ├── memory.ts     # SQLite 滚动记忆管理
│   │   ├── llm.ts        # OpenAI 适配器
│   │   └── config.ts     # 配置校验 (Zod)
│   ├── utils/            # 工具类 (Token 计数、时间格式化)
│   └── types/            # 类型定义
├── db/                   # 本地数据库存放处 (.gitignore)
├── tests/                # 单元测试
├── .env.example          # 环境变量模板
└── package.json

```

---

## 2. 详细设计与实现方案 (Step 2)

### A. 配置模块 (`config.ts`)

使用 **Zod** 定义强类型配置，支持 1-30 天窗口设置。

* **功能：** 读取 `~/.glideclawrc` 或环境参数。
* **参数：** `API_KEY`, `MODEL`, `WINDOW_DAYS` (Default: 7), `MAX_TOKENS`.

### B. 滚动记忆层 (`memory.ts`)

利用 `bun:sqlite` 实现物理删除逻辑。

* **数据库初始化：** 自动创建 `messages` 表。
* **清理函数：** `cleanupOldMessages()`。执行 `DELETE FROM messages WHERE timestamp < datetime('now', '-' || ? || ' days')`。
* **上下文提取：** `getContext(limitDays)`。按时间顺序提取记录并格式化为 LLM 消息数组。

### C. LLM 交互层 (`llm.ts`)

* **功能：** 封装 Stream 流式输出，对接 OpenAI 兼容接口。
* **Token 预估：** 在发送请求前，简单统计字符数或集成 `gpt-tokenizer`，确保不溢出。

---

## 3. 编码路线图 (Step-by-Step Implementation)

### 第一阶段：持久化基座

1. 实现 `src/core/memory.ts`。
2. 编写 SQLite 初始化逻辑，支持 `saveMessage` 和 `getHistory`。
3. **关键逻辑：** 在每次 `getHistory` 前调用 `cleanupOldMessages`。

### 第二阶段：CLI 交互界面

1. 使用 `@clack/prompts` 构建交互。
2. 实现 `glideclaw chat` 命令，开启循环对话模式。
3. 实现 `glideclaw config` 命令，允许动态修改记忆天数（1-30）。

### 第三阶段：AI 链接

1. 集成 OpenAI SDK。
2. 实现流式输出渲染（`process.stdout.write`），确保打字机效果。

---

## 4. 单元测试策略 (Step 3)

使用 Bun 内置的测试运行器 `bun test`。

* **Memory Test:**
* 插入 10 天前的数据，设置窗口为 7 天，验证查询结果是否为空。
* 验证插入数据后，数据库文件确实存在于磁盘。


* **Config Test:**
* 输入 `WINDOW_DAYS = 31`，验证 Zod 是否抛出异常。


* **LLM Mock Test:**
* Mock `fetch` 请求，测试在网络异常时程序是否能优雅退出并保存已有的对话。



---

## 5. 构建与分发 (Step 4)

### 构建二进制文件

Bun 最强大的功能是直接打包成单文件二进制：

```bash
# 为当前平台构建
bun build ./src/index.ts --compile --outfile glideclaw

# 针对不同平台 (Cross-compile)
bun build ./src/index.ts --compile --target=bun-linux-x64 --outfile glideclaw-linux
bun build ./src/index.ts --compile --target=bun-windows-x64 --outfile glideclaw.exe

```

### 发布

1. **私用/极客分发：** 直接将编译后的二进制文件放入 `/usr/local/bin`。
2. **NPM 分发：** 尽管它是二进制，依然可以发布到 NPM，在 `package.json` 的 `bin` 字段声明。

---

## 6. 使用流程 (Step 5)

1. **初始化：** `glideclaw init` (设置 API Key 和 记忆天数)。
2. **启动：** `glideclaw` 默认进入对话模式。
3. **状态查看：** `glideclaw status` (显示当前占用 Token 数、数据库大小、当前记忆天数)。
4. **强制清理：** `glideclaw clear` (物理删除所有本地记录)。

---

## 7. 给 AI 编码工具的 Prompt 示例

如果你要把这个任务交给 AI，可以尝试以下 Prompt：

> "请作为高级 Typescript 开发专家，使用 Bun 运行时和 `bun:sqlite` 实现一个名为 GlideClaw 的 CLI。
> 1. 实现一个 memory.ts，要求能根据用户配置的 N 天周期（1-30天）自动删除 SQLite 中的旧对话。
> 2. 对话保存时需记录时间戳。
> 3. 使用 OpenAI API 进行流式对话，并在每次请求前只加载 N 天内的历史。
> 4. 代码需符合 Clean Code 原则，并包含基本的错误处理。"
> 
> 

---

**总结：**
这套方案规避了 Python 环境的复杂和 Node.js 的臃肿，通过 **Bun** 实现了极致的轻量化。

**你想针对“日结摘要（Daily Summary）”这部分补充具体的 Prompt 提示词工程（Prompt Engineering）设计吗？** 这能让你的 GlideClaw 在 30 天模式下依然像 1 天模式一样省钱。