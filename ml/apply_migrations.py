"""Apply supabase/migrations/*.sql in order to DATABASE_URL (Supabase Session pooler). Idempotent.
Usage: DATABASE_URL=postgresql://... python ml/apply_migrations.py"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        env = ROOT / "services" / "api" / ".env"
        if env.exists():
            for line in env.read_text().splitlines():
                if line.startswith("DATABASE_URL="):
                    url = line.split("=", 1)[1].strip()
    if not url or not url.startswith("postgres"):
        sys.exit("DATABASE_URL (postgresql://…) is required. SQLite offline mode creates tables automatically at API startup.")
    import psycopg
    with psycopg.connect(url, autocommit=True) as conn:
        for f in sorted((ROOT / "supabase" / "migrations").glob("*.sql")):
            print("applying", f.name)
            conn.execute(f.read_text())
    print("migrations applied")


if __name__ == "__main__":
    main()
