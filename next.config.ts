import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Limit page-data workers to keep builds reliable on developer laptops and
  // constrained CI runners. This affects build concurrency, not runtime.
  experimental: { cpus: 2 },
};

export default nextConfig;
