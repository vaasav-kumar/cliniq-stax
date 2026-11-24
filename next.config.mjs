/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Uploads (CSV or image) go through server actions; the default 1 MB limit is too small for photos.
    serverActions: { bodySizeLimit: "4mb" },
    // OCR runs in Node and loads its own worker files, so keep it out of the bundle.
    serverComponentsExternalPackages: ["tesseract.js"],
  },
};

export default nextConfig;
