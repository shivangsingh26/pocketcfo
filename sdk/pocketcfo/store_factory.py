import os
from .store import Store
from .store_local import LocalStore


def get_store():
    """Pick the store by environment: Supabase if configured, else local SQLite."""
    if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"):
        return Store()
    return LocalStore()
