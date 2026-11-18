#!/usr/bin/env python3
"""对画 · 课时打卡本地服务。数据存在同目录 data.json，手机和电脑访问同一地址即同一份数据。"""
from __future__ import annotations

import json
import os
import secrets
import socket
import sys
import threading
import time
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data.json"
HOST = "0.0.0.0"
PORT = int(os.environ.get("DUIHUA_PORT", "5173"))
BJ = ZoneInfo("Asia/Shanghai")
TEACHER_PIN = os.environ.get("DUIHUA_PIN", "1234")
CANCEL_SEC = 10 * 60
DAILY_LIMIT = 3
INTERVAL = timedelta(hours=3)
COURSES = ["国画", "油画", "素描", "速写", "书法", "其他"]
TEACHERS = ["李茹", "杨彩霞"]

SEED = {
    "students": [
        {"id": "s_demo_1", "name": "王小墨", "phone": "13800138001", "remaining": 12, "createdAt": "2026-11-01T02:00:00.000Z"},
        {"id": "s_demo_2", "name": "陈青青", "phone": "13900139002", "remaining": 3, "createdAt": "2026-11-01T02:00:00.000Z"},
    ],
    "checkins": [],
    "credits": [],
}

lock = threading.RLock()
sessions: dict[str, dict] = {}  # token -> {role, studentId?, exp?}


def now_bj() -> datetime:
    return datetime.now(BJ)


def parse_bj(value: str) -> datetime | None:
    if not value:
        return None
    value = value.strip()
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=BJ)
        except ValueError:
            pass
    return None


def date_str(dt: datetime) -> str:
    return dt.astimezone(BJ).strftime("%Y-%m-%d")


def time_str(dt: datetime) -> str:
    return dt.astimezone(BJ).strftime("%H:%M:%S")


def iso(dt: datetime) -> str:
    return dt.astimezone(BJ).isoformat()


def uid(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}{int(time.time())}"


def load_db() -> dict:
    if not DATA_FILE.exists():
        db = json.loads(json.dumps(SEED))
        save_db(db)
        return db
    with DATA_FILE.open(encoding="utf-8") as f:
        db = json.load(f)
    db.setdefault("students", [])
    db.setdefault("checkins", [])
    db.setdefault("credits", [])
    db.setdefault("sessions", {})
    return db


def save_db(db: dict) -> None:
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(DATA_FILE)


def student_by_id(db, sid):
    return next((s for s in db["students"] if s["id"] == sid), None)


def valid_on_date(db, sid, day):
    return [c for c in db["checkins"] if c["studentId"] == sid and c["date"] == day and c["status"] == "valid"]


def parse_iso_bj(raw) -> datetime | None:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=BJ)
        return dt.astimezone(BJ)
    except ValueError:
        return None


def submit_at(rec) -> datetime | None:
    """Interval uses successful submit time, not the recorded class time."""
    at = parse_iso_bj(rec.get("createdAt"))
    if at:
        return at
    at = parse_iso_bj(rec.get("at"))
    if at:
        return at
    day = rec.get("date") or ""
    tm = rec.get("time") or ""
    if day and tm:
        if len(str(tm)) == 5:
            tm = str(tm) + ":00"
        return parse_bj(f"{day}T{tm}")
    return None


def last_valid_submit(db, sid) -> datetime | None:
    times = []
    for c in db["checkins"]:
        if c.get("studentId") == sid and c.get("status") == "valid":
            at = submit_at(c)
            if at:
                times.append(at)
    return max(times) if times else None


def fmt_next(dt: datetime, ref: datetime) -> str:
    hm = dt.strftime("%H:%M")
    if dt.date() == ref.date():
        return f"今天 {hm}"
    if dt.date() == (ref + timedelta(days=1)).date():
        return f"明天 {hm}"
    return f"{dt.month}月{dt.day}日 {hm}"


def interval_error(db, sid, submitted: datetime):
    last = last_valid_submit(db, sid)
    if last is None or submitted - last >= INTERVAL:
        return None
    nxt = last + INTERVAL
    return f"距上次有效打卡不足 3 小时，最早可再打 {fmt_next(nxt, submitted)}。"


def can_checkin(db, sid, when: datetime, submitted: datetime | None = None):
    s = student_by_id(db, sid)
    if not s:
        return "未找到学员档案，请联系老师开通。"
    if s["remaining"] <= 0:
        return "剩余课时不足，请联系老师加课时后再打卡。"
    if len(valid_on_date(db, sid, date_str(when))) >= DAILY_LIMIT:
        return f"当天有效打卡已满 {DAILY_LIMIT} 次。"
    return interval_error(db, sid, submitted or now_bj())


def add_checkin(db, *, student_id, course, teacher, typ, when: datetime, location: str):
    if course not in COURSES:
        return None, "请选择课程。"
    if teacher not in TEACHERS:
        return None, "请选择授课老师。"
    day = date_str(when)
    err = can_checkin(db, student_id, when, now_bj())
    if err:
        return None, err
    s = student_by_id(db, student_id)
    s["remaining"] -= 1
    created = now_bj()
    rec = {
        "id": uid("ck"),
        "studentId": student_id,
        "date": day,
        "time": time_str(when),
        "at": iso(when),
        "createdAt": iso(created),
        "location": location,
        "course": course,
        "teacher": teacher,
        "type": typ,
        "status": "valid",
        "remainingAfter": s["remaining"],
    }
    db["checkins"].insert(0, rec)
    return rec, None


def refund_if_valid(db, rec, new_status):
    if rec["status"] != "valid":
        return "该记录已不是有效打卡。"
    rec["status"] = new_status
    rec["cancelledAt"] = iso(now_bj())
    s = student_by_id(db, rec["studentId"])
    if s:
        s["remaining"] += 1
        rec["remainingAfter"] = s["remaining"]
    return None


def within_cancel(rec) -> bool:
    try:
        created = datetime.fromisoformat(rec["createdAt"])
        if created.tzinfo is None:
            created = created.replace(tzinfo=BJ)
    except ValueError:
        return False
    return (now_bj() - created.astimezone(BJ)).total_seconds() <= CANCEL_SEC


def persist_sessions():
    db = load_db()
    db["sessions"] = sessions
    save_db(db)


def restore_sessions():
    global sessions
    db = load_db()
    now = time.time()
    fresh = {}
    for tok, sess in (db.get("sessions") or {}).items():
        exp = sess.get("exp")
        if exp and exp < now:
            continue
        fresh[tok] = sess
    sessions = fresh
    db["sessions"] = sessions
    save_db(db)


def new_session(role, student_id=None):
    token = secrets.token_urlsafe(24)
    sessions[token] = {"role": role, "studentId": student_id}
    persist_sessions()
    return token


def drop_session(token):
    if token and token in sessions:
        sessions.pop(token, None)
        persist_sessions()


def get_session(handler):
    auth = handler.headers.get("Authorization") or ""
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if not token:
        token = (handler.headers.get("X-Token") or "").strip()
    sess = sessions.get(token)
    exp = sess.get("exp") if sess else None
    if not sess or (exp and exp < time.time()):
        if token:
            sessions.pop(token, None)
            persist_sessions()
        return None, token
    return sess, token


def require_teacher(handler):
    sess, _ = get_session(handler)
    if not sess or sess["role"] != "teacher":
        return None, ("需要老师登录。", 401)
    return sess, None


def require_student(handler):
    sess, _ = get_session(handler)
    if not sess or sess["role"] != "student" or not sess.get("studentId"):
        return None, ("请先用手机号登录。", 401)
    return sess, None


def read_json(handler):
    length = int(handler.headers.get("Content-Length") or 0)
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        data = json.loads(raw.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def json_ok(handler, data, status=200):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def json_err(handler, msg, status=400):
    json_ok(handler, {"ok": False, "error": msg}, status)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.api_get(parsed)
        if parsed.path in ("/", "/index.html"):
            return super().do_GET()
        # prevent serving data.json
        if Path(parsed.path.lstrip("/")).name == "data.json":
            return json_err(self, "禁止访问", 403)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            return json_err(self, "找不到接口", 404)
        return self.api_post(parsed)

    def api_get(self, parsed):
        path = parsed.path.rstrip("/") or "/"
        qs = parse_qs(parsed.query)
        with lock:
            db = load_db()
            if path == "/api/meta":
                return json_ok(self, {
                    "ok": True,
                    "courses": COURSES,
                    "teachers": TEACHERS,
                    "dailyLimit": DAILY_LIMIT,
                    "intervalHours": 3,
                    "cancelMinutes": 10,
                    "today": date_str(now_bj()),
                })
            if path == "/api/roster":
                names = sorted({s["name"] for s in db["students"]})
                return json_ok(self, {"ok": True, "names": names})
            if path == "/api/me":
                sess, err = require_student(self)
                if err:
                    return json_err(self, *err)
                s = student_by_id(db, sess["studentId"])
                if not s:
                    return json_err(self, "档案不存在。", 404)
                now = now_bj()
                used = len(valid_on_date(db, s["id"], date_str(now)))
                ie = interval_error(db, s["id"], now)
                last = last_valid_submit(db, s["id"])
                nxt = (last + INTERVAL) if ie and last else None
                return json_ok(self, {
                    "ok": True,
                    "student": public_student(s),
                    "todayValid": used,
                    "today": date_str(now),
                    "intervalError": ie,
                    "nextCheckinAt": iso(nxt) if nxt else None,
                })
            if path == "/api/checkins":
                sess, _ = get_session(self)
                if not sess:
                    return json_err(self, "请先登录。", 401)
                sid = (qs.get("studentId") or [None])[0]
                if sess["role"] == "student":
                    sid = sess["studentId"]
                elif not sid:
                    return json_err(self, "请指定学员。")
                recs = [enrich(db, c) for c in db["checkins"] if c["studentId"] == sid]
                return json_ok(self, {"ok": True, "checkins": recs})
            if path == "/api/students":
                sess, err = require_teacher(self)
                if err:
                    return json_err(self, *err)
                rows = []
                for s in db["students"]:
                    rows.append(public_student(s))
                return json_ok(self, {"ok": True, "students": rows})
            if path.startswith("/api/students/"):
                sess, err = require_teacher(self)
                if err:
                    return json_err(self, *err)
                sid = path.split("/")[-1]
                s = student_by_id(db, sid)
                if not s:
                    return json_err(self, "未找到学员。", 404)
                recs = [enrich(db, c) for c in db["checkins"] if c["studentId"] == sid]
                logs = [c for c in db["credits"] if c["studentId"] == sid]
                return json_ok(self, {"ok": True, "student": public_student(s), "checkins": recs, "credits": logs})
            if path == "/api/export.csv":
                sess, err = require_teacher(self)
                if err:
                    return json_err(self, *err)
                return send_csv(self, db)
        return json_err(self, "找不到接口", 404)

    def api_post(self, parsed):
        path = parsed.path.rstrip("/") or "/"
        body = read_json(self)
        if body is None:
            return json_err(self, "请求格式不正确。")
        with lock:
            db = load_db()
            if path == "/api/student/login":
                return self.student_login(db, body)
            if path == "/api/teacher/login":
                pin = str(body.get("pin") or "")
                if pin != TEACHER_PIN:
                    return json_err(self, "密码不正确。", 401)
                token = new_session("teacher")
                return json_ok(self, {"ok": True, "token": token, "role": "teacher"})
            if path == "/api/checkin":
                return self.student_checkin(db, body)
            if path == "/api/checkin/cancel":
                return self.cancel(db, body)
            if path == "/api/teacher/students":
                return self.create_student(db, body)
            if path.startswith("/api/teacher/students/"):
                return self.update_student(db, path.split("/")[-1], body)
            if path == "/api/teacher/credits":
                return self.change_credits(db, body)
            if path == "/api/teacher/makeup":
                return self.makeup(db, body)
            if path == "/api/teacher/void":
                return self.void(db, body)
            if path == "/api/logout":
                _, token = get_session(self)
                drop_session(token)
                return json_ok(self, {"ok": True})
            if path == "/api/reset-demo":
                sess, err = require_teacher(self)
                if err:
                    return json_err(self, *err)
                db = json.loads(json.dumps(SEED))
                sessions.clear()
                db["sessions"] = {}
                save_db(db)
                return json_ok(self, {"ok": True})
        return json_err(self, "找不到接口", 404)

    def student_login(self, db, body):
        phone = str(body.get("phone") or "").strip().replace(" ", "").replace("-", "")
        if not (phone.isdigit() and len(phone) == 11 and phone.startswith("1")):
            return json_err(self, "请填写 11 位手机号。")
        hits = [s for s in db["students"] if s.get("phone") == phone]
        if not hits:
            return json_err(self, "未找到该手机号对应的学员，请检查后重试，或联系老师开通。", 401)
        s = hits[0]
        token = new_session("student", s["id"])
        return json_ok(self, {"ok": True, "token": token, "role": "student", "student": public_student(s)})

    def student_checkin(self, db, body):
        sess, err = require_student(self)
        if err:
            return json_err(self, *err)
        rec, e = add_checkin(
            db,
            student_id=sess["studentId"],
            course=str(body.get("course") or ""),
            teacher=str(body.get("teacher") or ""),
            typ="normal",
            when=now_bj(),
            location="",
        )
        if e:
            return json_err(self, e)
        save_db(db)
        s = student_by_id(db, sess["studentId"])
        return json_ok(self, {"ok": True, "record": enrich(db, rec), "remaining": s["remaining"]})

    def cancel(self, db, body):
        sess, _ = get_session(self)
        if not sess:
            return json_err(self, "请先登录。", 401)
        rec = next((c for c in db["checkins"] if c["id"] == body.get("id")), None)
        if not rec:
            return json_err(self, "记录不存在。", 404)
        if sess["role"] == "student" and rec["studentId"] != sess["studentId"]:
            return json_err(self, "只能取消自己的打卡。", 403)
        if not within_cancel(rec):
            return json_err(self, "已超过 10 分钟，不能取消。")
        e = refund_if_valid(db, rec, "cancelled")
        if e:
            return json_err(self, e)
        save_db(db)
        return json_ok(self, {"ok": True, "record": enrich(db, rec)})

    def create_student(self, db, body):
        sess, err = require_teacher(self)
        if err:
            return json_err(self, *err)
        name = str(body.get("name") or "").strip()
        phone = str(body.get("phone") or "").strip()
        hours = body.get("hours", 0)
        try:
            hours = int(hours)
        except (TypeError, ValueError):
            return json_err(self, "初始课时须为 0 或正整数。")
        if not name:
            return json_err(self, "请填写姓名。")
        if not (phone.isdigit() and len(phone) == 11 and phone.startswith("1")):
            return json_err(self, "请填写 11 位手机号。")
        if any(s["phone"] == phone for s in db["students"]):
            return json_err(self, "该手机号已有档案。")
        if any(s["name"] == name and s["phone"][-4:] == phone[-4:] for s in db["students"]):
            return json_err(self, "姓名与手机号后四位的组合已存在，请调整后再保存。")
        if hours < 0:
            return json_err(self, "初始课时须为 0 或正整数。")
        s = {"id": uid("s"), "name": name, "phone": phone, "remaining": hours, "createdAt": iso(now_bj())}
        db["students"].append(s)
        if hours > 0:
            db["credits"].insert(0, credit_log(s["id"], hours, "建档初始课时", hours))
        save_db(db)
        return json_ok(self, {"ok": True, "student": public_student(s)})

    def update_student(self, db, sid, body):
        sess, err = require_teacher(self)
        if err:
            return json_err(self, *err)
        s = student_by_id(db, sid)
        if not s:
            return json_err(self, "未找到学员。", 404)
        name = str(body.get("name") or "").strip()
        phone = str(body.get("phone") or "").strip()
        if not name:
            return json_err(self, "请填写姓名。")
        if not (phone.isdigit() and len(phone) == 11 and phone.startswith("1")):
            return json_err(self, "请填写 11 位手机号。")
        if any(x["phone"] == phone and x["id"] != sid for x in db["students"]):
            return json_err(self, "该手机号已被其他档案使用。")
        if any(x["name"] == name and x["phone"][-4:] == phone[-4:] and x["id"] != sid for x in db["students"]):
            return json_err(self, "姓名与手机号后四位的组合已存在，请调整后再保存。")
        s["name"] = name
        s["phone"] = phone
        save_db(db)
        return json_ok(self, {"ok": True, "student": public_student(s)})

    def change_credits(self, db, body):
        sess, err = require_teacher(self)
        if err:
            return json_err(self, *err)
        s = student_by_id(db, body.get("studentId"))
        if not s:
            return json_err(self, "未找到学员。", 404)
        try:
            delta = int(body.get("delta"))
        except (TypeError, ValueError):
            return json_err(self, "课时变动必须是非零整数。")
        if delta == 0:
            return json_err(self, "课时变动必须是非零整数。")
        if s["remaining"] + delta < 0:
            return json_err(self, f"剩余课时不足，当前剩余 {s['remaining']} 次，不能再减。")
        s["remaining"] += delta
        note = str(body.get("note") or ("老师加课时" if delta > 0 else "老师调减课时"))
        log = credit_log(s["id"], delta, note, s["remaining"])
        db["credits"].insert(0, log)
        save_db(db)
        return json_ok(self, {"ok": True, "student": public_student(s), "credit": log})

    def makeup(self, db, body):
        sess, err = require_teacher(self)
        if err:
            return json_err(self, *err)
        when = parse_bj(str(body.get("when") or ""))
        if not when:
            return json_err(self, "请填写上课日期与时间。")
        today = now_bj().replace(hour=0, minute=0, second=0, microsecond=0)
        if when.date() > now_bj().date():
            return json_err(self, "补卡只能补当天或过去的日期，不能补未来。")
        rec, e = add_checkin(
            db,
            student_id=str(body.get("studentId") or ""),
            course=str(body.get("course") or ""),
            teacher=str(body.get("teacher") or ""),
            typ="makeup",
            when=when,
            location="补打卡",
        )
        if e:
            return json_err(self, e)
        save_db(db)
        return json_ok(self, {"ok": True, "record": enrich(db, rec)})

    def void(self, db, body):
        sess, err = require_teacher(self)
        if err:
            return json_err(self, *err)
        rec = next((c for c in db["checkins"] if c["id"] == body.get("id")), None)
        if not rec:
            return json_err(self, "记录不存在。", 404)
        e = refund_if_valid(db, rec, "voided")
        if e:
            return json_err(self, e)
        save_db(db)
        return json_ok(self, {"ok": True, "record": enrich(db, rec)})


def credit_log(sid, delta, note, remaining):
    return {
        "id": uid("cr"),
        "studentId": sid,
        "delta": delta,
        "note": note,
        "remainingAfter": remaining,
        "createdAt": iso(now_bj()),
    }


def public_student(s):
    return {"id": s["id"], "name": s["name"], "phone": s["phone"], "remaining": s["remaining"]}


def enrich(db, c):
    rec = dict(c)
    rec["canCancel"] = c.get("status") == "valid" and within_cancel(c)
    rec["statusLabel"] = {"valid": "有效", "cancelled": "已取消", "voided": "已作废"}.get(c.get("status"), c.get("status"))
    rec["typeLabel"] = "补" if c.get("type") == "makeup" else "正常"
    s = student_by_id(db, c["studentId"])
    if s:
        rec["studentName"] = s["name"]
        rec["studentPhone"] = s["phone"]
    return rec


def build_csv(db) -> str:
    import csv
    import io
    buf = io.StringIO()
    buf.write("\ufeff")
    w = csv.writer(buf)
    w.writerow(["学员当前剩余课时"])
    w.writerow(["学员姓名", "手机号", "当前剩余课时"])
    students = sorted(db.get("students") or [], key=lambda s: (s.get("name") or "", s.get("phone") or ""))
    for s in students:
        w.writerow([s.get("name") or "", s.get("phone") or "", s.get("remaining", 0)])
    w.writerow([])
    w.writerow(["打卡明细"])
    w.writerow(["学员姓名", "手机号", "打卡日期", "打卡时间", "地点", "课程", "授课老师", "类型", "状态", "打卡后剩余次数"])
    rows = sorted(db.get("checkins") or [], key=lambda c: c.get("createdAt") or "", reverse=True)
    for c in rows:
        s = student_by_id(db, c["studentId"])
        w.writerow([
            s["name"] if s else "",
            s["phone"] if s else "",
            c.get("date"),
            c.get("time"),
            c.get("location"),
            c.get("course"),
            c.get("teacher"),
            "补" if c.get("type") == "makeup" else "正常",
            {"valid": "有效", "cancelled": "已取消", "voided": "已作废"}.get(c.get("status"), c.get("status")),
            c.get("remainingAfter"),
        ])
    return buf.getvalue()


def send_csv(handler, db):
    data = build_csv(db).encode("utf-8")
    handler.send_response(200)
    handler.send_header("Content-Type", "text/csv; charset=utf-8")
    handler.send_header("Content-Disposition", f'attachment; filename="duihua-{date_str(now_bj())}.csv"')
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def lan_ips():
    ips = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127."):
                ips.append(ip)
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    # unique, stable
    out, seen = [], set()
    for ip in ips:
        if ip not in seen:
            seen.add(ip)
            out.append(ip)
    return out or ["本机局域网IP"]


def main():
    os.chdir(ROOT)
    with lock:
        load_db()
        restore_sessions()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    ips = lan_ips()
    print(f"对画课时打卡已启动")
    print(f"本机：    http://127.0.0.1:{PORT}/")
    for ip in ips:
        print(f"同一WiFi： http://{ip}:{PORT}/")
    print(f"数据文件： {DATA_FILE}")
    print(f"老师密码： {TEACHER_PIN}")
    print("按 Ctrl+C 结束服务。手机和电脑请打开上面同一个地址。")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
        httpd.server_close()


if __name__ == "__main__":
    main()
