/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disable to prevent double mounting in dev
  webpack: (config) => {
    // Handle MapLibre GL JS
    config.module.rules.push({
      test: /\.worker\.js$/,
      use: { loader: 'worker-loader' },
    });
    return config;
  },
};

export default nextConfig;