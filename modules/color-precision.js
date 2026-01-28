/**
 * Color Precision Module
 * Extracts and validates brand colors from images
 */

export class ColorPrecision {
    constructor(app) {
        this.app = app;
        this.brandColors = [];
    }

    /**
     * Extract color palette from uploaded assets
     */
    async extractPalette(assets) {
        const allColors = [];

        for (const asset of assets) {
            try {
                const colors = await this.extractColorsFromImage(asset.dataUrl);
                allColors.push(...colors);
            } catch (error) {
                console.error('Color extraction failed for asset:', error);
            }
        }

        // Cluster similar colors and get dominant ones
        const dominantColors = this.clusterColors(allColors);
        this.brandColors = dominantColors;

        return dominantColors;
    }

    /**
     * Extract dominant colors from a single image
     */
    extractColorsFromImage(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Scale down for faster processing
                const scale = Math.min(1, 100 / Math.max(img.width, img.height));
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const colors = this.analyzePixels(imageData.data);

                resolve(colors);
            };

            img.onerror = () => resolve([]);
            img.src = dataUrl;
        });
    }

    /**
     * Analyze pixel data to extract colors
     */
    analyzePixels(pixels) {
        const colorCounts = {};
        const step = 4; // Sample every 4th pixel for speed

        for (let i = 0; i < pixels.length; i += 4 * step) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const a = pixels[i + 3];

            // Skip transparent pixels
            if (a < 128) continue;

            // Quantize colors to reduce noise
            const qr = Math.round(r / 32) * 32;
            const qg = Math.round(g / 32) * 32;
            const qb = Math.round(b / 32) * 32;

            const hex = this.rgbToHex(qr, qg, qb);
            colorCounts[hex] = (colorCounts[hex] || 0) + 1;
        }

        // Sort by frequency and return top colors
        return Object.entries(colorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([color]) => color);
    }

    /**
     * Cluster similar colors together
     */
    clusterColors(colors) {
        if (colors.length === 0) return [];

        // Count occurrences
        const counts = {};
        colors.forEach(color => {
            counts[color] = (counts[color] || 0) + 1;
        });

        // Sort by frequency
        const sorted = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([color]) => color);

        // Filter out similar colors
        const result = [];
        const threshold = 50; // Color distance threshold

        for (const color of sorted) {
            if (result.length >= 8) break;

            const rgb = this.hexToRgb(color);
            if (!rgb) continue;

            // Check if similar color already exists
            const hasSimilar = result.some(existing => {
                const existingRgb = this.hexToRgb(existing);
                if (!existingRgb) return false;
                return this.colorDistance(rgb, existingRgb) < threshold;
            });

            if (!hasSimilar) {
                // Skip very dark or very light colors
                const brightness = (rgb.r + rgb.g + rgb.b) / 3;
                if (brightness > 20 && brightness < 235) {
                    result.push(color);
                }
            }
        }

        return result;
    }

    /**
     * Calculate distance between two colors
     */
    colorDistance(c1, c2) {
        return Math.sqrt(
            Math.pow(c1.r - c2.r, 2) +
            Math.pow(c1.g - c2.g, 2) +
            Math.pow(c1.b - c2.b, 2)
        );
    }

    /**
     * Convert RGB to hex
     */
    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = Math.min(255, Math.max(0, x)).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    /**
     * Convert hex to RGB
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    /**
     * Infer style tags from assets
     */
    inferStyles(assets) {
        const styles = [];

        // Analyze aspect ratios
        const aspectRatios = assets.map(a => a.width / a.height);
        const avgRatio = aspectRatios.reduce((a, b) => a + b, 0) / aspectRatios.length;

        if (avgRatio > 1.5) {
            styles.push('Landscape');
        } else if (avgRatio < 0.7) {
            styles.push('Portrait');
        } else {
            styles.push('Square');
        }

        // Check for color dominance
        if (this.brandColors.length > 0) {
            const primaryColor = this.brandColors[0];
            const rgb = this.hexToRgb(primaryColor);

            if (rgb) {
                if (rgb.r > rgb.g && rgb.r > rgb.b) {
                    styles.push('Warm Tones');
                } else if (rgb.b > rgb.r && rgb.b > rgb.g) {
                    styles.push('Cool Tones');
                } else if (rgb.g > rgb.r && rgb.g > rgb.b) {
                    styles.push('Natural');
                }

                const brightness = (rgb.r + rgb.g + rgb.b) / 3;
                if (brightness < 80) {
                    styles.push('Dark');
                } else if (brightness > 180) {
                    styles.push('Light');
                } else {
                    styles.push('Balanced');
                }
            }
        }

        // Add generic style indicators
        if (assets.length > 10) {
            styles.push('Diverse');
        }

        styles.push('Professional');

        return styles.slice(0, 5);
    }

    /**
     * Validate colors in generated image against brand palette
     */
    async validateColors(imageUrl) {
        try {
            const imageColors = await this.extractColorsFromImage(imageUrl);

            if (this.brandColors.length === 0 || imageColors.length === 0) {
                return { score: 0, matches: [] };
            }

            // Check how many brand colors are present
            let matchCount = 0;
            const matches = [];

            for (const brandColor of this.brandColors) {
                const brandRgb = this.hexToRgb(brandColor);
                if (!brandRgb) continue;

                for (const imageColor of imageColors) {
                    const imageRgb = this.hexToRgb(imageColor);
                    if (!imageRgb) continue;

                    if (this.colorDistance(brandRgb, imageRgb) < 60) {
                        matchCount++;
                        matches.push({ brand: brandColor, image: imageColor });
                        break;
                    }
                }
            }

            const score = (matchCount / this.brandColors.length) * 100;

            return { score, matches };
        } catch (error) {
            console.error('Color validation failed:', error);
            return { score: 0, matches: [] };
        }
    }

    /**
     * Get brand color palette
     */
    getStyleColors() {
        return this.brandColors;
    }

    /**
     * Find closest brand color
     */
    findClosestStyleColor(hex) {
        if (this.brandColors.length === 0) return null;

        const rgb = this.hexToRgb(hex);
        if (!rgb) return null;

        let closest = null;
        let minDistance = Infinity;

        for (const brandColor of this.brandColors) {
            const brandRgb = this.hexToRgb(brandColor);
            if (!brandRgb) continue;

            const distance = this.colorDistance(rgb, brandRgb);
            if (distance < minDistance) {
                minDistance = distance;
                closest = brandColor;
            }
        }

        return closest;
    }
}
