// ---------- Data (saved in this browser's localStorage) ----------
const KEY = "tender-manager-data";
const EMPTY = () => ({ tenders: [], products: [], suppliers: [], lines: [] });
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
  const [page, id] = (location.hash.slice(1) || "dashboard").split("/");
  const navKey = page === "tender" ? "tenders" : page;
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + navKey));
  if (page === "tender" && id) return renderTender(id);
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
    <p class="muted">Your data is saved in this browser only. Download a backup regularly, and use it to move your data to another device.</p>
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
      db = data; save(); route();
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
  if (key === "tenders") db.lines = db.lines.filter(l => l.tender_id !== id);
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

  let cost = 0, quoted = 0;
  lines.forEach(l => { cost += l.quantity * l.purchase_price; quoted += l.quantity * l.quoted_price; });
  const profit = quoted - cost, margin = quoted ? (profit / quoted) * 100 : 0;
  const lineMargin = l => l.quoted_price > 0 ? (((l.quoted_price - l.purchase_price) / l.quoted_price) * 100).toFixed(1) + "%" : "n/a";

  $("#content").innerHTML = `
    <p><a href="#tenders">Back to tenders</a></p>
    <div class="detail-head">
      <div><h1>${esc(tender.tender_number)}</h1><p class="muted">${esc(tender.organization)}</p></div>
      <div class="head-actions">${badge(tender.status)} <button class="btn" id="edit-tender">Edit tender</button></div>
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
    </div>`;

  $("#edit-tender").onclick = () => openForm(entities.tenders, "tenders", tender, route);
  $("#add-line").onclick = () => openLineForm(id, null);
  $("#lines").onclick = e => {
    const edit = e.target.dataset.edit, del = e.target.dataset.del;
    if (edit) openLineForm(id, db.lines.find(l => l.id === edit));
    if (del && confirm("Remove this product from the tender?")) {
      db.lines = db.lines.filter(l => l.id !== del); save(); route();
    }
  };
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
