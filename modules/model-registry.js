/**
 * Model Registry Module
 * Manages trained LoRA models with local storage persistence
 */

export class ModelRegistry {
    constructor(app) {
        this.app = app;
        this.storageKey = 'offshoot-models';
        this.models = this.loadModels();
    }

    /**
     * Load models from local storage
     */
    loadModels() {
        const saved = localStorage.getItem(this.storageKey);
        return saved ? JSON.parse(saved) : [];
    }

    /**
     * Save models to local storage
     */
    saveModels() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.models));
    }

    /**
     * Add a new trained model
     */
    addModel(model) {
        // Ensure required fields
        const newModel = {
            id: model.id || `model-${Date.now()}`,
            name: model.name || 'Untitled Model',
            replicateId: model.replicateId,
            baseModel: model.baseModel || 'flux-dev',
            trainedAt: model.trainedAt || new Date().toISOString(),
            steps: model.steps || 500,
            loraRank: model.loraRank || 16,
            imageCount: model.imageCount || 0,
            metadata: model.metadata || {}
        };

        // Check for duplicate names
        const existingIndex = this.models.findIndex(m => m.name === newModel.name);
        if (existingIndex >= 0) {
            // Update existing model
            this.models[existingIndex] = newModel;
        } else {
            this.models.push(newModel);
        }

        this.saveModels();
        return newModel;
    }

    /**
     * Get all models
     */
    getModels() {
        return this.models;
    }

    /**
     * Get a model by ID
     */
    getModel(id) {
        return this.models.find(m => m.id === id);
    }

    /**
     * Get a model by name
     */
    getModelByName(name) {
        return this.models.find(m => m.name === name);
    }

    /**
     * Update a model
     */
    updateModel(id, updates) {
        const index = this.models.findIndex(m => m.id === id);
        if (index >= 0) {
            this.models[index] = { ...this.models[index], ...updates };
            this.saveModels();
            return this.models[index];
        }
        return null;
    }

    /**
     * Delete a model
     */
    deleteModel(id) {
        const index = this.models.findIndex(m => m.id === id);
        if (index >= 0) {
            const deleted = this.models.splice(index, 1)[0];
            this.saveModels();
            this.app.updateModelBadge();
            return deleted;
        }
        return null;
    }

    /**
     * Clear all models
     */
    clearModels() {
        this.models = [];
        this.saveModels();
        this.app.updateModelBadge();
    }

    /**
     * Export models to JSON
     */
    exportModels() {
        return JSON.stringify(this.models, null, 2);
    }

    /**
     * Import models from JSON
     */
    importModels(json) {
        try {
            const imported = JSON.parse(json);
            if (Array.isArray(imported)) {
                imported.forEach(model => this.addModel(model));
                return imported.length;
            }
            return 0;
        } catch (error) {
            console.error('Import failed:', error);
            return 0;
        }
    }

    /**
     * Get most recent model
     */
    getLatestModel() {
        if (this.models.length === 0) return null;

        return this.models.reduce((latest, model) => {
            const latestDate = new Date(latest.trainedAt);
            const modelDate = new Date(model.trainedAt);
            return modelDate > latestDate ? model : latest;
        });
    }

    /**
     * Get models count
     */
    getCount() {
        return this.models.length;
    }

    /**
     * Check if a model exists by Replicate ID
     */
    hasReplicateModel(replicateId) {
        return this.models.some(m => m.replicateId === replicateId);
    }
}
