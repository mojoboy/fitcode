"""
run_sql.py
----------
Runs every query in a .sql file against data/fitcode.duckdb and prints each result as a table.

    .venv\\Scripts\\python scripts\\run_sql.py sql\\explore_trends.sql
"""

import sys
from pathlib import Path

import duckdb

DATABASE = Path(__file__).resolve().parents[1] / "data" / "fitcode.duckdb"


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: python scripts/run_sql.py path/to/queries.sql")
    text = Path(sys.argv[1]).read_text(encoding="utf-8")
    with duckdb.connect(str(DATABASE), read_only=True) as con:
        for block in text.split(";"):
            lines = [line for line in block.strip().splitlines() if line.strip()]
            comments = [line for line in lines if line.lstrip().startswith("--")]
            query = "\n".join(line for line in lines if not line.lstrip().startswith("--"))
            if not query.strip():
                continue
            title = next((c.lstrip("- ").strip() for c in comments if c.lstrip("- ")[:1].isdigit()), "")
            print(f"\n{title}" if title else "")
            con.sql(query).show(max_width=120)


if __name__ == "__main__":
    main()
