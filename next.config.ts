import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Supabase images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

export default nextConfig;
