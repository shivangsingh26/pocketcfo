"use client";

import { useRef, useState } from "react";

type Role = "user" | "cfo";

interface Message {
  role: Role;
  text: string;
}

export function CFOChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [inFlight, setInFlight] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    // rAF so we scroll after the DOM has painted the new bubble
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }

  async function handleSubmit() {
    const question = input.trim();
    if (!question || inFlight) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInFlight(true);
    scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as { text?: string };
      const reply = data.text ?? "No response from server.";
      setMessages((prev) => [...prev, { role: "cfo", text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "cfo",
          text: "Sorry, I couldn't reach the CFO service right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setInFlight(false);
      scrollToBottom();
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
      className="pc-glass flex flex-col"
      style={{
        borderRadius: "var(--pc-radius)",
        minHeight: "420px",
        maxHeight: "520px",
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 border-b"
        style={{ borderColor: "rgba(255,255,255,0.4)" }}
      >
        <h2
          className="text-sm font-semibold uppercase tracking-widest"
          style={{ color: "var(--pc-ink)", opacity: 0.55 }}
        >
          CFO Chat
        </h2>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <p
            className="text-sm text-center mt-6"
            style={{ color: "var(--pc-ink)", opacity: 0.35 }}
          >
            Ask your CFO anything about your finances.
          </p>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={i}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className="text-sm px-4 py-2.5 max-w-[82%]"
                style={{
                  background: isUser ? "#E0D7F5" : "rgba(255,255,255,0.85)",
                  borderRadius: isUser
                    ? "16px 16px 4px 16px"
                    : "16px 16px 16px 4px",
                  color: "var(--pc-ink)",
                  border: "1px solid rgba(255,255,255,0.6)",
                  lineHeight: "1.5",
                }}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        {inFlight && (
          <div className="flex justify-start">
            <div
              className="text-sm px-4 py-2.5"
              style={{
                background: "rgba(255,255,255,0.85)",
                borderRadius: "16px 16px 16px 4px",
                color: "var(--pc-ink)",
                opacity: 0.55,
                border: "1px solid rgba(255,255,255,0.6)",
              }}
            >
              …
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div
        className="px-4 py-3 flex gap-2 border-t"
        style={{ borderColor: "rgba(255,255,255,0.4)" }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Where did my money go in May?"
          aria-label="Ask your CFO a question"
          disabled={inFlight}
          className="flex-1 px-4 py-2 text-sm outline-none"
          style={{
            background: "rgba(255,255,255,0.6)",
            borderRadius: "calc(var(--pc-radius) - 4px)",
            border: "1px solid rgba(255,255,255,0.7)",
            color: "var(--pc-ink)",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={inFlight || !input.trim()}
          aria-label={inFlight ? "Sending" : "Ask"}
          className="px-4 py-2 text-sm font-semibold shrink-0 transition-opacity disabled:opacity-40"
          style={{
            background: "#E0D7F5",
            borderRadius: "calc(var(--pc-radius) - 4px)",
            color: "var(--pc-ink)",
            border: "none",
            cursor: inFlight || !input.trim() ? "not-allowed" : "pointer",
          }}
        >
          {inFlight ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}
