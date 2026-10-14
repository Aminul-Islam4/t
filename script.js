// ---------- Data (saved in this browser's localStorage) ----------
const KEY = "tender-manager-data";
const EMPTY = () => ({ tenders: [], products: [], suppliers: [], lines: [], docs: [], company: "" });
let db = load();

function load() {
  try { return Object.assign(EMPTY(), JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { return EMPTY(); }
}
const save = () => localStorage.setItem(KEY, JSON.stringify(db));

// ---------- Helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmtDate = v => v ? new Date(v).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
const money = n => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const badge = s => `<span class="status ${esc(s)}">${esc(s)}</span>`;
const byId = (list, id) => db[list].find(x => x.id === id);
const STATUSES = ["active", "submitted", "won", "lost", "cancelled"];
const DOC_TYPES = ["Tender document", "Requirements", "Certificate", "Quotation", "Other"];

// ---------- Pages (add an entry to add a simple list page) ----------
const entities = {
  tenders: {
    title: "Tenders", singular: "tender", detail: "tender",
    fields: [
      { key: "tender_number", label: "Tender number", required: true },
      { key: "organization", label: "Organization", required: true },
      { key: "deadline", label: "Deadline", type: "datetime-local" },
      { key: "status", label: "Status", type: "select", options: STATUSES, required: true, default: "active" },
      { key: "link", label: "Document link (Google Drive, etc.)", type: "url" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    columns: ["tender_number", "organization", "deadline", "status"],
  },
  products: {
    title: "Products", singular: "product",
    fields: [
      { key: "name", label: "Product name", required: true },
      { key: "category", label: "Category" },
      { key: "brand", label: "Brand" },
      { key: "unit", label: "Unit (pcs, kg, box...)" },
      { key: "specs", label: "Specifications", type: "textarea" },
    ],
    columns: ["name", "category", "brand", "unit"],
  },
  suppliers: {
    title: "Suppliers", singular: "supplier",
    fields: [
      { key: "name", label: "Supplier name", required: true },
      { key: "contact_person", label: "Contact person" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email", type: "email" },
      { key: "address", label: "Address", type: "textarea" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    columns: ["name", "contact_person", "phone", "email"],
  },
};

// ---------- Router ----------
window.addEventListener("hashchange", route);

function route() {
  renderAlert();
  const [page, id] = (location.hash.slice(1) || "dashboard").split("/");
  const navKey = page === "tender" ? "tenders" : page;
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + navKey));
  if (page === "tender" && id) return renderTender(id);
  if (page === "reports") return renderReports();
  if (entities[page]) return renderList(page);
  renderDashboard();
}

// ---------- Dashboard ----------
function renderDashboard() {
  const count = s => db.tenders.filter(t => t.status === s).length;
  const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  const soon = d => new Date(d) - Date.now() < 3 * 86400000;
  const upcoming = db.tenders.filter(t => t.status === "active" && t.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).slice(0, 6);

  $("#content").innerHTML = `
    <h1>Dashboard</h1>
    <div class="stats">
      ${stat(count("active"), "Active tenders")}${stat(count("submitted"), "Submitted")}${stat(count("won"), "Won")}${stat(count("lost"), "Lost")}
      ${stat(db.products.length, "Products")}${stat(db.suppliers.length, "Suppliers")}
    </div>
    <h2>Active tenders by deadline</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Tender</th><th>Organization</th><th>Deadline</th></tr></thead>
      <tbody>${upcoming.length ? upcoming.map(t => `<tr>
        <td><a href="#tender/${t.id}">${esc(t.tender_number)}</a></td><td>${esc(t.organization)}</td>
        <td class="${soon(t.deadline) ? "warn-text" : ""}">${fmtDate(t.deadline)}${new Date(t.deadline) < Date.now() ? " (passed)" : soon(t.deadline) ? " (within 3 days)" : ""}</td></tr>`).join("")
        : `<tr><td colspan="3" class="empty">No active tenders with a deadline.</td></tr>`}</tbody>
    </table></div>

    <div class="section-head"><h2>Backup</h2></div>
    <p class="muted">Your data is saved in this browser only. Download a backup regularly, and use it to move your data to another device. Uploaded files stay in this browser and are not part of the backup.</p>
    <div class="backup">
      <button class="btn primary" id="export">Download backup</button>
      <label class="btn" for="import">Restore from backup</label>
      <input type="file" id="import" accept="application/json">
    </div>`;

  $("#export").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }));
    a.download = `tender-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $("#import").onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!["tenders", "products", "suppliers", "lines"].every(k => Array.isArray(data[k]))) throw new Error();
      if (!confirm("Replace all current data with this backup?")) return;
      data.docs = data.docs || []; data.company = data.company || ""; db = data; save(); route();
    } catch { alert("That file is not a valid Tender Manager backup."); }
  };
}

// ---------- List pages ----------
function renderList(key) {
  const cfg = entities[key];
  const fieldOf = k => cfg.fields.find(f => f.key === k);
  const label = k => fieldOf(k).label.replace(/ \(.*\)/, "");

  $("#content").innerHTML = `
    <h1>${cfg.title}</h1>
    <div class="toolbar">
      <input type="search" id="search" placeholder="Search ${cfg.title.toLowerCase()}" aria-label="Search ${cfg.title.toLowerCase()}">
      ${key === "tenders" ? `<select id="status-filter" aria-label="Filter by status"><option value="">All statuses</option>${STATUSES.map(s => `<option>${s}</option>`).join("")}</select>` : ""}
      <span class="spacer"></span>
      <button class="btn primary" id="add">Add ${cfg.singular}</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>${cfg.columns.map(c => `<th>${esc(label(c))}</th>`).join("")}<th></th></tr></thead>
      <tbody id="rows"></tbody>
    </table></div>`;

  const cell = (r, c) => {
    if (c === "status") return `<td>${badge(r[c])}</td>`;
    if (cfg.detail && c === cfg.columns[0]) return `<td><a href="#${cfg.detail}/${r.id}">${esc(r[c])}</a></td>`;
    return `<td>${esc(fieldOf(c).type === "datetime-local" ? fmtDate(r[c]) : r[c])}</td>`;
  };

  const draw = () => {
    const t = $("#search").value.trim().toLowerCase();
    const st = $("#status-filter")?.value;
    const shown = db[key].filter(r => (!st || r.status === st) && (!t || cfg.fields.some(f => String(r[f.key] ?? "").toLowerCase().includes(t))))
      .sort((a, b) => b.created - a.created);
    $("#rows").innerHTML = shown.length
      ? shown.map(r => `<tr>${cfg.columns.map(c => cell(r, c)).join("")}
          <td class="actions"><button class="btn small" data-edit="${r.id}">Edit</button>
          <button class="btn small danger" data-del="${r.id}">Delete</button></td></tr>`).join("")
      : `<tr><td colspan="${cfg.columns.length + 1}" class="empty">${db[key].length ? "No matches." : `No ${cfg.title.toLowerCase()} yet. Add your first ${cfg.singular}.`}</td></tr>`;
  };
  draw();

  $("#search").oninput = draw;
  if ($("#status-filter")) $("#status-filter").onchange = draw;
  $("#add").onclick = () => openForm(cfg, key, null, route);
  $("#rows").onclick = e => {
    const edit = e.target.dataset.edit, del = e.target.dataset.del;
    if (edit) openForm(cfg, key, byId(key, edit), route);
    if (del) deleteRecord(key, del, cfg.singular);
  };
}

function deleteRecord(key, id, singular) {
  if (key === "products" && db.lines.some(l => l.product_id === id)) {
    alert("This product is used in a tender. Remove it from those tenders first."); return;
  }
  if (!confirm(`Delete this ${singular}? This cannot be undone.`)) return;
  if (key === "tenders") {
    db.lines = db.lines.filter(l => l.tender_id !== id);
    db.docs.filter(d => d.tender_id === id).forEach(d => delFile(d.id));
    db.docs = db.docs.filter(d => d.tender_id !== id);
  }
  if (key === "suppliers") db.lines.forEach(l => { if (l.supplier_id === id) l.supplier_id = ""; });
  db[key] = db[key].filter(r => r.id !== id);
  save(); route();
}

// ---------- Add / edit dialog ----------
function openForm(cfg, list, row, onSaved, preset = {}) {
  const form = $("#entity-form");
  const control = f => {
    const v = row?.[f.key], req = f.required ? "required" : "";
    if (f.type === "textarea") return `<textarea name="${f.key}" ${req}>${esc(v)}</textarea>`;
    if (f.type === "select") {
      const opts = (f.options || []).map(o => typeof o === "string" ? { value: o, label: o } : o);
      const cur = String(v ?? f.default ?? "");
      return `<select name="${f.key}" ${req}>${f.required ? "" : '<option value="">None</option>'}${opts.map(o =>
        `<option value="${esc(o.value)}" ${cur === String(o.value) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
    }
    if (f.type === "number") return `<input name="${f.key}" type="number" step="any" min="0" value="${esc(v ?? f.default ?? "")}" ${req}>`;
    return `<input name="${f.key}" type="${f.type || "text"}" value="${esc(v)}" ${req}>`;
  };
  form.innerHTML = `
    <h2>${row ? "Edit" : "Add"} ${cfg.singular}</h2>
    ${cfg.fields.map(f => `<label>${esc(f.label)}${f.required ? " *" : ""}${control(f)}</label>`).join("")}
    <div class="form-actions">
      <button class="btn" type="button" id="cancel">Cancel</button>
      <button class="btn primary" type="submit">Save ${cfg.singular}</button>
    </div>`;
  const dlg = $("#form-dialog");
  $("#cancel").onclick = () => dlg.close();
  form.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(form), values = {};
    for (const f of cfg.fields) {
      const v = fd.get(f.key);
      values[f.key] = f.type === "number" ? Number(v || 0) : v;
    }
    if (row) Object.assign(row, values);
    else db[list].push({ id: uid(), created: Date.now(), ...preset, ...values });
    save(); dlg.close(); onSaved();
  };
  dlg.showModal();
}

// ---------- Tender detail: products, pricing, margins ----------
function renderTender(id) {
  const tender = byId("tenders", id);
  if (!tender) { $("#content").innerHTML = `<p><a href="#tenders">Back to tenders</a></p><p>Tender not found.</p>`; return; }
  const lines = db.lines.filter(l => l.tender_id === id).sort((a, b) => a.created - b.created);
  const docs = db.docs.filter(d => d.tender_id === id).sort((a, b) => b.created - a.created);

  let cost = 0, quoted = 0;
  lines.forEach(l => { cost += l.quantity * l.purchase_price; quoted += l.quantity * l.quoted_price; });
  const profit = quoted - cost, margin = quoted ? (profit / quoted) * 100 : 0;
  const lineMargin = l => l.quoted_price > 0 ? (((l.quoted_price - l.purchase_price) / l.quoted_price) * 100).toFixed(1) + "%" : "n/a";

  $("#content").innerHTML = `
    <p><a href="#tenders">Back to tenders</a></p>
    <div class="detail-head">
      <div><h1>${esc(tender.tender_number)}</h1><p class="muted">${esc(tender.organization)}</p></div>
      <div class="head-actions">${badge(tender.status)} <button class="btn" id="edit-tender">Edit tender</button> <button class="btn primary" id="pdf">Download quotation PDF</button></div>
    </div>
    <p>Deadline: <b>${tender.deadline ? fmtDate(tender.deadline) : "not set"}</b>
      ${tender.link ? ` &middot; <a href="${esc(tender.link)}" target="_blank" rel="noopener">Open tender documents</a>` : ""}</p>
    ${tender.notes ? `<p class="notes">${esc(tender.notes)}</p>` : ""}

    <div class="section-head"><h2>Required products</h2><button class="btn primary" id="add-line">Add product</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Product</th><th>Supplier</th><th class="num">Qty</th><th class="num">Cost each</th><th class="num">Quoted each</th><th class="num">Quoted total</th><th class="num">Margin</th><th></th></tr></thead>
      <tbody id="lines">${lines.length ? lines.map(l => {
        const p = byId("products", l.product_id), s = byId("suppliers", l.supplier_id);
        return `<tr><td>${esc(p?.name)}${p?.unit ? ` <span class="muted">(${esc(p.unit)})</span>` : ""}</td><td>${esc(s?.name)}</td>
          <td class="num">${esc(l.quantity)}</td><td class="num">${money(l.purchase_price)}</td><td class="num">${money(l.quoted_price)}</td>
          <td class="num">${money(l.quantity * l.quoted_price)}</td><td class="num">${lineMargin(l)}</td>
          <td class="actions"><button class="btn small" data-edit="${l.id}">Edit</button>
          <button class="btn small danger" data-del="${l.id}">Delete</button></td></tr>`;
      }).join("") : `<tr><td colspan="8" class="empty">No products yet. Add the products this tender asks for.</td></tr>`}</tbody>
    </table></div>
    <div class="stats">
      <div class="stat"><span>Total cost</span><b>${money(cost)}</b></div>
      <div class="stat"><span>Total quoted</span><b>${money(quoted)}</b></div>
      <div class="stat"><span>Profit</span><b class="${profit < 0 ? "warn-text" : ""}">${money(profit)}</b></div>
      <div class="stat"><span>Margin</span><b class="${profit < 0 ? "warn-text" : ""}">${margin.toFixed(1)}%</b></div>
    </div>
    ${docsSection(docs)}`;

  $("#edit-tender").onclick = () => openForm(entities.tenders, "tenders", tender, route);
  $("#pdf").onclick = () => downloadQuotation(tender, lines);
  bindDocs(id);
  $("#add-line").onclick = () => openLineForm(id, null);
  $("#lines").onclick = e => {
    const edit = e.target.dataset.edit, del = e.target.dataset.del;
    if (edit) openLineForm(id, db.lines.find(l => l.id === edit));
    if (del && confirm("Remove this product from the tender?")) {
      db.lines = db.lines.filter(l => l.id !== del); save(); route();
    }
  };
}

// ---------- Deadline reminders ----------
function dueSoon() {
  return db.tenders.filter(t => t.status === "active" && t.deadline && new Date(t.deadline) - Date.now() < 3 * 86400000)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
}

function renderAlert() {
  const el = $("#alert"), due = dueSoon();
  if (!due.length) { el.hidden = true; return; }
  const over = due.filter(t => new Date(t.deadline) < Date.now()).length, soon = due.length - over;
  const parts = [over ? `${over} past deadline` : "", soon ? `${soon} due within 3 days` : ""].filter(Boolean).join(", ");
  const canAsk = "Notification" in window && Notification.permission === "default";
  el.hidden = false;
  el.innerHTML = `<b>Deadlines:</b> ${parts}. <a href="#dashboard">See list</a>${canAsk ? ` <button class="btn small" id="enable-notify">Turn on notifications</button>` : ""}`;
  if (canAsk) $("#enable-notify").onclick = async () => { await Notification.requestPermission(); renderAlert(); notifyOnce(); };
}

function notifyOnce() {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted" || sessionStorage.getItem("notified")) return;
    const due = dueSoon();
    if (!due.length) return;
    sessionStorage.setItem("notified", "1");
    new Notification("Tender deadlines", { body: `${due.length} tender${due.length > 1 ? "s are" : " is"} due within 3 days or overdue.` });
  } catch { /* notifications not supported here */ }
}

// ---------- Documents (files kept in this browser using IndexedDB) ----------
function fileOp(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("tender-files", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("files");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("files", mode);
      const req = fn(tx.objectStore("files"));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}
const putFile = (id, blob) => fileOp("readwrite", s => s.put(blob, id));
const getFile = id => fileOp("readonly", s => s.get(id));
const delFile = id => fileOp("readwrite", s => s.delete(id));

function docsSection(docs) {
  const size = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
  return `
    <div class="section-head"><h2>Documents</h2></div>
    <p class="muted">Files are stored in this browser on this device.</p>
    <form id="upload-form" class="upload">
      <select name="doc_type" aria-label="Document type">${DOC_TYPES.map(d => `<option>${d}</option>`).join("")}</select>
      <input type="file" name="file" required aria-label="Choose a file">
      <button class="btn primary" type="submit">Upload</button>
    </form>
    <p class="error" id="upload-error" role="alert"></p>
    <div class="table-wrap"><table>
      <thead><tr><th>File</th><th>Type</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
      <tbody id="docs">${docs.length ? docs.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.doc_type)}</td><td>${size(d.size)}</td><td>${fmtDate(d.created)}</td>
        <td class="actions"><button class="btn small" data-open="${d.id}">Open</button>
        <button class="btn small danger" data-del="${d.id}">Delete</button></td></tr>`).join("")
        : `<tr><td colspan="5" class="empty">No documents yet. Upload the tender PDF, requirements or certificates.</td></tr>`}</tbody>
    </table></div>`;
}

function bindDocs(tenderId) {
  $("#upload-form").onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target), file = fd.get("file"), err = $("#upload-error");
    err.textContent = "";
    if (file.size > 15 * 1024 * 1024) { err.textContent = "That file is over 15 MB. Choose a smaller file."; return; }
    const docId = uid();
    try { await putFile(docId, file); }
    catch { err.textContent = "Could not save the file in this browser. Check that private browsing is off and there is free storage."; return; }
    db.docs.push({ id: docId, tender_id: tenderId, name: file.name, doc_type: fd.get("doc_type"), size: file.size, created: Date.now() });
    save(); route();
  };
  $("#docs").onclick = async e => {
    const open = e.target.dataset.open, del = e.target.dataset.del;
    if (open) {
      const w = window.open("", "_blank");
      const blob = await getFile(open);
      if (!blob) { w?.close(); alert("This file is not stored in this browser. It may have been uploaded on another device."); return; }
      const url = URL.createObjectURL(blob);
      w ? (w.location = url) : (location.href = url);
    }
    if (del && confirm("Delete this document? This cannot be undone.")) {
      await delFile(del).catch(() => {});
      db.docs = db.docs.filter(d => d.id !== del);
      save(); route();
    }
  };
}

// ---------- Reports ----------
let reportFilter = "";

function renderReports() {
  const tenders = db.tenders.filter(t => !reportFilter || t.status === reportFilter);
  const ids = new Set(tenders.map(t => t.id));
  const lines = db.lines.filter(l => ids.has(l.tender_id));
  const margin = (q, c) => q ? ((q - c) / q * 100).toFixed(1) + "%" : "n/a";
  const tot = ls => ls.reduce((a, l) => ({ q: a.q + l.quantity, c: a.c + l.quantity * l.purchase_price, s: a.s + l.quantity * l.quoted_price }), { q: 0, c: 0, s: 0 });
  const group = keyFn => {
    const m = new Map();
    lines.forEach(l => { const k = keyFn(l); m.set(k, [...(m.get(k) || []), l]); });
    return [...m];
  };
  const all = tot(lines);

  const reports = [
    { title: "Tender-wise", cols: [["Tender", "t"], ["Organization", "t"], ["Status", "t"], ["Cost", "m"], ["Quoted", "m"], ["Profit", "m"], ["Margin", "p"]],
      rows: tenders.map(t => { const x = tot(lines.filter(l => l.tender_id === t.id)); return [t.tender_number, t.organization, t.status, x.c, x.s, x.s - x.c, margin(x.s, x.c)]; }) },
    { title: "Product-wise", cols: [["Product", "t"], ["Tenders", "n"], ["Quantity", "n"], ["Cost", "m"], ["Quoted", "m"], ["Profit", "m"], ["Margin", "p"]],
      rows: group(l => l.product_id).map(([pid, ls]) => { const x = tot(ls); return [byId("products", pid)?.name || "(deleted product)", new Set(ls.map(l => l.tender_id)).size, x.q, x.c, x.s, x.s - x.c, margin(x.s, x.c)]; })
        .sort((a, b) => b[5] - a[5]) },
    { title: "Supplier-wise", cols: [["Supplier", "t"], ["Products", "n"], ["Quantity", "n"], ["Purchase value", "m"], ["Quoted", "m"], ["Profit", "m"], ["Margin", "p"]],
      rows: group(l => l.supplier_id || "").map(([sid, ls]) => { const x = tot(ls); return [byId("suppliers", sid)?.name || "No supplier chosen", new Set(ls.map(l => l.product_id)).size, x.q, x.c, x.s, x.s - x.c, margin(x.s, x.c)]; })
        .sort((a, b) => b[5] - a[5]) },
  ];

  const show = (v, kind) => kind === "m" ? money(v) : esc(v);
  $("#content").innerHTML = `
    <h1>Reports</h1>
    <div class="toolbar">
      <label>Include tenders
        <select id="report-filter">${["", ...STATUSES].map(s => `<option value="${s}" ${s === reportFilter ? "selected" : ""}>${s || "All statuses"}</option>`).join("")}</select>
      </label>
    </div>
    <div class="stats">
      <div class="stat"><span>Total cost</span><b>${money(all.c)}</b></div>
      <div class="stat"><span>Total quoted</span><b>${money(all.s)}</b></div>
      <div class="stat"><span>Profit</span><b class="${all.s - all.c < 0 ? "warn-text" : ""}">${money(all.s - all.c)}</b></div>
      <div class="stat"><span>Margin</span><b>${margin(all.s, all.c)}</b></div>
    </div>
    ${reports.map((r, i) => `
      <div class="report-head"><h2>${r.title}</h2><button class="btn small" data-csv="${i}">Download CSV</button></div>
      <div class="table-wrap"><table>
        <thead><tr>${r.cols.map(([n, k]) => `<th class="${k === "t" ? "" : "num"}">${n}</th>`).join("")}</tr></thead>
        <tbody>${r.rows.length ? r.rows.map(row => `<tr>${row.map((v, j) => `<td class="${r.cols[j][1] === "t" ? "" : "num"}">${show(v, r.cols[j][1])}</td>`).join("")}</tr>`).join("")
          : `<tr><td colspan="${r.cols.length}" class="empty">No data yet.</td></tr>`}</tbody>
      </table></div>`).join("")}`;

  $("#report-filter").onchange = e => { reportFilter = e.target.value; renderReports(); };
  $("#content").onclick = e => {
    const i = e.target.dataset.csv;
    if (i === undefined) return;
    const r = reports[i];
    const q = v => `"${String(typeof v === "number" ? Math.round(v * 100) / 100 : v ?? "").replace(/"/g, '""')}"`;
    const csv = [r.cols.map(c => q(c[0])), ...r.rows.map(row => row.map(q))].map(row => row.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv" }));
    a.download = `report-${r.title.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

// ---------- Quotation PDF ----------
function downloadQuotation(tender, lines) {
  if (!window.jspdf) { alert("The PDF tool could not load. Check your internet connection and refresh the page."); return; }
  if (!lines.length) { alert("Add products to this tender first."); return; }
  if (!db.company) {
    const name = prompt("Your company name (shown at the top of the quotation):");
    if (name && name.trim()) { db.company = name.trim(); save(); }
  }
  const num = n => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18); doc.setFont("helvetica", "bold");
  doc.text(db.company || "Quotation", 14, 20);
  if (db.company) { doc.setFontSize(12); doc.setFont("helvetica", "normal"); doc.text("Quotation", 14, 28); }

  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`To: ${tender.organization}`, 14, 40);
  doc.text(`Tender number: ${tender.tender_number}`, 14, 46);
  doc.text(`Date: ${new Date().toLocaleDateString("en-GB")}`, 14, 52);

  let total = 0;
  const body = lines.map((l, i) => {
    const p = byId("products", l.product_id), lineTotal = l.quantity * l.quoted_price;
    total += lineTotal;
    return [i + 1, p?.name || "", p?.unit || "", l.quantity, num(l.quoted_price), num(lineTotal)];
  });

  doc.autoTable({
    startY: 60,
    head: [["#", "Product", "Unit", "Qty", "Unit price", "Total"]],
    body,
    foot: [["", "", "", "", "Grand total", num(total)]],
    headStyles: { fillColor: [31, 79, 216] },
    footStyles: { fillColor: [238, 241, 244], textColor: 20, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 10 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    styles: { fontSize: 10 },
  });

  const safe = String(tender.tender_number).replace(/[^\w\-]+/g, "_");
  doc.save(`Quotation-${safe}.pdf`);
}

function openLineForm(tenderId, row) {
  if (!db.products.length) { alert("Add products on the Products page first, then add them to a tender."); return; }
  const cfg = {
    singular: "product",
    fields: [
      { key: "product_id", label: "Product", type: "select", required: true, options: db.products.map(p => ({ value: p.id, label: p.name })) },
      { key: "supplier_id", label: "Supplier", type: "select", options: db.suppliers.map(s => ({ value: s.id, label: s.name })) },
      { key: "quantity", label: "Quantity", type: "number", required: true, default: 1 },
      { key: "purchase_price", label: "Cost price (each)", type: "number", default: 0 },
      { key: "quoted_price", label: "Quoted price (each)", type: "number", default: 0 },
    ],
  };
  openForm(cfg, "lines", row, route, { tender_id: tenderId });
}

route();
notifyOnce();
