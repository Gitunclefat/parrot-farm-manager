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
    html += `<div class="card"><p style="margin-bottom:10px">当前没有进行中的繁殖。繁殖期不便打扰时，可直接开始记录，父母脚环号后期再补。</p>
      <button class="btn-primary" id="start-b">开始繁殖记录</button></div>
      <div class="bar" style="margin-top:14px"><button class="btn-ghost" id="back-b" style="color:var(--muted);border-color:var(--line)">返回巢箱列表</button></div>`;
  } else {
    const stages = ["配对", "产蛋", "孵化中", "出壳", "育雏中", "断奶成活"];
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
  // 选择公母种鸟（按脚环号搜，可留空）
  titleEl.textContent = "开始繁殖记录";
  pageContainer.innerHTML = `
    <h2 class="sec">开始繁殖（可只填巢箱号，父母后补）</h2>
    <form class="form" id="bs">
      <label>配对日期<input type="date" id="bs-date" value="${today()}"></label>
      <label>公鸟脚环号（留空=后期补录）<input id="bs-m" placeholder="输入脚环号搜索"></label>
      <div id="bs-m-msg"></div>
      <label>母鸟脚环号（留空=后期补录）<input id="bs-f" placeholder="输入脚环号搜索"></label>
      <div id="bs-f-msg"></div>
      <div class="err" id="bs-err"></div>
      <div class="bar"><button type="button" class="btn-ghost" id="bs-c">取消</button><button type="submit" class="btn-primary">开始</button></div>
    </form>`;
  const pick = async (inputId, msgId) => {
    const v = pageContainer.querySelector(inputId).value.trim();
    if (!v) { pageContainer.querySelector(msgId).innerHTML = ""; return null; }
    const { data } = await sb.from("birds").select("*").eq("deleted", false)
      .or(`band.eq.${v},code.eq.${v}`).limit(1).single();
    if (data) {
      pageContainer.querySelector(msgId).innerHTML = `<span class="tag">已匹配 ${esc(data.band)} ${esc(data.species)}/${esc(data.variety || "")}</span>`;
      return data;
    }
    pageContainer.querySelector(msgId).innerHTML = `<span style="color:var(--red);font-size:12px">未找到该脚环号，将作为临时记录</span>`;
    return null;
  };
  pageContainer.querySelector("#bs-m").addEventListener("change", () => pick("#bs-m", "#bs-m-msg"));
  pageContainer.querySelector("#bs-f").addEventListener("change", () => pick("#bs-f", "#bs-f-msg"));
  pageContainer.querySelector("#bs-c").addEventListener("click", () => openNest(nestId));
  pageContainer.querySelector("#bs").addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = await pick("#bs-m", "#bs-m-msg");
    const f = await pick("#bs-f", "#bs-f-msg");
    const code = await autoCode("BR", "breedings");
    const ins = await sb.from("breedings").insert({
      code, nest_id: nestId,
      male_id: m ? m.id : null, female_id: f ? f.id : null,
      temp_label: null, pair_date: pageContainer.querySelector("#bs-date").value, stage: "配对",
    });
    if (ins.error) { pageContainer.querySelector("#bs-err").textContent = ins.error.message; return; }
    await sb.from("nests").update({ status: "占用" }).eq("id", nestId);
    toast("繁殖已开始"); openNest(nestId);
  });
}

const STAGE_FIELDS = {
  "产蛋": [["laid_date", "产蛋日期", "date"], ["egg_count", "总蛋数", "number"]],
  "孵化中": [["candle_date", "照蛋日期", "date"], ["fertile_count", "受精蛋数", "number"]],
  "出壳": [["hatch_date", "出壳日期", "date"], ["hatch_count", "出壳只数", "number"]],
  "断奶成活": [["wean_date", "断奶日期", "date"], ["survived_count", "成活只数", "number"], ["died_count", "中途死亡只数", "number"]],
};
const NEXT_STAGE = { "配对": "产蛋", "产蛋": "孵化中", "孵化中": "出壳", "出壳": "育雏中", "育雏中": "断奶成活" };

async function bindStageAdvance(br) {
  const zone = pageContainer.querySelector("#next-stage-zone");
  if (br.stage === "断奶成活") {
    zone.innerHTML = `<p style="color:var(--muted);font-size:13px">本窝已结束，雏鸟已自动生成。</p>`; return;
  }
  if (br.stage === "失败") { zone.innerHTML = ""; return; }
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
  zone.querySelector("#sv-fail").addEventListener("click", async () => {
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
    <button class="btn-primary" id="cf-promote" style="width:100%;margin-top:14px;background:var(--amber)">一键转种鸟</button>`;
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
