import type { MetaStore } from "./meta";
import { HeartbeatManager } from "./heartbeat";
import type { AppConfig } from "./config";

export interface AssistantContext {
  agentId: string;
  userId: string;
  soulId?: string;
  identityId?: string;
}

export interface AssistantConfig {
  agent: any;
  user: any;
  soul?: any;
  identity?: any;
  config: AppConfig;
}

/**
 * 助手配置管理器
 * 负责从数据库加载和管理助手配置，集成各个表的信息
 */
export class AssistantManager {
  private heartbeatManager: HeartbeatManager;
  private currentContext?: AssistantContext;

  constructor(private meta: MetaStore, private config: AppConfig) {
    this.heartbeatManager = new HeartbeatManager(meta);
  }

  /**
   * 初始化助手配置
   */
  async initialize() {
    await this.heartbeatManager.startAll();
    console.log("[Assistant] 助手管理器已初始化");
  }

  /**
   * 获取默认的助手配置
   */
  getDefaultAssistantConfig(): AssistantConfig | null {
    try {
      const defaultAgent = this.meta.getRowById("agents", "glideclaw-default");
      if (!defaultAgent) return null;

      const soul = this.meta
        .getRows("souls", 1)
        .find((s: any) => s.assistant_id === defaultAgent.id);
      const identity = this.meta
        .getRows("identities", 1)
        .find((i: any) => i.assistant_id === defaultAgent.id);
      const user = this.meta.getRowById("users", "local-user");

      return {
        agent: defaultAgent,
        soul,
        identity,
        user,
        config: this.config,
      };
    } catch (error) {
      console.error("[Assistant] 获取默认配置失败:", error);
      return null;
    }
  }

  /**
   * 获取指定助手的完整配置
   */
  getAssistantConfig(assistantId: string): AssistantConfig | null {
    try {
      const agent = this.meta.getRowById("agents", assistantId);
      if (!agent) return null;

      const souls = this.meta.getRows("souls", 100) as any[];
      const soul = souls.find((s) => s.assistant_id === assistantId);

      const identities = this.meta.getRows("identities", 100) as any[];
      const identity = identities.find((i) => i.assistant_id === assistantId);

      const users = this.meta.getRows("users", 100) as any[];
      const user = users[0] ?? null;

      return {
        agent,
        soul,
        identity,
        user,
        config: this.config,
      };
    } catch (error) {
      console.error(`[Assistant] 获取助手 ${assistantId} 的配置失败:`, error);
      return null;
    }
  }

  /**
   * 获取助手的系统提示词
   */
  getSystemPrompt(assistantId: string): string {
    const config = this.getAssistantConfig(assistantId);
    if (!config || !config.soul) {
      return this.getDefaultSystemPrompt();
    }

    const soul = config.soul;
    let prompt = soul.prompt || "你是一个有用的AI助手。";

    // 添加用户信息
    if (config.user) {
      prompt += `\n\n用户信息：`;
      if (config.user.name) {
        prompt += `\n用户名：${config.user.name}`;
      }
      if (config.user.email) {
        prompt += `\n邮箱：${config.user.email}`;
      }
    }

    // 如果有身份设置，添加到提示词中
    if (config.identity) {
      prompt += `\n\n身份设置：${config.identity.name}`;
      if (config.identity.description) {
        prompt += `\n描述：${config.identity.description}`;
      }
    }

    // 添加文件操作功能说明
    prompt += this.getFileOperationGuidance();

    return prompt;
  }

  /**
   * 获取默认系统提示词
   */
  private getDefaultSystemPrompt(): string {
    return "你是一个有用的AI助手。" + this.getFileOperationGuidance();
  }

  /**
   * 获取文件操作功能说明
   */
  private getFileOperationGuidance(): string {
    return `

## 本地文件操作能力

你具备以下文件操作能力，可以根据用户需求使用：

### 1. 读取文件
- 用法："读取文件 /path/to/file"、"打开 /path/to/file"、"查看 /path/to/file"
- 示例：用户说"读取我主目录下的 .zshrc 文件"，你可以请求读取该文件
- 支持格式：.txt, .md, .json, .js, .ts, .tsx, .jsx, .css, .html, .xml, .yaml, .yml, .toml, .ini, .csv, .sql, .py, .log 等文本文件
- 限制：最大读取 10MB 的文件

### 2. 写入文件
- 用法："写入文件 /path/to/file 内容为 [内容文本]"、"保存到 /path/to/file [内容]"
- 示例：用户要求写入配置文件或代码文件时，你先生成内容，然后请求写入
- 支持格式：.txt, .md, .json, .js, .ts, .tsx, .jsx, .css, .html, .xml, .yaml, .yml, .toml, .ini, .csv, .sql, .py 等

### 3. 列表目录
- 用法："列出目录 /path/to/dir"、"查看 /path/to/dir 中的文件"
- 示例：用户说"列出我主目录下的所有文件"，你可以请求列出该目录

### 文件操作指导原则
- 当用户提到读取某个文件时，自动提出读取该文件的请求
- 当用户要求创建或修改文件时，先生成完整的文件内容，然后请求写入
- 始终遵守安全限制，不访问系统关键目录（/System, /Library, /Applications 等）
- 仅支持相对安全的文件类型操作
- 如果用户路径不是绝对路径，请提醒用户提供完整路径

### 返回格式
当文件操作执行完后，你会在消息中看到格式如：[文件内容] 或 [成功] 的标记，这表示操作已完成。`;
  }

  /**
   * 获取所有助手列表
   */
  getAllAssistants() {
    const agents = this.meta.getRows("agents", 100) as any[];
    return agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      createdAt: agent.created_at,
    }));
  }

  /**
   * 获取心跳管理器
   */
  getHeartbeatManager(): HeartbeatManager {
    return this.heartbeatManager;
  }

  /**
   * 获取助手统计信息
   */
  getStats() {
    const agents = this.meta.getRows("agents", 100);
    const souls = this.meta.getRows("souls", 100);
    const identities = this.meta.getRows("identities", 100);
    const users = this.meta.getRows("users", 100);
    const heartbeats = this.meta.getRows("heartbeats", 100);

    return {
      agents: agents.length,
      souls: souls.length,
      identities: identities.length,
      users: users.length,
      heartbeats: heartbeats.length,
      heartbeatStats: this.heartbeatManager.getStats(),
    };
  }

  /**
   * 创建新的助手
   */
  createAssistant(
    name: string,
    description?: string,
  ): {
    agentId: string;
    soulId: string;
  } {
    const agentId = crypto.randomUUID();
    this.meta.insertRow("agents", {
      id: agentId,
      name,
      description: description ?? "",
    });

    const soulId = crypto.randomUUID();
    this.meta.insertRow("souls", {
      id: soulId,
      assistant_id: agentId,
      version: "v1",
      prompt: `你是 ${name}，${description ?? "一个有用的AI助手"}。`,
    });

    return { agentId, soulId };
  }

  /**
   * 添加身份到助手
   */
  addIdentity(
    assistantId: string,
    name: string,
    description?: string,
  ): string {
    const identityId = crypto.randomUUID();
    this.meta.insertRow("identities", {
      id: identityId,
      assistant_id: assistantId,
      name,
      description: description ?? "",
    });
    return identityId;
  }

  /**
   * 添加心跳任务到助手
   */
  addHeartbeat(
    assistantId: string,
    eventType: string,
    description?: string,
    cronExpression?: string,
  ): string {
    const heartbeatId = crypto.randomUUID();
    this.meta.insertRow("heartbeats", {
      id: heartbeatId,
      assistant_id: assistantId,
      event_type: eventType,
      description: description ?? "",
      cron_expression: cronExpression ?? "0 * * * *",
      enabled: 1,
    });
    return heartbeatId;
  }

  /**
   * 清理资源
   */
  async cleanup() {
    this.heartbeatManager.stopAll();
    console.log("[Assistant] 助手管理器已清理");
  }
}
