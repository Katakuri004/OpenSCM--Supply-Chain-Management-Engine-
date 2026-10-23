"""Keep the public screenshot tour navigable and its evidence inspectable."""

import hashlib
import json
import re
import struct
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]


def test_readme_walkthrough_images_cover_every_workspace_and_match_capture_manifest() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    manifest = json.loads(
        (ROOT / "docs/images/walkthrough/manifest.json").read_text(encoding="utf-8")
    )
    images = re.findall(r"!\[([^\]]+)\]\(([^)]+)\)", readme)
    referenced = {path for _, path in images}
    assert set(manifest["modules"]) == {
        "overview",
        "exceptions",
        "tower",
        "playbooks",
        "portfolio",
        "learning",
        "scenario",
        "network",
        "builder",
        "inventory",
        "bullwhip",
        "resilience",
        "methodology",
    }
    assert {capture["module"] for capture in manifest["captures"]} == set(manifest["modules"])
    for capture in manifest["captures"]:
        assert capture["file"] in referenced
        data = (ROOT / capture["file"]).read_bytes()
        assert data[:8] == b"\x89PNG\r\n\x1a\n"
        assert struct.unpack(">II", data[16:24]) == (capture["width"], capture["height"])
        assert capture["width"] >= 300 and capture["height"] >= 200
        assert hashlib.sha256(data).hexdigest() == capture["sha256"]
        assert capture["source"] in {"recorded", "live", "analytical", "interface"}
    for name, digest in manifest["evidence_sha256"].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest


def test_readme_local_links_and_image_descriptions_resolve() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    without_code = re.sub(r"```.*?```", "", readme, flags=re.DOTALL)
    for description, target in re.findall(r"!?\[([^\]]*)\]\(([^)]+)\)", without_code):
        assert description.strip(), target
        parsed = urlparse(target)
        if parsed.scheme or not parsed.path:
            continue
        path = (ROOT / unquote(parsed.path)).resolve()
        assert path.is_relative_to(ROOT), target
        assert path.exists(), target
    headings = re.findall(r"^#{1,6} (.+)$", without_code, flags=re.MULTILINE)
    anchors = {re.sub(r"[^\w\- ]", "", heading.lower()).replace(" ", "-") for heading in headings}
    for target in re.findall(r"\]\(#([^)]+)\)", without_code):
        assert target in anchors, target
