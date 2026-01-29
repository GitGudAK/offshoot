/**
 * Training Engine Module
 * Handles LoRA model training via Replicate API
 */

export class TrainingEngine {
    constructor(app) {
        this.app = app;
        this.currentTraining = null;
        this.pollingInterval = null;
    }

    /**
     * Refresh UI when switching to training tab
     */
    refreshUI() {
        this.app.updateLaunchButton();
        this.renderModelList();
    }

    /**
     * Start LoRA training with assets
     */
    async startTraining(assets, config) {
        if (!this.app.settings.replicateApiKey) {
            this.app.showToast('Please add your Replicate API key in settings', 'error');
            return;
        }

        if (assets.length < 5) {
            this.app.showToast('Need at least 5 images for training', 'error');
            return;
        }

        this.app.showToast('Preparing training data...', 'info');

        try {
            // Create a ZIP file with training images
            const zipBlob = await this.createTrainingZip(assets);

            // Upload ZIP to a temporary hosting service
            const zipUrl = await this.uploadZip(zipBlob);

            // Start training via Replicate API
            const response = await this.createTraining(zipUrl, config);

            this.currentTraining = {
                id: response.id,
                config,
                startTime: Date.now(),
                status: 'starting'
            };

            this.showTrainingProgress();
            this.startPolling(response.id);

            this.app.showToast('Training started!', 'success');

        } catch (error) {
            console.error('Training failed:', error);
            this.app.showToast(`Training failed: ${error.message}`, 'error');
        }
    }

    /**
     * Create a ZIP file from training images
     */
    async createTrainingZip(assets) {
        // Use JSZip library (loaded dynamically)
        if (!window.JSZip) {
            // Load JSZip dynamically
            await this.loadJSZip();
        }

        const zip = new JSZip();

        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i];
            if (!asset.dataUrl) {
                console.warn(`Asset ${i} missing dataUrl, skipping`);
                continue;
            }
            const base64Data = asset.dataUrl.split(',')[1] || '';
            const extension = (asset.type || 'image/jpg').split('/')[1] || 'jpg';

            // Add image to zip with caption file
            zip.file(`${i}.${extension}`, base64Data, { base64: true });
            zip.file(`${i}.txt`, 'TOK, a photo in the style of TOK');
        }

        return await zip.generateAsync({ type: 'blob' });
    }

    /**
     * Load JSZip library dynamically
     */
    loadJSZip() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Upload ZIP file to file.io (temporary hosting)
     */
    async uploadZip(blob) {
        const formData = new FormData();
        formData.append('file', blob, 'training_images.zip');

        const response = await fetch('https://file.io', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to upload training data');
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error('File upload failed');
        }

        return result.link;
    }

    /**
     * Create training job via Replicate API
     */
    async createTraining(zipUrl, config) {
        // Use the flux-dev-lora-trainer model
        const modelMap = {
            'flux-dev': 'ostris/flux-dev-lora-trainer',
            'flux-schnell': 'ostris/flux-dev-lora-trainer', // Same trainer
            'sdxl': 'ostris/flux-dev-lora-trainer' // For now, use flux trainer
        };

        const trainingModel = modelMap[config.baseModel] || 'ostris/flux-dev-lora-trainer';

        const response = await fetch('https://api.replicate.com/v1/trainings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.app.settings.replicateApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                destination: `${(this.app.settings.replicateApiKey || '').split('_')[0] || 'user'}/${config.name}`,
                input: {
                    input_images: zipUrl,
                    trigger_word: 'TOK',
                    steps: config.steps,
                    lora_rank: config.loraRank,
                    learning_rate: parseFloat(config.learningRate),
                    batch_size: 1,
                    resolution: '512,768,1024',
                    autocaption: true,
                    autocaption_prefix: 'a photo of TOK, '
                },
                model: trainingModel,
                version: 'latest'
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to start training');
        }

        return await response.json();
    }

    /**
     * Show training progress UI
     */
    showTrainingProgress() {
        const display = document.getElementById('progressDisplay');

        display.innerHTML = `
            <div class="training-active">
                <div class="training-spinner"></div>
                <h3>Training in Progress</h3>
                <p>${this.currentTraining.config.name}</p>
                <div class="training-progress-bar">
                    <div class="training-progress-fill" id="trainingFill" style="width: 0%"></div>
                </div>
                <div class="training-stats">
                    <div>Step: <span id="currentStep">0</span> / <span id="totalSteps">${this.currentTraining.config.steps}</span></div>
                    <div>Status: <span id="trainingStatus">Starting...</span></div>
                </div>
            </div>
        `;
    }

    /**
     * Start polling for training status
     */
    startPolling(trainingId) {
        this.pollingInterval = setInterval(async () => {
            try {
                const status = await this.checkTrainingStatus(trainingId);
                this.updateTrainingProgress(status);

                if (status.status === 'succeeded') {
                    this.onTrainingComplete(status);
                } else if (status.status === 'failed' || status.status === 'canceled') {
                    this.onTrainingFailed(status);
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 5000); // Poll every 5 seconds
    }

    /**
     * Check training status via Replicate API
     */
    async checkTrainingStatus(trainingId) {
        const response = await fetch(`https://api.replicate.com/v1/trainings/${trainingId}`, {
            headers: {
                'Authorization': `Bearer ${this.app.settings.replicateApiKey}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to check training status');
        }

        return await response.json();
    }

    /**
     * Update training progress UI
     */
    updateTrainingProgress(status) {
        const fillEl = document.getElementById('trainingFill');
        const stepEl = document.getElementById('currentStep');
        const statusEl = document.getElementById('trainingStatus');

        if (!fillEl) return;

        // Parse logs for step progress
        const logs = status.logs || '';
        const stepMatch = logs.match(/step (\d+)/i);
        const currentStep = stepMatch ? parseInt(stepMatch[1]) : 0;
        const totalSteps = this.currentTraining.config.steps;

        const progress = (currentStep / totalSteps) * 100;
        fillEl.style.width = `${progress}%`;
        stepEl.textContent = currentStep;

        // Update status
        const statusMap = {
            'starting': 'Initializing...',
            'processing': 'Training model...',
            'succeeded': 'Complete!',
            'failed': 'Failed',
            'canceled': 'Canceled'
        };
        statusEl.textContent = statusMap[status.status] || status.status;
    }

    /**
     * Handle training completion
     */
    onTrainingComplete(status) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;

        // Save model to registry
        const model = {
            id: `model-${Date.now()}`,
            name: this.currentTraining.config.name,
            replicateId: status.output?.version || status.model,
            baseModel: this.currentTraining.config.baseModel,
            trainedAt: new Date().toISOString(),
            steps: this.currentTraining.config.steps,
            loraRank: this.currentTraining.config.loraRank,
            imageCount: this.app.assets.length
        };

        this.app.modelRegistry.addModel(model);
        this.app.updateModelBadge();
        this.renderModelList();

        this.app.showToast('Training complete! Model saved.', 'success');

        // Reset progress display
        setTimeout(() => {
            this.showIdleState();
        }, 3000);
    }

    /**
     * Handle training failure
     */
    onTrainingFailed(status) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;

        this.app.showToast(`Training failed: ${status.error || 'Unknown error'}`, 'error');

        setTimeout(() => {
            this.showIdleState();
        }, 3000);
    }

    /**
     * Show idle state
     */
    showIdleState() {
        const display = document.getElementById('progressDisplay');
        display.innerHTML = `
            <div class="progress-idle">
                <div class="idle-icon">🧠</div>
                <p>No active training job</p>
                <span>Configure and launch training to begin</span>
            </div>
        `;
    }

    /**
     * Render model list
     */
    renderModelList() {
        const list = document.getElementById('modelList');
        const models = this.app.modelRegistry.getModels();

        if (models.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <p>No trained models yet</p>
                    <span>Your trained models will appear here</span>
                </div>
            `;
            return;
        }

        list.innerHTML = models.map(model => `
            <div class="model-card" data-id="${model.id}">
                <div class="model-card-header">
                    <div class="model-icon">🧠</div>
                    <h3>${model.name}</h3>
                </div>
                <div class="model-card-meta">
                    <span>${model.baseModel}</span>
                    <span>${model.steps} steps</span>
                    <span>${model.imageCount} images</span>
                    <span>${new Date(model.trainedAt).toLocaleDateString()}</span>
                </div>
            </div>
        `).join('');
    }
}
