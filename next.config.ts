import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The section moved to /knowledge; links saved under the old path still open.
  async redirects() {
    return [
      { source: "/reading", destination: "/knowledge", permanent: true },
      {
        source: "/reading/:itemId",
        destination: "/knowledge/:itemId",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
