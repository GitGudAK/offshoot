/**
 * Product Page Scraper Module
 * Extracts product images from e-commerce URLs
 */

export class ProductScraper {
    constructor(app) {
        this.app = app;
        // Multiple CORS proxies for fallback (GCP primary, public fallbacks)
        this.proxies = [
            { name: 'gcp', url: 'https://us-central1-gen-lang-client-0655380841.cloudfunctions.net/corsProxy?url=', type: 'json', key: 'contents' },
            { name: 'allorigins', url: 'https://api.allorigins.win/get?url=', type: 'json', key: 'contents' },
            { name: 'corsproxy', url: 'https://corsproxy.io/?', type: 'text' },
        ];
    }

    /**
     * Extract images from a product page URL
     */
    async extractImages(productUrl) {
        try {
            // Validate URL
            if (!this.isValidUrl(productUrl)) {
                throw new Error('Invalid URL');
            }

            this.app.showToast('Fetching product page...', 'info');

            // Fetch page through CORS proxy
            const html = await this.fetchPage(productUrl);

            // Extract images based on common patterns
            const images = this.parseImages(html, productUrl);

            if (images.length === 0) {
                throw new Error('No product images found on this page');
            }

            this.app.showToast(`Found ${images.length} images`, 'success');
            return images;

        } catch (error) {
            console.error('Scraper error:', error);
            throw error;
        }
    }

    /**
     * Validate URL format
     */
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Fetch page HTML through CORS proxy with fallbacks
     */
    async fetchPage(url) {
        let lastError = null;

        for (const proxy of this.proxies) {
            try {
                console.log(`Trying proxy: ${proxy.name}`);
                const proxyUrl = `${proxy.url}${encodeURIComponent(url)}`;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                const response = await fetch(proxyUrl, {
                    signal: controller.signal,
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                let html;
                if (proxy.type === 'json') {
                    const data = await response.json();
                    html = data[proxy.key];
                } else {
                    html = await response.text();
                }

                if (html && html.length > 100) {
                    console.log(`Success with proxy: ${proxy.name}`);
                    return html;
                }
                throw new Error('Empty response');

            } catch (error) {
                console.warn(`Proxy ${proxy.name} failed:`, error.message);
                lastError = error;
            }
        }

        throw new Error(`All proxies failed. Last error: ${lastError?.message || 'Unknown'}`);
    }

    /**
     * Parse images from HTML
     */
    parseImages(html, baseUrl) {
        const images = new Set();
        const baseUrlObj = new URL(baseUrl);

        // Strategy 1: Amazon data-a-dynamic-image JSON (main product images)
        const dynamicImageMatch = html.match(/data-a-dynamic-image=["']({[^"']+})["']/gi);
        if (dynamicImageMatch) {
            dynamicImageMatch.forEach(match => {
                try {
                    // Extract the JSON string
                    const jsonStr = match.match(/=["']({[^"']+})["']/)?.[1];
                    if (jsonStr) {
                        // Decode HTML entities
                        const decoded = jsonStr.replace(/&quot;/g, '"');
                        const imgObj = JSON.parse(decoded);
                        // Keys are the image URLs
                        Object.keys(imgObj).forEach(url => {
                            if (url.includes('images') && !url.includes('sprite')) {
                                images.add(this.cleanImageUrl(url));
                            }
                        });
                    }
                } catch (e) {
                    // JSON parse failed, skip
                }
            });
        }

        // Strategy 2: Open Graph image
        const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/gi);
        if (ogMatch) {
            ogMatch.forEach(match => {
                const urlMatch = match.match(/content=["']([^"']+)["']/i);
                if (urlMatch && urlMatch[1].startsWith('http')) {
                    images.add(this.cleanImageUrl(urlMatch[1]));
                }
            });
        }

        // Strategy 3: JSON-LD structured data
        const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
        if (jsonLdMatch) {
            jsonLdMatch.forEach(script => {
                try {
                    const jsonContent = script.replace(/<\/?script[^>]*>/gi, '');
                    const data = JSON.parse(jsonContent);
                    this.extractFromJsonLd(data, images);
                } catch (e) {
                    // Invalid JSON, skip
                }
            });
        }

        // Strategy 4: High-res srcset images
        const srcsetMatches = html.match(/srcset=["']([^"']+)["']/gi);
        if (srcsetMatches) {
            srcsetMatches.forEach(match => {
                const srcset = match.match(/=["']([^"']+)["']/)?.[1];
                if (srcset) {
                    // Parse srcset - format: "url1 1x, url2 2x" or "url1 100w, url2 200w"
                    const parts = srcset.split(',');
                    parts.forEach(part => {
                        const url = part.trim().split(/\s+/)[0];
                        if (url && url.startsWith('http') && this.isProductImage(url)) {
                            images.add(this.cleanImageUrl(url));
                        }
                    });
                }
            });
        }

        // Strategy 5: Data attributes (lazy-loaded images)
        const dataAttrs = ['data-src', 'data-zoom-image', 'data-large', 'data-full', 'data-original', 'data-old-hires'];
        dataAttrs.forEach(attr => {
            const regex = new RegExp(`${attr}=["']([^"']+)["']`, 'gi');
            const matches = html.match(regex);
            if (matches) {
                matches.forEach(match => {
                    const urlMatch = match.match(/=["']([^"']+)["']/);
                    if (urlMatch && urlMatch[1].startsWith('http') && this.isProductImage(urlMatch[1])) {
                        images.add(this.cleanImageUrl(urlMatch[1]));
                    }
                });
            }
        });

        // Strategy 6: Standard img tags (more selective)
        const imgMatches = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
        if (imgMatches) {
            imgMatches.forEach(match => {
                const srcMatch = match.match(/src=["']([^"']+)["']/);
                if (srcMatch) {
                    const url = srcMatch[1];
                    if (url.startsWith('http') && this.isProductImage(url) && url.length > 60) {
                        images.add(this.cleanImageUrl(url));
                    }
                }
            });
        }

        // Convert to array and filter valid URLs only
        return Array.from(images)
            .filter(url => {
                try {
                    new URL(url);
                    return url.startsWith('http') &&
                        !url.includes('sprite') &&
                        !url.includes('data:') &&
                        !url.includes('pixel') &&
                        !url.includes('blank');
                } catch {
                    return false;
                }
            })
            .slice(0, 20); // Max 20 images
    }

    /**
     * Check if URL looks like a product image
     */
    isProductImage(url) {
        const lowUrl = url.toLowerCase();
        // Skip common non-product images
        if (lowUrl.includes('logo') ||
            lowUrl.includes('icon') ||
            lowUrl.includes('sprite') ||
            lowUrl.includes('nav-') ||
            lowUrl.includes('button') ||
            lowUrl.includes('badge') ||
            lowUrl.includes('banner') ||
            lowUrl.includes('arrow') ||
            lowUrl.includes('checkbox') ||
            lowUrl.includes('_SS40') ||
            lowUrl.includes('_SS50') ||
            lowUrl.includes('transparent-pixel')) {
            return false;
        }
        // Must be an image
        return /\.(jpg|jpeg|png|webp|gif)/i.test(url);
    }

    /**
     * Extract images from JSON-LD data
     */
    extractFromJsonLd(data, images) {
        if (Array.isArray(data)) {
            data.forEach(item => this.extractFromJsonLd(item, images));
            return;
        }

        if (typeof data !== 'object' || !data) return;

        // Look for image properties
        ['image', 'images', 'photo', 'photos', 'thumbnail'].forEach(key => {
            if (data[key]) {
                if (typeof data[key] === 'string' && data[key].startsWith('http')) {
                    images.add(this.cleanImageUrl(data[key]));
                } else if (Array.isArray(data[key])) {
                    data[key].forEach(img => {
                        if (typeof img === 'string' && img.startsWith('http')) {
                            images.add(this.cleanImageUrl(img));
                        } else if (img?.url && img.url.startsWith('http')) {
                            images.add(this.cleanImageUrl(img.url));
                        }
                    });
                } else if (data[key]?.url && data[key].url.startsWith('http')) {
                    images.add(this.cleanImageUrl(data[key].url));
                }
            }
        });

        // Recurse into nested objects (but limit depth)
        Object.values(data).forEach(value => {
            if (typeof value === 'object') {
                this.extractFromJsonLd(value, images);
            }
        });
    }

    /**
     * Clean up image URL (remove tracking params, get higher res)
     */
    cleanImageUrl(url) {
        // Remove any trailing garbage from regex
        url = url.split('"')[0].split("'")[0].split(' ')[0];

        // Amazon: get largest version by removing size constraints
        if (url.includes('amazon') || url.includes('ssl-images-amazon')) {
            // Remove size indicators like ._AC_SX466_ or ._SL1500_
            url = url.replace(/\._[A-Z]{2}\d*_?[A-Z]*\d*_/, '.');
            url = url.replace(/\._[A-Z]+_\d+_/, '.');
        }

        // Shopify: get largest version
        if (url.includes('shopify') || url.includes('cdn.shopify')) {
            url = url.replace(/_\d+x\d*\./, '.');
        }

        return url;
    }

    /**
     * Load an image URL as a data URL using canvas (avoids CORS issues)
     */
    async loadAsDataUrl(imageUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    console.error('Canvas conversion failed:', e);
                    resolve(null);
                }
            };

            img.onerror = () => {
                // Try via proxy as fallback
                this.loadViaProxy(imageUrl).then(resolve);
            };

            // Try direct load first (works for many CDNs that allow cross-origin)
            img.src = imageUrl;
        });
    }

    /**
     * Load image via proxy as fallback
     */
    async loadViaProxy(imageUrl) {
        try {
            // Use corsproxy.io which handles binary content better
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`;
            const response = await fetch(proxyUrl);

            if (!response.ok) {
                return null;
            }

            const blob = await response.blob();

            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('Proxy load failed:', imageUrl, error);
            return null;
        }
    }
}
