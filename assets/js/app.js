// 鹦鹉养殖场管理系统
const SUPABASE_URL = "https://uraxrfmlzpmraskqyowf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NxEEPGId_L46iHJ1kh8-rA_PAJozl-E";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);
const views = { login: $("#view-login"), app: $("#view-app") };
const pageContainer = $("#page-container");
const titleEl = $("#topbar-title");

const SPECIES_VARIETIES = {
  "牡丹": ["紫伊莎", "松石伊莎", "紫熏", "紫罗兰", "其他"],
  "玄凤": ["原始灰", "珍珠", "黄化", "其他"],
  "虎皮": ["原始", "云斑", "黄化", "其他"],
  "和尚": ["绿和尚", "蓝和尚", "其他"],
  "其他": [],
};
const BIRD_STATUS = ["在养", "配对", "隔离", "出售", "死亡", "淘汰", "待补录"];
const CAGE_TYPES = ["繁殖笼", "雏鸟笼", "放飞笼"];
const CAGE_STATUS = ["空闲", "占用", "维修", "停用"];
const BREED_STAGES = ["挂窝", "产蛋", "出壳", "休养"];

let sessionUser = null;

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
    t.style = "position:fixed;left:50%;bottom:100px;transform:translateX(-50%);background:#22302a;color:#fff;padding:10px 18px;border-radius:8px;z-index:99";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.style.opacity = "0"), 2200);
}
async function autoCode(prefix, table) {
  const { data } = await sb.from(table).select("code").order("id", { ascending: false }).limit(1);
  if (data && data[0] && data[0].code) {
    const n = parseInt(String(data[0].code).split("-").pop() || "0", 10) + 1;
    return prefix + "-" + String(n).padStart(4, "0");
  }
  return prefix + "-0001";
}
function today() { return new Date().toISOString().slice(0, 10); }
function minusMonths(dStr, m) {
  const d = new Date(dStr); d.setMonth(d.getMonth() - m);
  return d.toISOString().slice(0, 10);
}

const PAGES = {
  home: { title: "首页", render: renderHome },
  birds: { title: "种鸟档案", render: renderBirds },
  breed: { title: "笼位与繁殖", render: renderBreed },
  chicks: { title: "雏鸟管理", render: renderChicks },
  more: { title: "更多", render: renderMore },
  orders: { title: "销售订单", render: renderOrders },
  customers: { title: "客户管理", render: renderCustomers },
  purchases: { title: "采购支出", render: renderPurchases },
  reminders: { title: "待办提醒", render: renderReminders },
  reports: { title: "统计报表", render: renderReports },
  sexTests: { title: "验卡记录", render: renderSexTests },
  providers: { title: "验卡服务商", render: renderProviders },
  history: { title: "历史繁殖", render: renderHistory },
};

function showPage(name) {
  const p = PAGES[name] || PAGES.home;
  titleEl.textContent = p.title;
  pageContainer.innerHTML = p.render();
  document.querySelectorAll(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.page === name)
  );
}

// ---------- 首页 ----------
function renderHome() {
  loadStats();
  return `
    <div class="grid">
      <div class="card"><div class="stat-num" id="s-bird">-</div><div class="stat-label">在养种鸟</div></div>
      <div class="card"><div class="stat-num" id="s-chick">-</div><div class="stat-label">在养雏鸟</div></div>
      <div class="card"><div class="stat-num" id="s-nest">-</div><div class="stat-label">占用笼位</div></div>
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
    sb.from("birds").select("id", { count: "exact", head: true }).neq("status", "死亡").eq("deleted", false),
    sb.from("chicks").select("id", { count: "exact", head: true }).eq("deleted", false),
    sb.from("nests").select("id", { count: "exact", head: true }).eq("status", "占用").eq("deleted", false),
  ]);
  set("s-bird", r1.count ?? 0);
  set("s-chick", r2.count ?? 0);
  set("s-nest", r3.count ?? 0);
  set("s-sale", "—");
}

// ---------- 笼位与繁殖 ----------
function renderBreed() {
  setTimeout(bindBreed, 0);
  return `
    <div class="bar">
      <input id="c-search" placeholder="按笼号搜索" style="flex:1">
      <button class="btn-primary sm" id="c-add">＋ 登记笼位</button>
    </div>
    <div id="c-list"></div>`;
}
function bindBreed() {
  const el = (id) => pageContainer.querySelector(id);
  if (!el("#c-add")) return;
  el("#c-add").addEventListener("click", () => openCageForm());
  el("#c-search").addEventListener("input", loadCagesList);
  loadCagesList();
}
async function loadActiveBreeding(cageId) {
  const { data } = await sb.from("breedings")
    .select("*, male:birds!breedings_male_id_fkey(ring_no), female:birds!breedings_female_id_fkey(ring_no)")
    .eq("nest_id", cageId).neq("stage", "休养").order("id", { ascending: false }).limit(1);
  return data && data[0] ? data[0] : null;
}
async function loadCagesList() {
  const kw = (pageContainer.querySelector("#c-search").value || "").trim();
  const { data: cages } = await sb.from("nests").select("*").eq("deleted", false).order("code", { ascending: true });
  const list = pageContainer.querySelector("#c-list");
  const filtered = kw ? (cages||[]).filter(c => (c.code||"").includes(kw)) : (cages||[]);
  if (!filtered.length) { list.innerHTML = '<div class="empty">暂无笼位，点「登记笼位」</div>'; return; }
  const rows = await Promise.all(filtered.map(async (c) => {
    const br = await loadActiveBreeding(c.id);
    const maleRing = br ? (br.male?.ring_no || "未上环") : "";
    const femaleRing = br ? (br.female?.ring_no || "未上环") : "";
    const stageLabel = br ? br.stage : (c.type === "繁殖笼" ? "无繁殖" : "—");
    return `
      <div class="row" data-id="${c.id}">
        <div>
          <div class="row-title">${esc(c.code)} <span class="tag">${esc(c.type||"繁殖笼")}</span> <span class="tag" style="background:${c.status==='占用'?'#e8f3e5':'#f4f1ea'}">${esc(c.status||"空闲")}</span></div>
          <div class="row-sub">${esc(stageLabel)}${br ? ` · 公：${esc(maleRing)} 母：${esc(femaleRing)}` : ""}</div>
        </div>
        <div class="row-arrow">›</div>
      </div>`;
  }));
  list.innerHTML = rows.join("");
  list.querySelectorAll(".row").forEach(r => r.addEventListener("click", () => openCageDetail(Number(r.dataset.id))));
}
function openCageForm(id) {
  titleEl.textContent = id ? "编辑笼位" : "登记笼位";
  document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
  const load = id
    ? sb.from("nests").select("*").eq("id", id).single().then(r => r.data)
    : Promise.resolve({ code: "", type: "繁殖笼", status: "空闲" });
  load.then(c => {
    pageContainer.innerHTML = `
      <form class="form" id="cf">
        <label>笼号（如 A-01 / YC01 / FF01）<input id="cf-code" value="${esc(c.code||"")}"></label>
        <label>类型<select id="cf-type">${CAGE_TYPES.map(t=>`<option ${t===c.type?"selected":""}>${t}</option>`).join("")}</select></label>
        <label>状态<select id="cf-status">${CAGE_STATUS.map(s=>`<option ${s===c.status?"selected":""}>${s}</option>`).join("")}</select></label>
        <div class="err" id="cf-err"></div>
        <div class="bar"><button type="button" class="btn-ghost" id="cf-c">取消</button><button type="submit" class="btn-primary">保存</button></div>
      </form>`;
    document.getElementById("cf-c").addEventListener("click", () => showPage("breed"));
    document.getElementById("cf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        code: document.getElementById("cf-code").value.trim(),
        type: document.getElementById("cf-type").value,
        status: document.getElementById("cf-status").value,
      };
      const r = id ? await sb.from("nests").update(payload).eq("id", id)
                   : await sb.from("nests").insert(payload);
      if (r.error) { document.getElementById("cf-err").textContent = r.error.message; return; }
      toast("已保存"); showPage("breed");
    });
  });
}
async function openCageDetail(id) {
  titleEl.textContent = "笼位详情";
  document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
  const { data: cage } = await sb.from("nests").select("*").eq("id", id).single();
  const br = await loadActiveBreeding(id);
  const infoForm = `
    <form class="form" id="cf">
      <h3 class="sec">笼位信息</h3>
      <label>笼号<input id="cf-code" value="${esc(cage.code)}"></label>
      <label>类型<select id="cf-type">${CAGE_TYPES.map(t=>`<option ${t===cage.type?"selected":""}>${t}</option>`).join("")}</select></label>
      <label>状态<select id="cf-status">${CAGE_STATUS.map(s=>`<option ${s===cage.status?"selected":""}>${s}</option>`).join("")}</select></label>
      <button type="submit" class="btn-primary" style="width:100%">保存笼位</button>
    </form>`;
  if (!br) {
    const { data: history } = await sb.from("breedings")
      .select("*, male:birds!breedings_male_id_fkey(ring_no), female:birds!breedings_female_id_fkey(ring_no)")
      .eq("nest_id", id).order("id", { ascending: false });
    pageContainer.innerHTML = `
      ${infoForm}
      ${cage.type === "繁殖笼" ? `
        <button class="btn-primary" id="cf-start" style="width:100%;background:var(--amber);margin-top:10px">开始挂窝</button>
        <h3 class="sec" style="margin-top:16px">历史窝次</h3>
        <div>${(history||[]).map(h=>`
          <div class="row"><div>
            <div class="row-title">${esc(h.code)}</div>
            <div class="row-sub">${esc(h.stage)} · 公 ${esc(h.male?.ring_no||"未上环")} 母 ${esc(h.female?.ring_no||"未上环")} · 蛋${h.egg_count} 受精${h.fertile_count} 出壳${h.hatch_count} 活${h.survive_count}</div>
          </div></div>`).join("") || '<div class="empty">无</div>'}
        </div>` : ""}`;
    document.getElementById("cf").addEventListener("submit", async (e) => {
      e.preventDefault();
      await sb.from("nests").update({
        code: document.getElementById("cf-code").value,
        type: document.getElementById("cf-type").value,
        status: document.getElementById("cf-status").value,
      }).eq("id", id);
      toast("已保存"); showPage("breed");
    });
    document.getElementById("cf-start")?.addEventListener("click", () => startPairing(id));
    return;
  }
  const maleB = await sb.from("birds").select("*").eq("id", br.male_id).single().then(r=>r.data);
  const femaleB = await sb.from("birds").select("*").eq("id", br.female_id).single().then(r=>r.data);
  pageContainer.innerHTML = `
    <h3 class="sec">${esc(cage.code)} · ${esc(cage.type)}</h3>
    <div class="card">
      <div style="font-size:13px;color:var(--muted)">公：${esc(maleB?.ring_no||"未上环")}（${esc(maleB?.code||"")}）</div>
      <div style="font-size:13px;color:var(--muted);margin-top:4px">母：${esc(femaleB?.ring_no||"未上环")}（${esc(femaleB?.code||"")}）</div>
    </div>
    <form class="form" id="bf">
      <label>繁殖阶段<select id="bf-stage">${BREED_STAGES.map(s=>`<option ${s===br.stage?"selected":""}>${s}</option>`).join("")}</select></label>
      <label>第一颗蛋日期<input type="date" id="bf-firstegg" value="${br.first_egg_date||""}"></label>
      <label>第一只出壳日期<input type="date" id="bf-firsthatch" value="${br.first_hatch_date||""}"></label>
      <label>产蛋数<input type="number" id="bf-egg" value="${br.egg_count||0}"></label>
      <label>受精数<input type="number" id="bf-fertile" value="${br.fertile_count||0}"></label>
      <label>出壳数<input type="number" id="bf-hatch" value="${br.hatch_count||0}"></label>
      <label>存活数<input type="number" id="bf-survive" value="${br.survive_count||0}"></label>
      <div class="err" id="bf-err"></div>
      <button type="submit" class="btn-primary" style="width:100%">保存繁殖数据</button>
    </form>`;
  document.getElementById("bf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("bf-err"); err.textContent = "";
    const egg = +document.getElementById("bf-egg").value;
    const fertile = +document.getElementById("bf-fertile").value;
    const hatch = +document.getElementById("bf-hatch").value;
    const survive = +document.getElementById("bf-survive").value;
    const stage = document.getElementById("bf-stage").value;
    if (fertile > egg) { err.textContent = "受精数不能大于产蛋数"; return; }
    if (hatch > fertile) { err.textContent = "出壳数不能大于受精数"; return; }
    if (survive > hatch) { err.textContent = "存活数不能大于出壳数"; return; }
    const payload = {
      stage, egg_count: egg, fertile_count: fertile, hatch_count: hatch, survive_count: survive,
      first_egg_date: document.getElementById("bf-firstegg").value || null,
      first_hatch_date: document.getElementById("bf-firsthatch").value || null,
    };
    const r = await sb.from("breedings").update(payload).eq("id", br.id);
    if (r.error) { err.textContent = r.error.message; return; }
    if (stage === "休养" && survive > 0) {
      await sb.from("nests").update({ status: "空闲" }).eq("id", cage.id);
      toast("已保存，开始转移雏鸟");
      openAddChicksFromBreeding(br.id, survive);
      return;
    }
    toast("已保存"); showPage("breed");
  });
}
async function startPairing(nestId) {
  const { data: males } = await sb.from("birds").select("*").eq("gender","公").eq("status","在养").eq("deleted",false);
  const { data: females } = await sb.from("birds").select("*").eq("gender","母").eq("status","在养").eq("deleted",false);
  titleEl.textContent = "开始挂窝";
  pageContainer.innerHTML = `
    <form class="form" id="pf">
      <label>公鸟<select id="pf-male">${(males||[]).map(b=>`<option value="${b.id}">${esc(b.ring_no||b.code)} (${esc(b.species)}/${esc(b.variety||"")})</option>`).join("")}</select></label>
      <button type="button" class="btn-ghost" id="pf-newmale" style="color:var(--green);border-color:var(--green);margin-bottom:8px">＋ 现场建公鸟</button>
      <label>母鸟<select id="pf-female">${(females||[]).map(b=>`<option value="${b.id}">${esc(b.ring_no||b.code)} (${esc(b.species)}/${esc(b.variety||"")})</option>`).join("")}</select></label>
      <button type="button" class="btn-ghost" id="pf-newfemale" style="color:var(--green);border-color:var(--green);margin-bottom:8px">＋ 现场建母鸟</button>
      <div class="err" id="pf-err"></div>
      <button type="submit" class="btn-primary" style="width:100%">开始挂窝</button>
    </form>`;
  const newBird = async (gender) => {
    const code = await autoCode("NB", "birds");
    const birdCode = prompt(`${gender}鸟档案号（默认 ${code}，回车使用默认）：`, code);
    if (!birdCode) return;
    const ins = await sb.from("birds").insert({ code: birdCode, gender, species: "牡丹", variety: "其他", status: "待补录" }).select().single();
    if (ins.error) { alert(ins.error.message); return; }
    const selId = gender === "公" ? "pf-male" : "pf-female";
    const opt = document.createElement("option");
    opt.value = ins.data.id; opt.textContent = `${ins.data.code} (待补录)`;
    document.getElementById(selId).appendChild(opt);
    document.getElementById(selId).value = ins.data.id;
  };
  document.getElementById("pf-newmale").addEventListener("click", () => newBird("公"));
  document.getElementById("pf-newfemale").addEventListener("click", () => newBird("母"));
  document.getElementById("pf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const maleId = document.getElementById("pf-male").value;
    const femaleId = document.getElementById("pf-female").value;
    if (!maleId || !femaleId) { document.getElementById("pf-err").textContent="请选公母"; return; }
    if (maleId === femaleId) { document.getElementById("pf-err").textContent="公母不能是同一只"; return; }
    const code = await autoCode("BR", "breedings");
    const r = await sb.from("breedings").insert({
      code, nest_id: nestId, male_id: +maleId, female_id: +femaleId, stage: "挂窝",
    });
    if (r.error) { document.getElementById("pf-err").textContent = r.error.message; return; }
    await sb.from("nests").update({ status: "占用" }).eq("id", nestId);
    await sb.from("birds").update({ nest_id: nestId, status: "在养" }).in("id", [+maleId, +femaleId]);
    toast("已开始挂窝"); showPage("breed");
  });
}
async function openAddChicksFromBreeding(breedingId, surviveCount) {
  titleEl.textContent = "转移雏鸟到雏鸟笼";
  const { data: cageOpts } = await sb.from("nests").select("*").eq("type","雏鸟笼").eq("deleted",false).order("code");
  const rows = Array.from({length: surviveCount}, (_,i) => i+1);
  pageContainer.innerHTML = `
    <div class="card" style="font-size:13px;color:var(--muted)">窝次已转入休养。请把 ${surviveCount} 只雏鸟录到雏鸟笼：</div>
    <form class="form" id="ac">
      <label>雏鸟笼<select id="ac-cage">${(cageOpts||[]).map(c=>`<option value="${c.id}">${esc(c.code)}</option>`).join("")}</select></label>
      <label>出壳日期<input type="date" id="ac-hatch" value="${today()}"></label>
      <h3 class="sec">逐只录入</h3>
      ${rows.map(i=>`
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <span style="line-height:36px;color:var(--muted)">#${i}</span>
          <input data-k="ring" placeholder="脚环号（可空）" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:8px">
          <input data-k="variety" placeholder="品相" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:8px">
        </div>`).join("")}
      <button type="submit" class="btn-primary" style="width:100%">保存雏鸟档案</button>
    </form>`;
  document.getElementById("ac").addEventListener("submit", async (e) => {
    e.preventDefault();
    const cageId = +document.getElementById("ac-cage").value;
    const hatchDate = document.getElementById("ac-hatch").value;
    const rings = Array.from(document.querySelectorAll('[data-k=ring]')).map(x=>x.value.trim());
    const varieties = Array.from(document.querySelectorAll('[data-k=variety]')).map(x=>x.value.trim());
    const items = rings.map((r,i)=>({
      breeding_id: breedingId, cage_id: cageId,
      ring_no: r || null, hatch_date: hatchDate,
      variety: varieties[i] || null,
      status: "在养", gender: "未知",
    }));
    const r = await sb.from("chicks").insert(items);
    if (r.error) { alert(r.error.message); return; }
    toast("雏鸟档案已建"); showPage("chicks");
  });
}

// ---------- 种鸟 ----------
function renderBirds() {
  setTimeout(bindBirds, 0);
  return `
    <div class="bar">
      <input id="b-search" placeholder="按脚环号 / 档案号搜索" style="flex:1">
      <button class="btn-primary sm" id="b-add">新增</button>
    </div>
    <div id="b-list"></div>`;
}
function bindBirds() {
  const el = (id) => pageContainer.querySelector(id);
  if (!el("#b-search")) return;
  el("#b-add").addEventListener("click", () => openBirdForm());
  el("#b-search").addEventListener("input", loadBirds);
  loadBirds();
}
async function loadBirds() {
  const kw = (pageContainer.querySelector("#b-search").value || "").trim();
  let q = sb.from("birds").select("*, nests(code)").eq("deleted",false).order("code",{ascending:true}).limit(500);
  if (kw) q = q.or(`ring_no.ilike.%${kw}%,code.ilike.%${kw}%`);
  const { data, error } = await q;
  const list = pageContainer.querySelector("#b-list");
  if (!list) return;
  if (error) { list.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  if (!data || !data.length) { list.innerHTML = '<div class="empty">暂无种鸟</div>'; return; }
  list.innerHTML = data.map(b=>`
    <div class="row" data-id="${b.id}">
      <div>
        <div class="row-title">${esc(b.ring_no||b.code)} <span class="tag">${esc(b.gender)}</span></div>
        <div class="row-sub">${esc(b.species)}/${esc(b.variety||"")} · 笼：${esc(b.nests?.code||"未分配")} · ${esc(b.status)}</div>
      </div>
      <div class="row-arrow">›</div>
    </div>`).join("");
  list.querySelectorAll(".row").forEach(r => r.addEventListener("click", () => openBirdForm(Number(r.dataset.id))));
}
async function openBirdForm(id) {
  titleEl.textContent = id ? "编辑种鸟" : "登记种鸟";
  document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
  const { data: cages } = await sb.from("nests").select("*").eq("deleted",false).order("code");
  const load = id
    ? sb.from("birds").select("*").eq("id", id).single().then(r=>r.data)
    : sb.from("birds").select("code").order("id",{ascending:false}).limit(1).then(r=>({ species: "牡丹", gender: "公", status: "在养", code: "" }));
  load.then(async (b) => {
    const birdCode = b.code || await autoCode("NB","birds");
    pageContainer.innerHTML = `
      <form class="form" id="bf">
        <label>档案号<input id="bf-code" value="${esc(birdCode)}"></label>
        <label>所在笼号（必选）<select id="bf-cage">
          <option value="">-- 请选择笼号 --</option>
          ${(cages||[]).map(c=>`<option value="${c.id}" ${b.nest_id===c.id?"selected":""}>${esc(c.code)} (${esc(c.type)})</option>`).join("")}
        </select></label>
        <label>品种<select id="bf-species">
          ${Object.keys(SPECIES_VARIETIES).map(s=>`<option ${s===b.species?"selected":""}>${s}</option>`).join("")}
          <option value="__new__">＋ 新品种</option>
        </select></label>
        <label>品相<select id="bf-variety"></select></label>
        <label>性别<select id="bf-gender">${["公","母","未知"].map(g=>`<option ${g===b.gender?"selected":""}>${g}</option>`).join("")}</select></label>
        <label>状态<select id="bf-status">${BIRD_STATUS.map(s=>`<option ${s===b.status?"selected":""}>${s}</option>`).join("")}</select></label>
        <label>脚环号（可空）<input id="bf-ring" value="${esc(b.ring_no||"")}"></label>
        <div class="err" id="bf-err"></div>
        <button type="submit" class="btn-primary" style="width:100%">保存</button>
        ${id ? `<button type="button" id="bf-history" class="btn-ghost" style="width:100%;margin-top:8px">查看历史窝次</button>` : ""}
      </form>`;
    const speciesSel = document.getElementById("bf-species");
    const varietySel = document.getElementById("bf-variety");
    const fillVarieties = (sp, current) => {
      const list = SPECIES_VARIETIES[sp] || [];
      varietySel.innerHTML = list.map(v=>`<option ${v===current?"selected":""}>${v}</option>`).join("") + '<option value="__new__">＋ 新品相</option>';
    };
    fillVarieties(b.species, b.variety);
    speciesSel.addEventListener("change", () => {
      if (speciesSel.value === "__new__") {
        const sp = prompt("新品种名称：");
        if (sp) { SPECIES_VARIETIES[sp] = []; const opt = document.createElement("option"); opt.value=sp; opt.textContent=sp; speciesSel.insertBefore(opt, speciesSel.lastElementChild); speciesSel.value=sp; fillVarieties(sp, ""); }
        speciesSel.value = b.species || "牡丹";
      } else fillVarieties(speciesSel.value, "");
    });
    varietySel.addEventListener("change", () => {
      if (varietySel.value === "__new__") {
        const v = prompt("新品相名称：");
        if (v) {
          if (!SPECIES_VARIETIES[speciesSel.value].includes(v)) SPECIES_VARIETIES[speciesSel.value].push(v);
          const opt = document.createElement("option"); opt.value=v; opt.textContent=v;
          varietySel.insertBefore(opt, varietySel.lastElementChild); varietySel.value=v;
        }
      }
    });
    document.getElementById("bf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = document.getElementById("bf-err"); err.textContent = "";
      const cageId = document.getElementById("bf-cage").value;
      if (!cageId) { err.textContent = "请选择所在笼号"; return; }
      const payload = {
        code: document.getElementById("bf-code").value.trim(),
        nest_id: +cageId,
        species: speciesSel.value,
        variety: varietySel.value,
        gender: document.getElementById("bf-gender").value,
        status: document.getElementById("bf-status").value,
        ring_no: document.getElementById("bf-ring").value.trim() || null,
      };
      const r = id ? await sb.from("birds").update(payload).eq("id", id)
                   : await sb.from("birds").insert(payload);
      if (r.error) { err.textContent = r.error.message; return; }
      await sb.from("nests").update({ status: "占用" }).eq("id", cageId);
      toast("已保存"); showPage("birds");
    });
    document.getElementById("bf-history")?.addEventListener("click", () => {
      showPage("history");
      setTimeout(()=>{ document.getElementById("h-search").value = b.ring_no || b.code; loadHistory(); }, 50);
    });
  });
}

// ---------- 雏鸟 ----------
function renderChicks() {
  setTimeout(bindChicks, 0);
  return `
    <div class="bar">
      <button class="btn-primary sm" id="k-add" style="width:100%">＋ 添加雏鸟</button>
    </div>
    <div id="k-list"></div>`;
}
function bindChicks() {
  const el = (id) => pageContainer.querySelector(id);
  if (!el("#k-add")) return;
  el("#k-add").addEventListener("click", ()=>openChickForm());
  loadChicks();
}
async function loadChicks() {
  const { data: chicks } = await sb.from("chicks").select("*, nests(code), breedings(code)").eq("deleted",false).order("id",{ascending:false});
  const { data: cages } = await sb.from("nests").select("*").eq("type","雏鸟笼").eq("deleted",false).order("code");
  const list = pageContainer.querySelector("#k-list");
  if (!list) return;
  const groups = {};
  (chicks||[]).forEach(c => {
    const key = c.cage_id || 0;
    (groups[key] = groups[key] || []).push(c);
  });
  let html = "";
  (cages||[]).forEach(cage => {
    const arr = groups[cage.id] || [];
    if (!arr.length) return;
    const ringed = arr.filter(c=>c.ring_no);
    const unringed = arr.length - ringed.length;
    html += `
      <h3 class="sec">${esc(cage.code)} <span style="color:var(--muted);font-weight:400;font-size:13px">共 ${arr.length} 只</span></h3>
      ${arr.map(c=>`
        <div class="row" data-id="${c.id}">
          <div>
            <div class="row-title">${esc(c.ring_no||"未上环")} <span class="tag">${esc(c.gender)}</span> <span class="tag">${esc(c.status)}</span></div>
            <div class="row-sub">${esc(c.breedings?.code||"")} · 品相 ${esc(c.variety||"")} · ${esc(c.hatch_date||"")}</div>
          </div>
          <div class="row-arrow">›</div>
        </div>`).join("")}`;
  });
  const noCage = groups[0] || [];
  if (noCage.length) {
    html += `<h3 class="sec">未分配笼</h3>` + noCage.map(c=>`
      <div class="row" data-id="${c.id}">
        <div>
          <div class="row-title">${esc(c.ring_no||"未上环")} <span class="tag">${esc(c.gender)}</span></div>
          <div class="row-sub">${esc(c.breedings?.code||"")} · ${esc(c.variety||"")} · ${esc(c.hatch_date||"")}</div>
        </div>
        <div class="row-arrow">›</div>
      </div>`).join("");
  }
  list.innerHTML = html || '<div class="empty">暂无雏鸟</div>';
  list.querySelectorAll(".row[data-id]").forEach(r => r.addEventListener("click", () => openChickForm(Number(r.dataset.id))));
}
async function openChickForm(id) {
  titleEl.textContent = id ? "编辑雏鸟" : "添加雏鸟";
  document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
  const [cageOptsRes, breedOptsRes, existingRes] = await Promise.all([
    sb.from("nests").select("*").eq("type","雏鸟笼").eq("deleted",false).order("code"),
    sb.from("breedings").select("*").order("id",{ascending:false}).limit(100),
    id ? sb.from("chicks").select("*").eq("id", id).single() : Promise.resolve({data:null}),
  ]);
  const c = existingRes.data || { ring_no:"", hatch_date: today(), variety:"", gender:"未知", status:"在养" };
  pageContainer.innerHTML = `
    <form class="form" id="kf">
      <label>窝次编号<select id="kf-breeding">
        <option value="">-- 无 --</option>
        ${(breedOptsRes.data||[]).map(b=>`<option value="${b.id}" ${c.breeding_id===b.id?"selected":""}>${esc(b.code)}</option>`).join("")}
      </select></label>
      <label>雏鸟笼<select id="kf-cage">
        ${(cageOptsRes.data||[]).map(x=>`<option value="${x.id}" ${c.cage_id===x.id?"selected":""}>${esc(x.code)}</option>`).join("")}
      </select></label>
      <label>脚环号（可空）<input id="kf-ring" value="${esc(c.ring_no||"")}"></label>
      <label>出壳日期<input type="date" id="kf-hatch" value="${c.hatch_date||""}"></label>
      <label>品相<select id="kf-variety"></select></label>
      <label>性别<select id="kf-gender">${["未知","公","母"].map(g=>`<option ${g===c.gender?"selected":""}>${g}</option>`).join("")}</select></label>
      <label>状态<select id="kf-status">${["在养","待售","已售","死亡"].map(s=>`<option ${s===c.status?"selected":""}>${s}</option>`).join("")}</select></label>
      <div class="err" id="kf-err"></div>
      <button type="submit" class="btn-primary" style="width:100%">保存</button>
    </form>`;
  const varietySel = document.getElementById("kf-variety");
  const fillVarieties = () => {
    const all = new Set();
    Object.values(SPECIES_VARIETIES).flat().forEach(v=>all.add(v));
    all.add("其他");
    varietySel.innerHTML = [...all].map(v=>`<option ${v===c.variety?"selected":""}>${v}</option>`).join("") + '<option value="__new__">＋ 新品相</option>';
  };
  fillVarieties();
  varietySel.addEventListener("change", ()=>{ if(varietySel.value==="__new__"){ const v=prompt("新品相："); if(v){ const o=document.createElement("option"); o.value=v; o.textContent=v; varietySel.insertBefore(o, varietySel.lastElementChild); varietySel.value=v; } } });
  document.getElementById("kf").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const payload = {
      breeding_id: document.getElementById("kf-breeding").value || null,
      cage_id: +document.getElementById("kf-cage").value || null,
      ring_no: document.getElementById("kf-ring").value.trim() || null,
      hatch_date: document.getElementById("kf-hatch").value || null,
      variety: varietySel.value,
      gender: document.getElementById("kf-gender").value,
      status: document.getElementById("kf-status").value,
    };
    if (!id) payload.code = await autoCode("CH", "chicks");
    const r = id ? await sb.from("chicks").update(payload).eq("id", id)
                 : await sb.from("chicks").insert(payload);
    if (r.error) { document.getElementById("kf-err").textContent = r.error.message; return; }
    toast("已保存"); showPage("chicks");
  });
}

// ---------- 更多 ----------
function renderMore() {
  setTimeout(bindMore, 0);
  return `
    <div class="card quick">
      <button class="btn-line" data-go="orders">销售订单 / 开单</button>
      <button class="btn-line" data-go="customers">客户管理</button>
      <button class="btn-line" data-go="purchases">采购支出</button>
      <button class="btn-line" data-go="reminders">待办提醒</button>
      <button class="btn-line" data-go="sexTests">验卡记录</button>
      <button class="btn-line" data-go="providers">验卡服务商</button>
      <button class="btn-line" data-go="history">历史繁殖</button>
      <button class="btn-line" data-go="reports">统计报表</button>
    </div>`;
}
function bindMore() {
  document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click", ()=>showPage(b.dataset.go)));
}

// ---------- 验卡服务商 ----------
function renderProviders() { setTimeout(bindProviders,0); return `<div class="bar"><button class="btn-primary sm" id="pv-add">新增服务商</button></div><div id="pv-list"></div>`; }
function bindProviders() {
  const el = (id)=>pageContainer.querySelector(id);
  if (!el("#pv-add")) return;
  el("#pv-add").addEventListener("click", ()=>openProviderForm());
  loadProviders();
}
async function loadProviders() {
  const { data } = await sb.from("sex_providers").select("*").eq("deleted",false).order("id",{ascending:false});
  const list = pageContainer.querySelector("#pv-list");
  if (!list) return;
  list.innerHTML = (data||[]).map(p=>`
    <div class="row" data-id="${p.id}"><div>
      <div class="row-title">${esc(p.name)}</div>
      <div class="row-sub">${esc(p.recipient||"")} ${esc(p.phone||"")} · ¥${Number(p.unit_price||0).toFixed(2)}/只 · ${esc(p.address||"")}</div>
    </div><div class="row-arrow">›</div></div>`).join("") || '<div class="empty">暂无服务商</div>';
  list.querySelectorAll(".row").forEach(r=>r.addEventListener("click", ()=>openProviderForm(Number(r.dataset.id))));
}
function openProviderForm(id) {
  titleEl.textContent = id?"编辑服务商":"新增服务商";
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
  const load = id ? sb.from("sex_providers").select("*").eq("id",id).single().then(r=>r.data)
                  : Promise.resolve({});
  load.then(p=>{
    pageContainer.innerHTML = `
      <form class="form" id="pvf">
        <label>商家名称<input id="pvf-name" value="${esc(p.name||"")}"></label>
        <label>收件人<input id="pvf-rec" value="${esc(p.recipient||"")}"></label>
        <label>电话<input id="pvf-phone" value="${esc(p.phone||"")}"></label>
        <label>单只价格<input type="number" step="0.01" id="pvf-price" value="${p.unit_price||0}"></label>
        <label>邮寄地址<input id="pvf-addr" value="${esc(p.address||"")}"></label>
        <div class="err" id="pvf-err"></div>
        <div class="bar"><button type="button" class="btn-ghost" id="pvf-c">取消</button><button type="submit" class="btn-primary">保存</button></div>
      </form>`;
    document.getElementById("pvf-c").addEventListener("click", ()=>showPage("providers"));
    document.getElementById("pvf").addEventListener("submit", async (e)=>{
      e.preventDefault();
      const payload = {
        name: document.getElementById("pvf-name").value.trim(),
        recipient: document.getElementById("pvf-rec").value.trim()||null,
        phone: document.getElementById("pvf-phone").value.trim()||null,
        unit_price: +document.getElementById("pvf-price").value||0,
        address: document.getElementById("pvf-addr").value.trim()||null,
      };
      const r = id ? await sb.from("sex_providers").update(payload).eq("id",id)
                   : await sb.from("sex_providers").insert(payload);
      if (r.error) { document.getElementById("pvf-err").textContent=r.error.message; return; }
      toast("已保存"); showPage("providers");
    });
  });
}

// ---------- 验卡记录 ----------
function renderSexTests() {
  setTimeout(bindSexTests,0);
  return `
    <div class="bar">
      <button class="btn-primary sm" id="st-new">新建验卡批</button>
      <button class="btn-primary sm" id="st-import" style="background:var(--amber);color:#fff">批量导入</button>
    </div>
    <div id="st-list"></div>`;
}
function bindSexTests() {
  const el=(id)=>pageContainer.querySelector(id);
  if (!el("#st-new")) return;
  el("#st-new").addEventListener("click", ()=>openSexTestForm());
  el("#st-import").addEventListener("click", openImportSexTest);
  loadSexTests();
}
async function loadSexTests() {
  const { data, error } = await sb.from("sex_tests").select("*, sex_providers(name)").eq("deleted",false).order("id",{ascending:false});
  const list = pageContainer.querySelector("#st-list");
  if (!list) return;
  if (error) { list.innerHTML=`<div class="empty">${esc(error.message)}</div>`; return; }
  list.innerHTML = (data||[]).map(t=>`
    <div class="row" data-id="${t.id}">
      <div>
        <div class="row-title">${esc(t.code)} <span class="tag">${esc(t.sex_providers?.name||"")}</span></div>
        <div class="row-sub">${esc(t.test_date)} · ${t.count} 只 · 验卡费 ¥${Number(t.fee||0)} 快递 ¥${Number(t.shipping_fee||0)}</div>
      </div>
      <div class="row-arrow">›</div>
    </div>`).join("") || '<div class="empty">暂无验卡记录</div>';
  list.querySelectorAll(".row").forEach(r=>r.addEventListener("click", ()=>openSexTestItems(Number(r.dataset.id))));
}
async function openSexTestForm() {
  titleEl.textContent = "新建验卡批";
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
  const { data: providers } = await sb.from("sex_providers").select("*").eq("deleted",false);
  const code = await autoCode("ST","sex_tests");
  pageContainer.innerHTML = `
    <form class="form" id="stf">
      <label>编号（自动）<input value="${code}" disabled></label>
      <label>验卡日期<input type="date" id="stf-date" value="${today()}"></label>
      <label>服务商<select id="stf-prov">${(providers||[]).map(p=>`<option value="${p.id}">${esc(p.name)} ¥${p.unit_price}/只</option>`).join("")}</select></label>
      <label>雏鸟数量<input type="number" id="stf-count" value="0"></label>
      <label>验卡费<input type="number" step="0.01" id="stf-fee" value="0"></label>
      <label>快递费<input type="number" step="0.01" id="stf-ship" value="0"></label>
      <div class="err" id="stf-err"></div>
      <button type="submit" class="btn-primary" style="width:100%">保存</button>
    </form>`;
  document.getElementById("stf").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const payload = {
      code, test_date: document.getElementById("stf-date").value,
      provider_id: +document.getElementById("stf-prov").value,
      count: +document.getElementById("stf-count").value||0,
      fee: +document.getElementById("stf-fee").value||0,
      shipping_fee: +document.getElementById("stf-ship").value||0,
    };
    const r = await sb.from("sex_tests").insert(payload);
    if (r.error) { document.getElementById("stf-err").textContent=r.error.message; return; }
    toast("已保存"); showPage("sexTests");
  });
}
async function openSexTestItems(testId) {
  titleEl.textContent = "验卡详情";
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
  pageContainer.innerHTML = `
    <div id="items-list"></div>
    <h3 class="sec">添加单条</h3>
    <form class="form" id="itf">
      <label>脚环号<input id="itf-ring"></label>
      <label>性别<select id="itf-gender"><option>公</option><option>母</option></select></label>
      <label>品相<input id="itf-variety"></label>
      <button type="submit" class="btn-primary" style="width:100%">添加</button>
    </form>`;
  const render = async () => {
    const { data } = await sb.from("sex_test_items").select("*").eq("sex_test_id",testId).order("id",{ascending:true});
    document.getElementById("items-list").innerHTML = (data||[]).map(it=>`
      <div class="row"><div>
        <div class="row-title">${esc(it.ring_no)} <span class="tag">${esc(it.gender)}</span></div>
        <div class="row-sub">${esc(it.variety||"")}</div>
      </div></div>`).join("") || '<div class="empty">暂无详情</div>';
  };
  await render();
  document.getElementById("itf").addEventListener("submit", async (e)=>{
    e.preventDefault();
    await sb.from("sex_test_items").insert({
      sex_test_id: testId,
      ring_no: document.getElementById("itf-ring").value.trim(),
      gender: document.getElementById("itf-gender").value,
      variety: document.getElementById("itf-variety").value.trim()||null,
    });
    document.getElementById("itf-ring").value=""; document.getElementById("itf-variety").value="";
    await render();
  });
}
function openImportSexTest() {
  titleEl.textContent = "批量导入验卡结果";
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
  pageContainer.innerHTML = `
    <form class="form" id="imf">
      <label>选择验卡批次<select id="imf-test"><option>加载中…</option></select></label>
      <label>Excel 文件（列：脚环号、品相、性别）<input type="file" id="imf-file" accept=".xlsx,.xls"></label>
      <div id="imf-preview" style="font-size:13px;color:var(--muted)"></div>
      <button type="button" class="btn-primary" id="imf-run" style="width:100%">导入并回写雏鸟</button>
    </form>`;
  (async ()=>{
    const { data } = await sb.from("sex_tests").select("*").eq("deleted",false).order("id",{ascending:false});
    document.getElementById("imf-test").innerHTML = (data||[]).map(t=>`<option value="${t.id}">${t.test_date} (${t.code})</option>`).join("") || '<option value="">请先新建批次</option>';
  })();
  let rows = [];
  document.getElementById("imf-file").addEventListener("change", (e)=>{
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev)=>{
      const wb = XLSX.read(new Uint8Array(ev.target.result));
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const headerIdx = json.findIndex(r => r.some(c => String(c).includes("脚环")));
      const header = json[headerIdx] || [];
      const ringI = header.findIndex(c=>String(c).includes("脚环"));
      const varI = header.findIndex(c=>String(c).includes("品相"));
      const genI = header.findIndex(c=>String(c).includes("性别"));
      rows = json.slice(headerIdx+1).filter(r=>r[ringI]).map(r=>({
        ring_no: String(r[ringI]||"").trim(),
        variety: varI>=0 ? String(r[varI]||"").trim() : "",
        gender: genI>=0 ? String(r[genI]||"").trim() : "",
      }));
      document.getElementById("imf-preview").textContent = `识别到 ${rows.length} 条：` + rows.slice(0,3).map(r=>`${r.ring_no}/${r.variety}/${r.gender}`).join("，") + (rows.length>3?"…":"");
    };
    reader.readAsArrayBuffer(f);
  });
  document.getElementById("imf-run").addEventListener("click", async ()=>{
    const testId = +document.getElementById("imf-test").value;
    if (!testId) { alert("请先新建批次"); return; }
    if (!rows.length) { alert("请先选择 Excel 文件"); return; }
    const { data: test } = await sb.from("sex_tests").select("test_date").eq("id",testId).single();
    const testDate = test.test_date;
    for (const r of rows) {
      await sb.from("sex_test_items").insert({ sex_test_id: testId, ring_no: r.ring_no, gender: r.gender, variety: r.variety });
      const { data: chicks } = await sb.from("chicks").select("*").eq("ring_no", r.ring_no).limit(1);
      if (chicks && chicks[0]) {
        const c = chicks[0];
        const upd = { gender: r.gender || c.gender };
        if (r.variety && !c.variety) upd.variety = r.variety;
        if (!c.hatch_date) upd.hatch_date = minusMonths(testDate, 2);
        await sb.from("chicks").update(upd).eq("id", c.id);
      }
    }
    await sb.from("sex_tests").update({ count: rows.length }).eq("id", testId);
    toast("已导入并回写"); showPage("sexTests");
  });
}

// ---------- 历史繁殖 ----------
function renderHistory() {
  setTimeout(bindHistory,0);
  return `
    <div class="bar"><input id="h-search" placeholder="按脚环号查询" style="flex:1"></div>
    <div id="h-list"></div>`;
}
function bindHistory() {
  const el=(id)=>pageContainer.querySelector(id);
  if (!el("#h-search")) return;
  el("#h-search").addEventListener("input", loadHistory);
  loadHistory();
}
async function loadHistory() {
  const kw = (pageContainer.querySelector("#h-search").value||"").trim();
  const { data } = await sb.from("breedings").select("*, nests(code), male:birds!breedings_male_id_fkey(ring_no,code), female:birds!breedings_female_id_fkey(ring_no,code)").order("id",{ascending:false}).limit(200);
  let rows = data||[];
  if (kw) rows = rows.filter(b =>
    (b.male?.ring_no||"").includes(kw) || (b.female?.ring_no||"").includes(kw) ||
    (b.male?.code||"").includes(kw) || (b.female?.code||"").includes(kw) || (b.code||"").includes(kw)
  );
  const list = pageContainer.querySelector("#h-list");
  if (!list) return;
  list.innerHTML = rows.map(b=>`
    <div class="row">
      <div>
        <div class="row-title">${esc(b.code)} <span class="tag">${esc(b.stage)}</span> <span class="tag">${esc(b.nests?.code||"")}</span></div>
        <div class="row-sub">公：${esc(b.male?.ring_no||b.male?.code||"")} · 母：${esc(b.female?.ring_no||b.female?.code||"")}</div>
        <div class="row-sub">产蛋 ${b.egg_count} · 受精 ${b.fertile_count} · 出壳 ${b.hatch_count} · 存活 ${b.survive_count}</div>
        <div class="row-sub">首蛋 ${esc(b.first_egg_date||"-")} · 首出壳 ${esc(b.first_hatch_date||"-")}</div>
      </div>
    </div>`).join("") || '<div class="empty">无记录</div>';
}

// ---------- 客户 / 订单 / 采购 / 待办 / 报表 ----------
function renderCustomers() {
  setTimeout(bindCustomers,0);
  return `<div class="bar"><input id="c-search" placeholder="姓名/电话/微信" style="flex:1"><button class="btn-primary sm" id="c-add">新增客户</button></div><div id="c-list"></div>`;
}
function bindCustomers() {
  const el=(id)=>pageContainer.querySelector(id);
  if (!el("#c-add")) return;
  el("#c-add").addEventListener("click", ()=>openCustomerForm());
  el("#c-search").addEventListener("input", loadCustomers);
  loadCustomers();
}
async function loadCustomers() {
  const kw = (pageContainer.querySelector("#c-search").value||"").trim();
  let q = sb.from("customers").select("*").eq("deleted",false).order("id",{ascending:false}).limit(200);
  if (kw) q = q.or(`name.ilike.%${kw}%,phone.ilike.%${kw}%`);
  const { data, error } = await q;
  const box = pageContainer.querySelector("#c-list");
  if (!box) return;
  if (error) { box.innerHTML=`<div class="empty">${esc(error.message)}</div>`; return; }
  box.innerHTML = (data||[]).map(c=>`
    <div class="row" data-id="${c.id}"><div>
      <div class="row-title">${esc(c.name||"未命名")}</div>
      <div class="row-sub">${esc(c.phone||"")}${c.source?" · "+esc(c.source):""}</div>
    </div><div class="row-arrow">›</div></div>`).join("") || '<div class="empty">暂无客户</div>';
  box.querySelectorAll(".row").forEach(r=>r.addEventListener("click", ()=>openCustomerForm(Number(r.dataset.id))));
}
function openCustomerForm(id) {
  titleEl.textContent = id?"编辑客户":"新增客户";
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
  const load = id ? sb.from("customers").select("*").eq("id",id).single().then(r=>r.data)
                  : Promise.resolve({name:"",phone:"",wechat:"",source:"线下",address:"",note:""});
  load.then(c=>{
    pageContainer.innerHTML = `
      <form class="form" id="cf">
        <label>称呼<input id="cf-name" value="${esc(c.name||"")}"></label>
        <label>电话<input id="cf-phone" value="${esc(c.phone||"")}"></label>
        <label>微信<input id="cf-wechat" value="${esc(c.wechat||"")}"></label>
        <label>来源<select id="cf-source">${["抖音","闲鱼","朋友介绍","线下","其他"].map(s=>`<option ${s===c.source?"selected":""}>${s}</option>`).join("")}</select></label>
        <label>备注<input id="cf-note" value="${esc(c.note||"")}"></label>
        <div class="err" id="cf-err"></div>
        <div class="bar"><button type="button" class="btn-ghost" id="cf-c">取消</button><button type="submit" class="btn-primary">保存</button></div>
      </form>`;
    document.getElementById("cf-c").addEventListener("click", ()=>showPage("customers"));
    document.getElementById("cf").addEventListener("submit", async (e)=>{
      e.preventDefault();
      const payload = {
        name: document.getElementById("cf-name").value.trim(),
        phone: document.getElementById("cf-phone").value.trim()||null,
        wechat: document.getElementById("cf-wechat").value.trim()||null,
        source: document.getElementById("cf-source").value,
        note: document.getElementById("cf-note").value.trim()||null,
      };
      const r = id ? await sb.from("customers").update(payload).eq("id",id)
                   : await sb.from("customers").insert(payload);
      if (r.error) { document.getElementById("cf-err").textContent=r.error.message; return; }
      toast("已保存"); showPage("customers");
    });
  });
}
function renderOrders() {
  setTimeout(bindOrders,0);
  return `<div class="bar"><select id="o-status"><option value="">全部状态</option>${["未收","部分","已收","已取消"].map(s=>`<option>${s}</option>`).join("")}</select><button class="btn-primary sm" id="o-add" style="margin-left:auto">开新单</button></div><div id="o-list"></div>`;
}
function bindOrders() {
  const el=(id)=>pageContainer.querySelector(id);
  if (!el("#o-add")) return;
  el("#o-add").addEventListener("click", ()=>openOrderForm());
  el("#o-status").addEventListener("change", loadOrders);
  loadOrders();
}
async function loadOrders() {
  const st = pageContainer.querySelector("#o-status").value;
  let q = sb.from("orders").select("*, customers(name)").eq("deleted",false).order("id",{ascending:false}).limit(100);
  if (st) q = q.eq("payment_status", st);
  const { data } = await q;
  const box = pageContainer.querySelector("#o-list");
  if (!box) return;
  box.innerHTML = (data||[]).map(o=>`
    <div class="row" data-id="${o.id}"><div>
      <div class="row-title">${esc(o.code)} <span class="tag">${esc(o.payment_status)}</span></div>
      <div class="row-sub">${esc(o.customers?.name||"散客")} · ¥${Number(o.total||0).toFixed(2)} · ${esc(o.order_date)}</div>
    </div><div class="row-arrow">›</div></div>`).join("") || '<div class="empty">暂无订单</div>';
  box.querySelectorAll(".row").forEach(r=>r.addEventListener("click", ()=>openOrderForm(Number(r.dataset.id))));
}
async function openOrderForm(id) {
  let o = { items: [] };
  if (id) {
    const { data } = await sb.from("orders").select("*, order_items(*), customers(*)").eq("id",id).single();
    o = data;
  } else {
    o.code = await autoCode("SO","orders");
  }
  titleEl.textContent = id?"订单详情":"开新单";
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
  const { data: customers } = await sb.from("customers").select("*").eq("deleted",false);
  const rows = (o.order_items&&o.order_items.length) ? o.order_items : [{species:"牡丹",qty:1,price:0}];
  pageContainer.innerHTML = `
    <form class="form" id="of">
      <label>订单号<input value="${esc(o.code)}" disabled></label>
      <label>客户<select id="of-customer"><option value="">散客</option>${(customers||[]).map(c=>`<option value="${c.id}" ${o.customer_id===c.id?"selected":""}>${esc(c.name||"")}</option>`).join("")}</select></label>
      <label>日期<input type="date" id="of-date" value="${o.order_date||today()}"></label>
      <label>交付<select id="of-deliver">${["自提","送货","快递"].map(d=>`<option ${d===o.delivery_method?"selected":""}>${d}</option>`).join("")}</select></label>
      <h3 class="sec">明细</h3>
      <div id="of-items"></div>
      <button type="button" class="btn-ghost" id="of-additem" style="color:var(--green);border-color:var(--green);width:100%;margin:6px 0">＋ 加一行</button>
      <label>总价<input type="number" step="0.01" id="of-total" value="${o.total??0}"></label>
      <label>已收<input type="number" step="0.01" id="of-paid" value="0"></label>
      <label>方式<select id="of-method">${["微信","支付宝","现金","转账"].map(m=>`<option>${m}</option>`).join("")}</select></label>
      <div class="err" id="of-err"></div>
      <button type="submit" class="btn-primary" style="width:100%">保存</button>
      ${id?`<button type="button" id="of-void" style="width:100%;margin-top:8px;color:var(--red);border:1px solid var(--red);background:transparent;padding:10px;border-radius:8px">取消订单</button>`:""}
    </form>`;
  const speciesOpts = ["牡丹","玄凤","虎皮","和尚"];
  const renderRows = () => {
    document.getElementById("of-items").innerHTML = rows.map((r,i)=>`
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <select data-i="${i}" data-k="species" style="flex:2;padding:8px;border:1px solid var(--line);border-radius:8px">${speciesOpts.map(s=>`<option ${s===r.species?"selected":""}>${s}</option>`).join("")}</select>
        <input data-i="${i}" data-k="qty" type="number" value="${r.qty}" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:8px">
        <input data-i="${i}" data-k="price" type="number" step="0.01" value="${r.price}" style="flex:1.4;padding:8px;border:1px solid var(--line);border-radius:8px">
        <button type="button" data-del="${i}" style="color:var(--red);padding:0 8px">×</button>
      </div>`).join("");
    document.querySelectorAll("#of-items [data-del]").forEach(b=>b.addEventListener("click", ()=>{ rows.splice(+b.dataset.del,1); renderRows(); }));
    document.querySelectorAll("#of-items input,#of-items select").forEach(x=>x.addEventListener("change", recalc));
  };
  const recalc = () => {
    let sum=0;
    document.querySelectorAll("#of-items [data-k=qty]").forEach((q,i)=>{
      const p = document.querySelectorAll("#of-items [data-k=price]")[i].value||0;
      sum += (+q.value)*(+p);
    });
    document.getElementById("of-total").value = sum.toFixed(2);
  };
  document.getElementById("of-additem").addEventListener("click", ()=>{ rows.push({species:"牡丹",qty:1,price:0}); renderRows(); });
  renderRows();
  document.getElementById("of").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const err = document.getElementById("of-err"); err.textContent="";
    const items = [];
    document.querySelectorAll("#of-items [data-k=species]").forEach((sel,i)=>{
      const q = +document.querySelectorAll("#of-items [data-k=qty]")[i].value||0;
      const p = +document.querySelectorAll("#of-items [data-k=price]")[i].value||0;
      if (q>0) items.push({species: sel.value, qty:q, price:p});
    });
    if (!items.length) { err.textContent="请加明细"; return; }
    const total = +document.getElementById("of-total").value||0;
    const paid = +document.getElementById("of-paid").value||0;
    const payStatus = paid<=0?"未收":(paid>=total?"已收":"部分");
    const payload = {
      code: o.code, customer_id: document.getElementById("of-customer").value||null,
      total, order_date: document.getElementById("of-date").value||today(),
      payment_status: payStatus, delivery_method: document.getElementById("of-deliver").value,
    };
    let orderId = id;
    if (id) {
      await sb.from("orders").update(payload).eq("id",id);
      await sb.from("order_items").delete().eq("order_id",id);
      await sb.from("order_items").insert(items.map(it=>({order_id:id,...it})));
    } else {
      const r = await sb.from("orders").insert(payload).select().single();
      if (r.error) { err.textContent=r.error.message; return; }
      orderId = r.data.id;
      await sb.from("order_items").insert(items.map(it=>({order_id:orderId,...it})));
      if (paid>0) await sb.from("payments").insert({order_id:orderId, amount:paid, method:document.getElementById("of-method").value});
      await deductChicks(items);
    }
    toast("已保存"); showPage("orders");
  });
  document.getElementById("of-void")?.addEventListener("click", async ()=>{
    if (!confirm("确认取消？相关雏鸟退回待售")) return;
    await sb.from("orders").update({payment_status:"已取消"}).eq("id",id);
    const { data: items } = await sb.from("order_items").select("*").eq("order_id",id);
    for (const it of (items||[])) {
      const { data } = await sb.from("chicks").select("*").eq("species",it.species).eq("status","已售").order("id",{ascending:false}).limit(it.qty);
      for (const c of (data||[])) await sb.from("chicks").update({status:"待售"}).eq("id",c.id);
    }
    toast("已取消"); showPage("orders");
  });
}
async function deductChicks(items) {
  for (const it of items) {
    let need = it.qty;
    while (need>0) {
      const { data } = await sb.from("chicks").select("*").eq("species",it.species).eq("status","待售").order("id",{ascending:true}).limit(need);
      if (!data||!data.length) break;
      for (const c of data) { await sb.from("chicks").update({status:"已售"}).eq("id",c.id); need--; if(need<=0)break; }
    }
  }
}

// ---------- 采购 ----------
let _pMonth = null, _pRange = {start:"",end:""};
function renderPurchases() {
  setTimeout(bindPurchases,0);
  const m = _pMonth || today().slice(0,7);
  return `
    <div class="bar" style="flex-wrap:wrap;gap:6px">
      <button class="btn-nav" id="p-prev">‹ 上月</button>
      <input type="month" id="p-month" value="${m}" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:8px">
      <button class="btn-nav" id="p-next">下月 ›</button>
      <button class="btn-primary sm" id="p-add" style="margin-left:auto">记一笔</button>
    </div>
    <div class="bar" style="margin-top:6px;gap:6px">
      <input type="date" id="p-start" value="${_pRange.start}" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:8px">
      <span style="color:var(--muted)">至</span>
      <input type="date" id="p-end" value="${_pRange.end}" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:8px">
      <button class="btn-nav" id="p-apply">应用</button>
      <button class="btn-nav" id="p-clear">清除</button>
    </div>
    <div class="bar" style="margin-top:6px">
      <select id="p-cat" style="flex:1"><option value="">全部类别</option>${["种鸟","饲料","药品","耗材","其他"].map(c=>`<option>${c}</option>`).join("")}</select>
    </div>
    <div id="p-list"></div>`;
}
function bindPurchases() {
  const el=(id)=>pageContainer.querySelector(id);
  if (!el("#p-add")) return;
  el("#p-add").addEventListener("click", ()=>openPurchaseForm());
  el("#p-cat").addEventListener("change", loadPurchases);
  el("#p-month").addEventListener("change", (e)=>{_pMonth=e.target.value; loadPurchases();});
  const shift = (d)=>{ const [y,m]=(_pMonth||today().slice(0,7)).split("-").map(Number); let nm=m+d; if(nm<1){nm=12;y--} if(nm>12){nm=1;y++} _pMonth=`${y}-${String(nm).padStart(2,"0")}`; document.getElementById("p-month").value=_pMonth; loadPurchases(); };
  el("#p-prev").addEventListener("click", ()=>shift(-1));
  el("#p-next").addEventListener("click", ()=>shift(1));
  el("#p-apply").addEventListener("click", ()=>{ _pRange.start=el("#p-start").value; _pRange.end=el("#p-end").value; loadPurchases(); });
  el("#p-clear").addEventListener("click", ()=>{ _pRange.start=""; _pRange.end=""; document.getElementById("p-start").value=""; document.getElementById("p-end").value=""; loadPurchases(); });
  loadPurchases();
}
async function loadPurchases() {
  const cat = pageContainer.querySelector("#p-cat").value;
  let start, end, label;
  if (_pRange.start || _pRange.end) {
    start = _pRange.start || "2000-01-01";
    end = _pRange.end ? (()=>{const [y,m,d]=_pRange.end.split("-").map(Number); const dt=new Date(y,m-1,d+1); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;})() : "2100-01-01";
    label = `${_pRange.start||"最早"} ~ ${_pRange.end||"现在"}`;
  } else {
    const m = pageContainer.querySelector("#p-month").value;
    const [y,mm] = m.split("-").map(Number);
    start = `${m}-01`;
    end = `${y}-${String(mm===12?1:mm+1).padStart(2,"0")}-01`;
    label = m;
  }
  let q = sb.from("purchases").select("*").or("deleted.is.null,deleted.is.false")
    .gte("purchase_date",start).lt("purchase_date",end)
    .order("purchase_date",{ascending:false}).limit(500);
  if (cat) q = q.eq("category",cat);
  const { data, error } = await q;
  const box = pageContainer.querySelector("#p-list");
  if (!box) return;
  if (error) { box.innerHTML=`<div class="empty">${esc(error.message)}</div>`; return; }
  const total = (data||[]).reduce((s,p)=>s+Number(p.amount||0),0);
  const head = `<div style="padding:10px 4px;font-size:13px;color:var(--muted)">${label} 合计：<b>¥${total.toFixed(2)}</b></div>`;
  box.innerHTML = head + ((data||[]).map(p=>`
    <div class="row" data-id="${p.id}"><div>
      <div class="row-title">${esc(p.category||"其他")} <span style="color:var(--red);float:right">¥${Number(p.amount||0).toFixed(2)}</span></div>
      <div class="row-sub">${esc(p.purchase_date||"")} · ${esc(p.supplier||"")}</div>
    </div></div>`).join("") || '<div class="empty">无记录</div>');
  box.querySelectorAll(".row").forEach(r=>r.addEventListener("click", ()=>openPurchaseForm(Number(r.dataset.id))));
}
function openPurchaseForm(id) {
  titleEl.textContent = id?"编辑支出":"记一笔";
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
  const load = id ? sb.from("purchases").select("*").eq("id",id).single().then(r=>r.data)
                  : Promise.resolve({purchase_date:today(),category:"饲料",amount:0});
  load.then(p=>{
    pageContainer.innerHTML = `
      <form class="form" id="pf">
        <label>日期<input type="date" id="pf-date" value="${p.purchase_date||today()}"></label>
        <label>类别<select id="pf-cat">${["种鸟","饲料","药品","耗材","其他"].map(c=>`<option ${c===p.category?"selected":""}>${c}</option>`).join("")}</select></label>
        <label>金额<input type="number" step="0.01" id="pf-amt" value="${p.amount||0}"></label>
        <label>供应商<input id="pf-sup" value="${esc(p.supplier||"")}"></label>
        <div class="bar"><button type="button" class="btn-ghost" id="pf-c">取消</button><button type="submit" class="btn-primary">保存</button></div>
      </form>`;
    document.getElementById("pf-c").addEventListener("click", ()=>showPage("purchases"));
    document.getElementById("pf").addEventListener("submit", async (e)=>{
      e.preventDefault();
      const payload = {
        purchase_date: document.getElementById("pf-date").value,
        category: document.getElementById("pf-cat").value,
        amount: +document.getElementById("pf-amt").value||0,
        supplier: document.getElementById("pf-sup").value.trim()||null,
      };
      const r = id ? await sb.from("purchases").update(payload).eq("id",id) : await sb.from("purchases").insert(payload);
      if (r.error) { alert(r.error.message); return; }
      toast("已保存"); showPage("purchases");
    });
  });
}

// ---------- 待办 ----------
function renderReminders() {
  setTimeout(bindReminders,0);
  return `<div class="bar"><select id="r-filter"><option value="pending">待办</option><option value="done">已完成</option></select><button class="btn-primary sm" id="r-add" style="margin-left:auto">＋ 提醒</button></div><div id="r-list"></div>`;
}
function bindReminders() {
  const el=(id)=>pageContainer.querySelector(id);
  if (!el("#r-add")) return;
  el("#r-add").addEventListener("click", ()=>openReminderForm());
  el("#r-filter").addEventListener("change", loadReminders);
  loadReminders();
}
async function loadReminders() {
  const f = pageContainer.querySelector("#r-filter").value;
  let q = sb.from("reminders").select("*").eq("deleted",false).order("id",{ascending:false}).limit(100);
  if (f==="pending") q=q.eq("done",false); else q=q.eq("done",true);
  const { data } = await q;
  const list = pageContainer.querySelector("#r-list");
  if (!list) return;
  list.innerHTML = (data||[]).map(r=>`
    <div class="row" style="${r.done?"opacity:.5":""}">
      <div><div class="row-title">${r.done?"✅ ":""}${esc(r.title)}</div>
      <div class="row-sub">${esc(r.remind_date||"")} · ${esc(r.type||"")}</div></div>
      ${r.done?"":`<button class="btn-nav" data-done="${r.id}">完成</button>`}
    </div>`).join("") || '<div class="empty">暂无</div>';
  list.querySelectorAll("[data-done]").forEach(b=>b.addEventListener("click", async ()=>{
    await sb.from("reminders").update({done:true}).eq("id",+b.dataset.done);
    loadReminders();
  }));
}
function openReminderForm() {
  titleEl.textContent = "新增提醒";
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
  pageContainer.innerHTML = `
    <form class="form" id="rf">
      <label>事项<input id="rf-title"></label>
      <label>日期<input type="date" id="rf-date" value="${today()}"></label>
      <label>类型<select id="rf-type">${["照蛋","换羽","驱虫","疫苗","其他"].map(t=>`<option>${t}</option>`).join("")}</select></label>
      <button type="submit" class="btn-primary" style="width:100%">保存</button>
    </form>`;
  document.getElementById("rf").addEventListener("submit", async (e)=>{
    e.preventDefault();
    await sb.from("reminders").insert({
      title: document.getElementById("rf-title").value.trim(),
      remind_date: document.getElementById("rf-date").value,
      type: document.getElementById("rf-type").value, done:false,
    });
    toast("已添加"); showPage("reminders");
  });
}

// ---------- 报表 ----------
async function renderReports() {
  titleEl.textContent = "统计报表";
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
  pageContainer.innerHTML = `<div class="empty">加载中…</div>`;
  const m = today().slice(0,7);
  const [yy,mm] = m.split("-").map(Number);
  const nextMonth = `${yy}-${String(mm===12?1:mm+1).padStart(2,"0")}-01`;
  const [oR, pR, cR] = await Promise.all([
    sb.from("orders").select("total").or("deleted.is.null,deleted.is.false").gte("order_date",m+"-01").lt("order_date",nextMonth),
    sb.from("purchases").select("amount").or("deleted.is.null,deleted.is.false").gte("purchase_date",m+"-01").lt("purchase_date",nextMonth),
    sb.from("chicks").select("status").eq("deleted",false),
  ]);
  const sales = (oR.data||[]).reduce((s,o)=>s+Number(o.total||0),0);
  const cost = (pR.data||[]).reduce((s,p)=>s+Number(p.amount||0),0);
  const cnt = {}; (cR.data||[]).forEach(c=>cnt[c.status]=(cnt[c.status]||0)+1);
  const { count: birdCount } = await sb.from("birds").select("id",{count:"exact"}).eq("deleted",false);
  pageContainer.innerHTML = `
    <h3 class="sec">本月（${m}）</h3>
    <div class="grid2">
      <div class="stat"><div class="num">¥${sales.toFixed(0)}</div><div class="lbl">销售额</div></div>
      <div class="stat"><div class="num">¥${cost.toFixed(0)}</div><div class="lbl">支出</div></div>
    </div>
    <div class="card" style="margin-top:10px;text-align:center;padding:14px">
      <div style="font-size:13px;color:var(--muted)">本月毛利</div>
      <div style="font-size:24px;font-weight:700;color:${(sales-cost)>=0?"var(--green)":"var(--red)"}">¥${(sales-cost).toFixed(0)}</div>
    </div>
    <h3 class="sec" style="margin-top:16px">存栏</h3>
    <div class="grid2">
      <div class="stat"><div class="num">${birdCount||0}</div><div class="lbl">种鸟</div></div>
      <div class="stat"><div class="num">${cnt["在养"]||0}</div><div class="lbl">在养雏鸟</div></div>
      <div class="stat"><div class="num">${cnt["待售"]||0}</div><div class="lbl">待售</div></div>
      <div class="stat"><div class="num">${cnt["已售"]||0}</div><div class="lbl">已售</div></div>
    </div>`;
  return "";
}

// ---------- 登录 ----------
document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { views.login.hidden = true; views.app.hidden = false; showPage("home"); }
  else views.login.hidden = false;
});
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { document.getElementById("login-error").textContent = error.message; return; }
  views.login.hidden = true; views.app.hidden = false;
  showPage("home");
});
document.getElementById("btn-logout").addEventListener("click", async () => {
  await sb.auth.signOut(); location.reload();
});
document.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => showPage(b.dataset.page)));
