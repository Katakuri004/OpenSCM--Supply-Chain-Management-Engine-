"""The same checks for Make, Windows and CI; run from the repository root."""

import os
import shutil
import subprocess
import sys


def main() -> None:
    for args in (
        ["ruff", "check", "."],
        ["ruff", "format", "--check", "."],
        ["mypy"],
        ["scm.contracts", "--check"],
        ["scm.openapi", "--check"],
        ["pytest", "-q"],
    ):
        print(f"Checking: {' '.join(args)}", flush=True)
        result = subprocess.run([sys.executable, "-m", *args], check=False)
        if result.returncode:
            sys.exit(result.returncode)
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if npm is None:
        raise SystemExit("Node.js/npm is required for the generated API client checks")
    for script in ("check:api", "format:check", "typecheck", "test", "build", "test:e2e"):
        print(f"Checking: npm run {script}", flush=True)
        result = subprocess.run([npm, "run", script], cwd="web", check=False)
        if result.returncode:
            sys.exit(result.returncode)


if __name__ == "__main__":
    main()
