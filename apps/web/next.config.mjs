/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/shared ships raw TS with no build step — let Next.js compile it directly.
  transpilePackages: ["@echonome/shared"],
};

export default nextConfig;
