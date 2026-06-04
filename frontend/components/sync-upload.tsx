"use client";

import { useRef, useState } from "react";

interface SyncResult {
  inserted: number;
  skipped: number;
  needs_review: number;
}

interface SyncUploadProps {
  onChanged?: () => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "message"; text: string; isError?: boolean };

export function SyncUpload({ onChanged }: SyncUploadProps) {
  const [syncStatus, setSyncStatus] = useState<Status>({ kind: "idle" });
  const [uploadStatus, setUploadStatus] = useState<Status>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSync() {
    if (syncStatus.kind === "busy") return;
    setSyncStatus({ kind: "busy" });

    try {
      const res = await fetch("/api/sync", { method: "POST" });

      if (res.status === 409) {
        setSyncStatus({
          kind: "message",
          text: "Connect Gmail to sync (coming soon)",
          isError: false,
        });
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setSyncStatus({
          kind: "message",
          text: body.error ?? `Sync failed (HTTP ${res.status})`,
          isError: true,
        });
        return;
      }

      const data = (await res.json()) as SyncResult;
      setSyncStatus({
        kind: "message",
        text: `Synced: ${data.inserted} new, ${data.skipped} dup, ${data.needs_review} to review.`,
      });
      onChanged?.();
    } catch {
      setSyncStatus({
        kind: "message",
        text: "Could not reach the sync service. Try again.",
        isError: true,
      });
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset input so the same file can be re-selected later
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!file) return;
    setUploadStatus({ kind: "busy" });

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: form });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setUploadStatus({
          kind: "message",
          text: body.error ?? `Upload failed (HTTP ${res.status})`,
          isError: true,
        });
        return;
      }

      const data = (await res.json()) as SyncResult;
      setUploadStatus({
        kind: "message",
        text: `Imported: ${data.inserted} new, ${data.skipped} dup.`,
      });
      onChanged?.();
    } catch {
      setUploadStatus({
        kind: "message",
        text: "Upload failed. Please try again.",
        isError: true,
      });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Sync Gmail */}
      <button
        onClick={handleSync}
        disabled={syncStatus.kind === "busy"}
        className="px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
        style={{
          background: "#CDEAD9",
          borderRadius: "calc(var(--pc-radius) - 4px)",
          color: "var(--pc-ink)",
          border: "none",
          cursor: syncStatus.kind === "busy" ? "not-allowed" : "pointer",
        }}
      >
        {syncStatus.kind === "busy" ? "Syncing…" : "Sync Gmail"}
      </button>

      {/* Upload CSV/PDF */}
      <label
        className="px-4 py-2 text-sm font-semibold transition-opacity cursor-pointer"
        style={{
          background: uploadStatus.kind === "busy" ? "rgba(199,224,244,0.5)" : "#C7E0F4",
          borderRadius: "calc(var(--pc-radius) - 4px)",
          color: "var(--pc-ink)",
          border: "none",
          opacity: uploadStatus.kind === "busy" ? 0.6 : 1,
          pointerEvents: uploadStatus.kind === "busy" ? "none" : "auto",
        }}
      >
        {uploadStatus.kind === "busy" ? "Uploading…" : "Upload CSV / PDF"}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.pdf"
          className="sr-only"
          onChange={handleFileChange}
          disabled={uploadStatus.kind === "busy"}
        />
      </label>

      {/* Status messages */}
      {syncStatus.kind === "message" && (
        <span
          className="text-xs"
          style={{
            color: syncStatus.isError ? "#b94a4a" : "var(--pc-ink)",
            opacity: syncStatus.isError ? 1 : 0.65,
          }}
        >
          {syncStatus.text}
        </span>
      )}
      {uploadStatus.kind === "message" && (
        <span
          className="text-xs"
          style={{
            color: uploadStatus.isError ? "#b94a4a" : "var(--pc-ink)",
            opacity: uploadStatus.isError ? 1 : 0.65,
          }}
        >
          {uploadStatus.text}
        </span>
      )}
    </div>
  );
}
