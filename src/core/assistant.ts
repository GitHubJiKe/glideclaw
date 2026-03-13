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
      return "你是一个有用的AI助手。";
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

    return prompt;
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
