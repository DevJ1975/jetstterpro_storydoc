/** @type {import('next').NextConfig} */
const nextConfig = {
  // @libsql/client ships native/node bindings — keep it external to the server bundle
  experimental: {
    serverComponentsExternalPackages: ['@libsql/client', 'libsql'],
  },
};

export default nextConfig;
