const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3344;
const OUT_DIR = path.join(__dirname, 'out');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
        res.end('Method not allowed');
        return;
    }

    let reqPath;
    try {
        reqPath = decodeURIComponent((req.url || '/').split('?')[0] || '/');
    } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Invalid URL');
        return;
    }

    const resolvedOutDir = path.resolve(OUT_DIR);
    const candidatePath = path.resolve(resolvedOutDir, `.${reqPath}`);
    const outDirPrefix = `${resolvedOutDir}${path.sep}`;
    if (candidatePath !== resolvedOutDir && !candidatePath.startsWith(outDirPrefix)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    let filePath = candidatePath;
    if (reqPath === '/' || reqPath === '') filePath = path.join(resolvedOutDir, 'index.html');

    // Route fallback applies only to extensionless paths. Missing assets must
    // remain 404s so a broken bundle cannot be disguised as index.html.
    if (!fs.existsSync(filePath) && !path.extname(filePath)) {
        const htmlPath = `${filePath}.html`;
        if (fs.existsSync(htmlPath)) filePath = htmlPath;
        else filePath = path.join(resolvedOutDir, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(err.code === 'ENOENT' ? 'Not found' : 'Error reading file');
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache'
            });
            if (req.method === 'HEAD') res.end();
            else res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Pulsaria UI server running on http://localhost:${PORT} and http://127.0.0.1:${PORT}`);
});
