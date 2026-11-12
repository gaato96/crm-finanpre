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
  experimental: {
    serverActions: {
      // El PDF firmado viaja al servidor para hashearlo y guardarlo en un
      // bucket privado. El límite por defecto (1 MB) cortaba contratos largos.
      bodySizeLimit: '8mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Un CRM financiero no tiene por qué poder embeberse en otro sitio
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ]
  },
};

export default nextConfig;
