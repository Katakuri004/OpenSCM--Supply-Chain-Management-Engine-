"""The same checks for Make, Windows and CI; run from the repository root."""

import subprocess
import sys


def main() -> None:
    for args in (
        ["ruff", "check", "."],
        ["ruff", "format", "--check", "."],
        ["mypy"],
        ["scm.contracts", "--check"],
        ["pytest", "-q"],
    ):
        print(f"Checking: {' '.join(args)}", flush=True)
        result = subprocess.run([sys.executable, "-m", *args], check=False)
        if result.returncode:
            sys.exit(result.returncode)


if __name__ == "__main__":
    main()
