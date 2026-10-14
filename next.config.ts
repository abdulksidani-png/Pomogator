import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The sync tests build a second copy with different settings.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
};

export default nextConfig;
