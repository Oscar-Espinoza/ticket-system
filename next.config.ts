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
};

export default nextConfig;
