// 鹦鹉养殖场管理系统 - 前端骨架
const SUPABASE_URL = "https://uraxrfmlzpmraskqyowf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NxEEPGId_L46iHJ1kh8-rA_PAJozl-E";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (s) => document.querySelector(s);
const views = { login: $("#view-login"), app: $("#view-app") };
const pageContainer = $("#page-container");
const titleEl = $("#topbar-title");

// ---------- 页面占位（阶段 1 逐步替换为真实功能） ----------
const PAGES = {
  home: { title: "首页", render: renderHome },
  birds: { title: "种鸟档案", render: () => '<div class="empty">种鸟档案：开发中（阶段 1）</div>' },
  breed: { title: "繁殖记录", render: () => '<div class="empty">繁殖记录：开发中（阶段 2）</div>' },
  chicks: { title: "雏鸟管理", render: () => '<div class="empty">雏鸟管理：开发中（阶段 2）</div>' },
  more: { title: "更多", render: () => '<div class="empty">更多功能：存栏 / 销售 / 客户 / 采购 / 待办 / 报表 / 设置</div>' },
};

function renderHome() {
  return `
    <div class="grid">
      <div class="card"><div class="stat-num" id="stat-inv">-</div><div class="stat-label">总存栏</div></div>
      <div class="card"><div class="stat-num" id="stat-todo">-</div><div class="stat-label">今日待办</div></div>
      <div class="card"><div class="stat-num" id="stat-sales">-</div><div class="stat-label">本月销售额</div></div>
      <div class="card"><div class="stat-num" id="stat-chicks">-</div><div class="stat-label">雏鸟数</div></div>
    </div>
    <h2 class="sec">欢迎使用鹦鹉养殖场管理系统</h2>
    <div class="card">系统已就绪，接下来将按 PRD 分模块开发：种鸟档案、繁殖记录、雏鸟管理、巢箱、销售等。</div>
  `;
}

function showPage(name) {
  const p = PAGES[name] || PAGES.home;
  titleEl.textContent = p.title;
  pageContainer.innerHTML = p.render();
  document.querySelectorAll(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.page === name)
  );
  loadHomeStats();
}

async function loadHomeStats() {
  if (!PAGES.home || pageContainer.querySelector("#stat-inv") === null) return;
  // 骨架阶段先显示占位，真实统计在阶段 1 接入
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("stat-inv", "—"); set("stat-todo", "—"); set("stat-sales", "—"); set("stat-chicks", "—");
}

// ---------- 登录 ----------
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#login-error"); err.textContent = "";
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { err.textContent = "登录失败：" + error.message; return; }
  showApp();
});

$("#btn-logout").addEventListener("click", async () => {
  await sb.auth.signOut();
  showLogin();
});

document.querySelectorAll(".nav-item").forEach((b) =>
  b.addEventListener("click", () => showPage(b.dataset.page))
);

function showApp() {
  views.login.hidden = true;
  views.app.hidden = false;
  showPage("home");
}
function showLogin() {
  views.app.hidden = true;
  views.login.hidden = false;
  $("#login-password").value = "";
}

// ---------- 启动：检查登录态 ----------
(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) showApp(); else showLogin();
})();
