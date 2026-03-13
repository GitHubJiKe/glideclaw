// 获取DOM元素
const tableSelect = document.getElementById("tableSelect");
const rowsDiv = document.getElementById("rows");
const reloadBtn = document.getElementById("reloadBtn");
const exportBtn = document.getElementById("exportBtn");
const editor = document.getElementById("editor");
const createBtn = document.getElementById("createBtn");
const updateBtn = document.getElementById("updateBtn");
const updateIdInput = document.getElementById("updateId");
const message = document.getElementById("message");

/**
 * 显示消息提示
 */
function setMessage(text, kind = "info") {
  message.textContent = text || "";
  message.className = kind === "error" ? "message error" : kind === "success" ? "message success" : "message info";
  
  // 5秒后自动清除信息
  if (kind !== "error") {
    setTimeout(() => {
      message.textContent = "";
      message.className = "message";
    }, 5000);
  }
}

/**
 * API 请求辅助函数
 */
async function api(path, options = {}) {
  try {
    const resp = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const text = await resp.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!resp.ok) {
      throw new Error(data && data.error ? data.error : text || "请求失败");
    }
    return data;
  } catch (e) {
    throw new Error(e.message || String(e));
  }
}

/**
 * 加载所有表列表
 */
async function loadTables() {
  try {
    const data = await api("/api/tables");
    tableSelect.innerHTML = "";
    (data.tables || []).forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      tableSelect.appendChild(opt);
    });
    if (data.tables && data.tables.length > 0) {
      tableSelect.value = data.tables[0];
      await loadRows();
    }
  } catch (e) {
    setMessage(e.message || String(e), "error");
  }
}

/**
 * 加载表数据并渲染
 */
async function loadRows() {
  const table = tableSelect.value;
  if (!table) return;
  
  rowsDiv.innerHTML = '<div class="empty-state"><span class="spinner"></span> 加载中...</div>';
  
  try {
    const data = await api("/api/table/" + encodeURIComponent(table));
    const rows = data.rows || [];
    
    if (!rows.length) {
      rowsDiv.innerHTML = '<div class="empty-state"><p>此表中没有数据</p></div>';
      setMessage("已加载 0 行", "success");
      return;
    }
    
    renderTable(table, rows);
    setMessage(`已加载 ${rows.length} 行`, "success");
  } catch (e) {
    rowsDiv.innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p></div>`;
    setMessage(e.message || String(e), "error");
  }
}

/**
 * 渲染表格
 */
function renderTable(table, rows) {
  // 为messages和config_history表提供特殊的展示方式
  if (table === "messages") {
    renderMessagesTable(rows);
  } else if (table === "config_history") {
    renderConfigHistoryTable(rows);
  } else {
    renderGenericTable(table, rows);
  }
}

/**
 * 渲染消息表 - 以卡片形式展示对话内容
 */
function renderMessagesTable(rows) {
  const cols = Object.keys(rows[0]);
  const thead = `<thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}<th>操作</th></tr></thead>`;
  
  const tbody = `<tbody>${rows
    .map((r) => {
      const contentPreview = String(r.content ?? "").substring(0, 100) + (String(r.content ?? "").length > 100 ? "..." : "");
      const cells = cols.map((c) => {
        if (c === "content") {
          return `<td><div class="content-preview" title="${escapeHtml(String(r[c] ?? ""))}">${escapeHtml(contentPreview)}</div></td>`;
        }
        return `<td>${escapeHtml(String(r[c] ?? ""))}</td>`;
      }).join("");
      const id = r.id ?? "";
      const rowJson = encodeURIComponent(JSON.stringify(r));
      const actions = `<td class="row-actions"><button class="btn btn-warning editBtn" data-id="${escapeHtml(id)}" data-row="${rowJson}">编辑</button><button class="btn btn-danger deleteBtn" data-id="${escapeHtml(id)}">删除</button></td>`;
      return `<tr>${cells}${actions}</tr>`;
    })
    .join("")}</tbody>`;
  
  rowsDiv.innerHTML = `<table>${thead}${tbody}</table>`;
  attachRowActions("messages");
}

/**
 * 渲染配置历史表 - 展示配置变更记录
 */
function renderConfigHistoryTable(rows) {
  const cols = Object.keys(rows[0]);
  const thead = `<thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}<th>操作</th></tr></thead>`;
  
  const tbody = `<tbody>${rows
    .map((r) => {
      const oldValuePreview = r.old_value ? String(r.old_value).substring(0, 50) : "(无)";
      const newValuePreview = r.new_value ? String(r.new_value).substring(0, 50) : "(无)";
      
      const cells = cols.map((c) => {
        if (c === "old_value") {
          return `<td><div class="content-preview" title="${escapeHtml(String(r[c] ?? ""))}">${escapeHtml(oldValuePreview)}</div></td>`;
        } else if (c === "new_value") {
          return `<td><div class="content-preview" title="${escapeHtml(String(r[c] ?? ""))}">${escapeHtml(newValuePreview)}</div></td>`;
        }
        return `<td>${escapeHtml(String(r[c] ?? ""))}</td>`;
      }).join("");
      const id = r.id ?? "";
      const rowJson = encodeURIComponent(JSON.stringify(r));
      const actions = `<td class="row-actions"><button class="btn btn-warning editBtn" data-id="${escapeHtml(id)}" data-row="${rowJson}">编辑</button><button class="btn btn-danger deleteBtn" data-id="${escapeHtml(id)}">删除</button></td>`;
      return `<tr>${cells}${actions}</tr>`;
    })
    .join("")}</tbody>`;
  
  rowsDiv.innerHTML = `<table>${thead}${tbody}</table>`;
  attachRowActions("config_history");
}

/**
 * 渲染通用表格
 */
function renderGenericTable(table, rows) {
  const cols = Object.keys(rows[0]);
  const thead = `<thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}<th>操作</th></tr></thead>`;
  
  const tbody = `<tbody>${rows
    .map((r) => {
      const cells = cols.map((c) => `<td>${escapeHtml(String(r[c] ?? ""))}</td>`).join("");
      const id = r.id ?? "";
      const rowJson = encodeURIComponent(JSON.stringify(r));
      const actions = `<td class="row-actions"><button class="btn btn-warning editBtn" data-id="${escapeHtml(id)}" data-row="${rowJson}">编辑</button><button class="btn btn-danger deleteBtn" data-id="${escapeHtml(id)}">删除</button></td>`;
      return `<tr>${cells}${actions}</tr>`;
    })
    .join("")}</tbody>`;
  
  rowsDiv.innerHTML = `<table>${thead}${tbody}</table>`;
  
  // 绑定编辑和删除按钮
  attachRowActions(table);
}

/**
 * 绑定行操作按钮
 */
function attachRowActions(table) {
  rowsDiv.querySelectorAll(".editBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rowStr = decodeURIComponent(btn.getAttribute("data-row") || "");
      editor.value = rowStr;
      try {
        const obj = JSON.parse(rowStr);
        if (obj.id) {
          updateIdInput.value = obj.id;
        }
      } catch {}
      // 滚动到编辑区域
      document.querySelector(".sidebar").scrollIntoView({ behavior: "smooth" });
    });
  });

  rowsDiv.querySelectorAll(".deleteBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      if (!id) return;
      if (!confirm("确认删除该行？此操作不可撤销。")) return;
      try {
        await api("/api/table/" + encodeURIComponent(table) + "/" + encodeURIComponent(id), {
          method: "DELETE",
        });
        setMessage("已删除一行", "success");
        await loadRows();
      } catch (e) {
        setMessage(e.message || String(e), "error");
      }
    });
  });
}

/**
 * HTML转义
 */
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * 新增行
 */
createBtn.addEventListener("click", async () => {
  const table = tableSelect.value;
  if (!table) return;
  
  let obj;
  try {
    obj = JSON.parse(editor.value || "{}");
  } catch (e) {
    setMessage(`JSON 解析失败: ${e.message}`, "error");
    return;
  }
  
  try {
    createBtn.disabled = true;
    createBtn.textContent = "新增中...";
    await api("/api/table/" + encodeURIComponent(table), {
      method: "POST",
      body: JSON.stringify(obj),
    });
    setMessage("新增成功", "success");
    editor.value = "";
    await loadRows();
  } catch (e) {
    setMessage(e.message || String(e), "error");
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = "新增";
  }
});

/**
 * 更新行
 */
updateBtn.addEventListener("click", async () => {
  const table = tableSelect.value;
  const id = updateIdInput.value.trim();
  
  if (!table || !id) {
    setMessage("请输入要更新的行 ID", "error");
    return;
  }
  
  let obj;
  try {
    obj = JSON.parse(editor.value || "{}");
  } catch (e) {
    setMessage(`JSON 解析失败: ${e.message}`, "error");
    return;
  }
  
  try {
    updateBtn.disabled = true;
    updateBtn.textContent = "更新中...";
    await api("/api/table/" + encodeURIComponent(table) + "/" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify(obj),
    });
    setMessage("更新成功", "success");
    editor.value = "";
    updateIdInput.value = "";
    await loadRows();
  } catch (e) {
    setMessage(e.message || String(e), "error");
  } finally {
    updateBtn.disabled = false;
    updateBtn.textContent = "更新";
  }
});

/**
 * 导出 JSON
 */
exportBtn.addEventListener("click", async () => {
  const table = tableSelect.value;
  if (!table) return;
  
  try {
    exportBtn.disabled = true;
    exportBtn.textContent = "导出中...";
    const data = await api("/api/export/" + encodeURIComponent(table));
    const blob = new Blob([JSON.stringify(data.rows || [], null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`已导出 ${table}.json`, "success");
  } catch (e) {
    setMessage(e.message || String(e), "error");
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = "导出 JSON";
  }
});

/**
 * 事件监听
 */
reloadBtn.addEventListener("click", loadRows);
tableSelect.addEventListener("change", loadRows);

// 初始化
loadTables();
