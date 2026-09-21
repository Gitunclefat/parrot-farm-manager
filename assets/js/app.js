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
async function autoCode(prefix, table) {
  table = table || "birds";
  const { data } = await sb.from(table).select("code").order("id", { ascending: false }).limit(1);
  if (data && data.length) {
    const n = parseInt(String(data[0].code).split("-")[1] || "0", 10) + 1;
    return prefix + "-" + String(n).padStart(4, "0");
  }
  return prefix + "-0001";
}
function today() { return new Date().toISOString().slice(0, 10); }
function minusMonths(dStr, m) {
  const d = new Date(dStr); d.setMonth(d.getMonth() - m);
  return d.toISOString().slice(0, 10);
}

// ---------- 页面 ----------
const PAGES = {
  home: { title: "首页", render: renderHome },
  birds: { title: "种鸟档案", render: renderBirds },
  breed: { title: "繁殖记录", render: renderBreed },
  chicks: { title: "雏鸟管理", render: renderChicks },
  more: { title: "更多", render: renderMore },
  orders: { title: "销售订单", render: renderOrders },
  customers: { title: "客户管理", render: renderCustomers },
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

// ---------- 巢箱管理 ----------
function renderBreed() {
  setTimeout(bindBreed, 0);
  return `
    <div class="bar">
      <input id="n-search" placeholder="按巢箱号 / 位置搜索" style="flex:1">
      <button class="btn-primary sm" id="n-add">新增巢箱</button>
    </div>
    <div id="n-list"></div>`;
}
function bindBreed() {
  const el = (id) => pageContainer.querySelector(id);
  if (!el("#n-search")) return;
  el("#n-add").addEventListener("click", openNestForm);
  el("#n-search").addEventListener("input", loadNests);
  loadNests();
}
async function loadNests() {
  const kw = (pageContainer.querySelector("#n-search").value || "").trim();
  let q = sb.from("nests").select("*").eq("deleted", false).order("id", { ascending: false });
  if (kw) q = q.or(`code.ilike.%${kw}%,position.ilike.%${kw}%`);
  const { data, error } = await q;
  const box = pageContainer.querySelector("#n-list");
  if (!box) return;
  if (error) { box.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  if (!data.length) { box.innerHTML = '<div class="empty">还没有巢箱，点右上角「新增巢箱」建立</div>'; return; }
  box.innerHTML = data.map((n) => `
    <div class="row" data-id="${n.id}">
      <div>
        <div class="row-title">${esc(n.code)} <span class="tag">${esc(n.status)}</span></div>
        <div class="row-sub">${esc(n.position || "未设位置")}${n.note ? " · " + esc(n.note) : ""}</div>
      </div>
      <div class="row-arrow">›</div>
    </div>`).join("");
  box.querySelectorAll(".row").forEach((r) =>
    r.addEventListener("click", () => openNest(Number(r.dataset.id)))
  );
}
function openNestForm(id) {
  const existing = id ? null : {};
  titleEl.textContent = "新增巢箱";
  pageContainer.innerHTML = `
    <form class="form" id="nf">
      <label>巢箱编号<span class="req">*</span><input id="nf-code" placeholder="如 A-01"></label>
      <label>位置<input id="nf-pos" placeholder="如 一排左三"></label>
      <label>状态<select id="nf-status">${["空闲", "占用", "维修", "停用"].map((s) => `<option>${s}</option>`).join("")}</select></label>
      <label>备注<input id="nf-note"></label>
      <div class="err" id="nf-err"></div>
      <div class="bar"><button type="button" class="btn-ghost" id="nf-c">取消</button><button type="submit" class="btn-primary">保存</button></div>
    </form>`;
  pageContainer.querySelector("#nf-c").addEventListener("click", () => showPage("breed"));
  pageContainer.querySelector("#nf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = pageContainer.querySelector("#nf-code").value.trim();
    if (!code) { pageContainer.querySelector("#nf-err").textContent = "请填巢箱编号"; return; }
    const res = await sb.from("nests").insert({
      code,
      position: pageContainer.querySelector("#nf-pos").value.trim() || null,
      status: pageContainer.querySelector("#nf-status").value,
      note: pageContainer.querySelector("#nf-note").value.trim() || null,
    });
    if (res.error) { pageContainer.querySelector("#nf-err").textContent = "巢箱编号重复"; return; }
    toast("已保存"); showPage("breed");
  });
}

// ---------- 巢箱详情 / 繁殖推进 ----------
async function openNest(id) {
  const { data: nest } = await sb.from("nests").select("*").eq("id", id).single();
  // 找当前未结束的窝次
  const { data: br } = await sb.from("breedings")
    .select("*, breeding_details(*)")
    .eq("nest_id", id).neq("deleted", true)
    .not("stage", "in", '("断奶成活","失败")')
    .order("id", { ascending: false }).limit(1).single();
  titleEl.textContent = nest.code;
  document.querySelectorAll(".nav-item").forEach((x) => x.classList.remove("active"));
  let html = `<h2 class="sec">巢箱 ${esc(nest.code)} · ${esc(nest.position || "")}</h2>`;
  if (!br) {
    html += `<div class="card"><p style="margin-bottom:10px">当前没有进行中的繁殖。先选定这一巢箱的一公一母，再开始挂窝。</p>
      <button class="btn-primary" id="start-b">开始挂窝</button></div>
      <div class="bar" style="margin-top:14px"><button class="btn-ghost" id="back-b" style="color:var(--muted);border-color:var(--line)">返回巢箱列表</button></div>`;
  } else {
    const stages = ["挂窝", "产蛋", "孵化中", "出壳", "育雏中", "断奶成活"];
    const si = stages.indexOf(br.stage);
    html += `<div class="card">
      <div class="row-title">窝次 ${esc(br.code)} <span class="tag">${esc(br.stage)}</span></div>
      <div class="row-sub">配对日：${esc(br.pair_date || "—")}</div>
      <div style="display:flex;gap:4px;margin:12px 0">
        ${stages.map((s, i) => `<div style="flex:1;text-align:center;font-size:11px;color:${i <= si ? "var(--green)" : "var(--muted)"}">${s}<div style="height:4px;background:${i < si ? "var(--green)" : "var(--line)"};border-radius:2px;margin-top:4px"></div></div>`).join("")}
      </div>
      <div id="next-stage-zone"></div>
    </div>`;
  }
  pageContainer.innerHTML = html;
  pageContainer.querySelector("#back-b")?.addEventListener("click", () => showPage("breed"));
  pageContainer.querySelector("#start-b")?.addEventListener("click", () => openBreedingStart(id));
  if (br) bindStageAdvance(br);
}

async function openBreedingStart(nestId) {
  // 选择公母种鸟：按脚环号搜；找不到可现场建临时鸟（脚环号空）
  titleEl.textContent = "开始挂窝";
  let picked = { m: null, f: null };
  pageContainer.innerHTML = `
    <h2 class="sec">挂窝（一公一母）</h2>
    <p style="font-size:13px;color:var(--muted);margin-bottom:8px">公母鸟需从已有种鸟中选择；脚环号未知时可先建临时档案，后期补录。</p>
    <form class="form" id="bs">
      <label>挂窝日期<input type="date" id="bs-date" value="${today()}"></label>

      <label>公鸟（脚环号/档案号）<input id="bs-m" placeholder="输入后点查找"></label>
      <div id="bs-m-msg" style="font-size:12px;margin-bottom:6px"></div>

      <label>母鸟（脚环号/档案号）<input id="bs-f" placeholder="输入后点查找"></label>
      <div id="bs-f-msg" style="font-size:12px;margin-bottom:6px"></div>

      <div class="err" id="bs-err"></div>
      <div class="bar"><button type="button" class="btn-ghost" id="bs-c">取消</button><button type="submit" class="btn-primary">开始挂窝</button></div>
    </form>`;

  const pick = async (inputId, msgId, gender) => {
    const v = pageContainer.querySelector(inputId).value.trim();
    const msg = pageContainer.querySelector(msgId);
    if (!v) { msg.innerHTML = ""; picked[gender === "公" ? "m" : "f"] = null; return null; }
    const { data } = await sb.from("birds").select("*").eq("deleted", false)
      .or(`band.eq.${v},code.eq.${v}`).limit(1);
    if (data && data.length) {
      const b = data[0];
      if (b.gender && b.gender !== gender) {
        msg.innerHTML = `<span style="color:var(--red)">这只登记为${b.gender}，与${gender}不符</span>`;
        return null;
      }
      msg.innerHTML = `<span class="tag">已选：${esc(b.band || b.code)} ${esc(b.species)}/${esc(b.variety || "?")}</span>
        <button type="button" class="btn-ghost" style="color:var(--green);border-color:var(--green);padding:3px 10px;margin-left:6px" data-newtemp="${gender}">没有？建临时鸟</button>`;
      picked[gender === "公" ? "m" : "f"] = b;
      return b;
    }
    msg.innerHTML = `<span style="color:var(--muted)">未找到，可建为临时${gender}鸟（无脚环号）</span>
      <button type="button" class="btn-ghost" style="color:var(--green);border-color:var(--green);padding:3px 10px;margin-left:6px" data-newtemp="${gender}">＋ 新建临时${gender}鸟</button>`;
    return null;
  };

  pageContainer.querySelector("#bs-m").addEventListener("change", () => pick("#bs-m", "#bs-m-msg", "公"));
  pageContainer.querySelector("#bs-f").addEventListener("change", () => pick("#bs-f", "#bs-f-msg", "母"));
  pageContainer.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-newtemp]");
    if (!btn) return;
    const gender = btn.dataset.newtemp;
    const code = await autoCode("NB", "birds");
    const ins = await sb.from("birds").insert({
      code, species: "玄凤", variety: null, gender,
      source: "自繁", status: "待补录", band: null,
    }).select().single();
    if (ins.error) { alert(ins.error.message); return; }
    const b = ins.data;
    picked[gender === "公" ? "m" : "f"] = b;
    const msgId = gender === "公" ? "#bs-m-msg" : "#bs-f-msg";
    pageContainer.querySelector(msgId).innerHTML =
      `<span class="tag">已建临时鸟：${esc(b.code)}（${gender}），脚环号后补</span>`;
  });

  pageContainer.querySelector("#bs-c").addEventListener("click", () => openNest(nestId));
  pageContainer.querySelector("#bs").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = pageContainer.querySelector("#bs-err");
    err.textContent = "";
    if (!picked.m || !picked.f) { err.textContent = "请先选定公鸟和母鸟（可建临时鸟）"; return; }
    if (picked.m.id === picked.f.id) { err.textContent = "公母不能是同一只鸟"; return; }
    const code = await autoCode("BR", "breedings");
    const ins = await sb.from("breedings").insert({
      code, nest_id: nestId,
      male_id: picked.m.id, female_id: picked.f.id,
      pair_date: pageContainer.querySelector("#bs-date").value, stage: "挂窝",
    });
    if (ins.error) { err.textContent = ins.error.message; return; }
    await sb.from("nests").update({ status: "占用" }).eq("id", nestId);
    toast("已开始挂窝"); openNest(nestId);
  });
}

const STAGE_FIELDS = {
  "产蛋": [["laid_date", "产蛋日期", "date"], ["egg_count", "总蛋数", "number"]],
  "孵化中": [["candle_date", "照蛋日期", "date"], ["fertile_count", "受精蛋数", "number"]],
  "出壳": [["hatch_date", "出壳日期", "date"], ["hatch_count", "出壳只数", "number"]],
  "断奶成活": [["wean_date", "断奶日期", "date"], ["survived_count", "成活只数", "number"], ["died_count", "中途死亡只数", "number"]],
};
const NEXT_STAGE = { "挂窝": "产蛋", "产蛋": "孵化中", "孵化中": "出壳", "出壳": "育雏中", "育雏中": "断奶成活" };

async function bindStageAdvance(br) {
  const zone = pageContainer.querySelector("#next-stage-zone");
  if (br.stage === "断奶成活") {
    zone.innerHTML = `<p style="color:var(--muted);font-size:13px">本窝已结束，雏鸟已自动生成。</p>`; return;
  }
  if (br.stage === "失败") { zone.innerHTML = ""; return; }

  // 产蛋阶段：可多次记录蛋数，确认照蛋后再推进
  if (br.stage === "产蛋") {
    const eggs = (br.breeding_details || []).filter(d => d.egg_count);
    const totalEgg = eggs.length ? Math.max(...eggs.map(d => d.egg_count)) : 0;
    zone.innerHTML = `
      <div style="font-size:13px;color:var(--muted);margin:6px 0">当前累计蛋数：<b style="color:var(--ink)">${totalEgg}</b> 颗</div>
      <h3 style="font-size:14px;margin:8px 0">更新蛋数</h3>
      <form id="sv">
        <label style="font-size:13px;color:var(--muted);display:block;margin:6px 0 2px">日期
          <input type="date" id="sv-laid_date" value="${today()}" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:8px;margin-top:2px"></label>
        <label style="font-size:13px;color:var(--muted);display:block;margin:6px 0 2px">累计总蛋数
          <input type="number" id="sv-egg_count" value="${totalEgg}" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:8px;margin-top:2px"></label>
        <div class="err" id="sv-err"></div>
        <button type="submit" class="btn-primary" style="margin-top:8px">更新蛋数</button>
      </form>
      <button type="button" id="sv-next" class="btn-ghost" style="color:var(--green);border-color:var(--green);margin-top:10px">蛋已下完，照蛋转入孵化中 ›</button>
      <button type="button" id="sv-fail" class="btn-ghost" style="color:var(--red);border-color:var(--red);margin-left:8px">本窝失败</button>`;
    zone.querySelector("#sv").addEventListener("submit", async (e) => {
      e.preventDefault();
      const detail = {
        breeding_id: br.id,
        laid_date: pageContainer.querySelector("#sv-laid_date").value || null,
        egg_count: parseInt(pageContainer.querySelector("#sv-egg_count").value, 10) || 0,
      };
      const r1 = await sb.from("breeding_details").insert(detail);
      if (r1.error) { pageContainer.querySelector("#sv-err").textContent = r1.error.message; return; }
      toast("已更新蛋数"); openNest(br.nest_id);
    });
    zone.querySelector("#sv-next").addEventListener("click", () => {
      zone.innerHTML = `
        <h3 style="font-size:14px;margin:8px 0">照蛋 → 孵化中</h3>
        <form id="sv">
          <label style="font-size:13px;color:var(--muted);display:block;margin:6px 0 2px">照蛋日期
            <input type="date" id="sv-candle_date" value="${today()}" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:8px;margin-top:2px"></label>
          <label style="font-size:13px;color:var(--muted);display:block;margin:6px 0 2px">受精蛋数
            <input type="number" id="sv-fertile_count" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:8px;margin-top:2px"></label>
          <div class="err" id="sv-err"></div>
          <button type="submit" class="btn-primary" style="margin-top:8px">记录并推进</button>
        </form>`;
      zone.querySelector("#sv").addEventListener("submit", async (e) => {
        e.preventDefault();
        const detail = {
          breeding_id: br.id,
          candle_date: pageContainer.querySelector("#sv-candle_date").value || null,
          fertile_count: parseInt(pageContainer.querySelector("#sv-fertile_count").value, 10) || 0,
        };
        await sb.from("breeding_details").insert(detail);
        await sb.from("breedings").update({ stage: "孵化中" }).eq("id", br.id);
        toast("已推进到孵化中"); openNest(br.nest_id);
      });
    });
    bindFail(zone, br);
    return;
  }

  // 出壳阶段：可多天记录出壳数，确认完成后进入育雏
  if (br.stage === "出壳") {
    const hatches = (br.breeding_details || []).filter(d => d.hatch_count);
    const totalHatch = hatches.reduce((s, d) => s + (d.hatch_count || 0), 0);
    zone.innerHTML = `
      <div style="font-size:13px;color:var(--muted);margin:6px 0">累计出壳：<b style="color:var(--ink)">${totalHatch}</b> 只</div>
      <h3 style="font-size:14px;margin:8px 0">记录今日出壳</h3>
      <form id="sv">
        <label style="font-size:13px;color:var(--muted);display:block;margin:6px 0 2px">出壳日期
          <input type="date" id="sv-hatch_date" value="${today()}" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:8px;margin-top:2px"></label>
        <label style="font-size:13px;color:var(--muted);display:block;margin:6px 0 2px">本次出壳只数
          <input type="number" id="sv-hatch_count" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:8px;margin-top:2px"></label>
        <div class="err" id="sv-err"></div>
        <button type="submit" class="btn-primary" style="margin-top:8px">记录出壳</button>
      </form>
      <button type="button" id="sv-next" class="btn-ghost" style="color:var(--green);border-color:var(--green);margin-top:10px">出壳完成，进入育雏中 ›</button>
      <button type="button" id="sv-fail" class="btn-ghost" style="color:var(--red);border-color:var(--red);margin-left:8px">本窝失败</button>`;
    zone.querySelector("#sv").addEventListener("submit", async (e) => {
      e.preventDefault();
      const detail = {
        breeding_id: br.id,
        hatch_date: pageContainer.querySelector("#sv-hatch_date").value || null,
        hatch_count: parseInt(pageContainer.querySelector("#sv-hatch_count").value, 10) || 0,
      };
      await sb.from("breeding_details").insert(detail);
      toast("已记录"); openNest(br.nest_id);
    });
    zone.querySelector("#sv-next").addEventListener("click", async () => {
      await sb.from("breedings").update({ stage: "育雏中" }).eq("id", br.id);
      toast("进入育雏中"); openNest(br.nest_id);
    });
    bindFail(zone, br);
    return;
  }

  const next = br.stage === "育雏中" ? "断奶成活" : NEXT_STAGE[br.stage];
  if (!next) { zone.innerHTML = ""; return; }
  const fields = STAGE_FIELDS[next] || [];
  zone.innerHTML = `
    <h3 style="font-size:14px;margin:8px 0">推进到「${next}」</h3>
    <form id="sv">
      ${fields.map(([id, label, type]) => `
        <label style="font-size:13px;color:var(--muted);display:block;margin:6px 0 2px">${label}
          <input type="${type}" id="sv-${id}" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:8px;margin-top:2px" ${type === "date" ? `value="${today()}"` : ""}>
        </label>`).join("")}
      <div class="err" id="sv-err"></div>
      <button type="submit" class="btn-primary" style="margin-top:8px">记录并推进</button>
      <button type="button" id="sv-fail" class="btn-ghost" style="color:var(--red);border-color:var(--red);margin-left:8px">本窝失败</button>
    </form>`;
  zone.querySelector("#sv").addEventListener("submit", async (e) => {
    e.preventDefault();
    const detail = { breeding_id: br.id };
    fields.forEach(([id]) => {
      const el = pageContainer.querySelector(`#sv-${id}`);
      detail[id] = el.type === "number" ? (parseInt(el.value, 10) || 0) : el.value || null;
    });
    const r1 = await sb.from("breeding_details").insert(detail);
    if (r1.error) { pageContainer.querySelector("#sv-err").textContent = r1.error.message; return; }
    const r2 = await sb.from("breedings").update({ stage: next }).eq("id", br.id);
    if (next === "断奶成活") {
      await sb.from("nests").update({ status: "空闲" }).eq("id", br.nest_id);
      await autoMakeChicks(br, detail);
      toast("已生成雏鸟档案");
    } else {
      toast("已推进到 " + next);
    }
    openNest(br.nest_id);
  });
  bindFail(zone, br);
}
function bindFail(zone, br) {
  const btn = zone.querySelector("#sv-fail");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    await sb.from("breedings").update({ stage: "失败" }).eq("id", br.id);
    await sb.from("nests").update({ status: "空闲" }).eq("id", br.nest_id);
    toast("本窝标记为失败"); openNest(br.nest_id);
  });
}

async function autoMakeChicks(br, detail) {
  const n = detail.survived_count || 0;
  if (!n) return;
  // 父母信息
  let species = null, variety = null, father = null, mother = null;
  if (br.male_id) { const { data } = await sb.from("birds").select("*").eq("id", br.male_id).single(); father = data; species = species || data.species; variety = variety || data.variety; }
  if (br.female_id) { const { data } = await sb.from("birds").select("*").eq("id", br.female_id).single(); mother = data; species = species || data.species; variety = variety || data.variety; }
  const rows = [];
  const baseCode = await autoCode("CH", "chicks");
  const baseN = parseInt(String(baseCode).split("-")[1], 10) || 0;
  for (let i = 0; i < n; i++) {
    rows.push({
      code: "CH-" + String(baseN + i).padStart(4, "0"),
      breeding_id: br.id,
      father_id: father ? father.id : null,
      mother_id: mother ? mother.id : null,
      species, variety,
      birth_date: detail.hatch_date || detail.wean_date || today(),
      status: "在养",
    });
  }
  const ins = await sb.from("chicks").insert(rows);
  if (ins.error) console.error("autoMakeChicks:", ins.error.message);
}

// ---------- 雏鸟管理 ----------
function renderChicks() {
  setTimeout(bindChicks, 0);
  return `
    <div class="bar">
      <input id="c-search" placeholder="按脚环号搜索" style="flex:1">
      <button class="btn-primary sm" id="c-test">验卡录入</button>
    </div>
    <div id="c-list"></div>`;
}
function bindChicks() {
  const el = (id) => pageContainer.querySelector(id);
  if (!el("#c-search")) return;
  el("#c-test").addEventListener("click", openSexTest);
  el("#c-search").addEventListener("input", loadChicks);
  loadChicks();
}
async function loadChicks() {
  const kw = (pageContainer.querySelector("#c-search").value || "").trim();
  let q = sb.from("chicks").select("*").eq("deleted", false).order("id", { ascending: false }).limit(200);
  if (kw) q = q.or(`band.ilike.%${kw}%,code.ilike.%${kw}%`);
  const { data, error } = await q;
  const box = pageContainer.querySelector("#c-list");
  if (!box) return;
  if (error) { box.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  if (!data.length) { box.innerHTML = '<div class="empty">暂无雏鸟。窝次记录到「断奶成活」后会自动生成雏鸟档案。</div>'; return; }
  box.innerHTML = data.map((c) => `
    <div class="row" data-id="${c.id}">
      <div>
        <div class="row-title">${esc(c.band || "未上脚环")} <span class="tag">${esc(c.species || "?")}/${esc(c.variety || "?")} · ${esc(c.gender)}</span></div>
        <div class="row-sub">${esc(c.code)} · ${esc(c.status)} · 出生 ${esc(c.birth_date || "—")}</div>
      </div>
      <div class="row-arrow">›</div>
    </div>`).join("");
  box.querySelectorAll(".row").forEach((r) =>
    r.addEventListener("click", () => openChickForm(Number(r.dataset.id)))
  );
}

async function openChickForm(id) {
  const { data: c } = await sb.from("chicks").select("*").eq("id", id).single();
  titleEl.textContent = "雏鸟详情";
  document.querySelectorAll(".nav-item").forEach((x) => x.classList.remove("active"));
  pageContainer.innerHTML = `
    <h2 class="sec">${esc(c.band || c.code)}</h2>
    <form class="form" id="cf">
      <label>脚环号<input id="cf-band" value="${esc(c.band || "")}"></label>
      <label>品种<input id="cf-species" value="${esc(c.species || "")}"></label>
      <label>品相<input id="cf-variety" value="${esc(c.variety || "")}"></label>
      <label>性别<select id="cf-gender">${["公", "母", "未知"].map((g) => `<option ${g === c.gender ? "selected" : ""}>${g}</option>`).join("")}</select></label>
      <label>出生日期<input type="date" id="cf-birth" value="${c.birth_date || ""}"></label>
      <label>状态<select id="cf-status">${["在养", "待售", "已售", "死亡", "已转种鸟"].map((s) => `<option ${s === c.status ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <div class="err" id="cf-err"></div>
      <div class="bar"><button type="button" class="btn-ghost" id="cf-c">取消</button><button type="submit" class="btn-primary">保存</button></div>
    </form>
    <button class="btn-primary" id="cf-promote" style="width:100%;margin-top:14px;background:var(--amber)">一键转种鸟</button>
    ${c.status === "在养" ? `<button class="btn-primary" id="cf-sellready" style="width:100%;margin-top:8px">标记为待售</button>` : ""}
    ${c.status === "待售" ? `<button class="btn-primary" id="cf-backliving" style="width:100%;margin-top:8px;background:var(--muted)">退回在养</button>` : ""}`;
  pageContainer.querySelector("#cf-c").addEventListener("click", () => showPage("chicks"));
  pageContainer.querySelector("#cf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await sb.from("chicks").update({
      band: pageContainer.querySelector("#cf-band").value.trim() || null,
      species: pageContainer.querySelector("#cf-species").value.trim() || null,
      variety: pageContainer.querySelector("#cf-variety").value.trim() || null,
      gender: pageContainer.querySelector("#cf-gender").value,
      birth_date: pageContainer.querySelector("#cf-birth").value || null,
      status: pageContainer.querySelector("#cf-status").value,
    }).eq("id", id);
    if (res.error) { pageContainer.querySelector("#cf-err").textContent = res.error.message; return; }
    toast("已保存"); showPage("chicks");
  });
  pageContainer.querySelector("#cf-promote").addEventListener("click", async () => {
    if (!confirm(`将 ${c.band || c.code} 转为种鸟？`)) return;
    const birdCode = await autoCode("NB", "birds");
    const ins = await sb.from("birds").insert({
      code: birdCode,
      band: c.band, species: c.species, variety: c.variety,
      gender: c.gender === "未知" ? "未知" : c.gender,
      birth_date: c.birth_date, source: "自繁", status: "在养",
      father_id: c.father_id, mother_id: c.mother_id,
    });
    if (ins.error) { alert(ins.error.message); return; }
    await sb.from("chicks").update({ status: "已转种鸟" }).eq("id", id);
    toast("已转种鸟 " + birdCode); showPage("chicks");
  });
  pageContainer.querySelector("#cf-sellready")?.addEventListener("click", async () => {
    await sb.from("chicks").update({ status: "待售" }).eq("id", id);
    toast("已标记为待售"); showPage("chicks");
  });
  pageContainer.querySelector("#cf-backliving")?.addEventListener("click", async () => {
    await sb.from("chicks").update({ status: "在养" }).eq("id", id);
    toast("已退回在养"); showPage("chicks");
  });
}

// ---------- 验卡录入 ----------
function openSexTest() {
  titleEl.textContent = "验卡录入";
  document.querySelectorAll(".nav-item").forEach((x) => x.classList.remove("active"));
  pageContainer.innerHTML = `
    <h2 class="sec">验卡结果录入</h2>
    <form class="form" id="st">
      <label>验卡服务商<input id="st-lab" placeholder="如 XX 基因"></label>
      <label>验卡日期<input type="date" id="st-date" value="${today()}"></label>
      <label>脚环号<span class="req">*</span><input id="st-band"></label>
      <label>品相<input id="st-variety" placeholder="雏鸟未填时会自动回填"></label>
      <label>性别<select id="st-gender"><option>公</option><option>母</option></select></label>
      <div class="err" id="st-err"></div>
      <div class="bar"><button type="button" class="btn-ghost" id="st-c">取消</button><button type="submit" class="btn-primary">保存</button></div>
    </form>`;
  pageContainer.querySelector("#st-c").addEventListener("click", () => showPage("chicks"));
  pageContainer.querySelector("#st").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = pageContainer.querySelector("#st-err");
    const band = pageContainer.querySelector("#st-band").value.trim();
    const lab = pageContainer.querySelector("#st-lab").value.trim();
    const tdate = pageContainer.querySelector("#st-date").value;
    const variety = pageContainer.querySelector("#st-variety").value.trim();
    const gender = pageContainer.querySelector("#st-gender").value;
    if (!band) { err.textContent = "请填脚环号"; return; }
    await sb.from("sex_tests").insert({ lab, test_date: tdate, band, variety: variety || null, gender });
    // 回写雏鸟
    const { data: chick } = await sb.from("chicks").select("*").eq("band", band).eq("deleted", false).single();
    if (chick) {
      const patch = { gender };
      if (!chick.birth_date) patch.birth_date = minusMonths(tdate, 2);
      if (!chick.variety && variety) patch.variety = variety;
      await sb.from("chicks").update(patch).eq("id", chick.id);
      toast("已回写雏鸟 " + band);
    } else {
      toast("已保存验卡记录（未找到对应雏鸟）");
    }
    showPage("chicks");
  });
}

// ---------- 更多 ----------
function renderMore() {
  setTimeout(bindMore, 0);
  return `
    <div class="card quick">
      <button class="btn-line" data-go="orders">销售订单 / 开单</button>
      <button class="btn-line" data-go="customers">客户管理</button>
      <button class="btn-line" disabled style="opacity:.4">采购支出（阶段 4）</button>
      <button class="btn-line" disabled style="opacity:.4">待办提醒（阶段 4）</button>
      <button class="btn-line" disabled style="opacity:.4">统计报表（阶段 5）</button>
    </div>`;
}
function bindMore() {
  document.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => showPage(b.dataset.go))
  );
}

// ---------- 客户 ----------
function renderCustomers() {
  setTimeout(bindCustomers, 0);
  return `
    <div class="bar">
      <input id="c-search" placeholder="姓名 / 电话 / 微信" style="flex:1">
      <button class="btn-primary sm" id="c-add">新增客户</button>
    </div>
    <div id="c-list"></div>`;
}
function bindCustomers() {
  const el = (id) => pageContainer.querySelector(id);
  if (!el("#c-search")) return;
  el("#c-add").addEventListener("click", () => openCustomerForm());
  el("#c-search").addEventListener("input", loadCustomers);
  loadCustomers();
}
async function loadCustomers() {
  const kw = (pageContainer.querySelector("#c-search").value || "").trim();
  let q = sb.from("customers").select("*").eq("deleted", false).order("id", { ascending: false }).limit(200);
  if (kw) q = q.or(`name.ilike.%${kw}%,phone.ilike.%${kw}%,wechat.ilike.%${kw}%`);
  const { data, error } = await q;
  const box = pageContainer.querySelector("#c-list");
  if (!box) return;
  if (error) { box.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  if (!data.length) { box.innerHTML = '<div class="empty">暂无客户</div>'; return; }
  box.innerHTML = data.map((c) => `
    <div class="row" data-id="${c.id}">
      <div>
        <div class="row-title">${esc(c.name || "未命名")}</div>
        <div class="row-sub">${esc(c.phone || "")}${c.wechat ? " · 微信 " + esc(c.wechat) : ""}${c.source ? " · " + esc(c.source) : ""}</div>
      </div>
      <div class="row-arrow">›</div>
    </div>`).join("");
  box.querySelectorAll(".row").forEach((r) =>
    r.addEventListener("click", () => openCustomerForm(Number(r.dataset.id)))
  );
}
function openCustomerForm(id) {
  const existing = id ? null : { name: "", phone: "", wechat: "", source: "线下" };
  titleEl.textContent = id ? "编辑客户" : "新增客户";
  document.querySelectorAll(".nav-item").forEach((x) => x.classList.remove("active"));
  const load = async () => {
    if (id) {
      const { data } = await sb.from("customers").select("*").eq("id", id).single();
      return data;
    }
    return existing;
  };
  load().then((c) => {
    pageContainer.innerHTML = `
      <form class="form" id="cf">
        <label>称呼 / 姓名<input id="cf-name" value="${esc(c.name || "")}"></label>
        <label>电话<input id="cf-phone" value="${esc(c.phone || "")}"></label>
        <label>微信<input id="cf-wechat" value="${esc(c.wechat || "")}"></label>
        <label>来源<select id="cf-source">${["抖音", "闲鱼", "朋友介绍", "线下", "其他"].map((s) => `<option ${s === c.source ? "selected" : ""}>${s}</option>`).join("")}</select></label>
        <label>地址<input id="cf-addr" value="${esc(c.address || "")}"></label>
        <label>备注<textarea id="cf-note" rows="2">${esc(c.note || "")}</textarea></label>
        <div class="err" id="cf-err"></div>
        <div class="bar"><button type="button" class="btn-ghost" id="cf-c">取消</button><button type="submit" class="btn-primary">保存</button></div>
      </form>`;
    pageContainer.querySelector("#cf-c").addEventListener("click", () => showPage("customers"));
    pageContainer.querySelector("#cf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        name: pageContainer.querySelector("#cf-name").value.trim(),
        phone: pageContainer.querySelector("#cf-phone").value.trim() || null,
        wechat: pageContainer.querySelector("#cf-wechat").value.trim() || null,
        source: pageContainer.querySelector("#cf-source").value,
        address: pageContainer.querySelector("#cf-addr").value.trim() || null,
        note: pageContainer.querySelector("#cf-note").value.trim() || null,
      };
      const res = id ? await sb.from("customers").update(payload).eq("id", id)
                     : await sb.from("customers").insert(payload);
      if (res.error) { pageContainer.querySelector("#cf-err").textContent = res.error.message; return; }
      toast("已保存"); showPage("customers");
    });
  });
}

// ---------- 销售订单 ----------
function renderOrders() {
  setTimeout(bindOrders, 0);
  return `
    <div class="bar">
      <select id="o-status"><option value="">全部状态</option>${["未收", "部分", "已收", "已取消"].map((s) => `<option>${s}</option>`).join("")}</select>
      <button class="btn-primary sm" id="o-add" style="margin-left:auto">开新单</button>
    </div>
    <div id="o-list"></div>`;
}
function bindOrders() {
  const el = (id) => pageContainer.querySelector(id);
  if (!el("#o-add")) return;
  el("#o-add").addEventListener("click", () => openOrderForm());
  el("#o-status").addEventListener("change", loadOrders);
  loadOrders();
}
async function loadOrders() {
  const st = pageContainer.querySelector("#o-status").value;
  let q = sb.from("orders").select("*, customers(name,phone)").eq("deleted", false).order("id", { ascending: false }).limit(100);
  if (st) q = q.eq("payment_status", st);
  const { data, error } = await q;
  const box = pageContainer.querySelector("#o-list");
  if (!box) return;
  if (error) { box.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  if (!data.length) { box.innerHTML = '<div class="empty">暂无订单，点「开新单」</div>'; return; }
  box.innerHTML = data.map((o) => `
    <div class="row" data-id="${o.id}">
      <div>
        <div class="row-title">${esc(o.code)} <span class="tag">${esc(o.payment_status)}</span></div>
        <div class="row-sub">${esc(o.customers?.name || "散客")} · ¥${Number(o.total || 0).toFixed(2)} · ${esc(o.order_date)}</div>
      </div>
      <div class="row-arrow">›</div>
    </div>`).join("");
  box.querySelectorAll(".row").forEach((r) =>
    r.addEventListener("click", () => openOrderForm(Number(r.dataset.id)))
  );
}

async function openOrderForm(id) {
  let o = { items: [] };
  if (id) {
    const { data } = await sb.from("orders").select("*, order_items(*), customers(*)").eq("id", id).single();
    o = data;
  } else {
    o.code = await autoCode("SO", "orders");
  }
  titleEl.textContent = id ? "订单详情" : "开新单";
  document.querySelectorAll(".nav-item").forEach((x) => x.classList.remove("active"));
  pageContainer.innerHTML = `
    <form class="form" id="of">
      <label>订单号（自动）<input value="${esc(o.code)}" disabled></label>
      <label>客户<select id="of-customer">
        <option value="">散客 / 现结</option>
      </select>
        <button type="button" class="btn-ghost" style="color:var(--green);border-color:var(--green);padding:3px 10px;margin-top:4px" id="of-newc">＋ 新客户</button>
      </label>
      <label>下单日期<input type="date" id="of-date" value="${o.order_date || today()}"></label>
      <label>交付方式<select id="of-deliver">${["自提", "送货", "快递"].map((d) => `<option ${d === o.delivery_method ? "selected" : ""}>${d}</option>`).join("")}</select></label>

      <h3 class="sec" style="margin:16px 0 6px">订单明细</h3>
      <div id="of-items"></div>
      <button type="button" class="btn-ghost" id="of-additem" style="color:var(--green);border-color:var(--green);width:100%;margin:6px 0">＋ 加一行</button>

      <label>订单总价（元）<input type="number" step="0.01" id="of-total" value="${o.total ?? 0}"></label>

      <label>已收款（元）<input type="number" step="0.01" id="of-paid" value="${(o.payments_sum || 0)}"></label>
      <label>收款方式<select id="of-method">${["微信", "支付宝", "现金", "转账"].map((m) => `<option>${m}</option>`).join("")}</select></label>
      <label>备注<input id="of-note" value="${esc(o.note || "")}"></label>
      <div class="err" id="of-err"></div>
      <div class="bar"><button type="button" class="btn-ghost" id="of-cancel">返回</button><button type="submit" class="btn-primary">保存订单</button></div>
    </form>`;

  // 加载客户列表
  const { data: customers } = await sb.from("customers").select("*").eq("deleted", false).order("id", { ascending: false });
  const sel = pageContainer.querySelector("#of-customer");
  sel.innerHTML = `<option value="">散客 / 现结</option>` + (customers || []).map((c) =>
    `<option value="${c.id}" ${o.customer_id === c.id ? "selected" : ""}>${esc(c.name || "")}${c.phone ? " " + esc(c.phone) : ""}</option>`
  ).join("");
  pageContainer.querySelector("#of-newc").addEventListener("click", () => {
    const name = prompt("客户称呼："); if (!name) return;
    (async () => {
      const ins = await sb.from("customers").insert({ name }).select().single();
      if (ins.error) { alert(ins.error.message); return; }
      sel.innerHTML += `<option value="${ins.data.id}">${esc(name)}</option>`;
      sel.value = ins.data.id;
    })();
  });

  // 明细行
  const speciesOpts = Object.keys(SPECIES_VARIETIES);
  const rows = (o.order_items && o.order_items.length) ? o.order_items : [{ species: "玄凤", qty: 1, price: 0 }];
  const renderRows = () => {
    document.getElementById("of-items").innerHTML = rows.map((r, i) => `
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <select data-i="${i}" data-k="species" style="flex:2;padding:8px;border:1px solid var(--line);border-radius:8px">${speciesOpts.map((s) => `<option ${s === r.species ? "selected" : ""}>${s}</option>`).join("")}</select>
        <input data-i="${i}" data-k="qty" type="number" value="${r.qty}" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:8px" placeholder="数量">
        <input data-i="${i}" data-k="price" type="number" step="0.01" value="${r.price}" style="flex:1.4;padding:8px;border:1px solid var(--line);border-radius:8px" placeholder="单价">
        <button type="button" data-del="${i}" style="color:var(--red);padding:0 8px">×</button>
      </div>`).join("");
    document.querySelectorAll("#of-items [data-k]").forEach((el) =>
      el.addEventListener("change", recalc)
    );
    document.querySelectorAll("#of-items [data-del]").forEach((b) =>
      b.addEventListener("click", () => { rows.splice(Number(b.dataset.del), 1); renderRows(); })
    );
  };
  const recalc = () => {
    let sum = 0;
    document.querySelectorAll("#of-items [data-k=species]").forEach((sel, i) => {
      const q = document.querySelectorAll("#of-items [data-k=qty]")[i].value || 0;
      const p = document.querySelectorAll("#of-items [data-k=price]")[i].value || 0;
      sum += Number(q) * Number(p);
    });
    document.getElementById("of-total").value = sum.toFixed(2);
  };
  pageContainer.querySelector("#of-additem").addEventListener("click", () => { rows.push({ species: "玄凤", qty: 1, price: 0 }); renderRows(); });
  renderRows();

  // 已收款汇总（如果是已有订单）
  if (id) {
    const { data: pays } = await sb.from("payments").select("amount").eq("order_id", id);
    const sumPaid = (pays || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    pageContainer.querySelector("#of-paid").value = sumPaid.toFixed(2);
  }

  pageContainer.querySelector("#of-cancel").addEventListener("click", () => showPage("orders"));
  pageContainer.querySelector("#of").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = pageContainer.querySelector("#of-err");
    err.textContent = "";
    const items = [];
    document.querySelectorAll("#of-items [data-k=species]").forEach((sel, i) => {
      const q = document.querySelectorAll("#of-items [data-k=qty]")[i].value;
      const p = document.querySelectorAll("#of-items [data-k=price]")[i].value;
      if (Number(q) > 0) items.push({ species: sel.value, qty: Number(q), price: Number(p) });
    });
    if (!items.length) { err.textContent = "请至少加一行明细"; return; }
    const total = Number(pageContainer.querySelector("#of-total").value) || 0;
    const paid = Number(pageContainer.querySelector("#of-paid").value) || 0;
    const payStatus = paid <= 0 ? "未收" : (paid >= total ? "已收" : "部分");
    const orderPayload = {
      code: o.code,
      customer_id: pageContainer.querySelector("#of-customer").value || null,
      total, order_date: pageContainer.querySelector("#of-date").value || today(),
      payment_status: payStatus,
      delivery_method: pageContainer.querySelector("#of-deliver").value,
      note: pageContainer.querySelector("#of-note").value.trim() || null,
    };
    let orderId = id;
    if (id) {
      const r = await sb.from("orders").update(orderPayload).eq("id", id);
      if (r.error) { err.textContent = r.error.message; return; }
    } else {
      const r = await sb.from("orders").insert(orderPayload).select().single();
      if (r.error) { err.textContent = r.error.message; return; }
      orderId = r.data.id;
      // 删除旧明细再重插
      await sb.from("order_items").delete().eq("order_id", orderId);
      await sb.from("order_items").insert(items.map((it) => ({ order_id: orderId, ...it })));
      // 收款记录（本次填入的 paid）
      if (paid > 0) {
        await sb.from("payments").insert({
          order_id: orderId, amount: paid,
          method: pageContainer.querySelector("#of-method").value,
        });
      }
      // 扣减待售雏鸟（FIFO）
      await deductChicks(items);
    }
    toast("已保存"); showPage("orders");
  });
}

// 按明细扣减待售雏鸟（FIFO：按品种，从最老的待售雏鸟里标记已售）
async function deductChicks(items) {
  for (const it of items) {
    let need = it.qty;
    while (need > 0) {
      const { data } = await sb.from("chicks").select("*")
        .eq("species", it.species).eq("status", "待售").eq("deleted", false)
        .order("id", { ascending: true }).limit(need);
      if (!data || !data.length) break;
      for (const c of data) {
        await sb.from("chicks").update({ status: "已售" }).eq("id", c.id);
        need--;
        if (need <= 0) break;
      }
    }
  }
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
