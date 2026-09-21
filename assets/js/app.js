// 鹦鹉养殖场管理系统
const SUPABASE_URL = "https://uraxrfmlzpmraskqyowf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NxEEPGId_L46iHJ1kh8-rA_PAJozl-E";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);
const views = { login: $("#view-login"), app: $("#view-app") };
const pageContainer = $("#page-container");
const titleEl = $("#topbar-title");

// ---------- 品种 / 品相字典（M10 设置中后续可改） ----------
const SPECIES_VARIETIES = {
  "虎皮鹦鹉": ["原始", "云斑", "黄化", "其他"],
  "玄凤": ["原始灰", "珍珠", "黄化", "其他"],
  "牡丹": ["紫伊莎", "松石伊莎", "紫熏", "紫罗兰", "其他"],
  "和尚": ["绿和尚", "蓝和尚", "其他"],
  "其他": [],
};
const BIRD_STATUS = ["在养", "配对", "隔离", "出售", "死亡", "淘汰", "待补录"];

let sessionUser = null;

// ---------- 工具 ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function toast(msg) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.style = "position:fixed;left:50%;bottom:100px;transform:translateX(-50%);background:#22302a;color:#fff;padding:10px 18px;border-radius:8px;z-index:99;transition:opacity .3s";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.style.opacity = "0"), 2200);
}
async function autoCode(prefix) {
  const { data } = await sb.from("birds").select("code").order("id", { ascending: false }).limit(1);
  if (data && data.length) {
    const n = parseInt(String(data[0].code).split("-")[1] || "0", 10) + 1;
    return prefix + "-" + String(n).padStart(4, "0");
  }
  return prefix + "-0001";
}

// ---------- 页面 ----------
const PAGES = {
  home: { title: "首页", render: renderHome },
  birds: { title: "种鸟档案", render: renderBirds },
  breed: { title: "繁殖记录", render: () => '<div class="empty">繁殖记录：开发中（阶段 2）</div>' },
  chicks: { title: "雏鸟管理", render: () => '<div class="empty">雏鸟管理：开发中（阶段 2）</div>' },
  more: { title: "更多", render: () => '<div class="empty">存栏 / 销售 / 客户 / 采购 / 待办 / 报表 / 设置：开发中</div>' },
};

function showPage(name) {
  const p = PAGES[name] || PAGES.home;
  titleEl.textContent = p.title;
  pageContainer.innerHTML = p.render();
  document.querySelectorAll(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.page === name)
  );
}

// ---------- 首页看板 ----------
function renderHome() {
  loadStats();
  return `
    <div class="grid">
      <div class="card"><div class="stat-num" id="s-bird">-</div><div class="stat-label">在养种鸟</div></div>
      <div class="card"><div class="stat-num" id="s-chick">-</div><div class="stat-label">在养雏鸟</div></div>
      <div class="card"><div class="stat-num" id="s-nest">-</div><div class="stat-label">占用巢箱</div></div>
      <div class="card"><div class="stat-num" id="s-sale">-</div><div class="stat-label">本月订单</div></div>
    </div>
    <h2 class="sec">快捷操作</h2>
    <div class="card quick">
      <button class="btn-line" data-goto="bird-add">＋ 登记种鸟</button>
      <button class="btn-line" data-goto="birds">按脚环号查种鸟</button>
    </div>`;
}
function bindHome() {
  document.querySelectorAll("[data-goto]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.goto === "bird-add") openBirdForm();
      else showPage("birds");
    })
  );
}
async function loadStats() {
  setTimeout(bindHome, 0);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const [r1, r2, r3] = await Promise.all([
    sb.from("birds").select("*", { count: "exact", head: true }).neq("status", "死亡").neq("deleted", true),
    sb.from("chicks").select("*", { count: "exact", head: true }).neq("status", "死亡").neq("deleted", true),
    sb.from("nests").select("*", { count: "exact", head: true }).eq("status", "占用").neq("deleted", true),
  ]);
  set("s-bird", r1.count ?? 0);
  set("s-chick", r2.count ?? 0);
  set("s-nest", r3.count ?? 0);
  set("s-sale", "—");
}

// ---------- 种鸟列表 ----------
function renderBirds() {
  setTimeout(bindBirds, 0);
  return `
    <div class="bar">
      <input id="b-search" placeholder="按脚环号 / 档案号搜索" style="flex:1">
      <button class="btn-primary sm" id="b-add">新增</button>
    </div>
    <div class="bar">
      <select id="b-species"><option value="">全部品种</option>${Object.keys(SPECIES_VARIETIES).map((s) => `<option>${s}</option>`).join("")}</select>
      <select id="b-status"><option value="">全部状态</option>${BIRD_STATUS.map((s) => `<option>${s}</option>`).join("")}</select>
    </div>
    <div id="b-list"></div>`;
}
function bindBirds() {
  const el = (id) => pageContainer.querySelector(id);
  if (!el("#b-search")) return;
  el("#b-add").addEventListener("click", () => openBirdForm());
  el("#b-search").addEventListener("input", loadBirds);
  el("#b-species").addEventListener("change", loadBirds);
  el("#b-status").addEventListener("change", loadBirds);
  loadBirds();
}
async function loadBirds() {
  const kw = (pageContainer.querySelector("#b-search").value || "").trim();
  const sp = pageContainer.querySelector("#b-species").value;
  const st = pageContainer.querySelector("#b-status").value;
  let q = sb.from("birds").select("*").eq("deleted", false).order("id", { ascending: false }).limit(200);
  if (sp) q = q.eq("species", sp);
  if (st) q = q.eq("status", st);
  if (kw) q = q.or(`band.ilike.%${kw}%,code.ilike.%${kw}%`);
  const { data, error } = await q;
  const box = pageContainer.querySelector("#b-list");
  if (!box) return;
  if (error) { box.innerHTML = `<div class="empty">加载失败：${esc(error.message)}</div>`; return; }
  if (!data.length) { box.innerHTML = '<div class="empty">暂无种鸟，点右上角「新增」登记</div>'; return; }
  box.innerHTML = data.map((b) => `
    <div class="row" data-id="${b.id}">
      <div>
        <div class="row-title">${esc(b.band || "未上脚环")} <span class="tag">${esc(b.species)}/${esc(b.variety || "")}</span></div>
        <div class="row-sub">${esc(b.code)} · ${esc(b.gender)} · ${esc(b.status)}${b.location ? " · " + esc(b.location) : ""}</div>
      </div>
      <div class="row-arrow">›</div>
    </div>`).join("");
  box.querySelectorAll(".row").forEach((r) =>
    r.addEventListener("click", () => openBirdForm(Number(r.dataset.id)))
  );
}

// ---------- 种鸟新增/编辑 ----------
async function openBirdForm(id) {
  let b = { species: "玄凤", gender: "未知", status: "在养", source: "自繁" };
  if (id) {
    const { data } = await sb.from("birds").select("*").eq("id", id).single();
    b = data;
  } else {
    b.code = await autoCode("NB");
  }
  titleEl.textContent = id ? "编辑种鸟" : "登记种鸟";
  document.querySelectorAll(".nav-item").forEach((x) => x.classList.remove("active"));
  const varietyOpts = (b.species in SPECIES_VARIETIES ? SPECIES_VARIETIES[b.species] : []);
  pageContainer.innerHTML = `
    <h2 class="sec">${id ? "编辑种鸟" : "登记种鸟"}</h2>
    <form id="bf" class="form">
      <label>档案编号（自动）<input value="${esc(b.code)}" disabled></label>
      <label>脚环号<input id="bf-band" value="${esc(b.band || "")}" placeholder="繁殖期可先留空，后补"></label>
      <label>品种
        <select id="bf-species">${Object.keys(SPECIES_VARIETIES).map((s) => `<option ${s === b.species ? "selected" : ""}>${s}</option>`).join("")}</select>
      </label>
      <label>品相
        <select id="bf-variety"><option value="">未填</option>${varietyOpts.map((v) => `<option ${v === b.variety ? "selected" : ""}>${v}</option>`).join("")}</select>
      </label>
      <label>性别<select id="bf-gender">${["公", "母", "未知"].map((g) => `<option ${g === b.gender ? "selected" : ""}>${g}</option>`).join("")}</select></label>
      <label>出生日期 / 购入日期<input type="date" id="bf-birth" value="${b.birth_date || ""}"></label>
      <label>来源<select id="bf-source">${["自繁", "外购"].map((s) => `<option ${s === b.source ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <label>位置（笼号/区域）<input id="bf-loc" value="${esc(b.location || "")}"></label>
      <label>状态<select id="bf-status">${BIRD_STATUS.map((s) => `<option ${s === b.status ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <label>健康备注<textarea id="bf-note" rows="2">${esc(b.health_note || "")}</textarea></label>
      <div class="err" id="bf-err"></div>
      <div class="bar">
        <button type="button" class="btn-ghost" id="bf-cancel">取消</button>
        <button type="submit" class="btn-primary">保存</button>
      </div>
    </form>`;
  pageContainer.querySelector("#bf-species").addEventListener("change", (e) => {
    const list = SPECIES_VARIETIES[e.target.value] || [];
    pageContainer.querySelector("#bf-variety").innerHTML =
      `<option value="">未填</option>` + list.map((v) => `<option>${v}</option>`).join("");
  });
  pageContainer.querySelector("#bf-cancel").addEventListener("click", () => showPage("birds"));
  pageContainer.querySelector("#bf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = pageContainer.querySelector("#bf-err");
    err.textContent = "";
    const payload = {
      code: b.code,
      band: pageContainer.querySelector("#bf-band").value.trim() || null,
      species: pageContainer.querySelector("#bf-species").value,
      variety: pageContainer.querySelector("#bf-variety").value || null,
      gender: pageContainer.querySelector("#bf-gender").value,
      birth_date: pageContainer.querySelector("#bf-birth").value || null,
      source: pageContainer.querySelector("#bf-source").value,
      location: pageContainer.querySelector("#bf-loc").value.trim() || null,
      status: pageContainer.querySelector("#bf-status").value,
      health_note: pageContainer.querySelector("#bf-note").value.trim() || null,
    };
    const res = id ? await sb.from("birds").update(payload).eq("id", id)
                   : await sb.from("birds").insert(payload);
    if (res.error) {
      err.textContent = res.error.message.includes("band") ? "脚环号重复了，请检查" : res.error.message;
      return;
    }
    toast("已保存");
    showPage("birds");
  });
}

// ---------- 登录 / 退出 ----------
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#login-error"); err.textContent = "";
  const { data, error } = await sb.auth.signInWithPassword({
    email: $("#login-email").value.trim(),
    password: $("#login-password").value,
  });
  if (error) { err.textContent = "登录失败：" + error.message; return; }
  sessionUser = data.user;
  showApp();
});
$("#btn-logout").addEventListener("click", async () => { await sb.auth.signOut(); showLogin(); });
document.querySelectorAll(".nav-item").forEach((b) =>
  b.addEventListener("click", () => showPage(b.dataset.page))
);
function showApp() { views.login.hidden = true; views.app.hidden = false; showPage("home"); }
function showLogin() { views.app.hidden = true; views.login.hidden = false; $("#login-password").value = ""; }

(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) { sessionUser = data.session.user; showApp(); } else showLogin();
})();
