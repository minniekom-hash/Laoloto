# Lao Lottery Analyzer (Laoloto)

เว็บวิเคราะห์หวยลาวจากผลจริง (Sanook) แบบ walk-forward ไม่แอบดูอนาคต
พร้อมอัปเดตผลอัตโนมัติหลังเวลา 20:30 (เวลาไทย)

## รันในเครื่อง

```bash
python serve.py
```

แล้วเปิด <http://127.0.0.1:8931/> (หรือดับเบิลคลิก `start.bat`)

## Deploy บน Render.com (Web Service)

| ช่อง | ค่า |
|---|---|
| Language / Runtime | **Python 3** |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `python serve.py` |

หรือใช้ Blueprint จากไฟล์ `render.yaml` ในโปรเจกต์นี้ได้เลย

`serve.py` รองรับตัวแปรสภาพแวดล้อม `PORT` และ `HOST` ของ Render แล้ว
(ค่าเริ่มต้นในเครื่องคือ `127.0.0.1:8931`)

### ข้อควรรู้บน Render
- ต้องเลือก **Web Service** ไม่ใช่ Static Site เพราะมี `/api/refresh` และ `/api/status`
- Free plan จะ spin down เมื่อไม่มีคนเข้า ประมาณ 15 นาที → การอัปเดตอัตโนมัติจะเกิดเมื่อมีคนเปิดหน้าเว็บ (ตัวหน้าเว็บจะ poll เองหลัง 20:30)
- ไฟล์ระบบของ Render เป็นแบบชั่วคราว: `raw.json` / `data.js` ที่ถูกเขียนตอน runtime จะหายเมื่อ redeploy หรือ restart
  ถ้าต้องการเก็บถาวรให้เพิ่ม Render Disk แล้วชี้ path ข้อมูลมาที่ disk นั้น
