# Pulsaria SDK

SDK TypeScript para integración externa con el ecosistema de Pulsaria.

## ¿Qué es?

El SDK proporciona clientes tipados para interactuar con la API REST de Pulsaria, permitiendo que aplicaciones externas (como Julia o servicios personalizados) consulten la biblioteca de videos procesados.

## Instalación

```bash
cd sdk/typescript
npm install
```

## Uso

```typescript
import { PulsarClient } from './sdk/typescript/src';

const client = new PulsarClient('http://127.0.0.1:8080');

// Obtener jobs pendientes de exportación a Julia
const pendingJobs = await client.getJuliaPending();

// Marcar un job como exportado
await client.markJuliaExported(jobId);

// Obtener todos los videos procesados
const jobs = await client.getJobs();

// Buscar en transcripciones
const results = await client.searchTranscripts('machine learning', {
  limit: 10,
  minScore: 0.5,
});
```

## API Disponible

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/v1/jobs` | GET | Lista todos los jobs procesados |
| `/api/v1/ingest` | POST | Ingesta de un nuevo video |
| `/api/v1/julia/pending` | GET | Jobs listos para exportar a Julia |
| `/api/v1/julia/ack` | POST | Marca un job como exportado |
| `/api/v1/export/:job_id` | GET | Exporta un job como JSON estructurado |
| `/api/v1/search` | POST | Búsqueda semántica en transcripciones |
| `/health` | GET | Estado de salud del servidor |

## Configuración

El servidor API de Pulsaria escucha en `127.0.0.1:8080` por defecto. El puerto puede configurarse en el código fuente de `src-tauri/src/api/gateway.rs`.

## Notas

- La API REST es un fallback/secundario al canal principal Tauri IPC
- Para uso interno de la app, se recomienda usar los comandos Tauri `invoke`
- La API no requiere autenticación por defecto (solo si `JWT_SECRET` está configurado)
