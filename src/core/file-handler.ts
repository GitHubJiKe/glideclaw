import type { FileCommand } from "../types/chat";
import { readFile, writeFile, listFiles, fileExists } from "../utils/file-utils";

/**
 * 文件命令处理器
 * 负责解析用户输入的文件操作命令
 * 执行文件读写操作
 */

/**
 * 用于识别文件操作的正则表达式
 */
const FILE_READ_REGEX = /(?:读取|打开|查看|显示)\s*(?:文件\s*)?[\"\']?([^\"\'\n]+?)[\"\']?(?:\s|$|。|!|？)/gi;
const FILE_WRITE_REGEX = /(?:写入|保存|创建)\s*(?:文件\s*)?[\"\']?([^\"\'\n]+?)[\"\']?(?:\s*(?:内容|为|是))?[\s\n]*([\s\S]*?)(?=$|读取|打开|写入|保存|创建)/gi;
const FILE_LIST_REGEX = /(?:列表|列出|查看)\s*(?:目录\s*)?[\"\']?([^\"\'\n]+?)[\"\']?(?:\s|$|。|!|？)/gi;

/**
 * 解析用户消息中的文件操作命令
 */
export function parseFileCommands(message: string): FileCommand[] {
  const commands: FileCommand[] = [];

  // 检测读取文件命令
  let match;
  while ((match = FILE_READ_REGEX.exec(message)) !== null) {
    const path = match[1]?.trim();
    if (path) {
      commands.push({
        type: "read",
        path,
      });
    }
  }

  // 检测列表目录命令
  while ((match = FILE_LIST_REGEX.exec(message)) !== null) {
    const path = match[1]?.trim();
    if (path) {
      commands.push({
        type: "list",
        path,
        limit: 50,
      });
    }
  }

  // 检测写入文件命令
  // 注：写入命令需要特殊处理，因为内容可能很长
  const writeMatch = message.match(
    /(?:写入|保存|创建)\s*(?:文件\s*)?[\"\']?([^\"\'\n]+?)[\"\']?(?:\s*(?:内容|为|是)\s+[\n]?)?[\s\n]*([\s\S]*?)$/i,
  );
  if (writeMatch && writeMatch[1] && writeMatch[2]) {
    commands.push({
      type: "write",
      path: writeMatch[1].trim(),
      content: writeMatch[2].trim(),
    });
  }

  return commands;
}

/**
 * 检查消息中是否包含文件操作意图
 */
export function hasFileOperation(message: string): boolean {
  const fileKeywords = [
    "读取",
    "打开",
    "查看",
    "显示",
    "写入",
    "保存",
    "创建",
    "列表",
    "列出",
    "文件",
    "目录",
  ];

  return fileKeywords.some((keyword) =>
    message.toLowerCase().includes(keyword),
  );
}

/**
 * 执行单个文件命令
 */
export async function executeFileCommand(
  command: FileCommand,
): Promise<string> {
  try {
    switch (command.type) {
      case "read": {
        const result = await readFile(command.path);
        if (result.success) {
          return `[文件内容] ${result.path}\n\n${result.data}`;
        } else {
          return `[错误] ${result.message}`;
        }
      }

      case "write": {
        const result = await writeFile(command.path, command.content);
        if (result.success) {
          return `[成功] ${result.message}`;
        } else {
          return `[错误] ${result.message}`;
        }
      }

      case "list": {
        const result = await listFiles(command.path, command.limit || 50);
        if (result.success) {
          const fileList = result.files
            ?.map((f) => {
              const sizeStr = f.size
                ? ` (${(f.size / 1024).toFixed(2)}KB)`
                : "";
              return `  ${f.type === "directory" ? "[目录]" : "[文件]"} ${f.name}${sizeStr}`;
            })
            .join("\n");

          return `[目录内容] ${command.path}\n\n${fileList || "目录为空"}`;
        } else {
          return `[错误] ${result.message}`;
        }
      }

      default:
        return "[错误] 未知的文件操作类型";
    }
  } catch (error) {
    return `[错误] 执行文件命令失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * 批量执行文件命令
 */
export async function executeFileCommands(
  commands: FileCommand[],
): Promise<string[]> {
  const results: string[] = [];

  for (const command of commands) {
    const result = await executeFileCommand(command);
    results.push(result);
  }

  return results;
}

/**
 * 在消息中处理文件操作并返回增强的消息
 * 如果检测到文件操作，先执行操作，然后将结果注入到消息中
 */
export async function enrichMessageWithFileContent(
  message: string,
): Promise<string> {
  if (!hasFileOperation(message)) {
    return message;
  }

  const commands = parseFileCommands(message);
  if (commands.length === 0) {
    return message;
  }

  const results = await executeFileCommands(commands);
  const resultsText = results.join("\n\n");

  return `${message}\n\n---\n[自动执行的文件操作结果]\n${resultsText}`;
}
