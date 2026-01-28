/**
 * Product Page Scraper Module
 * Extracts product images from e-commerce URLs
 */

export class ProductScraper {
    constructor(app) {
        this.app = app;
        // Free public CORS proxy
        this.proxyUrl = 'https://api.allorigins.win/get?url=';
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
     * Fetch page HTML through CORS proxy
     */
    async fetchPage(url) {
        const proxyUrl = `${this.proxyUrl}${encodeURIComponent(url)}`;

        const response = await fetch(proxyUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch page');
        }

        const data = await response.json();
        return data.contents;
    }

    /**
     * Parse images from HTML
     */
    parseImages(html, baseUrl) {
        const images = new Set();
        const baseUrlObj = new URL(baseUrl);

        // Strategy 1: Open Graph image
        const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/gi);
        if (ogMatch) {
            ogMatch.forEach(match => {
                const urlMatch = match.match(/content=["']([^"']+)["']/i);
                if (urlMatch) images.add(this.normalizeUrl(urlMatch[1], baseUrlObj));
            });
        }

        // Strategy 2: High-res image patterns (common in e-commerce)
        const patterns = [
            // Amazon high-res
            /https?:\/\/[^"'\s]*images-amazon[^"'\s]*\._[A-Z]{2}\d+_[^"'\s]*\.(?:jpg|jpeg|png|webp)/gi,
            // Shopify CDN
            /https?:\/\/cdn\.shopify\.com\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi,
            // General product image patterns
            /https?:\/\/[^"'\s]*(?:product|item|goods|media|image)[^"'\s]*\.(?:jpg|jpeg|png|webp)/gi,
            // Large image indicators
            /https?:\/\/[^"'\s]*(?:large|big|hi-res|zoom|full)[^"'\s]*\.(?:jpg|jpeg|png|webp)/gi,
        ];

        patterns.forEach(pattern => {
            const matches = html.match(pattern);
            if (matches) {
                matches.forEach(url => {
                    // Skip tiny images (thumbnails, icons)
                    if (!url.includes('thumb') && !url.includes('icon') && !url.includes('_SS40')) {
                        images.add(this.cleanImageUrl(url));
                    }
                });
            }
        });

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

        // Strategy 4: Data attributes (lazy-loaded images)
        const dataImgMatches = html.match(/data-(?:src|zoom|large|full|original)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi);
        if (dataImgMatches) {
            dataImgMatches.forEach(match => {
                const urlMatch = match.match(/=["']([^"']+)["']/);
                if (urlMatch) {
                    images.add(this.normalizeUrl(urlMatch[1], baseUrlObj));
                }
            });
        }

        // Strategy 5: Standard img tags with good src
        const imgMatches = html.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["'][^>]*>/gi);
        if (imgMatches) {
            imgMatches.forEach(match => {
                const srcMatch = match.match(/src=["']([^"']+)["']/);
                if (srcMatch) {
                    const url = srcMatch[1];
                    // Filter for likely product images (not icons, logos, etc.)
                    if (url.length > 50 && !url.includes('logo') && !url.includes('icon') && !url.includes('sprite')) {
                        images.add(this.normalizeUrl(url, baseUrlObj));
                    }
                }
            });
        }

        // Convert to array and filter
        return Array.from(images)
            .filter(url => url && url.startsWith('http'))
            .slice(0, 20); // Max 20 images
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
                if (typeof data[key] === 'string') {
                    images.add(data[key]);
                } else if (Array.isArray(data[key])) {
                    data[key].forEach(img => {
                        if (typeof img === 'string') images.add(img);
                        else if (img?.url) images.add(img.url);
                    });
                } else if (data[key]?.url) {
                    images.add(data[key].url);
                }
            }
        });

        // Recurse into nested objects
        Object.values(data).forEach(value => {
            if (typeof value === 'object') {
                this.extractFromJsonLd(value, images);
            }
        });
    }

    /**
     * Normalize relative URLs to absolute
     */
    normalizeUrl(url, baseUrlObj) {
        if (url.startsWith('//')) {
            return `https:${url}`;
        }
        if (url.startsWith('/')) {
            return `${baseUrlObj.origin}${url}`;
        }
        if (!url.startsWith('http')) {
            return `${baseUrlObj.origin}/${url}`;
        }
        return url;
    }

    /**
     * Clean up image URL (remove tracking params, get higher res)
     */
    cleanImageUrl(url) {
        // Amazon: get largest version
        if (url.includes('amazon')) {
            return url.replace(/\._[A-Z]{2}\d+_/, '.');
        }
        // Shopify: get largest version
        if (url.includes('shopify')) {
            return url.replace(/_\d+x\d*\./, '.');
        }
        return url;
    }

    /**
     * Load an image URL as a data URL
     */
    async loadAsDataUrl(imageUrl) {
        try {
            // Use proxy for CORS
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`;
            const response = await fetch(proxyUrl);
            const blob = await response.blob();

            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('Failed to load image:', imageUrl, error);
            return null;
        }
    }
}
