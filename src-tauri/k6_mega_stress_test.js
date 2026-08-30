import http from 'k6/http';
import { check, sleep } from 'k6';

/* eslint-disable import/no-anonymous-default-export -- k6 requires a default VU function. */

// Mega Stress Test Configuration
// Objetivo: Confirmar estabilidad, burst protection y limites Reales
export const options = {
  scenarios: {
    // Escenario 1: Carga Sostenida (5 mins)
    sustained_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 500 }, // Ramp-up
        { duration: '4m', target: 500 },  // Plateau
        { duration: '30s', target: 0 },   // Ramp-down
      ],
      gracefulRampDown: '10s',
    },
    // Escenario 2: Burst Spikes a la mitad de la carga sostenida
    burst_spikes: {
      executor: 'constant-arrival-rate',
      rate: 200, // 200 peticiones por segundo en el spike
      timeUnit: '1s',
      duration: '1m',       
      preAllocatedVUs: 500,
      maxVUs: 1000, 
      startTime: '2m',      // Disparar en el minuto 2, mientras la carga sostenida está activa
    },
  },
  thresholds: {
    // Criterios de Acpetación (SLOs)
    http_req_duration: ['p(95)<500'], // 95% de las peticiones en menos de 500ms
    http_req_failed: ['rate<0.05'],   // Fallos (Rate Limit o Circuit Breaker) debajo de 5%
  },
};

const BASE_URL = 'http://localhost:8080/api/v1';
const API_KEY = __ENV.API_KEY || 'secret_pulsar_key'; // Default de .env

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': API_KEY,
  };

  // Tráfico probabilístico: 20% ingestión (escritura agresiva), 80% búsqueda (lectura)
  const trafficType = Math.random();

  if (trafficType < 0.20) {
    // ======================================
    // MOCK INGEST (QueueService Backpressure)
    // ======================================
    const ingestRes = http.post(`${BASE_URL}/ingest`, JSON.stringify({
      url: `https://www.youtube.com/watch?v=k6_test_${__VU}_${__ITER}`
    }), { headers, tags: { name: 'IngestEndpoint' } });
    
    check(ingestRes, { "ingest status 200": (r) => r.status === 200 });

  } else {
    // ======================================
    // MOCK SEARCH (Axum + HNSW + Cache)
    // ======================================
    const searchRes = http.post(`${BASE_URL}/search`, JSON.stringify({
      query: "testing vector horizontal scaling limits under load",
      limit: 10
    }), { headers, tags: { name: 'SearchEndpoint' } });

    check(searchRes, { "search status 200": (r) => r.status === 200 });
  }
  
  // Realismo de usuario
  sleep(Math.random() * 2); 
}
