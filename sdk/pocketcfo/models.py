import hashlib
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from pydantic import BaseModel

Direction = Literal["debit", "credit"]
Source = Literal["gmail", "csv", "pdf", "sms"]


class RawTransaction(BaseModel):
    occurred_at: datetime
    amount: Decimal
    direction: Direction
    merchant: Optional[str] = None
    account: Optional[str] = None
    raw_text: str
    source: Source

    def dedup_key(self) -> str:
        basis = f"{self.occurred_at.isoformat()}|{self.amount:.2f}|{self.merchant or ''}|{self.account or ''}"
        return hashlib.sha1(basis.encode()).hexdigest()

    def merchant_key(self) -> str:
        """Normalized merchant used for category-correction rules (exact match)."""
        return (self.merchant or "").strip().upper()


def merchant_key_of(merchant: Optional[str]) -> str:
    """Module-level merchant normalizer for rows that aren't model instances."""
    return (merchant or "").strip().upper()


class Transaction(RawTransaction):
    category_id: str
    confidence: float = 0.0


class Category(BaseModel):
    id: str
    label: str
    emoji: Optional[str] = None
    color: Optional[str] = None


class CategoryTotal(BaseModel):
    category_id: str
    label: str
    emoji: Optional[str] = None
    color: Optional[str] = None
    total: Decimal


class SyncResult(BaseModel):
    inserted: int = 0
    skipped: int = 0
    needs_review: int = 0


class BudgetStatus(BaseModel):
    category_id: str
    label: str
    emoji: Optional[str] = None
    color: Optional[str] = None
    spent: Decimal
    limit: Decimal
    pct: float
    over: bool


class ChatAnswer(BaseModel):
    text: str
