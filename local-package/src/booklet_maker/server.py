from __future__ import annotations

import errno
from io import BytesIO
import json
import re
import subprocess
import sys
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

from pypdf import PdfReader

from .pdf_engine import convert_pdf


ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = ROOT / "static"
UPLOAD_DIR = ROOT / "work" / "uploads"
PREVIEW_DIR = ROOT / "work" / "previews"
OUTPUT_DIR = ROOT / "output"
HOST = "127.0.0.1"
PORT = 8765
ALLOWED_CORS_ORIGINS = {
    "https://hyun2xyz.github.io",
    "http://127.0.0.1:8765",
    "http://localhost:8765",
}


class BookletRequestHandler(BaseHTTPRequestHandler):
    server_version = "Bookbookbook/0.1"

    def do_OPTIONS(self) -> None:
        if self._reject_disallowed_origin():
            return

        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_HEAD(self) -> None:
        if self._reject_disallowed_origin():
            return

        if self.path == "/":
            path = STATIC_DIR / "index.html"
            if not path.exists():
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                return
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(path.stat().st_size))
            self._send_cors_headers()
            self.end_headers()
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_GET(self) -> None:
        if self._reject_disallowed_origin():
            return

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

        if self.path.startswith("/previews/"):
            self._send_preview_page()
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:
        if self._reject_disallowed_origin():
            return

        if self.path == "/convert":
            self._handle_convert()
            return

        if self.path == "/inspect":
            self._handle_inspect()
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def _handle_convert(self) -> None:
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

    def _handle_inspect(self) -> None:
        try:
            _fields, files = self._read_multipart()
            upload = files.get("pdf")
            if upload is None or not upload["data"]:
                raise ValueError("PDF file is required")

            preview_id = uuid.uuid4().hex
            PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
            source_path = PREVIEW_DIR / f"{preview_id}.pdf"
            source_path.write_bytes(upload["data"])

            reader = PdfReader(BytesIO(upload["data"]))
            page_count = len(reader.pages)
            if page_count <= 0:
                raise ValueError("PDF has no pages")

            self._send_json(
                {
                    "ok": True,
                    "previewId": preview_id,
                    "pageCount": page_count,
                    "filename": upload["filename"],
                }
            )
        except Exception as exc:
            self._send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def _send_preview_page(self) -> None:
        match = re.fullmatch(r"/previews/([a-f0-9]+)/([0-9]+)\.png", self.path)
        if not match:
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        try:
            preview_id = match.group(1)
            page_number = int(match.group(2))
            source_path = PREVIEW_DIR / f"{preview_id}.pdf"
            if not source_path.exists():
                self.send_error(HTTPStatus.NOT_FOUND, "Preview PDF not found")
                return

            reader = PdfReader(str(source_path))
            if page_number < 1 or page_number > len(reader.pages):
                self.send_error(HTTPStatus.NOT_FOUND, "Preview page not found")
                return

            output_base = PREVIEW_DIR / f"{preview_id}-{page_number}"
            output_path = output_base.with_suffix(".png")
            if not output_path.exists():
                subprocess.run(
                    [
                        "pdftoppm",
                        "-png",
                        "-singlefile",
                        "-f",
                        str(page_number),
                        "-l",
                        str(page_number),
                        "-r",
                        "120",
                        str(source_path),
                        str(output_base),
                    ],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )

            self._send_file(output_path, "image/png")
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
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(payload)

    def _send_json(self, payload: dict[str, object], status: HTTPStatus = HTTPStatus.OK) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(raw)

    def _send_cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin in ALLOWED_CORS_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Vary", "Origin")

    def _reject_disallowed_origin(self) -> bool:
        origin = self.headers.get("Origin")
        if origin is None or origin in ALLOWED_CORS_ORIGINS:
            return False

        self.send_response(HTTPStatus.FORBIDDEN)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"Origin is not allowed")
        return True


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
    try:
        server = ThreadingHTTPServer((HOST, PORT), BookletRequestHandler)
    except OSError as exc:
        if exc.errno == errno.EADDRINUSE:
            print(
                f"Port {PORT} is already in use. Stop the existing Bookbookbook server, then run ./run_app.sh again.",
                file=sys.stderr,
            )
            raise SystemExit(1) from exc
        raise
    print(f"Bookbookbook running at http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBookbookbook stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
