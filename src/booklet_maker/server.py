from __future__ import annotations

import json
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

from .pdf_engine import convert_pdf


ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = ROOT / "static"
UPLOAD_DIR = ROOT / "work" / "uploads"
OUTPUT_DIR = ROOT / "output"
HOST = "127.0.0.1"
PORT = 8765


class BookletRequestHandler(BaseHTTPRequestHandler):
    server_version = "BookletMaker/0.1"

    def do_HEAD(self) -> None:
        if self.path == "/":
            path = STATIC_DIR / "index.html"
            if not path.exists():
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                return
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(path.stat().st_size))
            self.end_headers()
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_GET(self) -> None:
        if self.path == "/":
            self._send_file(STATIC_DIR / "index.html", "text/html; charset=utf-8")
            return

        if self.path in ("/styles.css", "/app.js"):
            path = STATIC_DIR / self.path.removeprefix("/")
            content_type = "text/css; charset=utf-8" if path.suffix == ".css" else "application/javascript; charset=utf-8"
            self._send_file(path, content_type)
            return

        if self.path.startswith("/static/"):
            relative = self.path.removeprefix("/static/")
            path = STATIC_DIR / relative
            content_type = "text/plain; charset=utf-8"
            if path.suffix == ".css":
                content_type = "text/css; charset=utf-8"
            elif path.suffix == ".js":
                content_type = "application/javascript; charset=utf-8"
            self._send_file(path, content_type)
            return

        if self.path.startswith("/outputs/"):
            filename = unquote(self.path.removeprefix("/outputs/"))
            self._send_file(OUTPUT_DIR / Path(filename).name, "application/pdf")
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:
        if self.path != "/convert":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        try:
            fields, files = self._read_multipart()
            upload = files.get("pdf")
            if upload is None or not upload["data"]:
                raise ValueError("PDF file is required")

            binding = fields.get("binding", "left")
            if binding not in ("left", "right"):
                raise ValueError("Binding must be left or right")

            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

            source_name = _safe_filename(upload["filename"] or "upload.pdf")
            source_path = UPLOAD_DIR / source_name
            source_path.write_bytes(upload["data"])

            output_name = f"{Path(source_name).stem}_booklet.pdf"
            output_path = OUTPUT_DIR / output_name
            summary = convert_pdf(source_path, output_path, binding=binding)  # type: ignore[arg-type]

            self._send_json(
                {
                    "ok": True,
                    "summary": summary.to_dict(),
                    "downloadUrl": f"/outputs/{output_name}",
                }
            )
        except Exception as exc:
            self._send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def _read_multipart(self) -> tuple[dict[str, str], dict[str, dict[str, bytes | str]]]:
        content_type = self.headers.get("Content-Type", "")
        match = re.search(r"boundary=(.+)", content_type)
        if not match:
            raise ValueError("Expected multipart form data")

        boundary = match.group(1).strip('"')
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        boundary_bytes = f"--{boundary}".encode()

        fields: dict[str, str] = {}
        files: dict[str, dict[str, bytes | str]] = {}

        for raw_part in body.split(boundary_bytes):
            part = raw_part.strip(b"\r\n")
            if not part or part == b"--":
                continue
            if part.endswith(b"--"):
                part = part[:-2].rstrip(b"\r\n")
            if b"\r\n\r\n" not in part:
                continue

            raw_headers, data = part.split(b"\r\n\r\n", 1)
            header_text = raw_headers.decode("utf-8", errors="replace")
            disposition = _find_header(header_text, "Content-Disposition")
            name = _find_disposition_value(disposition, "name")
            filename = _find_disposition_value(disposition, "filename")

            if not name:
                continue

            if filename is not None:
                files[name] = {"filename": filename, "data": data}
            else:
                fields[name] = data.decode("utf-8", errors="replace")

        return fields, files

    def _send_file(self, path: Path, content_type: str) -> None:
        if not path.exists() or not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        payload = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_json(self, payload: dict[str, object], status: HTTPStatus = HTTPStatus.OK) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def _find_header(header_text: str, header_name: str) -> str:
    for line in header_text.splitlines():
        if line.lower().startswith(header_name.lower() + ":"):
            return line.split(":", 1)[1].strip()
    return ""


def _find_disposition_value(disposition: str, key: str) -> str | None:
    match = re.search(rf'{key}="([^"]*)"', disposition)
    if match:
        return match.group(1)
    return None


def _safe_filename(filename: str) -> str:
    name = Path(filename).name.strip() or "upload.pdf"
    name = name.replace("\x00", "").replace("/", "_").replace("\\", "_")
    return re.sub(r"\s+", "_", name) or "upload.pdf"


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), BookletRequestHandler)
    print(f"Booklet Maker running at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
