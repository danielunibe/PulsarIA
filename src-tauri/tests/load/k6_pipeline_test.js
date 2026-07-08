import http from 'k6/http';
import { check, sleep } from 'k6';

// Pipeline Stress Test Configuration
// Simula 100 usuarios concurrentes, picos de 500 y carga sostenida de 2 minutos
export let options = {
    stages: [
        { duration: '30s', target: 100 }, // Rampa de subida a 100 usuarios
        { duration: '1m', target: 100 },  // Carga sostenida (100 concurrentes)
        { duration: '10s', target: 500 }, // Spike de carga brutal (500 concurrentes)
        { duration: '20s', target: 50 },  // Bajada rápida (recovery test)
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% de requests (ingesta a cola) debajo de 500ms
        http_req_failed: ['rate<0.15'],   // Max 15% de errores admitidos (backpressure 429/503 esperado)
    },
};

export default function () {
    const url = 'http://127.0.0.1:9001/pipeline/ingest'; 
    
    const payload = JSON.stringify({
        url: 'https://video-source/sample.mp4',
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const res = http.post(url, payload, params);

    // Verificación del estado de protección (Sistema Sano = 200, Saturado pero Seguro = 429 / 503)
    check(res, {
        'is accepted or rejected by backpressure': (r) => r.status === 200 || r.status === 429 || r.status === 503,
        'job successfully queued': (r) => r.status === 200,
    });

    sleep(Math.random() * 1.5);
}
