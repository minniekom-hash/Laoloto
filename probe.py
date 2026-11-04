import re,datetime,urllib.request
def get(d):
    u='https://www.sanook.com/news/laolotto/%02d%02d%d'%(d.day,d.month,d.year+543)
    try: h=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=30).read().decode('utf8','ignore')
    except Exception as e: return 'ERR %s'%e
    t=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',h))
    m=re.search(r'\u0e15\u0e23\u0e27\u0e08\u0e2b\u0e27\u0e22\u0e25\u0e32\u0e27 (\d+) (\S+) (\d{4}) \u0e40\u0e25\u0e02\u0e17\u0e49\u0e32\u0e22 4 \u0e15\u0e31\u0e27 (\d{4})',t)
    return m.groups() if m else 'nomatch'
for s in ['2025-12-01','2025-06-02','2025-01-06','2024-06-03','2023-06-05','2022-06-06','2021-06-07','2020-06-08','2019-06-03']:
    print(s,get(datetime.date.fromisoformat(s)))
