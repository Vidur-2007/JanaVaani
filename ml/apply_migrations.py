"""Apply supabase/migrations/*.sql in order to DATABASE_URL (Supabase Session pooler). Idempotent.
DATABASE_URL comes from the environment or services/api/.env, read through the API's Settings so both parse it the same way.
Usage: DATABASE_URL=postgresql://... python ml/apply_migrations.py"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "api"))

from app.core.config import Settings  # noqa: E402


def libpq_url(url: str) -> str:
    """psycopg.connect takes plain postgresql:// URLs; the API's SQLAlchemy form names its driver."""
    for prefix in ("postgresql+psycopg://", "postgres+psycopg://"):
        if url.startswith(prefix):
            return "postgresql://" + url[len(prefix):]
    return url


def main():
    url = libpq_url(Settings().database_url)
    if not url.startswith(("postgresql://", "postgres://")):
        sys.exit("DATABASE_URL (postgresql://…) is required. SQLite offline mode creates tables automatically at API startup.")
    import psycopg
    with psycopg.connect(url, autocommit=True) as conn:
        for f in sorted((ROOT / "supabase" / "migrations").glob("*.sql")):
            print("applying", f.name)
            conn.execute(f.read_text())
    print("migrations applied")


if __name__ == "__main__":
    main()
