import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/diary/cases',
        destination: '/diary',
        permanent: false,
      },
      {
        source: '/diary/cases/:path*',
        destination: '/diary',
        permanent: false,
      },
    ]
  },
};

export default nextConfig;
