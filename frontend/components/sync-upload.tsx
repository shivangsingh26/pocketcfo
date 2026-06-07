"use client";

import { useRef, useState } from "react";
import { RefreshCw, Upload, AlertTriangle, CheckCircle } from "lucide-react";

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
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string };

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
        setSyncStatus({ kind: "ok", text: "Connect Gmail to sync" });
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSyncStatus({ kind: "error", text: body.error ?? `Sync failed (${res.status})` });
        return;
      }

      const data = (await res.json()) as SyncResult;
      setSyncStatus({ kind: "ok", text: `${data.inserted} new · ${data.skipped} dup` });
      onChanged?.();
    } catch {
      setSyncStatus({ kind: "error", text: "Could not reach sync service." });
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    setUploadStatus({ kind: "busy" });

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setUploadStatus({ kind: "error", text: body.error ?? `Upload failed (${res.status})` });
        return;
      }

      const data = (await res.json()) as SyncResult;
      setUploadStatus({ kind: "ok", text: `${data.inserted} imported · ${data.skipped} dup` });
      onChanged?.();
    } catch {
      setUploadStatus({ kind: "error", text: "Upload failed. Try again." });
    }
  }

  const syncBusy = syncStatus.kind === "busy";
  const uploadBusy = uploadStatus.kind === "busy";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
      {/* Sync Gmail */}
      <button
        onClick={handleSync}
        disabled={syncBusy}
        className="pc-btn pc-btn-success"
        aria-label={syncBusy ? "Syncing Gmail…" : "Sync Gmail"}
      >
        <RefreshCw
          size={14}
          strokeWidth={2.2}
          aria-hidden="true"
          style={{ animation: syncBusy ? "spin 1s linear infinite" : "none" }}
        />
        {syncBusy ? "Syncing…" : "Sync Gmail"}
      </button>

      {/* Upload */}
      <label
        className="pc-btn pc-btn-info"
        style={{ opacity: uploadBusy ? 0.55 : 1, pointerEvents: uploadBusy ? "none" : "auto", cursor: uploadBusy ? "not-allowed" : "pointer" }}
        aria-label={uploadBusy ? "Uploading…" : "Upload CSV or PDF statement"}
      >
        <Upload size={14} strokeWidth={2.2} aria-hidden="true" />
        {uploadBusy ? "Uploading…" : "Upload CSV / PDF"}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.pdf"
          className="sr-only"
          onChange={handleFileChange}
          disabled={uploadBusy}
          aria-hidden="true"
        />
      </label>

      {/* Sync status */}
      {syncStatus.kind === "ok" && (
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.8125rem", color: "var(--pc-credit)", fontWeight: 500 }}>
          <CheckCircle size={13} aria-hidden="true" />
          {syncStatus.text}
        </span>
      )}
      {syncStatus.kind === "error" && (
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.8125rem", color: "var(--pc-danger)", fontWeight: 500 }}>
          <AlertTriangle size={13} aria-hidden="true" />
          {syncStatus.text}
        </span>
      )}

      {/* Upload status */}
      {uploadStatus.kind === "ok" && (
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.8125rem", color: "var(--pc-credit)", fontWeight: 500 }}>
          <CheckCircle size={13} aria-hidden="true" />
          {uploadStatus.text}
        </span>
      )}
      {uploadStatus.kind === "error" && (
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.8125rem", color: "var(--pc-danger)", fontWeight: 500 }}>
          <AlertTriangle size={13} aria-hidden="true" />
          {uploadStatus.text}
        </span>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes spin { to { transform: none; } }
        }
      `}</style>
    </div>
  );
}
