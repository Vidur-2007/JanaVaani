"""Deploy the API to a Hugging Face Docker Space: stages only what the image needs, with the Dockerfile at the Space root.
Needs HF_TOKEN (write) for anything beyond --stage-only. The Space must be public so the frontends can reach it.
Usage: python scripts/deploy_space.py --stage-only /tmp/space
       HF_TOKEN=... python scripts/deploy_space.py --space <user>/<name> [--secrets-from services/api/.env]"""
import argparse
import os
import shutil
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP = shutil.ignore_patterns("__pycache__", "*.pyc", ".env", ".env.*", "uploads", ".ai_cache", "janavaani.db*", "tests", "notebooks", ".pytest_cache")
SECRET_KEYS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET", "DATABASE_URL", "GEMINI_API_KEY",
               "GEMINI_MODEL_MAIN", "GEMINI_MODEL_LITE", "GEMINI_TTS_MODEL", "GROQ_API_KEY", "GROQ_MODEL_MAIN", "GROQ_MODEL_SMALL",
               "GROQ_WHISPER_MODEL", "GROQ_VISION_MODEL", "ALLOWED_ORIGINS", "DEMO_MODE", "APP_JWT_SECRET", "PUBLIC_API_URL",
               "ALLOW_DEMO_LOGIN", "FORCE_FAIL_GEMINI", "FORCE_FAIL_GROQ"]
README = """---
title: JanaVaani API
emoji: 🏛️
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

Backend for JanaVaani, a multilingual citizen grievance platform. All data is synthetic.
Health: `/api/v1/health` · API docs: `/docs`
"""


def stage(target: Path) -> Path:
    target.mkdir(parents=True, exist_ok=True)
    shutil.copy(ROOT / "services" / "api" / "Dockerfile", target / "Dockerfile")
    (target / "README.md").write_text(README, encoding="utf-8")
    (target / "services" / "api").mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / "services" / "api" / "app", target / "services" / "api" / "app", ignore=SKIP, dirs_exist_ok=True)
    shutil.copy(ROOT / "services" / "api" / "requirements.txt", target / "services" / "api" / "requirements.txt")
    shutil.copytree(ROOT / "ml", target / "ml", ignore=SKIP, dirs_exist_ok=True)
    shutil.copytree(ROOT / "data", target / "data", ignore=SKIP, dirs_exist_ok=True)
    return target


def read_secrets(env_file: Path) -> dict[str, str]:
    from dotenv import dotenv_values
    return {k: v for k, v in dotenv_values(env_file).items() if k in SECRET_KEYS and v}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--space", help="<user>/<name>")
    ap.add_argument("--stage-only", type=Path, help="write the staged folder here and stop")
    ap.add_argument("--secrets-from", type=Path, help="set the known keys found in this .env file as Space secrets")
    a = ap.parse_args()
    if a.stage_only:
        print("staged:", stage(a.stage_only))
        return
    if not a.space:
        ap.error("--space or --stage-only is required")
    from huggingface_hub import HfApi
    api = HfApi(token=os.environ["HF_TOKEN"])
    api.create_repo(a.space, repo_type="space", space_sdk="docker", exist_ok=True)
    if a.secrets_from:
        secrets = read_secrets(a.secrets_from)
        for k, v in secrets.items():
            api.add_space_secret(a.space, k, v)
        print("secrets set:", ", ".join(sorted(secrets)))
    with tempfile.TemporaryDirectory() as d:
        api.upload_folder(repo_id=a.space, repo_type="space", folder_path=stage(Path(d) / "space"), delete_patterns="*",
                          commit_message="Deploy JanaVaani API")
    host = a.space.replace("/", "-").replace("_", "-").lower()
    print(f"deployed. Building now: https://huggingface.co/spaces/{a.space}\nAPI: https://{host}.hf.space/api/v1/health")


if __name__ == "__main__":
    main()
