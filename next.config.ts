import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nockbox/iris-sdk", "@nockbox/iris-wasm"],
};

export default nextConfig;
