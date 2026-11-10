import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 자료실 업로드(PDF, 5MB까지)가 서버 액션으로 들어온다. 기본 한도는 1MB.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
