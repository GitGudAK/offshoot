const functions = require('@google-cloud/functions-framework');

/**
 * Offshoot CORS Proxy
 * Google Cloud Function that proxies HTTP requests to bypass CORS restrictions
 * 
 * Usage: GET /?url=https://example.com
 */

// Allowed origins (add your production domain here)
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
    // Add your production domain:
    // 'https://yourapp.com',
    // 'https://www.yourapp.com',
];

// Block these domains to prevent abuse
const BLOCKED_DOMAINS = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '192.168.',
    '10.',
    '172.16.',
];

functions.http('corsProxy', async (req, res) => {
    // Get origin for CORS
    const origin = req.headers.origin || req.headers.referer || '';

    // Check if origin is allowed
    const isAllowed = ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));

    // Set CORS headers
    if (isAllowed) {
        res.set('Access-Control-Allow-Origin', origin);
    } else {
        res.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
    }
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.set('Access-Control-Max-Age', '86400');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check origin restriction (optional - uncomment in production)
    // if (!isAllowed) {
    //   return res.status(403).json({ error: 'Origin not allowed' });
    // }

    // Get target URL from query parameter
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({
            error: 'Missing url parameter',
            usage: 'GET /?url=https://example.com'
        });
    }

    // Validate URL format
    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Block internal/private URLs
    const hostname = parsedUrl.hostname.toLowerCase();
    if (BLOCKED_DOMAINS.some(blocked => hostname.includes(blocked))) {
        return res.status(403).json({ error: 'Internal URLs not allowed' });
    }

    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return res.status(400).json({ error: 'Only HTTP/HTTPS URLs allowed' });
    }

    try {
        // Fetch the target URL
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(targetUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            },
            redirect: 'follow',
        });

        clearTimeout(timeoutId);

        // Get content type
        const contentType = response.headers.get('content-type') || 'text/html';

        // For HTML/text content, return as JSON with contents field (allorigins compatible)
        if (contentType.includes('text') || contentType.includes('html') || contentType.includes('json')) {
            const text = await response.text();

            return res.json({
                contents: text,
                status: {
                    url: targetUrl,
                    content_type: contentType,
                    http_code: response.status,
                }
            });
        }

        // For binary content (images), stream directly
        const buffer = await response.arrayBuffer();
        res.set('Content-Type', contentType);
        return res.send(Buffer.from(buffer));

    } catch (error) {
        console.error('Proxy error:', error);

        if (error.name === 'AbortError') {
            return res.status(504).json({ error: 'Request timeout' });
        }

        return res.status(500).json({
            error: 'Failed to fetch URL',
            message: error.message
        });
    }
});
