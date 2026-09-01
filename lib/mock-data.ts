import type { VideoData } from '@/types';

// ============================================================
// Mock Data — Videos Activos del Dashboard (Modo Demo)
// ============================================================

export const MOCK_ACTIVE_VIDEOS: VideoData[] = [
    {
        id: 101,
        title: 'Aprende RAG y Vector Search en 60 segundos',
        author: '@tech_insights',
        duration: '01:15',
        tags: ['IA', 'RAG', 'HNSW', 'Vectores'],
        thumb: '/demo/demo-01.jpg',
        videoSrc: '/demo/demo-01.mp4',
        originalUrl: 'https://www.tiktok.com/@tech_insights/video/7345678901234567890',
        visualAnalysis: JSON.stringify({
            summary: 'Explicación acelerada de la arquitectura RAG con HNSW index y embeddings vectoriales.',
            key_scenes: ['Introducción a vectores', 'Indexación HNSW', 'Búsqueda semántica en tiempo real']
        }),
        instructionalGuide: '1. Ingesta el texto o video.\n2. Genera los embeddings con ONNX/MiniLM.\n3. Consulta el índice HNSW para similitud coseno.\n4. Sintetiza la respuesta con Gemini RAG.'
    },
    {
        id: 102,
        title: 'Diseño UI Glassmorphism de Nueva Generación',
        author: '@design_master',
        duration: '00:48',
        tags: ['UI/UX', 'NextJS', 'CSS', 'Luxury'],
        thumb: '/demo/demo-02.jpg',
        videoSrc: '/demo/demo-02.mp4',
        originalUrl: 'https://www.tiktok.com/@design_master/video/7345678901234567891',
        visualAnalysis: JSON.stringify({
            summary: 'Demostración de interfaces futuristas con desenfoque de fondo y efectos lumínicos.',
            key_scenes: ['Efecto Aurora', 'Bordes pulidos', 'Microanimaciones']
        }),
        instructionalGuide: 'Aplica backdrop-filter: blur(20px), degradados oscuros de alta gama y bordes semi-transparentes.'
    },
    {
        id: 103,
        title: 'Rust + Tauri 2.0: Rendimiento Extremo para Desktop',
        author: '@rustacean_dev',
        duration: '02:10',
        tags: ['Rust', 'Tauri', 'Desktop', 'Async'],
        thumb: '/demo/demo-03.jpg',
        videoSrc: '/demo/demo-03.mp4',
        originalUrl: 'https://www.tiktok.com/@rustacean_dev/video/7345678901234567892',
        visualAnalysis: JSON.stringify({
            summary: 'Comparativa de IPC y consumo de memoria entre Electron y Tauri 2 en Windows 11.',
            key_scenes: ['Consumo de RAM < 40MB', 'IPC handlers nativos', 'Empaquetado binario']
        }),
        instructionalGuide: 'Estructura tu backend con puertos y adaptadores en Rust y enlaza tu frontend Next.js vía comandos tauri::command.'
    },
    {
        id: 104,
        title: 'Whisper AI + Transcripciones en Tiempo Real',
        author: '@ai_frontier',
        duration: '01:32',
        tags: ['Whisper', 'Python', 'Audio', 'ML'],
        thumb: '/demo/demo-04.jpg',
        videoSrc: '/demo/demo-04.mp4',
        originalUrl: 'https://www.tiktok.com/@ai_frontier/video/7345678901234567893',
        visualAnalysis: JSON.stringify({
            summary: 'Pipeline de extracción y procesamiento de audio con timestamps precisos y soporte multilingüe.',
            key_scenes: ['Extracción FFmpeg', 'Inferencia Whisper', 'Segmentación por timestamps']
        }),
        instructionalGuide: 'Extrae audio a 16kHz WAV y pasa las muestras al modelo de Whisper para generar subtítulos y embeddings.'
    },
    {
        id: 105,
        title: 'Guía Rápida: Descarga de contenido y metadatos con yt-dlp',
        author: '@numloco2',
        duration: '00:59',
        tags: ['yt-dlp', 'TikTok', 'Pipeline', 'Python'],
        thumb: '/demo/demo-05.jpg',
        videoSrc: '/demo/demo-05.mp4',
        originalUrl: 'https://www.tiktok.com/@numloco2/video/7610575966838033682',
        visualAnalysis: JSON.stringify({
            summary: 'Automatización de pipelines de extracción de videos de TikTok y YouTube Shorts.',
            key_scenes: ['Parseo de URLs', 'Extracción de metadatos', 'Almacenamiento SQLite']
        }),
        instructionalGuide: 'Invoca yt-dlp como módulo de Python con fallback de cookies y rotación de agentes.'
    },
    {
        id: 106,
        title: 'Viral Puppy Moments & Video Analysis',
        author: '@scout2015',
        duration: '00:35',
        tags: ['Viral', 'Trending', 'Media', 'Shorts'],
        thumb: '/demo/demo-06.jpg',
        videoSrc: '/demo/demo-06.mp4',
        originalUrl: 'https://www.tiktok.com/@scout2015/video/6718335390845095173',
        visualAnalysis: JSON.stringify({
            summary: 'Análisis de retención y dinamismo en clips cortos virales.',
            key_scenes: ['Gancho inicial', 'Pico de atención', 'Llamado a la acción']
        }),
        instructionalGuide: 'Monitorea métricas de interacción para clasificar clips en playlists temáticas automáticas.'
    }
];

// Número de slots inactivos vacíos a mostrar en el Dashboard
export const INACTIVE_SLOTS_COUNT = 12;
