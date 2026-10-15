import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The sync tests build a second copy with different settings.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // Shown in the footer so it's easy to tell which version a browser has loaded.
  env: { NEXT_PUBLIC_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7) },
};

export default nextConfig;
