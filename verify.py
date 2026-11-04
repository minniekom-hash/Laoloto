"""ตรวจสอบผลหวยลาวใน raw.json กับต้นฉบับ Sanook แบบรายงวด

- ดึงหน้าผลรางวัลของแต่ละวันจาก sanook.com/news/laolotto/<ddmmyyyy+543>
- ดึงเลข 4 ตัวจาก JSON ที่ฝังในหน้า ("last4Prize":"xxxx")
- เทียบกับ raw.json แล้วเขียนผลลง verify.js เพื่อให้หน้าเว็บแสดงได้
"""
import json, re, urllib.request, datetime, io, sys, time
from concurrent.futures import ThreadPoolExecutor

RAW = json.load(open('raw.json'))
WANT = dict((d, n) for d, n in RAW)


def fetch(d):
    dt = datetime.date.fromisoformat(d)
    u = 'https://www.sanook.com/news/laolotto/%02d%02d%d' % (dt.day, dt.month, dt.year + 543)
    last = None
    for attempt in range(3):
        try:
            h = urllib.request.urlopen(
                urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}),
                timeout=30).read().decode('utf8', 'ignore')
            m = re.search(r'"last4Prize":"(\d{4})"', h)
            if m:
                return d, m.group(1), None
            last = 'no last4Prize'
        except Exception as e:
            last = str(e)[:80]
        time.sleep(0.4 * (attempt + 1))
    return d, None, last


if __name__ == '__main__':
    n = len(RAW)
    print('ตรวจสอบ %d งวด...' % n, flush=True)
    t0 = time.time()
    with ThreadPoolExecutor(12) as ex:
        res = list(ex.map(fetch, WANT.keys()))
    print('ใช้เวลา %.1f วินาที' % (time.time() - t0), flush=True)

    matched, missing, wrong = [], [], []
    for d, found, err in res:
        if found is None:
            missing.append({'d': d, 'err': err})
        elif found == WANT[d]:
            matched.append(d)
        else:
            wrong.append({'d': d, 'expected': WANT[d], 'found': found})

    years = {}
    for d, _ in RAW:
        years[d[:4]] = years.get(d[:4], 0) + 1

    out = {
        'checkedAt': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
        'source': 'sanook.com/news/laolotto',
        'total': n,
        'checked': len(matched) + len(wrong),
        'matched': len(matched),
        'missing': len(missing),
        'mismatched': len(wrong),
        'missingList': missing[:20],
        'mismatchList': wrong[:20],
        'years': years,
        'first': RAW[0][0],
        'last': RAW[-1][0],
    }
    io.open('verify.js', 'w', encoding='utf-8').write(
        'window.LAO_VERIFY=' + json.dumps(out, ensure_ascii=False) + ';')
    print('ตรงกัน %d / %d งวด' % (len(matched), n))
    print('ไม่พบข้อมูล %d, ไม่ตรง %d' % (len(missing), len(wrong)))
    if wrong:
        print(wrong[:5])
