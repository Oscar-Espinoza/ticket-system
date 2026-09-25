import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Better Auth (and its optional Kysely-based DB adapters) as server-only
  // externals rather than letting the bundler statically resolve them. Better
  // Auth's context/init pulls in @better-auth/kysely-adapter, which references
  // optional sqlite dialects (bun:sqlite, node:sqlite, D1) and Kysely exports
  // that aren't present here — bundling them breaks the Turbopack build. These
  // packages only ever run on the Node server, so externalizing them is correct
  // and also avoids shipping them to the client.
  serverExternalPackages: ["better-auth", "@better-auth/kysely-adapter"],

  // PWA (B12): the service worker must never be served from a cache, or a
  // deploy can't replace it; it controls the whole origin from /sw.js.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
