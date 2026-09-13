/// <reference types="next" />
/// <reference types="next/image-types/global" />

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // Static export para empaquetado Tauri (tauri.conf.json -> frontendDist: ../out)
    output: 'export',
    // Verification can isolate its generated output from an active next dev
    // process in the shared checkout.
    distDir: process.env.NEXT_DIST_DIR || '.next',
    reactStrictMode: false,
    allowedDevOrigins: ['127.0.0.1', 'localhost'],
    eslint: {
        ignoreDuringBuilds: false,
    },
    typescript: {
        ignoreBuildErrors: false,
    },
    images: {
        // Requerido por output: 'export' (deshabilita el optimizador de imágenes en servidor)
        unoptimized: true,
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
            {
                protocol: 'http',
                hostname: 'asset.localhost',
                port: '',
                pathname: '/**',
            },
        ],
    },
};

export default nextConfig;

