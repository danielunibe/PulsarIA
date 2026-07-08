/// <reference types="next" />
/// <reference types="next/image-types/global" />

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    reactStrictMode: true,
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: false,
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'picsum.photos',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'i.imgur.com',
                port: '',
                pathname: '/**',
            },
        ],
    },
    // output: 'standalone',
    outputFileTracingRoot: process.cwd(),
    transpilePackages: ['motion'],
    webpack: (config, { dev }) => {
        if (dev) {
            /* config.watchOptions = {
                poll: 1000,
                aggregateTimeout: 300,
                ignored: /node_modules/,
            }; */
        }
        return config;
    },
};

export default nextConfig;
