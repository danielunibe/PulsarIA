/**
 * Pulsar Mock API Server — para testing en sandbox
 * Simula el backend Axum en un puerto que el proxy no intercepta.
 * Solo soporta las operaciones básicas del frontend.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8081;
const DB_PATH = path.join(__dirname, '..', 'data', 'library.db');

let jobs = [];
let nextId = 1;

function jsonResponse(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        return res.end();
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // Health
    if (pathname === '/health' || pathname === '/api/v1/health') {
        return jsonResponse(res, 200, { status: 'healthy', mock: true });
    }

    // GET /api/v1/jobs
    if (req.method === 'GET' && pathname === '/api/v1/jobs') {
        return jsonResponse(res, 200, jobs);
    }

    // POST /api/v1/ingest
    if (req.method === 'POST' && pathname === '/api/v1/ingest') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { url } = JSON.parse(body);
                if (!url) return jsonResponse(res, 400, { error: 'url is required' });

                const job = {
                    id: nextId++,
                    url,
                    status: 'queued',
                    progress: 0,
                    created_at: new Date().toISOString(),
                };
                jobs.push(job);

                // Simulate progress
                simulateJob(job);

                jsonResponse(res, 200, { job_id: job.id });
            } catch (e) {
                jsonResponse(res, 400, { error: e.message });
            }
        });
        return;
    }

    // POST /api/v1/search
    if (req.method === 'POST' && pathname === '/api/v1/search') {
        return jsonResponse(res, 200, { results: [] });
    }

    // GET /api/v1/playlists
    if (req.method === 'GET' && pathname === '/api/v1/playlists') {
        return jsonResponse(res, 200, []);
    }

    // POST /api/v1/playlists
    if (req.method === 'POST' && pathname === '/api/v1/playlists') {
        return jsonResponse(res, 200, { id: 1, name: 'Mock Playlist' });
    }

    // Fallback
    jsonResponse(res, 404, { error: 'not found' });
});

function simulateJob(job) {
    const steps = [
        { status: 'downloading', progress: 15, delay: 1000 },
        { status: 'metadata', progress: 30, delay: 1500 },
        { status: 'extracting_audio', progress: 50, delay: 2000 },
        { status: 'transcribing', progress: 70, delay: 3000 },
        { status: 'indexing', progress: 90, delay: 2000 },
        { status: 'complete', progress: 100, delay: 1000 },
    ];

    let i = 0;
    function nextStep() {
        if (i >= steps.length) return;
        const step = steps[i++];
        job.status = step.status;
        job.progress = step.progress;

        if (step.status === 'complete') {
            job.title = extractTitle(job.url);
            job.author = extractAuthor(job.url);
            job.duration = Math.floor(Math.random() * 120) + 10;
            job.thumbnail = '';
            job.video_path = '';
        }

        setTimeout(nextStep, step.delay);
    }
    setTimeout(nextStep, 500);
}

function extractTitle(url) {
    const match = url.match(/video\/(\d+)/);
    return match ? `TikTok Video #${match[1]}` : 'Video from TikTok';
}

function extractAuthor(url) {
    const match = url.match(/@([^/]+)/);
    return match ? `@${match[1]}` : '@creator';
}

server.listen(PORT, '127.0.0.1', () => {
    console.log(`✅ Pulsar Mock API running on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Jobs:   http://localhost:${PORT}/api/v1/jobs`);
});
