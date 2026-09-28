import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"

load_dotenv(ENV_FILE, override=True)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")

if not SUPABASE_URL:
    raise RuntimeError(
        f"SUPABASE_URL is missing from {ENV_FILE}"
    )

if not SUPABASE_SECRET_KEY:
    raise RuntimeError(
        f"SUPABASE_SECRET_KEY is missing from {ENV_FILE}"
    )

supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
)

print("Supabase configuration loaded.")
