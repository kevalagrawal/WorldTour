"""Vercel entry point: exposes the FastAPI app as a Python serverless function."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")  # local development only; on Vercel the dashboard variables are used

from worldtour_ai.web.app import app  # noqa: E402,F401
