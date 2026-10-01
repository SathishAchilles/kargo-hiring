import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF and DOCX parsers load workers and fonts at runtime; keep them out of the bundle.
  serverExternalPackages: ["unpdf", "mammoth"],
  experimental: {
    serverActions: {
      // One CV per request, at most 5 MB, plus multipart overhead.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
