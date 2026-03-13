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
import { streamChatToStdout } from "./core/llm";
import type { ChatMessage } from "./types/chat";
import { estimateTokensFromMessages } from "./utils/tokens";

function usage() {
  console.log(
    [
      "用法:",
      "  glideclaw                 进入对话（同 chat）",
      "  glideclaw chat            循环对话模式",
      "  glideclaw init            初始化写入 ~/.glideclawrc",
      "  glideclaw config          修改记忆天数（1-30）",
      "  glideclaw status          查看状态（db 大小、窗口天数等）",
      "  glideclaw clear           清空本地对话记录",
      "  glideclaw reset-db        删除并重建本地数据库文件",
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
    await Bun.write(Bun.file(cfg.dbPath), ""); // ensure path writable if needed
  } catch {
    // ignore
  }
  try {
    await Bun.remove(cfg.dbPath);
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
  intro(chalk.bold("GlideClaw Chat"));
  console.log(chalk.dim("输入 /exit 退出。"));

  try {
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

      const history = memory.getContext(cfg.windowDays);
      const messages: ChatMessage[] = [...history, { role: "user", content: q }];

      memory.saveMessage("user", q);

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

      memory.saveMessage("assistant", answer);
    }
  } finally {
    memory.close();
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  const [cmd] = argv;

  if (!cmd || cmd === "chat") return cmdChat();
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

