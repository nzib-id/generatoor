// next.config.ts
import type { NextConfig } from "next";

// (opsional) otomatis baca dari NEXT_PUBLIC_API_URL kalau ada
function patternFromEnv() {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return null;
  try {
    const u = new URL(base);
    const protocol = u.protocol.replace(":", "") as "http" | "https";
    const hostname = u.hostname;
    const port = u.port || (protocol === "https" ? "443" : "80");
    return { protocol, hostname, port, pathname: "/**" } as const;
  } catch {
    return null;
  }
}

const envPattern = patternFromEnv();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: envPattern
      ? [envPattern]
      : [
          // fallback: host IP lokal lo
          {
            protocol: "http",
            hostname: "192.168.1.6",
            port: "4000",
            pathname: "/**",
          },
        ],
    // kalau masih error di dev, sementara bisa pakai wildcard (JANGAN untuk production):
    // remotePatterns: [{ protocol: "http", hostname: "**", port: "*", pathname: "/**" }],
  },
};

export default nextConfig;
