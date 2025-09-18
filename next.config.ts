import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // <-- CAMBIA ESTO A false
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pcovudoqndxfwndhqpta.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
