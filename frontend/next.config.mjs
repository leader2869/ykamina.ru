/** @type {import('next').NextConfig} */
const nextConfig = {
  // Development and production servers may run side by side locally. Keeping
  // their artifacts separate prevents either process from corrupting the
  // other's client bundles and breaking React hydration.
  distDir: process.env.NEXT_DIST_DIR || (process.env.NODE_ENV === 'production' ? '.next' : '.next-dev'),
  images: {
    formats: ['image/webp'],
    minimumCacheTTL: 86400,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'realflame.ru' },
    ],
  },
};

export default nextConfig;
