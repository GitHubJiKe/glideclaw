import { serve } from "bun";
import { resolve } from "node:path";
import { loadConfig } from "./core/config";
import { MetaStore, type MetaTableName } from "./core/meta";

const PORT = 8001;

async function loadHtmlPage(): Promise<string> {
  const htmlPath = resolve(import.meta.dir, "./ui/index.html");
  const htmlFile = Bun.file(htmlPath);
  return await htmlFile.text();
}

async function createMeta(): Promise<MetaStore> {
  const cfg = await loadConfig();
  return new MetaStore({ dbPath: cfg.dbPath });
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
      const filePath = resolve(import.meta.dir, "./ui" + pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const contentType = pathname.endsWith(".css") ? "text/css" : "application/javascript";
        return new Response(file, {
          headers: { "Content-Type": contentType + "; charset=utf-8" },
        });
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
      const table = decodeURIComponent(rawTable) as MetaTableName;
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
      const table = decodeURIComponent(pathname.replace("/api/export/", "")) as MetaTableName;
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

