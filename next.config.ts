import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // 엑셀 업로드(최대 5MB), 게시판 첨부파일(한 번에 합계 20MB)을 Server Action으로 받기 위해 기본 1MB에서 상향
      bodySizeLimit: "21mb",
    },
    // proxy가 요청 본문을 버퍼링하는 한도 (기본 10MB). 게시판 첨부 업로드가 잘리지 않도록 같은 크기로
    proxyClientMaxBodySize: "21mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
