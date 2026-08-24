/// <reference types="next" />
/// <reference types="next/image-types/global" />

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // Static export para empaquetado Tauri (tauri.conf.json -> frontendDist: ../out)
    output: 'export',
    reactStrictMode: false,
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    images: {
        // Requerido por output: 'export' (deshabilita el optimizador de imagenes en servidor)
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
        ],
    },
};

export default nextConfig;
