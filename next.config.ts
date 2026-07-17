import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pbeoojpqjyndqcrzxbju.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
  experimental: {
    cpus: 2,
  },
};

export default nextConfig;