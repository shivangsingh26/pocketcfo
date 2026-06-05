from ..models import RawTransaction, Transaction
from ..config import Config

CATEGORY_IDS = ["food", "travel", "clothing", "groceries", "bills",
                "entertainment", "health", "transport", "shopping", "other"]

_TOOL = {
    "name": "assign_category",
    "description": "Assign one spend category to a transaction.",
    "input_schema": {
        "type": "object",
        "properties": {
            "category_id": {"type": "string", "enum": CATEGORY_IDS},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["category_id", "confidence"],
    },
}
_SYSTEM = ("You categorize personal-finance transactions for an Indian user. "
           "Given a merchant and amount, call assign_category with the best "
           f"category from: {', '.join(CATEGORY_IDS)}. Use 'other' if unsure.")


class Categorizer:
    def __init__(self, client=None, rules: dict | None = None):
        self.rules = rules or {}
        if client is None:
            import anthropic
            Config.require("ANTHROPIC_API_KEY")
            client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)
        self.client = client

    def categorize(self, raw: RawTransaction) -> Transaction:
        # Learned rule wins: skip the LLM and tag with full confidence.
        ruled = self.rules.get(raw.merchant_key())
        if ruled:
            return Transaction(**raw.model_dump(), category_id=ruled, confidence=1.0)
        try:
            msg = self.client.messages.create(
                model=Config.CLAUDE_MODEL,
                max_tokens=128,
                system=_SYSTEM,
                tools=[_TOOL],
                tool_choice={"type": "tool", "name": "assign_category"},
                messages=[{"role": "user",
                           "content": f"Merchant: {raw.merchant}\nAmount: INR {raw.amount}\nDirection: {raw.direction}"}],
            )
            block = next(b for b in msg.content if getattr(b, "type", None) == "tool_use")
            cat = block.input["category_id"]
            conf = float(block.input["confidence"])
        except Exception as exc:
            import sys
            print(f"[categorizer] LLM categorization failed, falling back to 'other': "
                  f"{type(exc).__name__}: {exc}", file=sys.stderr)
            cat, conf = "other", 0.0
        return Transaction(**raw.model_dump(), category_id=cat, confidence=conf)
