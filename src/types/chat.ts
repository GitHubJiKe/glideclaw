export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/**
 * 文件操作命令
 * 用于在对话中嵌入文件操作指令
 */
export type FileCommand = 
  | {
      type: "read";
      path: string;
    }
  | {
      type: "write";
      path: string;
      content: string;
    }
  | {
      type: "list";
      path: string;
      limit?: number;
    };

/**
 * 扩展的聊天消息，可能包含文件操作
 */
export type ExtendedChatMessage = ChatMessage & {
  fileOperation?: FileCommand;
};

