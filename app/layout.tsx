import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk, Sora, Manrope, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { SettingsProvider } from '@/lib/settings-context';
import { I18nProvider } from '@/lib/i18n';
import { Toaster } from 'sonner';
import { LocalizedErrorBoundary } from '@/components/ErrorBoundary';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-sans',
    display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
    subsets: ['latin'],
    variable: '--font-display',
    display: 'swap',
});

const sora = Sora({
    subsets: ['latin'],
    variable: '--font-sora',
    display: 'swap',
});

const manrope = Manrope({
    subsets: ['latin'],
    variable: '--font-manrope',
    display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ['latin'],
    variable: '--font-mono',
    display: 'swap',
});

export const metadata: Metadata = {
    title: 'Pulsaria — Biblioteca Multimedia Inteligente',
    description: 'Descarga, transcribe e indexa semánticamente tus videos con IA local. Búsqueda semántica, playlists temáticas y análisis multimodal.',
    keywords: ['TikTok', 'IA', 'transcripción', 'ONNX', 'Whisper', 'búsqueda semántica'],
    icons: {
        icon: '/pulsaria-icon.png',
    },
    other: {
        'pulsaria-frontend': 'beta3-canonical',
        'pulsaria-version': process.env.PULSARIA_VERSION ?? 'unknown',
        'pulsaria-runtime-profile': process.env.PULSARIA_RUNTIME_PROFILE ?? 'browser',
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    minimumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable} ${sora.variable} ${manrope.variable} ${jetbrainsMono.variable}`}>
            <body className="font-sans antialiased" suppressHydrationWarning>
                <SettingsProvider>
                    <I18nProvider>
                        <LocalizedErrorBoundary>{children}</LocalizedErrorBoundary>
                    </I18nProvider>
                    <Toaster
                        position="bottom-right"
                        theme="dark"
                        toastOptions={{
                            style: {
                                background: 'rgba(10,11,15,0.9)',
                                backdropFilter: 'blur(30px)',
                                border: 'none',
                                color: 'rgba(255,255,255,0.9)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                borderRadius: '16px',
                                fontFamily: 'var(--font-sans)',
                            },
                        }}
                        gap={8}
                        richColors
                    />
                </SettingsProvider>
            </body>
        </html>
    );
}
