/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    /**
     * Next's <Image> component refuses to load images from domains you have not
     * listed here. That is a deliberate safety feature: without it, anyone who
     * got a URL into your database could make your server fetch arbitrary files.
     *
     * Product images live in Supabase Storage, so allow that host.
     * Replace the hostname with your own project ref, or keep the wildcard.
     */
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
