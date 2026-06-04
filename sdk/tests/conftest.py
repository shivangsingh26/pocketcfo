import pytest


class FakeTable:
    def __init__(self, rows):
        self.rows = rows
        self._op = None
        self._payload = None
        self._filters = []

    def insert(self, payload):
        self._op, self._payload = "insert", payload
        return self

    def select(self, *_cols):
        self._op = "select"
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def execute(self):
        if self._op == "insert":
            self.rows.append(self._payload)
            return type("R", (), {"data": [self._payload]})
        data = [r for r in self.rows
                if all(r.get(c) == v for c, v in self._filters)]
        return type("R", (), {"data": data})


class FakeSupabase:
    def __init__(self):
        self.tables = {"transactions": [], "categories": []}

    def table(self, name):
        return FakeTable(self.tables[name])


@pytest.fixture
def fake_supabase():
    return FakeSupabase()
