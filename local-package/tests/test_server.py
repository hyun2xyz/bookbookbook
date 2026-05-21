from __future__ import annotations

import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen

from booklet_maker.server import BookletRequestHandler


class ServerCorsTests(unittest.TestCase):
    def test_options_allows_private_network_requests_from_pages(self) -> None:
        server = ThreadingHTTPServer(("127.0.0.1", 0), BookletRequestHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)

        request = Request(
            f"http://127.0.0.1:{server.server_port}/inspect",
            method="OPTIONS",
            headers={
                "Origin": "https://hyun2xyz.github.io",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Private-Network": "true",
            },
        )

        with urlopen(request, timeout=5) as response:
            self.assertEqual(response.status, 204)
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], "*")
            self.assertEqual(response.headers["Access-Control-Allow-Private-Network"], "true")


if __name__ == "__main__":
    unittest.main()
