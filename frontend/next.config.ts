import type { NextConfig } from "next";

// In local dev the Python FastAPI service runs separately (uvicorn on :8000).
// Proxy /api/* to it so the dashboard's relative fetches work without `vercel dev`.
// In production, Vercel `experimentalServices` (vercel.json) handles /api routing,
// so this rewrite is dev-only.
const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const target = process.env.PC_API_ORIGIN ?? "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${target}/:path*` }];
  },
};

export default nextConfig;
