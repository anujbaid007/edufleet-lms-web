/** @type {import('next').NextConfig} */
const isDevelopment = process.env.NODE_ENV === "development";

const nextConfig = {
  distDir: isDevelopment ? ".next-dev" : ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
