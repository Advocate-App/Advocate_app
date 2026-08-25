import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Every page here is a client component that fetches its own data on
    // mount — but Next's client-side router cache was still reusing the
    // previously-rendered version of a page when navigating back to it
    // (Link, back button), so edits made elsewhere didn't show up until a
    // hard reload (which is why logging out and back in "fixed" it — that's
    // a full page load, not a soft navigation). Setting this to 0 makes
    // every navigation fetch fresh instead of reusing a stale cached page.
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
