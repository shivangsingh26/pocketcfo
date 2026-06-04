from pocketcfo.store_factory import get_store
from pocketcfo.store_local import LocalStore


def test_defaults_to_local_without_supabase(monkeypatch, tmp_path):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    monkeypatch.setenv("POCKETCFO_DB", str(tmp_path / "t.db"))
    assert isinstance(get_store(), LocalStore)


def test_uses_supabase_when_env_set(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "key")
    created = {}
    import pocketcfo.store_factory as f
    monkeypatch.setattr(f, "Store", lambda: created.setdefault("supabase", object()))
    get_store()
    assert "supabase" in created
