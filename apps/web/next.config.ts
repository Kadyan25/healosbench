import path from "path";
import "@healosbench/env/web";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  turbopack: {
    resolveAlias: {
      "@": path.resolve("./src"),
    },
  },
};

export default nextConfig;
