// js/main.js
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing game...");

    // --- Global Game Objects ---
    // Making instances accessible globally for easier debugging/inter-module communication initially
    // In a larger project, consider dependency injection or an event bus system.
    window.assetManager = new AssetManager();
    window.gameLogic = new GameLogic();
    window.persistenceManager = new PersistenceManager(window.gameLogic); // Needs gameLogic ref
    window.renderingEngine = new RenderingEngine('game-canvas', window.assetManager, window.gameLogic); // Needs assetManager and gameLogic refs
    window.uiManager = new UIManager(window.gameLogic, window.persistenceManager); // Needs gameLogic and persistenceManager refs


    // --- Game Variables ---
    let lastFrameTime = 0;
    let animationFrameId = null;
    let isPaused = false; // Basic pause state

    // --- Game Loop ---
    function gameLoop(timestamp) {
        if (isPaused) {
            animationFrameId = requestAnimationFrame(gameLoop);
            return;
        }

        const deltaTime = (timestamp - lastFrameTime) / 1000; // Delta time in seconds
        lastFrameTime = timestamp;

        // --- Update Phase ---
        // Ensure deltaTime is reasonable (e.g., prevent huge jumps after tab resumes)
        const dt = Math.min(deltaTime, 0.1); // Clamp delta time to max 100ms
        gameLogic.update(dt);

         // Update UI (passing the full game state for now)
        uiManager.update(gameLogic.getGameStateForSave()); // Reuse save state structure for simplicity

         // Update ViewFinder if open
         if (uiManager.viewFinderModal.style.display === 'block') {
             uiManager.drawViewFinder();
         }


        // --- Render Phase ---
        renderingEngine.render(gameLogic.getGameStateForSave()); // Pass necessary state to renderer

        // Request next frame
        animationFrameId = requestAnimationFrame(gameLoop);
    }

    // --- Initialization ---
    function initializeGame() {
         console.log("Starting asset loading...");
         // Load assets, then start the game loop
         assetManager.loadInitialAssets(() => {
             console.log("Assets loaded. Starting game loop...");
             lastFrameTime = performance.now(); // Set initial timestamp
             gameLoop(lastFrameTime); // Start the loop
         });

         // Add basic pause/resume listeners (optional)
         // document.addEventListener('visibilitychange', () => {
         //     if (document.hidden) {
         //         isPaused = true;
         //         console.log("Game paused (tab hidden)");
         //         if (animationFrameId) cancelAnimationFrame(animationFrameId);
         //     } else {
         //         isPaused = false;
         //         lastFrameTime = performance.now(); // Reset timestamp to avoid jump
         //         console.log("Game resumed");
         //         gameLoop(lastFrameTime);
         //     }
         // });
     }


    // Start the initialization process
    initializeGame();

}); // End DOMContentLoaded