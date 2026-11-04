# LEGACY: ตัวจำลองสูตรเดิมใน Python (เก็บไว้เทียบผลกับเวอร์ชันก่อน)
# สูตรปัจจุบันอยู่ใน model.js (ensemble 6 experts + Hedge online learning)
import json
D=[(d,n[2:],n[:2]) for d,n in json.load(open('raw.json'))]
def p2(v): return '%02d'%v
def norm(a):
    mx=max(a); mn=min(a)
    return [(x-mn)/((mx-mn) or 1) for x in a]
def score(H):
    N=len(H)
    tops=[int(h[1]) for h in H]
    bots=[int(h[2]) for h in H]
    w=[0.25,0.30,0.20,0.15,0.10]
    decay=0.95
    sc=[0.0]*100
    F=[0.0]*100; G=[0.0]*100; M1=[0.0]*100; M2=[0.0]*100; Ht=[0.0]*100; last=[-1]*100
    dc=[1]*10
    for i in range(N):
        F[tops[i]]+=decay**(N-1-i)
        F[bots[i]]+=decay**(N-1-i)
        last[tops[i]]=i; last[bots[i]]=i
        dc[tops[i]//10]+=1; dc[tops[i]%10]+=1
        dc[bots[i]//10]+=1; dc[bots[i]%10]+=1
    for v in range(100):
        G[v]=min(N-1-last[v],300)/3000
    lt=tops[-1]; lb=bots[-1]
    for i in range(N-1):
        if tops[i]==lt: M1[tops[i+1]]+=1
        if bots[i]==lb: M1[bots[i+1]]+=1
    if N>=3:
        a=tops[-2]; b=tops[-1]
        for i in range(N-2):
            if tops[i]==a and tops[i+1]==b: M2[tops[i+2]]+=1
        c=bots[-2]; e=bots[-1]
        for i in range(N-2):
            if bots[i]==c and bots[i+1]==e: M2[bots[i+2]]+=1
    recent=(tops+bots)[max(0,len(tops+bots)-20):]
    for v in recent: Ht[v]+=1
    P=[norm(F),norm(G),norm(M1),norm(M2),norm(Ht)]
    for v in range(100):
        for j in range(5): sc[v]+=w[j]*P[j][v]
    return sc
def pred(H):
    sc=score(H)
    order=sorted(range(100), key=lambda v:-sc[v])
    chosen=[]
    for v in order:
        if len(chosen)>=50: break
        chosen.append(p2(v))
    return chosen
hit=n=0; ht=0; hb=0; max_miss=0; streak=0
for i,x in enumerate(D):
    if i<30: continue
    p=pred(D[:i]); n+=1
    a=x[1] in p; b=x[2] in p
    if a or b:
        hit+=1; streak=0
    else:
        streak+=1
        if streak>max_miss: max_miss=streak
    if a: ht+=1
    if b: hb+=1
print('ทดสอบทั้งหมด',n,'งวด')
print('ถูก',hit,'งวด')
print('อัตราถูก',round(hit/n*100,2),'%')
print('ถูกบน',ht,'งวด', round(ht/n*100,2),'%')
print('ถูกล่าง',hb,'งวด', round(hb/n*100,2),'%')
print('ไม่ถูก',n-hit,'งวด')
print('ช่วงไม่ถูกยาวที่สุด',max_miss,'งวด')
print('next 50 ตัวตรง:',pred(D))