"""Vercel entrypoint for the FastAPI service (vercel.json → services.api, entrypoint "vercel_api:app").

The service is rooted at the repo root, not services/api, because the API reads data/ and ml/models/ and imports
ml/seed_db.py and ml/train_classifier.py, and Vercel cannot bundle files above a service root. Putting services/api
on the import path keeps every import exactly as it is under uvicorn and in Docker (`app.main:app`).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "services" / "api"))

from app.main import app  # noqa: E402,F401
