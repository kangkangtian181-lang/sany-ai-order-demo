(() => {
  const TOKEN_KEY = "duihua_token";
  const ROLE_KEY = "duihua_role";

  const $app = document.getElementById("app");
  let mode = "server";
  let meta = { courses: [], teachers: [], dailyLimit: 3, today: "" };
  let ui = {
    view: "gate",
    role: null,
    student: null,
    students: [],
    checkins: [],
    credits: [],
    detail: null,
    course: "",
    teacher: "",
    roster: [],
    form: {},
    last: null,
    modal: null,
    toast: "",
    toastTimer: null,
    loginError: "",
    loading: false,
  };

  function storeGet(k) { return localStorage.getItem(k) || sessionStorage.getItem(k) || ""; }
  function token() { return storeGet(TOKEN_KEY); }
  function setAuth(t, role) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
    if (role) localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
    ui.role = role || null;
  }
  async function signOut(nextView) {
    try { await api("/api/logout", { method: "POST", body: "{}" }); } catch {}
    setAuth("", "");
    ui.student = null;
    ui.loginError = "";
    ui.view = nextView;
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function toast(msg) {
    ui.toast = msg;
    if (ui.toastTimer) clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => { ui.toast = ""; render(); }, 2400);
    render();
  }
  function fmtDate(isoDate) {
    const m = String(isoDate || "").match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return isoDate || "";
    return `${Number(m[2])}月${Number(m[3])}日`;
  }
  function fmtTime(t) { return String(t || "").slice(0, 5); }
  function fmtDateTime(date, time) {
    const d = fmtDate(date);
    const tm = fmtTime(time);
    return tm ? `${d} ${tm}` : d;
  }
  function seal(cls = "", text = "对画") {
    if (text.length === 2) {
      return `<div class="seal ${cls}"><span>${escapeHtml(text[0])}</span><span>${escapeHtml(text[1])}</span></div>`;
    }
    return `<div class="seal ${cls} single">${escapeHtml(text)}</div>`;
  }
  function backBar(act, title) {
    return `<div class="topbar"><button type="button" class="back" data-act="${act}">返回</button><h2>${title}</h2></div>`;
  }
  function icon(name) {
    const icons = {
      checkin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="M9 14l2 2 4-4"/></svg>`,
      records: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>`,
      makeup: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>`,
      plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></svg>`,
      minus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M8 12h8"/></svg>`,
      edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z"/></svg>`,
    };
    return `<span class="ico">${icons[name] || ""}</span>`;
  }
  function otpHtml(id, opts) {
    const password = !!(opts && opts.password);
    const val = String(ui.form[id] || "");
    const boxes = Array.from({ length: 4 }, (_, i) =>
      `<input class="otp-box ${password ? "" : "plain"}" data-otp-id="${id}" data-i="${i}" maxlength="1" inputmode="numeric" autocomplete="${password ? "off" : "one-time-code"}" value="${escapeHtml(val[i] || "")}" />`
    ).join("");
    return `<div class="otp" data-otp="${id}">${boxes}</div>`;
  }
  function choicePills(key, items, cols) {
    const cur = key.startsWith("form.") ? ui.form[key.slice(5)] : ui[key];
    return `<div class="choice-grid ${cols === 2 ? "cols-2" : ""}" data-pills="${key}">${
      (items || []).map((c) => `<button type="button" class="pill ${cur === c ? "on" : ""}" data-val="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("")
    }</div>`;
  }

  async function api(path, opts = {}) {
    if (mode === "local" && window.DuihuaLocal) {
      return window.DuihuaLocal.handle(path, opts, token());
    }
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (token()) headers.Authorization = "Bearer " + token();
    const res = await fetch(path, { ...opts, headers });
    if (path.endsWith(".csv")) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "导出失败" }));
        throw new Error(err.error || "导出失败");
      }
      return res;
    }
    const data = await res.json().catch(() => ({ ok: false, error: "服务无响应" }));
    if (!res.ok || data.ok === false) throw new Error(data.error || "请求失败");
    return data;
  }

  async function probeServer() {
    try {
      const res = await fetch("/api/meta", { headers: { Accept: "application/json" } });
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || !ct.includes("application/json")) return false;
      const data = await res.json();
      return !!(data && data.ok);
    } catch {
      return false;
    }
  }
  async function boot() {
    const serverOk = await probeServer();
    if (!serverOk) {
      if (window.DuihuaLocal) mode = "local";
      else {
        ui.view = "offline";
        render();
        return;
      }
    }
    try {
      const m = await api("/api/meta");
      meta = m;
    } catch (e) {
      ui.view = "offline";
      render();
      return;
    }
    const role = storeGet(ROLE_KEY);
    if (role === "student" && token()) {
      try {
        await loadStudent();
        ui.view = "home";
        render();
        return;
      } catch { setAuth("", ""); }
    }
    if (role === "teacher" && token()) {
      try {
        await loadStudents();
        ui.view = "t-list";
        ui.role = "teacher";
        render();
        return;
      } catch { setAuth("", ""); }
    }
    ui.view = "gate";
    render();
  }

  async function loadStudent() {
    const me = await api("/api/me");
    ui.student = me.student;
    ui.todayValid = me.todayValid;
    meta.today = me.today;
    const rec = await api("/api/checkins");
    ui.checkins = rec.checkins;
    ui.role = "student";
  }
  async function loadStudents() {
    const data = await api("/api/students");
    ui.students = data.students;
    ui.role = "teacher";
  }
  async function loadDetail(id) {
    const data = await api("/api/students/" + id);
    ui.detail = data.student;
    ui.checkins = data.checkins;
    ui.credits = data.credits;
  }

  function render() {
    $app.innerHTML = view() + (ui.modal ? modalHtml(ui.modal) : "") + (ui.toast ? `<div class="toast">${escapeHtml(ui.toast)}</div>` : "");
    bind();
  }

  function view() {
    if (ui.view === "offline") return offlineView();
    if (ui.view === "gate") return gateView();
    if (ui.role === "student" || ui.view === "login") {
      if (ui.view === "login") return studentLoginView();
      if (ui.view === "records") return studentRecordsView();
      if (ui.view === "success") return successView();
      return studentHomeView();
    }
    if (ui.view === "t-login") return teacherLoginView();
    if (ui.view === "t-new") return teacherNewView();
    if (ui.view === "t-edit") return teacherEditView();
    if (ui.view === "t-hours") return teacherHoursView();
    if (ui.view === "t-makeup") return teacherMakeupView();
    if (ui.view === "t-detail") return teacherDetailView();
    if (ui.view === "t-list") return teacherListView();
    return gateView();
  }


  function offlineView() {
    return `<div class="screen"><div class="hero">${seal("lg")}<h1>对 画</h1>
      <p class="error" style="letter-spacing:0">连不上本地服务。请先在电脑上运行「启动.command」，再用同一 WiFi 打开终端打印的地址。</p></div></div>`;
  }
  function gateView() {
    return `<div class="screen"><div class="hero">${seal("lg")}<h1>对 画</h1>
      <p>课时打卡</p></div>
      <div class="stack">
        <button class="role-card primary" data-act="go-student">
          <div><div class="role-title">我是学员</div><div class="role-desc">使用手机号进入</div></div>
          <span class="chev">›</span>
        </button>
        <button class="role-card ghost" data-act="go-teacher">
          <div><div class="role-title">我是老师</div><div class="role-desc">使用口令登录，管理课时与档案</div></div>
          <span class="chev">›</span>
        </button>
      </div>
      <div class="footer-note">${mode === "local" ? "预览版 · 本期不采集定位" : "本地网页 · 本期不采集定位"}</div>
    </div>`;
  }

  function studentLoginView() {
    return `<div class="screen">
      ${backBar("back-gate", "学员进入")}
      <div class="card stack">
        <label class="field"><span>手机号</span>
          <input id="phone" class="phone-lg" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="请输入11位手机号" value="${escapeHtml(ui.form.phone || "")}" />
        </label>
        ${ui.loginError ? `<div class="banner err">${escapeHtml(ui.loginError)}</div>` : ""}
        <button class="btn primary" data-act="student-enter">进入</button>
        <p class="hint">请填写 11 位手机号。登录后本机将记住登录状态，退出前无需再登。</p>
      </div></div>`;
  }

  function studentNav(active) {
    return `<nav class="nav">
      <button data-act="s-home" class="${active === "home" ? "on" : ""}">${icon("checkin")}打卡</button>
      <button data-act="s-records" class="${active === "records" ? "on" : ""}">${icon("records")}记录</button>
    </nav>`;
  }

  function studentHomeView() {
    const s = ui.student || {};
    const used = ui.todayValid || 0;
    const limit = meta.dailyLimit || 3;
    const blocked = s.remaining <= 0
      ? "剩余课时不足，请联系老师加课时后再打卡。"
      : used >= limit
        ? `当天有效打卡已满 ${limit} 次。`
        : "";
    const ready = s.remaining > 0 && used < limit && ui.course && ui.teacher;
    const needPick = s.remaining > 0 && used < limit && (!ui.course || !ui.teacher);
    const dots = Array.from({ length: limit }, (_, i) => `<i class="${i < used ? "on" : ""}"></i>`).join("");
    return `<div class="screen has-nav">
      <div class="topbar">${seal()}
        <div class="who"><h1>你好，${escapeHtml(s.name || "")}</h1><div class="phone">${escapeHtml(s.phone || "")}</div></div>
        <div class="spacer"></div>
        <button type="button" class="text-btn" data-act="s-out">退出</button>
      </div>
      <div class="card balance">
        <div class="label">剩余课时</div>
        <div class="num">${s.remaining ?? "-"}<small>次</small></div>
        <div class="sub">今日已有效打卡 ${used} / ${limit} 次 · 北京时间 ${escapeHtml(fmtDate(meta.today))}</div>
        <div class="dots">${dots}</div>
      </div>
      <div class="card stack">
        <div class="field-label">课程</div>
        ${choicePills("course", meta.courses, 3)}
        <div class="field-label">授课老师</div>
        ${choicePills("teacher", meta.teachers, 2)}
      </div>
      <div class="bottom-act">
        ${blocked ? `<div class="banner err">${escapeHtml(blocked)}</div>` : ""}
        <button class="btn primary" ${blocked ? 'style="margin-top:12px"' : ""} data-act="ask-checkin" ${ready ? "" : "disabled"}>打卡</button>
        <p class="hint center">${needPick ? "请先选择课程和授课老师。" : (blocked ? "" : "点击后会二次确认，确认才扣 1 课时。本期不采集定位。")}</p>
      </div>
    </div>${studentNav("home")}`;
  }

  function successView() {
    const last = ui.last || {};
    const limit = meta.dailyLimit || 3;
    return `<div class="screen">
      <div class="hero" style="padding-top:48px">${seal("lg", "成")}<h1 style="letter-spacing:0.08em">打卡成功</h1>
        <p style="letter-spacing:0">${escapeHtml(last.course || "")} · ${escapeHtml(last.teacher || "")}</p>
      </div>
      <div class="card balance">
        <div class="label">当前剩余课时</div>
        <div class="num">${last.remaining ?? "-"}<small>次</small></div>
        <div class="sub">刚才扣除 1 课时 · 今日已有效打卡 ${last.todayValid ?? "-"} / ${limit} 次</div>
      </div>
      <div class="hint-box" style="margin-top:14px">提交成功后 10 分钟内可在记录里取消，课时退回。</div>
      <div class="bottom-act">
        <button class="btn primary" data-act="s-records">查看记录</button>
        <button class="btn ghost" style="margin-top:10px" data-act="s-home">返回打卡</button>
      </div>
    </div>`;
  }

  function statusTag(c) {
    if (c.status === "voided") return `<span class="tag void">已作废</span>`;
    if (c.status === "cancelled") return `<span class="tag cancel">已取消</span>`;
    return `<span class="tag ok">${escapeHtml(c.statusLabel || "有效")}</span>`;
  }

  function recordItem(c, opts = {}) {
    const cancelled = c.status !== "valid";
    const makeup = c.type === "makeup";
    let actions = "";
    if (opts.student && c.canCancel) {
      actions += `<button class="btn sm warn" style="margin-top:10px" data-act="ask-cancel" data-id="${c.id}">取消打卡</button>`;
    }
    let side = "";
    if (opts.teacher && c.status === "valid") {
      if (c.canCancel) {
        side += `<button class="btn sm warn" data-act="ask-cancel" data-id="${c.id}">取消</button>`;
      }
      side += `<button class="btn sm warn" data-act="ask-void" data-id="${c.id}">作废</button>`;
    }
    return `<div class="item ${cancelled ? "muted" : ""}">
      <div class="item-head">
        <div class="title">${escapeHtml(fmtDateTime(c.date, c.time))}
          ${makeup ? `<span class="tag bu">补</span>` : ""}
          ${statusTag(c)}
        </div>
        ${side ? `<div style="display:flex;gap:6px;flex-shrink:0">${side}</div>` : ""}
      </div>
      <div class="meta">${escapeHtml(c.course)} · ${escapeHtml(c.teacher)}${c.location ? ` · ${escapeHtml(c.location)}` : ""} · 当时剩余 ${c.remainingAfter} 次</div>
      ${actions}
    </div>`;
  }

  function studentRecordsView() {
    const list = ui.checkins || [];
    return `<div class="screen has-nav">
      <div class="topbar"><h2>我的打卡记录</h2></div>
      <p class="hint" style="margin-top:0">按时间倒序，含取消、作废与补卡。提交成功后 10 分钟内可取消，课时退回。</p>
      <div class="list" style="margin-top:14px">${list.length ? list.map((c) => recordItem(c, { student: true })).join("") : `<div class="card muted">还没有打卡记录</div>`}</div>
    </div>${studentNav("records")}`;
  }

  function teacherLoginView() {
    return `<div class="screen">
      ${backBar("back-gate", "老师登录")}
      ${seal("lg")}
      <div class="card stack">
        <label class="field"><span>口令</span>${otpHtml("pin", { password: true })}</label>
        ${ui.loginError ? `<div class="banner err">${escapeHtml(ui.loginError)}</div>` : ""}
        <button class="btn primary" data-act="teacher-enter">登录</button>
        <p class="hint">数据保存在电脑上的本地服务里，同一 WiFi 下的手机和电脑打开同一个地址，看到的是同一份数据。</p>
      </div></div>`;
  }


  function teacherListView() {
    const q = (ui.form.q || "").trim();
    const rows = (ui.students || []).filter((s) => !q || s.name.includes(q) || s.phone.includes(q));
    return `<div class="screen">
      <div class="topbar">${seal()}<h1>学员列表</h1><div class="spacer"></div>
        <button type="button" class="text-btn" data-act="t-out">退出</button></div>
      <div class="search-row">
        <input id="q" type="text" placeholder="搜索姓名或手机号" value="${escapeHtml(q)}" />
        <button class="btn ghost search" data-act="t-search">搜索</button>
      </div>
      <div class="row" style="margin:0 0 14px">
        <button class="btn primary" data-act="t-new">新建学员</button>
        <button class="btn ghost" data-act="export">导出表格</button>
      </div>
      <div class="list">${rows.map((s) => `
        <button class="item" data-act="t-open" data-id="${s.id}">
          <div class="title">${escapeHtml(s.name)}<span class="remain">${s.remaining}</span></div>
          <div class="phone">${escapeHtml(s.phone)}</div>
        </button>`).join("") || `<div class="card muted">没有匹配的学员</div>`}</div>
      <p class="hint">需要重新试用可 <button class="linkish" data-act="reset">恢复示例数据</button>。</p>
    </div>`;
  }

  function teacherDetailView() {
    const s = ui.detail || {};
    const list = ui.checkins || [];
    const logs = ui.credits || [];
    return `<div class="screen">
      ${backBar("t-list", escapeHtml(s.name || ""))}
      <div class="card balance">
        <div class="label">剩余课时</div>
        <div class="num">${s.remaining ?? "-"}<small>次</small></div>
        <div class="sub">${escapeHtml(s.phone || "")}</div>
      </div>
      <div class="actions-grid">
        <button class="tile" data-act="t-makeup">${icon("makeup")}补打卡</button>
        <button class="tile" data-act="t-hours-add">${icon("plus")}加课时</button>
        <button class="tile" data-act="t-hours-sub">${icon("minus")}调减课时</button>
        <button class="tile" data-act="t-edit">${icon("edit")}修改档案</button>
      </div>
      <div class="section-title">打卡明细</div>
      <div class="list">${list.length ? list.map((c) => recordItem(c, { teacher: true })).join("") : `<div class="card muted">暂无打卡记录</div>`}</div>
      <div class="section-title">课时变动</div>
      <div class="list">${logs.length ? logs.map((c) => `
        <div class="item"><div class="title">${c.delta > 0 ? "+" : ""}${c.delta} 次 <span class="tag">余额 ${c.remainingAfter}</span></div>
        <div class="meta">${escapeHtml((c.createdAt || "").replace("T", " ").slice(0, 19))} · ${escapeHtml(c.note)}</div></div>`).join("") : `<div class="card muted">暂无课时变动</div>`}</div>
    </div>`;
  }

  function teacherNewView() {
    const f = ui.form;
    return `<div class="screen">${backBar("t-list", "新建学员")}
      <div class="card stack">
        <label class="field"><span>姓名</span><input id="name" type="text" value="${escapeHtml(f.name || "")}" placeholder="学员姓名" /></label>
        <label class="field"><span>手机号</span><input id="phone" type="tel" maxlength="11" value="${escapeHtml(f.phone || "")}" placeholder="11 位手机号" /></label>
        <label class="field"><span>初始课时</span><input id="hours" type="number" min="0" step="1" value="${escapeHtml(f.hours ?? "10")}" /></label>
        <p class="hint">姓名与手机号后四位的组合须唯一；同一手机号不允许重复建档。初始课时须为 0 或正整数。</p>
        ${ui.formError ? `<div class="banner err">${escapeHtml(ui.formError)}</div>` : ""}
        <button class="btn primary" data-act="save-student">保存</button>
      </div></div>`;
  }
  function teacherEditView() {
    const s = ui.detail || {};
    const f = ui.form;
    return `<div class="screen">${backBar("t-detail", "修改档案")}
      <div class="card stack">
        <label class="field"><span>姓名</span><input id="name" type="text" value="${escapeHtml(f.name ?? s.name ?? "")}" /></label>
        <label class="field"><span>手机号</span><input id="phone" type="tel" maxlength="11" value="${escapeHtml(f.phone ?? s.phone ?? "")}" /></label>
        <p class="hint">姓名与手机号后四位的组合须唯一；同一手机号不允许重复建档。</p>
        ${ui.formError ? `<div class="banner err">${escapeHtml(ui.formError)}</div>` : ""}
        <button class="btn primary" data-act="save-edit">保存</button>
      </div></div>`;
  }
  function teacherHoursView() {
    const s = ui.detail || {};
    return `<div class="screen">${backBar("t-detail", "加减课时")}
      <div class="card stack">
        <p>${escapeHtml(s.name || "")} 当前剩余 <b>${s.remaining}</b> 次。次数须为正整数；调减后剩余不能小于 0。</p>
        <label class="field"><span>次数</span><input id="delta" type="number" min="1" step="1" value="${escapeHtml(ui.form.delta || "10")}" /></label>
        <div class="row">
          <button class="btn primary" data-act="ask-hours-add">增加课时</button>
          <button class="btn ghost" data-act="ask-hours-sub">调减课时</button>
        </div>
      </div></div>`;
  }

  function makeupBlock() {
    const s = ui.detail || {};
    const when = ui.form.when || "";
    const day = when.slice(0, 10);
    const today = meta.today || "";
    if (s.remaining <= 0) return { text: "剩余课时不足，请联系老师加课时后再打卡。", disable: true };
    if (day && today && day > today) return { text: "补卡只能补当天或过去的日期，不能补未来。", disable: false };
    if (day) {
      const used = (ui.checkins || []).filter((c) => c.date === day && c.status === "valid").length;
      const limit = meta.dailyLimit || 3;
      if (used >= limit) return { text: `当天有效打卡已满 ${limit} 次。`, disable: true };
    }
    return { text: "", disable: false };
  }
  function teacherMakeupView() {
    const s = ui.detail || {};
    const now = meta.today || "";
    const def = ui.form.when || (now ? now + "T10:00" : "");
    const block = makeupBlock();
    const remainClass = s.remaining <= 0 ? "emph" : "";
    return `<div class="screen">${backBar("t-detail", "补打卡")}
      <div class="card stack">
        <p>${escapeHtml(s.name || "")} 当前剩余 <b class="${remainClass}">${s.remaining}</b> 次。补卡扣 1 次，地点记为「补打卡」，计入所补日期的 3 次上限，不能补未来日期。</p>
        <div class="field-label">课程</div>
        ${choicePills("course", meta.courses, 3)}
        <div class="field-label">授课老师</div>
        ${choicePills("teacher", meta.teachers, 2)}
        <label class="field"><span>上课日期与时间（北京时间，当天或过去）</span>
          <input id="when" type="datetime-local" value="${escapeHtml(def)}" max="${escapeHtml(now ? now + "T23:59" : "")}" /></label>
        ${block.text ? `<div class="banner err">${escapeHtml(block.text)}</div>` : ""}
        <button class="btn primary" data-act="save-makeup" ${block.disable ? "disabled" : ""}>提交补打卡</button>
      </div></div>`;
  }

  function modalHtml(m) {
    return `<div class="mask"><div class="dialog" data-stop="1">
      <div class="grab"></div>
      <h3>${escapeHtml(m.title)}</h3><div>${m.body}</div>
      <div class="actions">
        <button class="btn ghost" data-act="close-modal">${escapeHtml(m.cancel || "取消")}</button>
        <button class="btn primary" data-act="${escapeHtml(m.okAct)}">${escapeHtml(m.ok || "确认")}</button>
      </div></div></div>`;
  }


  function readInputs() {
    for (const id of ["phoneTail", "pin", "name", "phone", "hours", "delta", "when", "q"]) {
      const el = document.getElementById(id);
      if (el) ui.form[id] = el.value;
    }
    document.querySelectorAll(".otp").forEach((box) => {
      const id = box.dataset.otp;
      ui.form[id] = [...box.querySelectorAll("input")].map((i) => i.value.replace(/\D/g, "")).join("");
    });
  }

  function bindOtp() {
    $app.querySelectorAll(".otp").forEach((box) => {
      box.addEventListener("input", (e) => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement)) return;
        const digit = (input.value || "").replace(/\D/g, "").slice(-1);
        input.value = digit;
        const id = box.dataset.otp;
        const inputs = [...box.querySelectorAll("input")];
        const i = Number(input.dataset.i);
        if (digit && inputs[i + 1]) inputs[i + 1].focus();
        ui.form[id] = inputs.map((el) => el.value.replace(/\D/g, "")).join("");
      });
      box.addEventListener("keydown", (e) => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement)) return;
        const inputs = [...box.querySelectorAll("input")];
        const i = Number(input.dataset.i);
        if (e.key === "Backspace" && !input.value && inputs[i - 1]) {
          inputs[i - 1].focus();
          inputs[i - 1].value = "";
        }
        if (e.key === "Enter") {
          const id = box.dataset.otp;
          readInputs();
          if (id === "phoneTail") run("student-enter");
          if (id === "pin") run("teacher-enter");
        }
      });
      box.addEventListener("paste", (e) => {
        const text = (e.clipboardData && e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 4);
        if (!text) return;
        e.preventDefault();
        const inputs = [...box.querySelectorAll("input")];
        inputs.forEach((el, i) => { el.value = text[i] || ""; });
        ui.form[box.dataset.otp] = text;
        (inputs[Math.min(text.length, 3)] || inputs[3]).focus();
      });
    });
  }

  function bindPhone() {
    const el = document.getElementById("phone");
    if (!el || ui.view !== "login") return;
    el.addEventListener("input", () => {
      el.value = el.value.replace(/\D/g, "").slice(0, 11);
      ui.form.phone = el.value;
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        readInputs();
        run("student-enter");
      }
    });
  }

  function bind() {
    bindPhone();
    $app.querySelectorAll("[data-pills]").forEach((box) => {
      box.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-val]");
        if (!btn) return;
        e.stopPropagation();
        const key = box.dataset.pills;
        if (key.startsWith("form.")) ui.form[key.slice(5)] = btn.dataset.val;
        else ui[key] = btn.dataset.val;
        ui.loginError = "";
        render();
      });
    });
    $app.querySelectorAll("input").forEach((el) => {
      el.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        if (el.id === "q") run("t-search");
      });
    });
    const when = document.getElementById("when");
    if (when) {
      when.addEventListener("change", () => { readInputs(); render(); });
    }
    bindOtp();
  }

  if (!$app.dataset.bound) {
    $app.dataset.bound = "1";
    $app.addEventListener("click", (e) => {
      if (e.target.classList.contains("mask")) { ui.modal = null; render(); return; }
      const t = e.target.closest("[data-act]");
      if (!t) return;
      if (t.disabled) return;
      run(t.dataset.act, t.dataset);
    });
  }

  function run(act, data = {}) {
    readInputs();
    const actions = {
      "back-gate": () => { ui.view = "gate"; ui.role = null; ui.loginError = ""; },
      "s-home": async () => { await loadStudent(); ui.view = "home"; },
      "s-records": async () => { await loadStudent(); ui.view = "records"; },
      "s-out": () => signOut("login"),
      "t-out": () => signOut("t-login"),
      "t-list": async () => { await loadStudents(); ui.view = "t-list"; },
      "t-search": () => { ui.view = "t-list"; },
      "t-new": () => { ui.form = { hours: "10" }; ui.formError = ""; ui.view = "t-new"; },
      "t-edit": () => { ui.form = { name: ui.detail && ui.detail.name, phone: ui.detail && ui.detail.phone }; ui.formError = ""; ui.view = "t-edit"; },
      "t-hours-add": () => { ui.form = { delta: "10" }; ui.view = "t-hours"; },
      "t-hours-sub": () => { ui.form = { delta: "2" }; ui.view = "t-hours"; },
      "t-makeup": () => { ui.course = ""; ui.teacher = ""; ui.form = {}; ui.view = "t-makeup"; },
      "t-detail": async () => { await loadDetail(ui.detail.id); ui.view = "t-detail"; },
      "close-modal": () => { ui.modal = null; },
      "go-student": goStudent,
      "go-teacher": () => { ui.view = "t-login"; ui.role = "teacher"; ui.form = {}; ui.loginError = ""; },
      "student-enter": studentEnter,
      "teacher-enter": teacherEnter,
      "t-open": () => openDetail(data.id),
      "ask-checkin": askCheckin,
      "do-checkin": doCheckin,
      "ask-cancel": () => askCancel(data.id),
      "do-cancel": () => doCancel(ui.form.cancelId),
      "ask-void": () => askVoid(data.id),
      "do-void": () => doVoid(ui.form.voidId),
      "save-student": saveStudent,
      "save-edit": saveEdit,
      "ask-hours-add": () => askHours(1),
      "ask-hours-sub": () => askHours(-1),
      "do-hours": doHours,
      "save-makeup": saveMakeup,
      "export": exportCsv,
      "reset": () => {
        ui.modal = { title: "恢复示例数据", body: "<p>将清除全部学员和打卡记录，恢复两位示例学员。</p>", ok: "恢复", okAct: "do-reset" };
      },
      "do-reset": doReset,
    };
    const fn = actions[act];
    if (!fn) return;
    Promise.resolve(fn()).then((r) => {
      if (r !== "skip") render();
    }).catch((e) => {
      const msg = e.message || String(e);
      if (act === "student-enter" || act === "teacher-enter") {
        ui.loginError = msg;
        render();
        return;
      }
      if (act === "save-student" || act === "save-edit") {
        ui.formError = msg;
        render();
        return;
      }
      toast(msg);
    });
  }

  async function goStudent() {
    ui.form = {};
    ui.loginError = "";
    ui.role = "student";
    ui.view = "login";
  }
  async function studentEnter() {
    const phone = String(ui.form.phone || "").replace(/\D/g, "");
    ui.form.phone = phone;
    if (!(phone.length === 11 && phone.startsWith("1"))) {
      throw new Error("请填写 11 位手机号。");
    }
    const data = await api("/api/student/login", { method: "POST", body: JSON.stringify({ phone }) });
    setAuth(data.token, "student");
    ui.loginError = "";
    await loadStudent();
    ui.course = "";
    ui.teacher = "";
    ui.view = "home";
  }
  async function teacherEnter() {
    const data = await api("/api/teacher/login", { method: "POST", body: JSON.stringify({ pin: ui.form.pin }) });
    setAuth(data.token, "teacher");
    ui.loginError = "";
    await loadStudents();
    ui.view = "t-list";
  }
  async function openDetail(id) {
    await loadDetail(id);
    ui.view = "t-detail";
  }
  function askCheckin() {
    const s = ui.student;
    ui.modal = {
      title: "确认打卡",
      body: `<div class="kv-list">
        <div class="kv"><span>课程</span><span>${escapeHtml(ui.course)}</span></div>
        <div class="kv"><span>老师</span><span>${escapeHtml(ui.teacher)}</span></div>
        <div class="kv"><span>将扣除</span><span>1 课时</span></div>
        <div class="kv"><span>扣后剩余</span><span class="emph">${s.remaining - 1} 次</span></div>
      </div>`,
      ok: "确认打卡",
      okAct: "do-checkin",
    };
  }
  async function doCheckin() {
    const data = await api("/api/checkin", { method: "POST", body: JSON.stringify({ course: ui.course, teacher: ui.teacher }) });
    ui.modal = null;
    await loadStudent();
    ui.last = {
      course: ui.course,
      teacher: ui.teacher,
      remaining: data.remaining,
      todayValid: ui.todayValid,
    };
    ui.view = "success";
    render();
    return "skip";
  }
  function askCancel(id) {
    ui.form.cancelId = id;
    ui.modal = { title: "取消打卡", body: "<p>确认取消？课时将退回 1 次，记录保留为「已取消」，不再计入当日次数。</p>", ok: "确认取消", okAct: "do-cancel" };
  }
  async function doCancel(id) {
    await api("/api/checkin/cancel", { method: "POST", body: JSON.stringify({ id }) });
    ui.modal = null;
    if (ui.role === "teacher" && ui.detail) await loadDetail(ui.detail.id);
    else await loadStudent();
    toast("已取消，课时已退回。");
    return "skip";
  }
  function askVoid(id) {
    ui.form.voidId = id;
    ui.modal = { title: "作废打卡", body: "<p>作废后课时退回 1 次，记录保留为「已作废」，不再计入当日次数。</p>", ok: "确认作废", okAct: "do-void" };
  }
  async function doVoid(id) {
    await api("/api/teacher/void", { method: "POST", body: JSON.stringify({ id }) });
    ui.modal = null;
    await loadDetail(ui.detail.id);
    toast("已作废，课时已退回。");
    return "skip";
  }
  async function saveStudent() {
    const data = await api("/api/teacher/students", { method: "POST", body: JSON.stringify({ name: ui.form.name, phone: ui.form.phone, hours: ui.form.hours }) });
    ui.formError = "";
    await loadDetail(data.student.id);
    ui.view = "t-detail";
    toast("学员已建档");
  }
  async function saveEdit() {
    await api("/api/teacher/students/" + ui.detail.id, { method: "POST", body: JSON.stringify({ name: ui.form.name, phone: ui.form.phone }) });
    ui.formError = "";
    await loadDetail(ui.detail.id);
    ui.view = "t-detail";
    toast("档案已更新");
  }
  function askHours(sign) {
    const n = Number(ui.form.delta);
    if (!Number.isInteger(n) || n <= 0) { toast("次数须为正整数"); return "skip"; }
    const s = ui.detail || {};
    const after = s.remaining + sign * n;
    if (after < 0) { toast("剩余课时不足，当前剩余 " + s.remaining + " 次，不能再减。"); return "skip"; }
    ui.form.hoursSign = sign;
    ui.modal = {
      title: sign > 0 ? "确认增加课时" : "确认调减课时",
      body: `<div class="kv-list">
        <div class="kv"><span>学员</span><span>${escapeHtml(s.name || "")}</span></div>
        <div class="kv"><span>当前剩余</span><span>${s.remaining} 次</span></div>
        <div class="kv"><span>${sign > 0 ? "将增加" : "将调减"}</span><span>${n} 课时</span></div>
        <div class="kv"><span>${sign > 0 ? "增加后剩余" : "调减后剩余"}</span><span class="emph">${after} 次</span></div>
      </div>${sign < 0 ? `<p class="hint">次数须为正整数；调减后剩余不能小于 0。</p>` : ""}`,
      ok: sign > 0 ? "确认增加" : "确认调减",
      okAct: "do-hours",
    };
  }
  async function doHours() {
    const sign = ui.form.hoursSign;
    const n = Number(ui.form.delta);
    const data = await api("/api/teacher/credits", { method: "POST", body: JSON.stringify({ studentId: ui.detail.id, delta: sign * n, note: sign > 0 ? "老师加课时" : "老师调减课时" }) });
    ui.modal = null;
    await loadDetail(data.student.id);
    ui.view = "t-detail";
    toast("已更新，当前剩余 " + data.student.remaining + " 次");
  }
  async function saveMakeup() {
    if (!ui.course || !ui.teacher) { toast("请选择课程和老师"); return "skip"; }
    const when = ui.form.when || "";
    const today = meta.today || "";
    if (today && when.slice(0, 10) > today) { toast("补卡只能补当天或过去的日期，不能补未来。"); return "skip"; }
    await api("/api/teacher/makeup", { method: "POST", body: JSON.stringify({ studentId: ui.detail.id, course: ui.course, teacher: ui.teacher, when }) });
    await loadDetail(ui.detail.id);
    ui.view = "t-detail";
    toast("补打卡成功");
  }
  async function exportCsv() {
    const res = await api("/api/export.csv");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "对画打卡与余额.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    return "skip";
  }
  async function doReset() {
    await api("/api/reset-demo", { method: "POST", body: "{}" });
    ui.modal = null;
    await loadStudents();
    ui.view = "t-list";
    toast("已恢复示例数据");
  }

  boot();
})();
