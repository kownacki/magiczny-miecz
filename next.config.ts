import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ~/Projects/moje has a stray package.json and package-lock.json at the top
  // level, and Turbopack walks upward looking for a workspace root — so without
  // this it adopts the parent directory and warns on every start.
  turbopack: { root: __dirname },
};

export default nextConfig;
