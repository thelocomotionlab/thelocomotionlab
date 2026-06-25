import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Transpile la charte partagée (TS/TSX + next/font) du monorepo.
  transpilePackages: ["@locomotionlab/ui"],
};

export default nextConfig;
