import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
    ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
    CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

    @classmethod
    def require(cls, *names: str) -> None:
        missing = [n for n in names if not getattr(cls, n)]
        if missing:
            raise RuntimeError(f"Missing required config: {', '.join(missing)}")
