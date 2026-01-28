/**
 * Offshoot - AI Image Variation Engine
 * Create styled image variations using custom-trained LoRA models
 */

import { AssetIngestion } from './modules/asset-ingestion.js';
import { TrainingEngine } from './modules/training-engine.js';
import { GenerationAgent } from './modules/generation-agent.js';
import { ColorPrecision } from './modules/color-precision.js';
import { ModelRegistry } from './modules/model-registry.js';

class BrandAIEngine {
    constructor() {
        this.assets = [];
        this.settings = this.loadSettings();

        // Initialize modules
        this.assetIngestion = new AssetIngestion(this);
        this.trainingEngine = new TrainingEngine(this);
        this.generationAgent = new GenerationAgent(this);
        this.colorPrecision = new ColorPrecision(this);
        this.modelRegistry = new ModelRegistry(this);

        this.init();
    }

    init() {
        this.bindNavigation();
        this.bindUploadEvents();
        this.bindTrainingEvents();
        this.bindGenerateEvents();
        this.bindSettingsEvents();
        this.updateModelBadge();
    }

    // ===============================
    // Settings Management
    // ===============================

    loadSettings() {
        const defaults = {
            geminiKey: '',
            apiKey: '',  // Replicate key (optional, for training)
            defaultVariations: 4,
            autoAnalyze: true,
            showPrecision: true
        };
        const saved = localStorage.getItem('offshoot-settings');
        return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    }

    saveSettings() {
        localStorage.setItem('offshoot-settings', JSON.stringify(this.settings));
    }

    // ===============================
    // Navigation
    // ===============================

    bindNavigation() {
        const tabs = document.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;
                this.switchTab(targetTab);
            });
        });
    }

    switchTab(tabName) {
        // Update nav tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}Tab`);
        });

        // Refresh data on tab switch
        if (tabName === 'train') {
            this.trainingEngine.refreshUI();
        } else if (tabName === 'generate') {
            this.generationAgent.refreshUI();
        }
    }

    // ===============================
    // Upload Tab Events
    // ===============================

    bindUploadEvents() {
        const uploadZone = document.getElementById('uploadZone');
        const fileInput = document.getElementById('fileInput');
        const urlInput = document.getElementById('urlInput');
        const fetchUrlBtn = document.getElementById('fetchUrlBtn');
        const clearAllBtn = document.getElementById('clearAllBtn');
        const startTrainingBtn = document.getElementById('startTrainingBtn');

        // Click to upload
        uploadZone.addEventListener('click', (e) => {
            if (e.target.closest('.url-input-wrap')) return;
            fileInput.click();
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
        });

        // Drag and drop
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            this.handleFileUpload(e.dataTransfer.files);
        });

        // URL fetch
        fetchUrlBtn.addEventListener('click', () => {
            const url = urlInput.value.trim();
            if (url) {
                this.assetIngestion.fetchFromUrl(url);
            }
        });

        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                fetchUrlBtn.click();
            }
        });

        // Clear all
        clearAllBtn.addEventListener('click', () => {
            this.clearAssets();
        });

        // Start training button
        startTrainingBtn.addEventListener('click', () => {
            this.switchTab('train');
        });
    }

    async handleFileUpload(files) {
        const newAssets = await this.assetIngestion.processFiles(files);
        this.assets.push(...newAssets);
        this.updatePreviewGrid();
        this.analyzeAssets();
    }

    updatePreviewGrid() {
        const previewSection = document.getElementById('previewSection');
        const previewGrid = document.getElementById('previewGrid');
        const assetCount = document.getElementById('assetCount');

        previewSection.classList.toggle('visible', this.assets.length > 0);
        assetCount.textContent = this.assets.length;

        previewGrid.innerHTML = this.assets.map((asset, index) => `
            <div class="preview-item" data-index="${index}">
                <img src="${asset.dataUrl}" alt="Asset ${index + 1}">
                <button class="remove-btn" data-index="${index}">×</button>
            </div>
        `).join('');

        // Bind remove buttons
        previewGrid.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeAsset(parseInt(btn.dataset.index));
            });
        });
    }

    removeAsset(index) {
        this.assets.splice(index, 1);
        this.updatePreviewGrid();
        this.analyzeAssets();
    }

    clearAssets() {
        this.assets = [];
        this.updatePreviewGrid();
        document.getElementById('analysisPanel').classList.remove('visible');
    }

    async analyzeAssets() {
        if (this.assets.length === 0) {
            document.getElementById('analysisPanel').classList.remove('visible');
            return;
        }

        const analysisPanel = document.getElementById('analysisPanel');
        const statusDot = analysisPanel.querySelector('.status-dot');
        const statusText = document.getElementById('analysisStatus');
        const startTrainingBtn = document.getElementById('startTrainingBtn');

        analysisPanel.classList.add('visible');
        statusDot.classList.add('analyzing');
        statusDot.classList.remove('complete');
        statusText.textContent = 'Analyzing...';

        // Extract colors from all assets
        const colors = await this.colorPrecision.extractPalette(this.assets);
        this.renderColorPalette(colors);

        // Generate style tags
        const styles = this.colorPrecision.inferStyles(this.assets);
        this.renderStyleTags(styles);

        // Update readiness
        const readiness = Math.min(this.assets.length / 5, 1) * 100;
        document.getElementById('readinessFill').style.width = `${readiness}%`;
        document.getElementById('readinessLabel').textContent =
            this.assets.length >= 5
                ? `${this.assets.length} images ready for training`
                : `${this.assets.length}/5 minimum images`;

        // Enable training button if enough images
        startTrainingBtn.disabled = this.assets.length < 5;

        statusDot.classList.remove('analyzing');
        statusDot.classList.add('complete');
        statusText.textContent = 'Analysis complete';
    }

    renderColorPalette(colors) {
        const palette = document.getElementById('colorPalette');
        palette.innerHTML = colors.slice(0, 6).map(color => `
            <div class="color-swatch" style="background: ${color}" data-hex="${color}" title="${color}"></div>
        `).join('');
    }

    renderStyleTags(styles) {
        const tags = document.getElementById('styleTags');
        tags.innerHTML = styles.map(style => `
            <span class="style-tag">${style}</span>
        `).join('');
    }

    // ===============================
    // Training Tab Events
    // ===============================

    bindTrainingEvents() {
        const stepsSlider = document.getElementById('trainingSteps');
        const stepsValue = document.getElementById('stepsValue');
        const rankSlider = document.getElementById('loraRank');
        const rankValue = document.getElementById('rankValue');
        const launchBtn = document.getElementById('launchTrainingBtn');

        // Slider updates
        stepsSlider.addEventListener('input', () => {
            stepsValue.textContent = stepsSlider.value;
        });

        rankSlider.addEventListener('input', () => {
            rankValue.textContent = rankSlider.value;
        });

        // Launch training
        launchBtn.addEventListener('click', () => {
            this.launchTraining();
        });

        // Enable button if assets available
        this.updateLaunchButton();
    }

    updateLaunchButton() {
        const launchBtn = document.getElementById('launchTrainingBtn');
        launchBtn.disabled = this.assets.length < 5 || !this.settings.apiKey;

        if (!this.settings.apiKey) {
            launchBtn.innerHTML = '<span>API Key Required</span>';
        } else if (this.assets.length < 5) {
            launchBtn.innerHTML = '<span>Need 5+ Images</span>';
        } else {
            launchBtn.innerHTML = '<span>Launch Training</span>';
        }
    }

    async launchTraining() {
        const config = {
            name: document.getElementById('modelName').value || `brand-model-${Date.now()}`,
            baseModel: document.getElementById('baseModel').value,
            steps: parseInt(document.getElementById('trainingSteps').value),
            loraRank: parseInt(document.getElementById('loraRank').value),
            learningRate: document.getElementById('learningRate').value
        };

        await this.trainingEngine.startTraining(this.assets, config);
    }

    // ===============================
    // Generate Tab Events
    // ===============================

    bindGenerateEvents() {
        const referenceUpload = document.getElementById('referenceUpload');
        const referenceInput = document.getElementById('referenceInput');
        const strengthSlider = document.getElementById('variationStrength');
        const strengthValue = document.getElementById('strengthValue');
        const countBtns = document.querySelectorAll('.count-btn');
        const generateBtn = document.getElementById('generateBtn');
        const downloadAllBtn = document.getElementById('downloadAllBtn');

        // Reference image upload
        referenceUpload.addEventListener('click', () => {
            referenceInput.click();
        });

        referenceInput.addEventListener('change', (e) => {
            this.handleReferenceUpload(e.target.files[0]);
        });

        // Drag and drop for reference
        referenceUpload.addEventListener('dragover', (e) => {
            e.preventDefault();
            referenceUpload.style.borderColor = 'var(--accent-primary)';
        });

        referenceUpload.addEventListener('dragleave', () => {
            referenceUpload.style.borderColor = '';
        });

        referenceUpload.addEventListener('drop', (e) => {
            e.preventDefault();
            referenceUpload.style.borderColor = '';
            if (e.dataTransfer.files[0]) {
                this.handleReferenceUpload(e.dataTransfer.files[0]);
            }
        });

        // Strength slider
        strengthSlider.addEventListener('input', () => {
            strengthValue.textContent = `${strengthSlider.value}%`;
        });

        // Variation count
        countBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const countEl = document.getElementById('variationCount');
                let count = parseInt(countEl.textContent);
                count += parseInt(btn.dataset.delta);
                count = Math.max(1, Math.min(8, count));
                countEl.textContent = count;
            });
        });

        // Generate button
        generateBtn.addEventListener('click', () => {
            this.generateVariations();
        });

        // Download all
        downloadAllBtn.addEventListener('click', () => {
            this.generationAgent.downloadAll();
        });
    }

    async handleReferenceUpload(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('referencePreview');
            const placeholder = document.querySelector('.reference-placeholder');

            preview.src = e.target.result;
            preview.hidden = false;
            placeholder.hidden = true;

            this.referenceImage = {
                file,
                dataUrl: e.target.result
            };

            this.updateGenerateButton();
        };
        reader.readAsDataURL(file);
    }

    updateGenerateButton() {
        const generateBtn = document.getElementById('generateBtn');
        const modelSelect = document.getElementById('generateModel');
        const hasModel = modelSelect.value !== '';
        const hasReference = !!this.referenceImage;
        const hasGeminiKey = !!this.settings.geminiKey;

        generateBtn.disabled = !hasReference || !hasGeminiKey;

        if (!hasGeminiKey) {
            generateBtn.innerHTML = '<span>Gemini API Key Required</span>';
        } else if (!hasReference) {
            generateBtn.innerHTML = '<span>Add Reference Image</span>';
        } else {
            generateBtn.innerHTML = `
                <span>Generate Offshoots</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
            `;
        }
    }

    async generateVariations() {
        const modelId = document.getElementById('generateModel').value;
        const strength = parseInt(document.getElementById('variationStrength').value) / 100;
        const count = parseInt(document.getElementById('variationCount').textContent);
        const prompt = document.getElementById('stylePrompt').value;

        await this.generationAgent.generate({
            referenceImage: this.referenceImage,
            modelId,
            strength,
            count,
            prompt
        });
    }

    // ===============================
    // Settings Events
    // ===============================

    bindSettingsEvents() {
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsModal = document.getElementById('settingsModal');
        const closeBtn = document.getElementById('closeSettings');
        const saveBtn = document.getElementById('saveSettings');

        settingsBtn.addEventListener('click', () => {
            this.openSettings();
        });

        closeBtn.addEventListener('click', () => {
            settingsModal.classList.remove('visible');
        });

        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('visible');
            }
        });

        saveBtn.addEventListener('click', () => {
            this.saveSettingsFromForm();
            settingsModal.classList.remove('visible');
            this.showToast('Settings saved', 'success');
        });
    }

    openSettings() {
        const modal = document.getElementById('settingsModal');

        // Populate form
        document.getElementById('geminiKeyInput').value = this.settings.geminiKey;
        document.getElementById('apiKeyInput').value = this.settings.apiKey;
        document.getElementById('defaultVariations').value = this.settings.defaultVariations;
        document.getElementById('autoAnalyze').checked = this.settings.autoAnalyze;
        document.getElementById('showPrecision').checked = this.settings.showPrecision;

        modal.classList.add('visible');
    }

    saveSettingsFromForm() {
        this.settings.geminiKey = document.getElementById('geminiKeyInput').value.trim();
        this.settings.apiKey = document.getElementById('apiKeyInput').value.trim();
        this.settings.defaultVariations = parseInt(document.getElementById('defaultVariations').value);
        this.settings.autoAnalyze = document.getElementById('autoAnalyze').checked;
        this.settings.showPrecision = document.getElementById('showPrecision').checked;

        this.saveSettings();
        this.updateLaunchButton();
        this.updateGenerateButton();
    }

    // ===============================
    // Model Badge
    // ===============================

    updateModelBadge() {
        const badge = document.getElementById('modelBadge');
        const models = this.modelRegistry.getModels();

        if (models.length > 0) {
            badge.classList.add('has-models');
            badge.querySelector('span:last-child').textContent = `${models.length} Model${models.length > 1 ? 's' : ''}`;
        } else {
            badge.classList.remove('has-models');
            badge.querySelector('span:last-child').textContent = 'No Models';
        }
    }

    // ===============================
    // Toast Notifications
    // ===============================

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BrandAIEngine();
});
