import { resolve, extname, dirname } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";

/**
 * 文件操作工具
 * 支持：
 * 1. 读取本地文件
 * 2. 写入本地文件
 * 3. 文件扫描和验证
 */

export interface FileOperationResult {
  success: boolean;
  message: string;
  data?: string | null;
  type?: "read" | "write";
  path?: string;
}

/**
 * 安全的文件路径验证
 * 防止路径遍历攻击
 */
function validateFilePath(filePath: string): { valid: boolean; error?: string } {
  const normalized = resolve(filePath);
  
  // 防止使用非绝对路径或包含 .. 的相对路径
  if (!normalized.startsWith("/")) {
    return { valid: false, error: "只支持绝对路径" };
  }

  // 防止访问系统关键目录
  const restrictedDirs = ["/System", "/Library/", "/Applications", "/etc", "/var/db"];
  if (restrictedDirs.some((dir) => normalized.startsWith(dir))) {
    return { valid: false, error: "禁止访问系统关键目录" };
  }

  return { valid: true };
}

/**
 * 检查文件是否可读（支持的文件类型）
 */
function isReadableFileType(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  const readableExtensions = [
    ".txt",
    ".md",
    ".json",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".css",
    ".html",
    ".xml",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".csv",
    ".sql",
    ".py",
    ".java",
    ".go",
    ".rs",
    ".cpp",
    ".c",
    ".h",
    ".sh",
    ".bash",
    ".zsh",
    ".env",
    ".log",
  ];

  return readableExtensions.includes(ext) || ext === "";
}

/**
 * 检查文件是否可写（支持的文件类型）
 */
function isWritableFileType(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  const writableExtensions = [
    ".txt",
    ".md",
    ".json",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".css",
    ".html",
    ".xml",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".csv",
    ".sql",
    ".py",
    ".java",
    ".go",
    ".rs",
    ".cpp",
    ".c",
    ".h",
    ".sh",
    ".bash",
    ".zsh",
    ".env",
  ];

  return writableExtensions.includes(ext) || ext === "";
}

/**
 * 读取文件内容
 * @param filePath - 文件的完整路径
 * @returns 文件操作结果
 */
export async function readFile(
  filePath: string,
): Promise<FileOperationResult> {
  try {
    // 验证路径
    const validation = validateFilePath(filePath);
    if (!validation.valid) {
      return {
        success: false,
        message: `路径验证失败: ${validation.error}`,
        type: "read",
      };
    }

    // 检查文件类型是否支持
    if (!isReadableFileType(filePath)) {
      return {
        success: false,
        message: `不支持读取该文件类型: ${extname(filePath)}`,
        type: "read",
      };
    }

    // 检查文件是否存在
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return {
        success: false,
        message: `文件不存在: ${filePath}`,
        type: "read",
        path: filePath,
      };
    }

    // 获取文件大小，限制最大读取 10MB
    const size = file.size;
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (size > maxSize) {
      return {
        success: false,
        message: `文件过大（${(size / 1024 / 1024).toFixed(2)}MB），最大限制 10MB`,
        type: "read",
        path: filePath,
      };
    }

    // 读取文件内容
    const content = await file.text();

    return {
      success: true,
      message: `成功读取文件: ${filePath} (${(size / 1024).toFixed(2)}KB)`,
      data: content,
      type: "read",
      path: filePath,
    };
  } catch (error) {
    return {
      success: false,
      message: `读取文件出错: ${error instanceof Error ? error.message : String(error)}`,
      type: "read",
      path: filePath,
    };
  }
}

/**
 * 写入文件内容
 * @param filePath - 文件的完整路径
 * @param content - 要写入的内容
 * @returns 文件操作结果
 */
export async function writeFile(
  filePath: string,
  content: string,
): Promise<FileOperationResult> {
  try {
    // 验证路径
    const validation = validateFilePath(filePath);
    if (!validation.valid) {
      return {
        success: false,
        message: `路径验证失败: ${validation.error}`,
        type: "write",
      };
    }

    // 检查文件类型是否支持
    if (!isWritableFileType(filePath)) {
      return {
        success: false,
        message: `不支持写入该文件类型: ${extname(filePath)}`,
        type: "write",
      };
    }

    // 确保目录存在
    const dir = dirname(filePath);
    await Bun.write(filePath, content);

    const size = content.length;
    return {
      success: true,
      message: `成功写入文件: ${filePath} (${(size / 1024).toFixed(2)}KB)`,
      type: "write",
      path: filePath,
    };
  } catch (error) {
    return {
      success: false,
      message: `写入文件出错: ${error instanceof Error ? error.message : String(error)}`,
      type: "write",
      path: filePath,
    };
  }
}

/**
 * 扫描并列出目录中的文件（非递归）
 * @param dirPath - 目录路径
 * @param limit - 最多返回的文件数
 * @returns 文件列表或错误信息
 */
export async function listFiles(
  dirPath: string,
  limit: number = 100,
): Promise<{
  success: boolean;
  message: string;
  files?: Array<{ name: string; type: "file" | "directory"; size?: number }>;
}> {
  try {
    // 验证路径
    const validation = validateFilePath(dirPath);
    if (!validation.valid) {
      return {
        success: false,
        message: `路径验证失败: ${validation.error}`,
      };
    }

    // 检查目录是否存在
    const dir = Bun.file(dirPath);
    if (!(await dir.exists())) {
      return {
        success: false,
        message: `目录不存在: ${dirPath}`,
      };
    }

    // 读取目录内容
    const files: Array<{ name: string; type: "file" | "directory"; size?: number }> = [];
    const entries = readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (files.length >= limit) break;
      
      try {
        files.push({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
          size: entry.isDirectory() ? undefined : statSync(resolve(dirPath, entry.name)).size,
        });
      } catch {
        // 跳过无法访问的文件
      }
    }

    return {
      success: true,
      message: `成功扫描目录: ${dirPath}（共 ${files.length} 项）`,
      files,
    };
  } catch (error) {
    return {
      success: false,
      message: `扫描目录出错: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 检查文件是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const validation = validateFilePath(filePath);
    if (!validation.valid) return false;

    const file = Bun.file(filePath);
    return await file.exists();
  } catch {
    return false;
  }
}

/**
 * 获取文件信息
 */
export async function getFileInfo(filePath: string): Promise<{
  exists: boolean;
  size?: number;
  isDirectory?: boolean;
  extension?: string;
} | null> {
  try {
    const validation = validateFilePath(filePath);
    if (!validation.valid) return null;

    if (!existsSync(filePath)) {
      return { exists: false };
    }

    const stat = statSync(filePath);
    const extension = extname(filePath);

    return {
      exists: true,
      size: stat.size,
      isDirectory: stat.isDirectory(),
      extension,
    };
  } catch {
    return null;
  }
}
