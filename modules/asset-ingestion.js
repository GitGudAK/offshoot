/**
 * Asset Ingestion Module
 * Handles file uploads and URL scraping for brand assets
 */

export class AssetIngestion {
    constructor(app) {
        this.app = app;
    }

    /**
     * Process uploaded files
     */
    async processFiles(files) {
        const assets = [];
        const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/jpg'];

        for (const file of Array.from(files)) {
            if (!validTypes.includes(file.type)) {
                this.app.showToast(`Skipped ${file.name}: unsupported format`, 'warning');
                continue;
            }

            try {
                const asset = await this.processFile(file);
                assets.push(asset);
            } catch (error) {
                this.app.showToast(`Failed to process ${file.name}`, 'error');
                console.error(error);
            }
        }

        if (assets.length > 0) {
            this.app.showToast(`Added ${assets.length} asset(s)`, 'success');
        }

        return assets;
    }

    /**
     * Process a single file into an asset object
     */
    async processFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                const dataUrl = e.target.result;

                // Get image dimensions
                const dimensions = await this.getImageDimensions(dataUrl);

                resolve({
                    id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    dataUrl,
                    width: dimensions.width,
                    height: dimensions.height,
                    file // Keep original file for training
                });
            };

            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Get image dimensions from data URL
     */
    getImageDimensions(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.width, height: img.height });
            };
            img.onerror = () => {
                resolve({ width: 0, height: 0 });
            };
            img.src = dataUrl;
        });
    }

    /**
     * Fetch images from a URL
     * Uses a proxy to handle CORS and scrape images from web pages
     */
    async fetchFromUrl(url) {
        this.app.showToast('Fetching images from URL...', 'info');

        try {
            // Validate URL
            const urlObj = new URL(url);

            // Try direct image URL first
            if (this.isImageUrl(url)) {
                const asset = await this.fetchSingleImage(url);
                if (asset) {
                    this.app.assets.push(asset);
                    this.app.updatePreviewGrid();
                    this.app.analyzeAssets();
                    this.app.showToast('Image added successfully', 'success');
                }
                return;
            }

            // For web pages, we'd need a backend proxy to scrape images
            // For now, inform the user
            this.app.showToast('Please provide a direct image URL (ending in .jpg, .png, .webp)', 'warning');

        } catch (error) {
            this.app.showToast('Invalid URL format', 'error');
            console.error(error);
        }
    }

    /**
     * Check if URL is a direct image link
     */
    isImageUrl(url) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const lowerUrl = url.toLowerCase();
        return imageExtensions.some(ext => lowerUrl.includes(ext));
    }

    /**
     * Fetch a single image from URL
     */
    async fetchSingleImage(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch image');

            const blob = await response.blob();
            const file = new File([blob], this.extractFilename(url), { type: blob.type });

            return await this.processFile(file);
        } catch (error) {
            // Try with a CORS proxy
            try {
                const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error('Proxy fetch failed');

                const blob = await response.blob();
                const file = new File([blob], this.extractFilename(url), { type: blob.type });

                return await this.processFile(file);
            } catch (proxyError) {
                this.app.showToast('Could not fetch image. Try downloading and uploading manually.', 'error');
                console.error(proxyError);
                return null;
            }
        }
    }

    /**
     * Extract filename from URL
     */
    extractFilename(url) {
        try {
            const pathname = new URL(url).pathname;
            const filename = pathname.split('/').pop() || 'image';
            return filename.includes('.') ? filename : `${filename}.jpg`;
        } catch {
            return `image-${Date.now()}.jpg`;
        }
    }

    /**
     * Convert assets to ZIP for training upload
     */
    async prepareTrainingZip(assets) {
        // We'll send files individually to Replicate
        // This method creates the proper format for their API
        const trainingData = [];

        for (const asset of assets) {
            // Create a caption/trigger word for each image
            const caption = 'TOK'; // Trigger token for LoRA

            trainingData.push({
                image: asset.dataUrl,
                caption
            });
        }

        return trainingData;
    }
}
