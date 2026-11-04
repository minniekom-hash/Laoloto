"""เสิร์ฟหน้าเว็บ + API อัปเดตผลหวยลาวอัตโนมัติ

รัน:  python serve.py
แล้วเปิด:  http://127.0.0.1:8931/

หน้าเว็บจะเรียก /api/refresh เองหลังเวลา 20:30 (เวลาไทย)
ถ้าพบผลงวดใหม่จะโหลดหน้าใหม่ให้อัตโนมัติ
"""
import http.server
import json
import os
import socketserver
import threading
import time
import urllib.parse

import update

HOST = '127.0.0.1'
PORT = 8931
CACHE_TTL = 45          # วินาที: กันยิง Sanook ถี่เกินไป
BASE = os.path.dirname(os.path.abspath(__file__))

_lock = threading.Lock()
_cache = {'ts': 0.0, 'data': None}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE, **kwargs)

    def log_message(self, fmt, *args):
        pass  # ไม่ต้องรกหน้าจอ

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path

        if path == '/api/refresh':
            with _lock:
                now = time.time()
                if _cache['data'] is not None and now - _cache['ts'] < CACHE_TTL:
                    data = _cache['data']
                else:
                    try:
                        data = update.refresh()
                    except Exception as e:
                        data = {'ok': False, 'error': str(e)}
                    _cache['ts'] = now
                    _cache['data'] = data
            self._json(data)
            return

        if path == '/api/status':
            try:
                raw = update.load_raw()
                self._json({'ok': True, 'total': len(raw), 'last': raw[-1]})
            except Exception as e:
                self._json({'ok': False, 'error': str(e)})
            return

        super().do_GET()

    def end_headers(self):
        if self.path.split('?')[0].endswith(('.js', '.html')):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    os.chdir(BASE)
    with Server((HOST, PORT), Handler) as httpd:
        print('serving http://%s:%d/  (auto-update: /api/refresh)' % (HOST, PORT))
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
