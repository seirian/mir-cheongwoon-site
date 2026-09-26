"""Parse deployment helpers without importing or executing deployment code."""
import ast
from pathlib import Path

paths = sorted(Path(__file__).resolve().parent.rglob("*.py"))
for path in paths:
    ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
print(f"Syntax OK: {len(paths)} Python files.")
