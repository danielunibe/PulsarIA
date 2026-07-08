import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { SettingsProvider } from '@/lib/settings-context';
import { Toaster } from 'sonner';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-sans',
});

const spaceGrotesk = Space_Grotesk({
    subsets: ['latin'],
    variable: '--font-display',
});

export const metadata: Metadata = {
    title: 'Pulsar TikTok Downloader',
    description: 'Download and manage TikTok videos.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
            <body className="font-sans antialiased" suppressHydrationWarning>
                <SettingsProvider>
                    {children}
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
