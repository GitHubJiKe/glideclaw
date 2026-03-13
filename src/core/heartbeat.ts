import { Database } from "bun:sqlite";
import type { MetaStore } from "./meta";

export interface HeartbeatEvent {
  id: string;
  assistant_id: string;
  event_type: string;
  description?: string;
  cron_expression?: string;
  enabled: number;
  last_run_at?: string;
  next_run_at?: string;
  created_at: string;
}

export interface HeartbeatHandler {
  eventType: string;
  handler: (meta: MetaStore, assistantId: string) => Promise<void>;
}

/**
 * 心跳任务管理器
 * 负责处理定时任务和事件触发
 */
export class HeartbeatManager {
  private handlers: Map<string, HeartbeatHandler> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private meta: MetaStore) {
    this.registerDefaultHandlers();
  }

  /**
   * 注册默认的心跳事件处理器
   */
  private registerDefaultHandlers() {
    // 日常内存清理
    this.registerHandler({
      eventType: "daily_memory_cleanup",
      handler: async (meta, _assistantId) => {
        // 这里可以调用 MemoryStore 进行清理
        console.log("[Heartbeat] 执行日常内存清理");
      },
    });

    // 每小时检查上下文
    this.registerHandler({
      eventType: "hourly_context_check",
      handler: async (meta, _assistantId) => {
        // 这里可以检查上下文使用情况
        console.log("[Heartbeat] 检查上下文使用情况");
      },
    });
  }

  /**
   * 注册自定义心跳事件处理器
   */
  registerHandler(handler: HeartbeatHandler) {
    this.handlers.set(handler.eventType, handler);
  }

  /**
   * 获取所有已注册的事件类型
   */
  getRegisteredEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * 触发心跳事件
   */
  async trigger(eventType: string, heartbeatId: string, assistantId: string) {
    const handler = this.handlers.get(eventType);
    if (!handler) {
      console.warn(`[Heartbeat] 未找到事件处理器: ${eventType}`);
      return;
    }

    try {
      await handler.handler(this.meta, assistantId);
      this.updateHeartbeatTimestamp(heartbeatId, "last_run_at");
      console.log(`[Heartbeat] 事件 ${eventType} 执行成功`);
    } catch (error) {
      console.error(`[Heartbeat] 事件 ${eventType} 执行失败:`, error);
    }
  }

  /**
   * 更新心跳的时间戳
   */
  private updateHeartbeatTimestamp(heartbeatId: string, field: "last_run_at" | "next_run_at") {
    const now = new Date().toISOString().split("T").join(" ").split(".")[0];
    this.meta.updateRow("heartbeats", heartbeatId, {
      [field]: now,
    });
  }

  /**
   * 启动所有启用的心跳任务
   * 注意：这是一个简化的实现，真实场景中应该使用成熟的 cron 库
   */
  async startAll() {
    const heartbeats = this.meta.getRows("heartbeats") as HeartbeatEvent[];
    for (const hb of heartbeats) {
      if (hb.enabled) {
        this.scheduleHeartbeat(hb);
      }
    }
    console.log(`[Heartbeat] 已启动 ${heartbeats.filter((h) => h.enabled).length} 个心跳任务`);
  }

  /**
   * 调度单个心跳任务
   * 简化实现：按秒数间隔运行
   */
  private scheduleHeartbeat(hb: HeartbeatEvent) {
    // 为了演示，这里简化为每分钟检查一次
    // 在生产环境中应使用 cron 库如 node-cron
    const intervalMs = 60 * 1000; // 1分钟

    const timer = setInterval(async () => {
      await this.trigger(hb.event_type, hb.id, hb.assistant_id);
    }, intervalMs);

    this.timers.set(hb.id, timer);
  }

  /**
   * 停止所有心跳任务
   */
  stopAll() {
    for (const [id, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
    console.log("[Heartbeat] 所有心跳任务已停止");
  }

  /**
   * 获取心跳统计信息
   */
  getStats() {
    const heartbeats = this.meta.getRows("heartbeats") as HeartbeatEvent[];
    const enabled = heartbeats.filter((h) => h.enabled).length;
    const disabled = heartbeats.length - enabled;

    return {
      total: heartbeats.length,
      enabled,
      disabled,
      registeredHandlers: this.getRegisteredEventTypes(),
      activeTimers: this.timers.size,
    };
  }
}
