"""Export or check the API contract without starting a server or computing a run."""

import argparse
import json
from pathlib import Path

from api.app.main import create_app


def export_openapi(path: Path, *, check: bool = False) -> None:
    schema = create_app().openapi()
    if check:
        if not path.is_file() or json.loads(path.read_text(encoding="utf-8")) != schema:
            raise SystemExit("Stale OpenAPI contract; run python -m scm.openapi")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    export_openapi(Path("contracts/openapi.json"), check=args.check)


if __name__ == "__main__":
    main()
