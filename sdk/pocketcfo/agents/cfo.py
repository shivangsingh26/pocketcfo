import json
from ..config import Config
from ..models import ChatAnswer

_TOOLS = [
    {"name": "spend_by_category", "description": "Totals spent per category.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "list_transactions", "description": "Recent transactions.",
     "input_schema": {"type": "object",
                      "properties": {"limit": {"type": "integer"}}}},
]
_SYSTEM = ("You are PocketCFO, a concise personal finance assistant. "
           "Use the tools to answer questions about the user's spending. "
           "Amounts are INR. Be brief and specific.")


class CFO:
    def __init__(self, store=None, client=None):
        from ..store_factory import get_store
        self.store = store or get_store()
        if client is None:
            import anthropic
            Config.require("ANTHROPIC_API_KEY")
            client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)
        self.client = client

    def _run_tool(self, name, args):
        if name == "spend_by_category":
            return [c.model_dump() for c in self.store.spend_by_category()]
        if name == "list_transactions":
            return self.store.list_transactions(limit=args.get("limit", 20))
        return {"error": f"unknown tool {name}"}

    def ask(self, question: str) -> ChatAnswer:
        messages = [{"role": "user", "content": question}]
        for _ in range(4):  # bounded tool loop
            msg = self.client.messages.create(
                model=Config.CLAUDE_MODEL, max_tokens=512,
                system=_SYSTEM, tools=_TOOLS, messages=messages,
            )
            if getattr(msg, "stop_reason", None) != "tool_use":
                text = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
                return ChatAnswer(text=text)
            messages.append({"role": "assistant", "content": msg.content})
            results = []
            for b in msg.content:
                if getattr(b, "type", None) == "tool_use":
                    out = self._run_tool(b.name, b.input or {})
                    results.append({"type": "tool_result", "tool_use_id": b.id,
                                    "content": json.dumps(out, default=str)})
            messages.append({"role": "user", "content": results})
        return ChatAnswer(text="Sorry, I couldn't complete that.")
