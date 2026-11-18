(() => {
  const KEY = "duihua_db_v1";
  const PIN = "1234";
  const CANCEL_SEC = 600;
  const DAILY_LIMIT = 3;
  const INTERVAL_MS = 3 * 60 * 60 * 1000;
  const COURSES = ["国画", "油画", "素描", "速写", "书法", "其他"];
  const TEACHERS = ["李茹", "杨彩霞"];
  const SEED = {
    students: [
      { id: "s_demo_1", name: "王小墨", phone: "13800138001", remaining: 12, createdAt: "2026-11-01T02:00:00.000Z" },
      { id: "s_demo_2", name: "陈青青", phone: "13900139002", remaining: 3, createdAt: "2026-11-01T02:00:00.000Z" },
    ],
    checkins: [],
    credits: [],
    sessions: {},
  };

  function nowParts() {
    const s = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" });
    const iso = s.replace(" ", "T") + "+08:00";
    return { date: s.slice(0, 10), time: s.slice(11, 19), iso, ms: Date.parse(iso) };
  }
  function uid(prefix) {
    const a = new Uint8Array(4);
    crypto.getRandomValues(a);
    const hex = [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${prefix}_${hex}${Date.now()}`;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const db = JSON.parse(raw);
        db.students ||= [];
        db.checkins ||= [];
        db.credits ||= [];
        db.sessions ||= {};
        return db;
      }
    } catch {}
    const db = JSON.parse(JSON.stringify(SEED));
    save(db);
    return db;
  }
  function save(db) {
    localStorage.setItem(KEY, JSON.stringify(db));
  }
  function studentById(db, sid) {
    return db.students.find((s) => s.id === sid) || null;
  }
  function publicStudent(s) {
    return { id: s.id, name: s.name, phone: s.phone, remaining: s.remaining };
  }
  function enrich(db, c) {
    const s = studentById(db, c.studentId);
    return Object.assign({}, c, {
      studentName: s ? s.name : "",
      studentPhone: s ? s.phone : "",
    });
  }
  function validOnDate(db, sid, day) {
    return db.checkins.filter((c) => c.studentId === sid && c.date === day && c.status === "valid");
  }
  function submitAt(c) {
    if (c.createdAt) {
      const ms = Date.parse(c.createdAt);
      if (Number.isFinite(ms)) return ms;
    }
    if (c.at) {
      const ms = Date.parse(c.at);
      if (Number.isFinite(ms)) return ms;
    }
    if (c.date && c.time) {
      const tm = c.time.length === 5 ? c.time + ":00" : c.time;
      const ms = Date.parse(`${c.date}T${tm}+08:00`);
      if (Number.isFinite(ms)) return ms;
    }
    return null;
  }
  function lastValidSubmit(db, sid) {
    const times = db.checkins
      .filter((c) => c.studentId === sid && c.status === "valid")
      .map(submitAt)
      .filter((ms) => ms != null);
    return times.length ? Math.max(...times) : null;
  }
  function fmtNext(ms, refMs) {
    const parts = (value) => {
      const s = new Date(value).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" });
      return { date: s.slice(0, 10), hm: s.slice(11, 16) };
    };
    const a = parts(ms);
    const b = parts(refMs);
    if (a.date === b.date) return `今天 ${a.hm}`;
    const next = new Date(refMs);
    next.setTime(refMs + 24 * 60 * 60 * 1000);
    const n = parts(next.getTime());
    // compare calendar dates in Beijing via parts of ref+1 day is messy if DST N/A in Shanghai
    const [ry, rm, rd] = b.date.split("-").map(Number);
    const tomorrow = new Date(Date.UTC(ry, rm - 1, rd + 1));
    const td = tomorrow.toISOString().slice(0, 10);
    if (a.date === td) return `明天 ${a.hm}`;
    const [, m, d] = a.date.split("-");
    return `${Number(m)}月${Number(d)}日 ${a.hm}`;
  }
  function intervalError(db, sid, submittedMs) {
    const last = lastValidSubmit(db, sid);
    if (last == null || submittedMs - last >= INTERVAL_MS) return null;
    return `距上次有效打卡不足 3 小时，最早可再打 ${fmtNext(last + INTERVAL_MS, submittedMs)}。`;
  }
  function canCheckin(db, sid, day, submittedMs, checkInterval = true) {
    const s = studentById(db, sid);
    if (!s) return "未找到学员档案，请联系老师开通。";
    if (s.remaining <= 0) return "剩余课时不足，请联系老师加课时后再打卡。";
    if (validOnDate(db, sid, day).length >= DAILY_LIMIT) return `当天有效打卡已满 ${DAILY_LIMIT} 次。`;
    if (!checkInterval) return null;
    return intervalError(db, sid, submittedMs);
  }
  function addCheckin(db, { studentId, course, teacher, typ, whenDate, whenTime, whenIso, location, checkInterval = true }) {
    if (!COURSES.includes(course)) return [null, "请选择课程。"];
    if (!TEACHERS.includes(teacher)) return [null, "请选择授课老师。"];
    const err = canCheckin(db, studentId, whenDate, nowParts().ms, checkInterval);
    if (err) return [null, err];
    const s = studentById(db, studentId);
    s.remaining -= 1;
    const created = nowParts();
    const rec = {
      id: uid("ck"),
      studentId,
      date: whenDate,
      time: whenTime.length === 5 ? whenTime + ":00" : whenTime,
      at: whenIso,
      createdAt: created.iso,
      location: location || "",
      course,
      teacher,
      type: typ,
      status: "valid",
      remainingAfter: s.remaining,
    };
    db.checkins.unshift(rec);
    return [rec, null];
  }
  function refundIfValid(db, rec, newStatus) {
    if (rec.status !== "valid") return "该记录已不是有效打卡。";
    rec.status = newStatus;
    rec.cancelledAt = nowParts().iso;
    const s = studentById(db, rec.studentId);
    if (s) {
      s.remaining += 1;
      rec.remainingAfter = s.remaining;
    }
    return null;
  }
  function withinCancel(rec) {
    const created = Date.parse(rec.createdAt);
    if (!Number.isFinite(created)) return false;
    return (Date.now() - created) / 1000 <= CANCEL_SEC;
  }
  function creditLog(sid, delta, note, remaining) {
    return { id: uid("cr"), studentId: sid, delta, note, remainingAfter: remaining, createdAt: nowParts().iso };
  }
  function newSession(db, role, studentId) {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    db.sessions[token] = { role, studentId: studentId || null };
    save(db);
    return token;
  }
  function getSess(db, token) {
    if (!token) return null;
    const sess = db.sessions[token];
    if (!sess) return null;
    if (sess.exp && sess.exp < Date.now() / 1000) {
      delete db.sessions[token];
      save(db);
      return null;
    }
    return sess;
  }
  function requireTeacher(db, token) {
    const sess = getSess(db, token);
    if (!sess || sess.role !== "teacher") throw fail("需要老师登录。", 401);
    return sess;
  }
  function requireStudent(db, token) {
    const sess = getSess(db, token);
    if (!sess || sess.role !== "student" || !sess.studentId) throw fail("请先用手机号登录。", 401);
    return sess;
  }
  function fail(msg, status) {
    const e = new Error(msg);
    e.status = status || 400;
    return e;
  }
  function parseWhen(value) {
    const v = String(value || "").trim();
    const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const date = m[1], time = m[2] + ":" + (m[3] || "00");
    const iso = `${date}T${time}+08:00`;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    return { date, time, iso, ms };
  }
  function buildCsv(db) {
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = ["学员当前剩余课时", "姓名,手机号,当前剩余课时"];
    const students = [...db.students].sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh") || (a.phone || "").localeCompare(b.phone || ""));
    for (const s of students) lines.push([s.name, s.phone, s.remaining].map(esc).join(","));
    lines.push("", "打卡明细", "姓名,手机号,日期,时间,课程,老师,类型,状态,打卡后剩余次数");
    for (const c of db.checkins) {
      const s = studentById(db, c.studentId);
      const typ = c.type === "makeup" ? "补" : "正常";
      const st = c.status === "cancelled" ? "已取消" : c.status === "voided" ? "已作废" : "有效";
      lines.push([s ? s.name : "", s ? s.phone : "", c.date, (c.time || "").slice(0, 5), c.course, c.teacher, typ, st, c.remainingAfter].map(esc).join(","));
    }
    return "\ufeff" + lines.join("\n");
  }

  function handle(path, opts = {}, token) {
    const method = (opts.method || "GET").toUpperCase();
    const url = new URL(path, "http://local.duihua");
    const pathname = (url.pathname || path.split("?")[0]).replace(/\/+$/, "") || "/";
    let body = {};
    if (opts.body) {
      try { body = typeof opts.body === "string" ? JSON.parse(opts.body || "{}") : opts.body; } catch { throw fail("请求格式不正确。"); }
    }
    const db = load();

    if (method === "GET" && pathname === "/api/meta") {
      return { ok: true, courses: COURSES, teachers: TEACHERS, dailyLimit: DAILY_LIMIT, intervalHours: 3, cancelMinutes: 10, today: nowParts().date };
    }
    if (method === "GET" && pathname === "/api/roster") {
      return { ok: true, names: [...new Set(db.students.map((s) => s.name))].sort((a, b) => a.localeCompare(b, "zh")) };
    }
    if (method === "GET" && pathname === "/api/me") {
      const sess = requireStudent(db, token);
      const s = studentById(db, sess.studentId);
      if (!s) throw fail("档案不存在。", 404);
      const now = nowParts();
      const ie = intervalError(db, s.id, now.ms);
      const last = lastValidSubmit(db, s.id);
      const nxt = ie && last != null ? last + INTERVAL_MS : null;
      return {
        ok: true,
        student: publicStudent(s),
        todayValid: validOnDate(db, s.id, now.date).length,
        today: now.date,
        intervalError: ie,
        nextCheckinAt: nxt != null ? new Date(nxt).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace(" ", "T") + "+08:00" : null,
      };
    }
    if (method === "GET" && pathname === "/api/checkins") {
      const sess = getSess(db, token);
      if (!sess) throw fail("请先登录。", 401);
      let sid = url.searchParams.get("studentId");
      if (sess.role === "student") sid = sess.studentId;
      else if (!sid) throw fail("请指定学员。");
      return { ok: true, checkins: db.checkins.filter((c) => c.studentId === sid).map((c) => enrich(db, c)) };
    }
    if (method === "GET" && pathname === "/api/students") {
      requireTeacher(db, token);
      return { ok: true, students: db.students.map(publicStudent) };
    }
    if (method === "GET" && pathname.startsWith("/api/students/")) {
      requireTeacher(db, token);
      const sid = pathname.split("/").pop();
      const s = studentById(db, sid);
      if (!s) throw fail("未找到学员。", 404);
      return {
        ok: true,
        student: publicStudent(s),
        checkins: db.checkins.filter((c) => c.studentId === sid).map((c) => enrich(db, c)),
        credits: db.credits.filter((c) => c.studentId === sid),
      };
    }
    if (method === "GET" && pathname === "/api/export.csv") {
      requireTeacher(db, token);
      const csv = buildCsv(db);
      return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8" } });
    }

    if (method === "POST" && pathname === "/api/student/login") {
      const phone = String(body.phone || "").replace(/[\s-]/g, "");
      if (!(phone.length === 11 && /^\d+$/.test(phone) && phone.startsWith("1"))) throw fail("请填写 11 位手机号。");
      const hits = db.students.filter((s) => s.phone === phone);
      if (!hits.length) throw fail("未找到该手机号对应的学员，请检查后重试，或联系老师开通。", 401);
      const s = hits[0];
      const tok = newSession(db, "student", s.id);
      return { ok: true, token: tok, role: "student", student: publicStudent(s) };
    }
    if (method === "POST" && pathname === "/api/teacher/login") {
      if (String(body.pin || "") !== PIN) throw fail("密码不正确。", 401);
      return { ok: true, token: newSession(db, "teacher"), role: "teacher" };
    }
    if (method === "POST" && pathname === "/api/logout") {
      if (token && db.sessions[token]) {
        delete db.sessions[token];
        save(db);
      }
      return { ok: true };
    }
    if (method === "POST" && pathname === "/api/checkin") {
      const sess = requireStudent(db, token);
      const now = nowParts();
      const [rec, e] = addCheckin(db, {
        studentId: sess.studentId,
        course: String(body.course || ""),
        teacher: String(body.teacher || ""),
        typ: "normal",
        whenDate: now.date,
        whenTime: now.time,
        whenIso: now.iso,
        location: "",
      });
      if (e) throw fail(e);
      save(db);
      const s = studentById(db, sess.studentId);
      return { ok: true, record: enrich(db, rec), remaining: s.remaining };
    }
    if (method === "POST" && pathname === "/api/checkin/cancel") {
      const sess = getSess(db, token);
      if (!sess) throw fail("请先登录。", 401);
      const rec = db.checkins.find((c) => c.id === body.id);
      if (!rec) throw fail("记录不存在。", 404);
      if (sess.role === "student" && rec.studentId !== sess.studentId) throw fail("只能取消自己的打卡。", 403);
      if (!withinCancel(rec)) throw fail("已超过 10 分钟，不能取消。");
      const e = refundIfValid(db, rec, "cancelled");
      if (e) throw fail(e);
      save(db);
      return { ok: true, record: enrich(db, rec) };
    }
    if (method === "POST" && pathname === "/api/teacher/students") {
      requireTeacher(db, token);
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      let hours = body.hours;
      hours = hours === undefined || hours === "" ? 0 : Number(hours);
      if (!Number.isInteger(hours) || hours < 0) throw fail("初始课时须为 0 或正整数。");
      if (!name) throw fail("请填写姓名。");
      if (!(phone.length === 11 && /^\d+$/.test(phone) && phone.startsWith("1"))) throw fail("请填写 11 位手机号。");
      if (db.students.some((s) => s.phone === phone)) throw fail("该手机号已有档案。");
      if (db.students.some((s) => s.name === name && s.phone.slice(-4) === phone.slice(-4))) {
        throw fail("姓名与手机号后四位的组合已存在，请调整后再保存。");
      }
      const s = { id: uid("s"), name, phone, remaining: hours, createdAt: nowParts().iso };
      db.students.push(s);
      if (hours > 0) db.credits.unshift(creditLog(s.id, hours, "建档初始课时", hours));
      save(db);
      return { ok: true, student: publicStudent(s) };
    }
    if (method === "POST" && pathname.startsWith("/api/teacher/students/")) {
      requireTeacher(db, token);
      const sid = pathname.split("/").pop();
      const s = studentById(db, sid);
      if (!s) throw fail("未找到学员。", 404);
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      if (!name) throw fail("请填写姓名。");
      if (!(phone.length === 11 && /^\d+$/.test(phone) && phone.startsWith("1"))) throw fail("请填写 11 位手机号。");
      if (db.students.some((x) => x.phone === phone && x.id !== sid)) throw fail("该手机号已被其他档案使用。");
      if (db.students.some((x) => x.name === name && x.phone.slice(-4) === phone.slice(-4) && x.id !== sid)) {
        throw fail("姓名与手机号后四位的组合已存在，请调整后再保存。");
      }
      s.name = name;
      s.phone = phone;
      save(db);
      return { ok: true, student: publicStudent(s) };
    }
    if (method === "POST" && pathname === "/api/teacher/credits") {
      requireTeacher(db, token);
      const s = studentById(db, body.studentId);
      if (!s) throw fail("未找到学员。", 404);
      const delta = Number(body.delta);
      if (!Number.isInteger(delta) || delta === 0) throw fail("课时变动必须是非零整数。");
      if (s.remaining + delta < 0) throw fail(`剩余课时不足，当前剩余 ${s.remaining} 次，不能再减。`);
      s.remaining += delta;
      const note = String(body.note || (delta > 0 ? "老师加课时" : "老师调减课时"));
      const log = creditLog(s.id, delta, note, s.remaining);
      db.credits.unshift(log);
      save(db);
      return { ok: true, student: publicStudent(s), credit: log };
    }
    if (method === "POST" && pathname === "/api/teacher/makeup") {
      requireTeacher(db, token);
      const when = parseWhen(body.when);
      if (!when) throw fail("请填写上课日期与时间。");
      const today = nowParts().date;
      if (when.date > today) throw fail("补卡只能补当天或过去的日期，不能补未来。");
      const [rec, e] = addCheckin(db, {
        studentId: String(body.studentId || ""),
        course: String(body.course || ""),
        teacher: String(body.teacher || ""),
        typ: "makeup",
        whenDate: when.date,
        whenTime: when.time,
        whenIso: when.iso,
        location: "补打卡",
        checkInterval: false,
      });
      if (e) throw fail(e);
      save(db);
      return { ok: true, record: enrich(db, rec) };
    }
    if (method === "POST" && pathname === "/api/teacher/void") {
      requireTeacher(db, token);
      const rec = db.checkins.find((c) => c.id === body.id);
      if (!rec) throw fail("记录不存在。", 404);
      const e = refundIfValid(db, rec, "voided");
      if (e) throw fail(e);
      save(db);
      return { ok: true, record: enrich(db, rec) };
    }
    if (method === "POST" && pathname === "/api/reset-demo") {
      requireTeacher(db, token);
      const fresh = JSON.parse(JSON.stringify(SEED));
      save(fresh);
      return { ok: true };
    }
    throw fail("找不到接口", 404);
  }

  window.DuihuaLocal = { handle };
})();
