import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.QUARRYFLOW_TEST_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
