"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Bot } from "lucide-react";

type Role = "user" | "cfo";

interface Message {
  role: Role;
  text: string;
}

const SUGGESTED = [
  "Where did most of my money go?",
  "How much did I spend on food this month?",
  "Am I over budget anywhere?",
];

export function CFOChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [inFlight, setInFlight] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages]);

  async function handleSubmit(question?: string) {
    const q = (question ?? input).trim();
    if (!q || inFlight) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setInFlight(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as { text?: string };
      setMessages((prev) => [
        ...prev,
        { role: "cfo", text: data.text ?? "No response from server." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "cfo",
          text: "Sorry, I couldn't reach the CFO service right now. Please check the backend and try again.",
        },
      ]);
    } finally {
      setInFlight(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div
      className="pc-glass"
      style={{
        borderRadius: "var(--pc-radius-lg)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 420,
        maxHeight: 560,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.40)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-hidden="true"
        >
          <Bot size={16} strokeWidth={1.8} color="var(--pc-ink)" />
        </div>
        <div>
          <p className="pc-h3" style={{ fontSize: "0.875rem", lineHeight: 1.2 }}>CFO Chat</p>
          <p style={{ fontSize: "0.7rem", color: "var(--pc-ink-3)", lineHeight: 1 }}>
            AI-powered financial insights
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        className="pc-scroll"
        style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}
        role="log"
        aria-label="CFO chat messages"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 12 }}>
            <p style={{ color: "var(--pc-ink-3)", fontSize: "0.875rem", marginBottom: 16 }}>
              Ask your CFO anything about your finances.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSubmit(s)}
                  disabled={inFlight}
                  className="pc-btn pc-btn-ghost"
                  style={{ fontSize: "0.78rem", padding: "6px 12px", fontWeight: 500 }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={i}
              style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}
            >
              <div
                style={{
                  maxWidth: "84%",
                  background: isUser ? "rgba(46,42,38,0.88)" : "rgba(255,255,255,0.85)",
                  color: isUser ? "#F4F1EA" : "var(--pc-ink)",
                  borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  padding: "10px 14px",
                  fontSize: "0.875rem",
                  lineHeight: "1.55",
                  border: "1px solid rgba(255,255,255,0.5)",
                  boxShadow: "var(--pc-shadow-sm)",
                  wordBreak: "break-word",
                }}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        {inFlight && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                background: "rgba(255,255,255,0.85)",
                borderRadius: "14px 14px 14px 4px",
                padding: "10px 16px",
                border: "1px solid rgba(255,255,255,0.5)",
                display: "flex",
                gap: 4,
                alignItems: "center",
              }}
              aria-label="CFO is typing"
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--pc-ink-3)",
                    display: "inline-block",
                    animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid rgba(255,255,255,0.40)",
          display: "flex",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Where did my money go this month?"
          aria-label="Ask your CFO a question"
          disabled={inFlight}
          className="pc-input"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          onClick={() => handleSubmit()}
          disabled={inFlight || !input.trim()}
          aria-label={inFlight ? "Sending…" : "Send message"}
          className="pc-btn pc-btn-primary"
          style={{ padding: "7px 12px", flexShrink: 0 }}
        >
          <Send size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes bounce { 0%, 100% { transform: none; } }
        }
      `}</style>
    </div>
  );
}
