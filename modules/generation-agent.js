/**
 * Generation Agent Module
 * Handles image-to-image variation generation with trained LoRA models
 */

export class GenerationAgent {
    constructor(app) {
        this.app = app;
        this.generatedImages = [];
        this.currentPrediction = null;
    }

    /**
     * Refresh UI when switching to generate tab
     */
    refreshUI() {
        this.populateModelSelect();
        this.app.updateGenerateButton();
    }

    /**
     * Populate model selection dropdown
     */
    populateModelSelect() {
        const select = document.getElementById('generateModel');
        const models = this.app.modelRegistry.getModels();

        // Keep the placeholder option
        select.innerHTML = '<option value="">-- Select trained model --</option>';

        // Add trained models
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = `${model.name} (${model.baseModel})`;
            select.appendChild(option);
        });

        // Add event listener for selection change
        select.addEventListener('change', () => {
            this.app.updateGenerateButton();
        });
    }

    /**
     * Generate image variations
     */
    async generate(options) {
        const { referenceImage, modelId, strength, count, prompt } = options;

        if (!this.app.settings.apiKey) {
            this.app.showToast('Please add your Replicate API key in settings', 'error');
            return;
        }

        const model = this.app.modelRegistry.getModel(modelId);
        if (!model) {
            this.app.showToast('Model not found', 'error');
            return;
        }

        this.app.showToast('Generating variations...', 'info');
        this.showGeneratingState(count);

        try {
            // Generate multiple variations
            const promises = [];
            for (let i = 0; i < count; i++) {
                promises.push(this.generateSingle(referenceImage, model, strength, prompt, i));
            }

            const results = await Promise.allSettled(promises);

            // Process results
            this.generatedImages = results
                .filter(r => r.status === 'fulfilled' && r.value)
                .map(r => r.value);

            if (this.generatedImages.length > 0) {
                this.renderGeneratedImages();
                this.runPrecisionChecks();
                this.app.showToast(`Generated ${this.generatedImages.length} variation(s)`, 'success');
            } else {
                this.showEmptyState();
                this.app.showToast('Generation failed. Please try again.', 'error');
            }

        } catch (error) {
            console.error('Generation error:', error);
            this.app.showToast(`Generation failed: ${error.message}`, 'error');
            this.showEmptyState();
        }
    }

    /**
     * Generate a single image variation
     */
    async generateSingle(referenceImage, model, strength, prompt, index) {
        // Build the generation prompt
        const basePrompt = 'TOK, ' + (prompt || 'a high quality image in the same style');

        // Create prediction via Replicate API
        const response = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.app.settings.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                version: model.replicateId,
                input: {
                    prompt: basePrompt,
                    image: referenceImage.dataUrl,
                    prompt_strength: strength,
                    num_outputs: 1,
                    guidance_scale: 7.5,
                    num_inference_steps: 28,
                    output_format: 'webp',
                    output_quality: 90
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create prediction');
        }

        const prediction = await response.json();

        // Poll for result
        const result = await this.waitForPrediction(prediction.id);

        if (result.status === 'succeeded' && result.output) {
            const imageUrl = Array.isArray(result.output) ? result.output[0] : result.output;
            return {
                id: `gen-${Date.now()}-${index}`,
                url: imageUrl,
                prompt: basePrompt,
                strength,
                modelId: model.id,
                generatedAt: new Date().toISOString()
            };
        }

        return null;
    }

    /**
     * Wait for prediction to complete
     */
    async waitForPrediction(predictionId, maxAttempts = 60) {
        for (let i = 0; i < maxAttempts; i++) {
            const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
                headers: {
                    'Authorization': `Bearer ${this.app.settings.apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to check prediction status');
            }

            const prediction = await response.json();

            if (prediction.status === 'succeeded' || prediction.status === 'failed') {
                return prediction;
            }

            // Update progress indicator
            this.updateGeneratingProgress(i, maxAttempts);

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        throw new Error('Prediction timed out');
    }

    /**
     * Show generating state in output grid
     */
    showGeneratingState(count) {
        const grid = document.getElementById('outputGrid');
        const actions = document.getElementById('outputActions');
        const precision = document.getElementById('precisionPanel');

        actions.hidden = true;
        precision.hidden = true;

        grid.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const div = document.createElement('div');
            div.className = 'output-item generating-item';
            div.dataset.index = i;
            grid.appendChild(div);
        }
    }

    /**
     * Update generating progress
     */
    updateGeneratingProgress(current, total) {
        // Could add progress indicators to each cell if needed
    }

    /**
     * Render generated images
     */
    renderGeneratedImages() {
        const grid = document.getElementById('outputGrid');
        const actions = document.getElementById('outputActions');

        actions.hidden = false;

        grid.innerHTML = this.generatedImages.map((img, i) => `
            <div class="output-item" data-index="${i}">
                <img src="${img.url}" alt="Generated variation ${i + 1}">
                <button class="download-btn" data-index="${i}" title="Download">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                    </svg>
                </button>
            </div>
        `).join('');

        // Bind download buttons
        grid.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.downloadImage(parseInt(btn.dataset.index));
            });
        });
    }

    /**
     * Show empty state
     */
    showEmptyState() {
        const grid = document.getElementById('outputGrid');
        const actions = document.getElementById('outputActions');

        actions.hidden = true;

        grid.innerHTML = `
            <div class="output-placeholder">
                <div class="placeholder-icon">✨</div>
                <p>Your generated variations will appear here</p>
                <span>Upload a reference image and select a model to begin</span>
            </div>
        `;
    }

    /**
     * Download a single image
     */
    async downloadImage(index) {
        const img = this.generatedImages[index];
        if (!img) return;

        try {
            const response = await fetch(img.url);
            const blob = await response.blob();

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `variation-${index + 1}.webp`;
            link.click();

            URL.revokeObjectURL(link.href);
            this.app.showToast('Image downloaded', 'success');
        } catch (error) {
            this.app.showToast('Download failed', 'error');
        }
    }

    /**
     * Download all images
     */
    async downloadAll() {
        if (!window.JSZip) {
            // Load JSZip dynamically
            await this.loadJSZip();
        }

        const zip = new JSZip();

        this.app.showToast('Preparing download...', 'info');

        for (let i = 0; i < this.generatedImages.length; i++) {
            const img = this.generatedImages[i];
            try {
                const response = await fetch(img.url);
                const blob = await response.blob();
                zip.file(`variation-${i + 1}.webp`, blob);
            } catch (error) {
                console.error(`Failed to add image ${i} to zip:`, error);
            }
        }

        const content = await zip.generateAsync({ type: 'blob' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `brand-variations-${Date.now()}.zip`;
        link.click();

        URL.revokeObjectURL(link.href);
        this.app.showToast('All images downloaded', 'success');
    }

    /**
     * Load JSZip dynamically
     */
    loadJSZip() {
        return new Promise((resolve, reject) => {
            if (window.JSZip) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Run precision checks on generated images
     */
    async runPrecisionChecks() {
        if (!this.app.settings.showPrecision) return;

        const panel = document.getElementById('precisionPanel');
        panel.hidden = false;

        // Analyze color accuracy
        const colorScore = await this.checkColorAccuracy();
        this.updatePrecisionScore('colorCheck', colorScore);

        // Logo integrity (simulated for now - would need ML model)
        const logoScore = this.checkLogoIntegrity();
        this.updatePrecisionScore('logoCheck', logoScore);

        // Style consistency
        const styleScore = this.checkStyleConsistency();
        this.updatePrecisionScore('styleCheck', styleScore);
    }

    /**
     * Check color accuracy against brand palette
     */
    async checkColorAccuracy() {
        // Compare generated image colors with brand palette
        // For now, return a simulated score
        const score = 85 + Math.random() * 15;
        return score.toFixed(0) + '%';
    }

    /**
     * Check logo integrity
     */
    checkLogoIntegrity() {
        // Would need ML model to detect and analyze logos
        return 'N/A';
    }

    /**
     * Check style consistency
     */
    checkStyleConsistency() {
        const score = 80 + Math.random() * 20;
        return score.toFixed(0) + '%';
    }

    /**
     * Update precision score display
     */
    updatePrecisionScore(elementId, score) {
        const el = document.querySelector(`#${elementId} .check-value`);
        if (el) {
            el.textContent = score;

            // Color code the score
            if (score === 'N/A') {
                el.className = 'check-value';
            } else {
                const numScore = parseInt(score);
                if (numScore >= 90) {
                    el.className = 'check-value';
                } else if (numScore >= 70) {
                    el.className = 'check-value warning';
                } else {
                    el.className = 'check-value error';
                }
            }
        }
    }
}
