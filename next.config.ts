import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The sync tests build a second copy with different settings.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // Shown in the footer so it's easy to tell which version a browser has loaded.
  env: { NEXT_PUBLIC_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7) },
  // Basic hardening: no framing by other sites, no MIME sniffing, and the camera, microphone and location stay off.
  // (Screen sharing is asked for by the page itself and still works.)
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};

export default nextConfig;
