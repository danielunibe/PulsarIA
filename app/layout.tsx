import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { SettingsProvider } from '@/lib/settings-context';
import { I18nProvider } from '@/lib/i18n';
import { Toaster } from 'sonner';

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

export const metadata: Metadata = {
    title: 'Pulsaria — Biblioteca Multimedia Inteligente',
    description: 'Descarga, transcribe e indexa semánticamente tus videos con IA local. Búsqueda semántica, playlists temáticas y análisis multimodal.',
    keywords: ['TikTok', 'IA', 'transcripción', 'ONNX', 'Whisper', 'búsqueda semántica'],
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    minimumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable}`}>
            <body className="font-sans antialiased" suppressHydrationWarning>
                <SettingsProvider>
                    <I18nProvider>
                        {children}
                    </I18nProvider>
                    <Toaster
                        position="bottom-right"
                        theme="dark"
                        toastOptions={{
                            style: {
                                background: 'rgba(10,11,15,0.9)',
                                backdropFilter: 'blur(30px)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                color: 'rgba(255,255,255,0.9)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1)',
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
