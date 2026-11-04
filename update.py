"""อัปเดตผลหวยลาวจาก Sanook อัตโนมัติ

หลักการ:
- ตรวจเฉพาะงวดที่ยังไม่มีใน raw.json โดยเริ่มจากวันถัดจากงวดล่าสุด
- จะยอมรับผลก็ต่อเมื่อหน้า Sanook มี dateSlug ตรงกับวันที่ขอ
  (กันกรณีเว็บคืนผลงวดล่าสุดของวันอื่นมา)
- เมื่อได้งวดใหม่ จะสร้าง data.js ใหม่ และอัปเดตตัวนับใน verify.js

ใช้ได้ทั้งแบบ CLI:  python update.py
และเป็นโมดูลให้ serve.py เรียกผ่าน /api/refresh
"""
import datetime as dt
import json
import os
import re
import tempfile

import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_PATH = os.path.join(HERE, 'raw.json')
DATA_PATH = os.path.join(HERE, 'data.js')
VERIFY_PATH = os.path.join(HERE, 'verify.js')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
THAI_TZ = dt.timezone(dt.timedelta(hours=7))
DRAW_HOUR, DRAW_MIN = 20, 30
LOOKBACK_DAYS = 30


def thai_now():
    return dt.datetime.now(THAI_TZ)


def load_raw():
    with open(RAW_PATH, encoding='utf-8') as f:
        return json.load(f)


def _atomic_write(path, text):
    fd, tmp = tempfile.mkstemp(dir=HERE, prefix='.tmp_', text=True)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='') as f:
            f.write(text)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def _slug(d):
    # Sanook ใช้ พ.ศ. ใน URL เช่น 2 พ.ย. 2026 -> 02112569
    return '%02d%02d%d' % (d.day, d.month, d.year + 543)


def fetch_prize(d):
    """คืนเลข 4 ตัวของงวดวันที่ d หรือ None ถ้ายังไม่มีผล/หน้าไม่ตรงวัน"""
    slug = _slug(d)
    url = 'https://www.sanook.com/news/laolotto/' + slug
    try:
        html = urllib.request.urlopen(
            urllib.request.Request(url, headers=UA), timeout=15
        ).read().decode('utf8', 'ignore')
    except Exception:
        return None

    # ต้องมี dateSlug ของวันนั้นจริง ๆ ไม่งั้นเป็นหน้าคืนผลเก่า
    if ('"dateSlug":"%s"' % slug) not in html:
        return None

    # อ่านเฉพาะ prizeResult ของวันนั้น (คีย์มี date กำกับ)
    # และต้องมีเลข 4 หลักจริง — หน้าเปล่าของวันใหม่มี last4Prize เป็น "" ซึ่ง
    # ห้ามไปหยิบเลขของงวดก่อนหน้ามาใช้เด็ดขาด
    key = ('"$ROOT_QUERY.laoLotto({\\"date\\":\\"%s\\"}).prizeResult"' % slug)
    m = re.search(re.escape(key) + r':\{[^{}]{0,300}?"last4Prize"\s*:\s*"(\d{4})"', html)
    return m.group(1) if m else None


def _write_data(raw):
    # ต้องบันทึก raw.json ด้วย ไม่งั้นรอบถัดไปจะโหลดของเก่าแล้วเติมซ้ำ
    _atomic_write(RAW_PATH, json.dumps(raw))
    _atomic_write(DATA_PATH, 'window.LAO_DATA=' + json.dumps(raw) + ';')


def _write_verify(raw, added):
    if not added or not os.path.exists(VERIFY_PATH):
        return
    try:
        with open(VERIFY_PATH, encoding='utf-8') as f:
            s = f.read()
        m = re.search(r'window\.LAO_VERIFY\s*=\s*(\{.*\})\s*;', s, re.S)
        if not m:
            return
        v = json.loads(m.group(1))
        v['total'] = len(raw)
        v['checked'] = int(v.get('checked', 0)) + len(added)
        v['matched'] = int(v.get('matched', 0)) + len(added)
        v['last'] = raw[-1][0]
        v['checkedAt'] = thai_now().strftime('%Y-%m-%d %H:%M')
        _atomic_write(VERIFY_PATH,
                      'window.LAO_VERIFY=' + json.dumps(v, ensure_ascii=False) + ';')
    except Exception:
        pass


def refresh(lookback_days=LOOKBACK_DAYS):
    raw = load_raw()
    have = {d for d, _ in raw}
    now = thai_now()
    today = now.date()
    last = (dt.date.fromisoformat(raw[-1][0]) if raw
            else today - dt.timedelta(days=lookback_days))
    start = max(last + dt.timedelta(days=1), today - dt.timedelta(days=lookback_days))

    added = []
    d = start
    while d <= today:
        iso = d.isoformat()
        if iso in have:
            d += dt.timedelta(days=1)
            continue
        # งวดวันนี้จะเริ่มตรวจหลัง 20:30 ตามเวลาไทย
        if d == today and (now.hour, now.minute) < (DRAW_HOUR, DRAW_MIN):
            d += dt.timedelta(days=1)
            continue
        n = fetch_prize(d)
        if n:
            added.append([iso, n])
            have.add(iso)
        d += dt.timedelta(days=1)

    if added:
        raw.extend(added)
        raw.sort(key=lambda r: r[0])
        _write_data(raw)
        _write_verify(raw, added)

    return {
        'ok': True,
        'added': added,
        'total': len(raw),
        'last': raw[-1] if raw else None,
        'serverTime': now.strftime('%Y-%m-%d %H:%M'),
        'drawAt': '%02d:%02d' % (DRAW_HOUR, DRAW_MIN),
    }


if __name__ == '__main__':
    import time
    t0 = time.time()
    out = refresh()
    print(json.dumps(out, ensure_ascii=False, indent=2))
    print('ใช้เวลา %.1f วินาที' % (time.time() - t0))
