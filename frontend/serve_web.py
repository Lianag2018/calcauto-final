import http.server, socketserver, os, socket

os.chdir('/app/frontend/dist')

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0]
        full_path = os.path.join(os.getcwd(), path.lstrip('/'))
        if not os.path.exists(full_path) and not path.startswith('/_expo'):
            self.path = '/index.html'
        return super().do_GET()
    def log_message(self, format, *args):
        pass

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True
    def server_bind(self):
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        super().server_bind()

with ReusableTCPServer(('0.0.0.0', 3000), SPAHandler) as httpd:
    print("Serving on port 3000")
    httpd.serve_forever()
