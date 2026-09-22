/// <reference types="next" />
/// <reference types="next/image-types/global" />

import type { NextConfig } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const packageVersion = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
).version as string;

const nextConfig: NextConfig = {
    // Static export para empaquetado Tauri (tauri.conf.json -> frontendDist: ../out)
    output: 'export',
    // Verification can isolate its generated output from an active next dev
    // process in the shared checkout.
    distDir: process.env.NEXT_DIST_DIR || '.next',
    // Keep Turbopack/PostCSS resolution anchored to this checkout even when
    // a verification script selects an alternate distDir.
    turbopack: {
        root: projectRoot,
    },
    reactStrictMode: false,
    allowedDevOrigins: ['127.0.0.1', 'localhost'],
    experimental: {
        optimizePackageImports: ['@phosphor-icons/react'],
    },
    env: {
        PULSARIA_VERSION: packageVersion,
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

