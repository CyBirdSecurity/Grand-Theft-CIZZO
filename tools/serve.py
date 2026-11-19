"""Static dev server with caching disabled (so edited ES modules always reload).
Usage: python3 tools/serve.py [port] [directory]"""
import functools
import http.server
import os
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
root = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


print(f'Serving {root} at http://localhost:{port}/', flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(NoCacheHandler, directory=root)).serve_forever()
