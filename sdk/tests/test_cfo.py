from decimal import Decimal
from pocketcfo.models import CategoryTotal, ChatAnswer
from pocketcfo.agents.cfo import CFO


class StubStore:
    def spend_by_category(self):
        return [CategoryTotal(category_id="travel", label="Travel", total=Decimal("14100.0"))]
    def list_transactions(self, limit=50):
        return []


class FakeAnthropic:
    """First call asks for the tool; second call returns prose."""
    def __init__(self):
        self.calls = 0
        self.messages = self
    def create(self, **kwargs):
        self.calls += 1
        if self.calls == 1:
            tu = type("B", (), {"type": "tool_use", "id": "t1",
                                "name": "spend_by_category", "input": {}})
            return type("M", (), {"content": [tu], "stop_reason": "tool_use"})
        txt = type("B", (), {"type": "text", "text": "You spent INR 14,100 on Travel."})
        return type("M", (), {"content": [txt], "stop_reason": "end_turn"})


def test_ask_uses_tool_and_returns_answer():
    cfo = CFO(store=StubStore(), client=FakeAnthropic())
    ans = cfo.ask("where did my money go?")
    assert isinstance(ans, ChatAnswer)
    assert "14,100" in ans.text


def test_ask_returns_text_without_tool():
    class DirectAnthropic:
        def __init__(self): self.messages = self
        def create(self, **kwargs):
            txt = type("B", (), {"type": "text", "text": "Hello!"})
            return type("M", (), {"content": [txt], "stop_reason": "end_turn"})
    cfo = CFO(store=StubStore(), client=DirectAnthropic())
    assert cfo.ask("hi").text == "Hello!"
