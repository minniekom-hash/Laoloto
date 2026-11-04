import re,json,datetime,urllib.request,concurrent.futures as cf
T=datetime.date.today()
def get(d):
    u='https://www.sanook.com/news/laolotto/%02d%02d%d'%(d.day,d.month,d.year+543)
    for _ in range(3):
        try:
            h=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=30).read().decode('utf8','ignore');break
        except urllib.error.HTTPError as e:
            if e.code==404: return d,None
        except Exception: pass
    else: return d,None
    t=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',h))
    m=re.search(r'\u0e15\u0e23\u0e27\u0e08\u0e2b\u0e27\u0e22\u0e25\u0e32\u0e27 (\d+) (\S+) (\d{4}) \u0e40\u0e25\u0e02\u0e17\u0e49\u0e32\u0e22 4 \u0e15\u0e31\u0e27 (\d{4})',t)
    if not m or int(m.group(1))!=d.day or int(m.group(3))!=d.year+543: return d,None
    return d,m.group(4)
ds=[];x=datetime.date(2016,1,1)
while x<=T:
    ds.append(x);x+=datetime.timedelta(1)
ds=[d for d in ds if d.weekday()<5]
with cf.ThreadPoolExecutor(12) as ex: rs=list(ex.map(get,ds))
out=sorted([(d.isoformat(),r) for d,r in rs if r])
from collections import Counter
print(len(ds),len(out),out[0],out[-1]);print(sorted(Counter(d[:4] for d,_ in out).items()))
json.dump(out,open('raw.json','w'));open('data.js','w').write('window.LAO_DATA='+json.dumps(out)+';')
