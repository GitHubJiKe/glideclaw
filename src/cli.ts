import chalk from "chalk";
import {
  intro,
  outro,
  text,
  isCancel,
  cancel,
  confirm,
  select,
  spinner,
} from "@clack/prompts";
import { loadConfig, defaultRcPath, updateRcFile } from "./core/config";
import { MemoryStore } from "./core/memory";
import { MetaStore } from "./core/meta";
import { AssistantManager } from "./core/assistant";
import { streamChatToStdout } from "./core/llm";
import type { ChatMessage } from "./types/chat";
import { estimateTokensFromMessages } from "./utils/tokens";
import { enrichMessageWithFileContent } from "./core/file-handler";

function usage() {
  console.log(
    [
      "用法:",
      "  glideclaw                 进入对话（同 chat）",
      "  glideclaw chat            循环对话模式",
      "  glideclaw web [端口]      启动 Web 管理界面（默认 8001）",
      "  glideclaw init            初始化写入 ~/.glideclawrc",
      "  glideclaw config          修改记忆天数（1-30）",
      "  glideclaw status          查看状态（db 大小、窗口天数等）",
      "  glideclaw clear           清空本地对话记录",
      "  glideclaw reset-db        删除并重建本地数据库文件",
      "",
      "示例:",
      "  glideclaw web             使用默认端口 8001",
      "  glideclaw web 3000        使用自定义端口 3000",
    ].join("\n"),
  );
}

function resolveRcPathOrThrow(): string {
  const rcPath = defaultRcPath();
  if (!rcPath) throw new Error("无法解析 HOME 目录，无法定位 ~/.glideclawrc。");
  return rcPath;
}

export async function cmdInit() {
  intro(chalk.bold("GlideClaw 初始化"));
  const rcPath = resolveRcPathOrThrow();

  const apiKey = await text({
    message: "OpenAI API Key（将写入 ~/.glideclawrc）",
    placeholder: "sk-...",
    validate: (v) => (!v || !v.trim() ? "API Key 不能为空" : undefined),
  });
  if (isCancel(apiKey)) return cancel("已取消");

  const model = await text({
    message: "模型名称",
    initialValue: "gpt-4o-mini",
  });
  if (isCancel(model)) return cancel("已取消");

  const windowDaysRaw = await text({
    message: "记忆窗口天数（1-30）",
    initialValue: "7",
    validate: (v) => {
      const n = Number.parseInt(String(v).trim(), 10);
      if (!Number.isFinite(n)) return "请输入数字";
      if (n < 1 || n > 30) return "范围必须在 1-30";
      return undefined;
    },
  });
  if (isCancel(windowDaysRaw)) return cancel("已取消");
  const windowDays = Number.parseInt(String(windowDaysRaw).trim(), 10);

  const baseUrl = await select({
    message: "API Base URL",
    options: [
      { label: "OpenAI 官方", value: "https://api.openai.com/v1" },
      { label: "自定义（之后可在 rc 中改）", value: "custom" },
    ],
  });
  if (isCancel(baseUrl)) return cancel("已取消");

  let finalBaseUrl = "https://api.openai.com/v1";
  if (baseUrl === "custom") {
    const b = await text({
      message: "输入自定义 BASE_URL（例如 https://api.xxx.com/v1）",
      placeholder: "https://api.openai.com/v1",
      initialValue: "https://api.openai.com/v1",
      validate: (v) => (!v || !v.trim() ? "BASE_URL 不能为空" : undefined),
    });
    if (isCancel(b)) return cancel("已取消");
    finalBaseUrl = b.trim();
  }

  const s = spinner();
  s.start("写入配置...");
  await updateRcFile(rcPath, {
    API_KEY: apiKey.trim(),
    MODEL: String(model).trim(),
    WINDOW_DAYS: windowDays,
    BASE_URL: finalBaseUrl,
  });
  s.stop("完成");
  outro(`已写入 ${chalk.cyan(rcPath)}`);
}

export async function cmdConfig() {
  intro(chalk.bold("GlideClaw 配置"));
  const rcPath = resolveRcPathOrThrow();

  const windowDaysRaw = await text({
    message: "设置记忆窗口天数（1-30）",
    initialValue: "7",
    validate: (v) => {
      const n = Number.parseInt(String(v).trim(), 10);
      if (!Number.isFinite(n)) return "请输入数字";
      if (n < 1 || n > 30) return "范围必须在 1-30";
      return undefined;
    },
  });
  if (isCancel(windowDaysRaw)) return cancel("已取消");
  const windowDays = Number.parseInt(String(windowDaysRaw).trim(), 10);

  const s = spinner();
  s.start("更新配置...");
  await updateRcFile(rcPath, { WINDOW_DAYS: windowDays });
  s.stop("完成");
  outro(`已更新 WINDOW_DAYS=${chalk.green(String(windowDays))}`);
}

export async function cmdStatus() {
  const cfg = await loadConfig();
  const memory = new MemoryStore({ dbPath: cfg.dbPath });
  try {
    const dbFile = Bun.file(cfg.dbPath);
    const exists = await dbFile.exists();
    const size = exists ? dbFile.size : 0;
    const count = memory.countMessages();
    const context = memory.getContext(cfg.windowDays);
    const est = estimateTokensFromMessages(context);

    console.log(chalk.bold("GlideClaw 状态"));
    console.log(`- model: ${chalk.cyan(cfg.model)}`);
    console.log(`- windowDays: ${chalk.cyan(String(cfg.windowDays))}`);
    console.log(`- baseUrl: ${chalk.cyan(cfg.baseUrl)}`);
    console.log(`- dbPath: ${chalk.cyan(cfg.dbPath)}`);
    console.log(`- dbSize: ${chalk.cyan(String(size))} bytes`);
    console.log(`- messages: ${chalk.cyan(String(count))}`);
    console.log(`- context(est tokens): ${chalk.cyan(String(est))}`);
  } finally {
    memory.close();
  }
}

export async function cmdClear() {
  intro(chalk.bold("清空本地记录"));
  const ok = await confirm({
    message: "确认要清空所有本地对话记录吗？（不可恢复）",
    initialValue: false,
  });
  if (isCancel(ok)) return cancel("已取消");
  if (!ok) return outro("未执行清空");

  const cfg = await loadConfig();
  const memory = new MemoryStore({ dbPath: cfg.dbPath });
  try {
    memory.clearAll();
  } finally {
    memory.close();
  }
  outro("已清空");
}

export async function cmdResetDb() {
  intro(chalk.bold("重建本地数据库"));
  const ok = await confirm({
    message: "确认要删除并重建本地数据库文件吗？（不可恢复）",
    initialValue: false,
  });
  if (isCancel(ok)) return cancel("已取消");
  if (!ok) return outro("未执行重建");

  const cfg = await loadConfig();
  try {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(cfg.dbPath);
  } catch {
    // ignore if not exists
  }

  const memory = new MemoryStore({ dbPath: cfg.dbPath });
  memory.close();
  outro(`已重建数据库：${chalk.cyan(cfg.dbPath)}`);
}

export async function cmdChat() {
  const cfg = await loadConfig();
  const memory = new MemoryStore({ dbPath: cfg.dbPath });
  const meta = new MetaStore({ dbPath: cfg.dbPath });
  const assistantMgr = new AssistantManager(meta, cfg);
  
  intro(chalk.bold("GlideClaw Chat"));
  console.log(chalk.dim("输入 /exit 退出。"));

  try {
    // 获取默认助手配置
    const assistantConfig = assistantMgr.getDefaultAssistantConfig();
    if (!assistantConfig) {
      console.error(chalk.red("错误：无法加载助手配置"));
      return;
    }

    const agentId = assistantConfig.agent.id;
    const systemPrompt = assistantMgr.getSystemPrompt(agentId);

    while (true) {
      const input = await text({
        message: chalk.bold("你说"),
        placeholder: "输入内容…",
      });
      if (isCancel(input)) {
        cancel("已退出");
        break;
      }
      const q = String(input ?? "").trim();
      if (!q) continue;
      if (q === "/exit") {
        outro("再见");
        break;
      }

      // 处理文件操作：如果用户消息中包含文件操作指令，先执行文件操作
      let enrichedMessage = q;
      try {
        enrichedMessage = await enrichMessageWithFileContent(q);
      } catch (error) {
        console.warn(chalk.yellow("文件操作处理出错:"), error);
        // 继续使用原始消息
      }

      const history = memory.getContext(cfg.windowDays);
      // 构建消息：系统提示词 + 历史对话 + 当前输入
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: enrichedMessage },
      ];

      // 保存用户消息（保存原始消息，不包含文件操作结果）
      memory.saveMessage("user", q, { agentId });

      process.stdout.write(chalk.bold("AI") + chalk.dim(": "));
      let answer = "";
      try {
        answer = await streamChatToStdout(
          {
            apiKey: cfg.apiKey,
            baseUrl: cfg.baseUrl,
            model: cfg.model,
            maxTokens: cfg.maxTokens,
          },
          { messages },
        );
      } finally {
        process.stdout.write("\n");
      }

      // 保存AI响应
      memory.saveMessage("assistant", answer, { agentId });
    }
  } finally {
    memory.close();
    meta.close();
  }
}

export async function cmdWeb(argv: string[] = []) {
  intro(chalk.bold("启动 Web 管理界面"));

  try {
    const config = await loadConfig();
    
    // 动态导入 server.ts
    const { serve } = await import("bun");
    const { resolve } = await import("node:path");
    const { MetaStore } = await import("./core/meta");

    // 从参数中解析端口号，默认 8001
    let PORT = 8001;
    if (argv.length > 0 && argv[0]) {
      const portArg = argv[0];
      const parsedPort = Number.parseInt(portArg, 10);
      if (!Number.isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
        PORT = parsedPort;
      } else {
        console.warn(chalk.yellow(`⚠ 无效的端口号: ${portArg}，使用默认端口 8001`));
      }
    }

    // 获取 UI 文件的正确路径
    // 处理两种场景：
    // 1. 开发时：import.meta.dir 指向 src，UI 文件在 src/ui/
    // 2. npm 包：import.meta.dir 指向 dist，UI 文件在 ../src/ui/
    async function getUiPath(filename: string): Promise<string> {
      const { dirname } = await import("node:path");
      const currentDir = import.meta.dir;
      
      const searchPaths = [
        resolve(currentDir, `./ui/${filename}`),           // 开发时
        resolve(currentDir, `../src/ui/${filename}`),      // npm 包全局安装
        resolve(dirname(currentDir), `src/ui/${filename}`), // npm 包另一种情况
      ];
      
      for (const uiPath of searchPaths) {
        const file = Bun.file(uiPath);
        if (await file.exists()) {
          return uiPath;
        }
      }
      
      throw new Error(
        `无法找到 UI 文件: ${filename}\n` +
        `已搜索路径:\n${searchPaths.map((p) => `  - ${p}`).join("\n")}`
      );
    }

    async function loadHtmlPage(): Promise<string> {
      const htmlPath = await getUiPath("index.html");
      const htmlFile = Bun.file(htmlPath);
      return await htmlFile.text();
    }

    async function createMeta() {
      return new MetaStore({ dbPath: config.dbPath });
    }

    function jsonResponse(body: unknown, init?: ResponseInit): Response {
      return new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        ...init,
      });
    }

    function errorResponse(message: string, status = 400): Response {
      return jsonResponse({ error: message }, { status });
    }

    serve({
      port: PORT,
      fetch: async (req) => {
        const url = new URL(req.url);
        const { pathname } = url;

        if (req.method === "GET" && pathname === "/") {
          const html = await loadHtmlPage();
          return new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        // 服务静态文件 (CSS 和 JS)
        if (req.method === "GET" && (pathname.endsWith(".css") || pathname.endsWith(".js"))) {
          try {
            const filename = pathname.substring(1); // 移除前导 /
            const filePath = await getUiPath(filename);
            const file = Bun.file(filePath);
            const contentType = pathname.endsWith(".css") ? "text/css" : "application/javascript";
            return new Response(file, {
              headers: { "Content-Type": contentType + "; charset=utf-8" },
            });
          } catch {
            return new Response("Not Found", { status: 404 });
          }
        }

        if (pathname === "/api/tables" && req.method === "GET") {
          const meta = await createMeta();
          try {
            return jsonResponse({ tables: meta.listTables() });
          } finally {
            meta.close();
          }
        }

        const tableMatch = pathname.match(/^\/api\/table\/([^/]+)(?:\/([^/]+))?$/);
        if (tableMatch) {
          const rawTable = tableMatch[1] ?? "";
          const rawId = tableMatch[2] ?? "";
          const table = decodeURIComponent(rawTable) as any;
          const id = rawId ? decodeURIComponent(rawId) : undefined;

          const supportedTables = ["agents", "users", "souls", "identities", "heartbeats", "change_history", "messages", "config_history"];
          if (!supportedTables.includes(table)) {
            return errorResponse("不支持的表：" + table, 404);
          }

          const meta = await createMeta();
          try {
            if (req.method === "GET" && !id) {
              const rows = meta.getRows(table, 200);
              return jsonResponse({ rows });
            }

            if (req.method === "DELETE" && id) {
              meta.deleteRow(table, id);
              return jsonResponse({ ok: true });
            }

            const bodyText = await req.text();
            const payload = bodyText ? JSON.parse(bodyText) : {};

            if (req.method === "POST" && !id) {
              const newId = meta.insertRow(table, payload ?? {});
              return jsonResponse({ id: newId });
            }

            if (req.method === "PUT" && id) {
              meta.updateRow(table, id, payload ?? {});
              return jsonResponse({ ok: true });
            }

            return errorResponse("不支持的操作", 405);
          } catch (e: any) {
            return errorResponse(e?.message ?? String(e), 500);
          } finally {
            meta.close();
          }
        }

        if (pathname.startsWith("/api/export/") && req.method === "GET") {
          const table = decodeURIComponent(pathname.replace("/api/export/", "")) as any;
          const supportedTables = ["agents", "users", "souls", "identities", "heartbeats", "change_history", "messages", "config_history"];
          if (!supportedTables.includes(table)) {
            return errorResponse("不支持的表：" + table, 404);
          }
          const meta = await createMeta();
          try {
            const rows = meta.getRows(table, 10_000);
            return jsonResponse({ rows });
          } finally {
            meta.close();
          }
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    console.log(chalk.green(`✓ Web 管理界面启动成功！`));
    console.log(chalk.cyan(`✓ 打开浏览器访问: http://localhost:${PORT}`));
    console.log(chalk.dim(`✓ 数据库位置: ${config.dbPath}`));
    console.log(chalk.dim(`✓ 按 Ctrl+C 退出\n`));
  } catch (error) {
    console.error(chalk.red("启动失败:"), error);
    process.exit(1);
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  const [cmd, ...args] = argv;

  if (!cmd || cmd === "chat") return cmdChat();
  if (cmd === "web") return cmdWeb(args);
  if (cmd === "init") return cmdInit();
  if (cmd === "config") return cmdConfig();
  if (cmd === "status") return cmdStatus();
  if (cmd === "clear") return cmdClear();
  if (cmd === "reset-db") return cmdResetDb();
  if (cmd === "-h" || cmd === "--help" || cmd === "help") {
    usage();
    return;
  }

  console.log(chalk.red(`未知命令: ${cmd}`));
  usage();
}

