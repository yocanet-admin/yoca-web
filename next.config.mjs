/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Document PDFs read the embedded fonts and the original logo SVG from disk.
    outputFileTracingIncludes: {
      // pdfkit loads its built-in font metrics (Helvetica, used as the initial
      // font of every PDF) through package "imports" at runtime; the file tracer
      // does not see them, so they are listed here.
      '/api/admin/documents/**': ['./lib/documents/fonts/**', './public/brand/*.svg', './node_modules/pdfkit/js/standard-fonts/**', './node_modules/pdfkit/js/data/**'],
    },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Supabase Storage public buckets (team photos, media)
      { protocol: 'https', hostname: '**.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
