/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: '/tc',
  assetPrefix: '/tc',
  images: { unoptimized: true },
};

module.exports = nextConfig;
