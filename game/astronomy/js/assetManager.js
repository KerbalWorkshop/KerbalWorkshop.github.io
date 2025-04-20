// js/assetManager.js
class AssetManager {
    constructor() {
        this.images = {};
        this.sounds = {}; // Placeholder for future audio
        this.assetsToLoad = 0;
        this.assetsLoaded = 0;
        this.onAllAssetsLoaded = null; // Callback function
    }

    loadImage(key, src) {
        this.assetsToLoad++;
        const img = new Image();
        img.src = src;
        img.onload = () => this._assetLoaded();
        img.onerror = () => {
            console.error(`Failed to load image: ${key} at ${src}`);
            this._assetLoaded(); // Still count it as 'loaded' to not block indefinitely
        };
        this.images[key] = img;
    }

    // Placeholder for future sound loading
    // loadSound(key, src) { ... }

    _assetLoaded() {
        this.assetsLoaded++;
        console.log(`Assets loaded: <span class="math-inline">\{this\.assetsLoaded\}/</span>{this.assetsToLoad}`);
        if (this.assetsLoaded === this.assetsToLoad) {
            console.log("All assets loaded.");
            if (this.onAllAssetsLoaded) {
                this.onAllAssetsLoaded();
            }
        }
    }

    getImage(key) {
        return this.images[key] || null;
    }

    // getSound(key) { ... }

    loadInitialAssets(callback) {
        this.onAllAssetsLoaded = callback;
        console.log("Loading initial assets...");
        this.loadImage('background', 'assets/images/background_backyard.png');
        this.loadImage('telescopeBasic', 'assets/images/telescope_basic.png');
        this.loadImage('moon', 'assets/images/moon.png');
        this.loadImage('jupiter', 'assets/images/jupiter.png');
        this.loadImage('mars', 'assets/images/mars.png');
        this.loadImage('saturn', 'assets/images/saturn.png');
        this.loadImage('venus', 'assets/images/venus.png');
        this.loadImage('mercury', 'assets/images/mercury.png');
        // Add more assets as needed

        // If no assets were queued (e.g., all paths wrong), trigger callback immediately
        if (this.assetsToLoad === 0 && this.onAllAssetsLoaded) {
             console.warn("No assets queued for loading.");
             this.onAllAssetsLoaded();
        }
    }
}