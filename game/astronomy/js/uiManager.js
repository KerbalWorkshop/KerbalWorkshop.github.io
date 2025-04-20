// js/uiManager.js
class UIManager {
    constructor(gameLogic, persistenceManager) {
        this.gameLogic = gameLogic;
        this.persistenceManager = persistenceManager;

        // Element references
        this.fundsDisplay = document.querySelector('#funds-display span');
        this.timeDisplay = document.querySelector('#time-display span');
        this.dateDisplay = document.querySelector('#date-display span');
        this.observeButton = document.getElementById('observe-button');
        this.photoButton = document.getElementById('photo-button');
        this.captureButton = document.getElementById('capture-button');
        this.saveButton = document.getElementById('save-button');
        this.loadButton = document.getElementById('load-button');
        this.saveCodeArea = document.getElementById('save-code-area');
        this.generatedSaveCodeArea = document.getElementById('generated-save-code');
        this.saveConfirmModal = document.getElementById('save-confirm-modal');
        this.viewFinderButton = document.getElementById('view-finder-button');
         this.viewFinderModal = document.getElementById('viewfinder-modal');
         this.viewFinderCanvas = document.getElementById('viewfinder-canvas');
         this.viewFinderCtx = this.viewFinderCanvas.getContext('2d');


        this.addEventListeners();
    }

    update(gameState) {
        // Update displays
        this.fundsDisplay.textContent = `$${gameState.funds}`;
        const time = gameState.time;
        this.timeDisplay.textContent = `<span class="math-inline">\{String\(time\.hours\)\.padStart\(2, '0'\)\}\:</span>{String(time.minutes).padStart(2, '0')}`;
         this.dateDisplay.textContent = `Day ${time.day}`;


        // Update button states based on game mode, etc.
        this.captureButton.disabled = gameState.currentMode !== 'photo'; // Only enable capture in photo mode

        if (gameState.currentMode === 'photo') {
            this.photoButton.classList.add('active');
            this.observeButton.classList.remove('active');
        } else {
            this.observeButton.classList.add('active');
            this.photoButton.classList.remove('active');
        }
    }

    addEventListeners() {
        this.observeButton.addEventListener('click', () => this.gameLogic.setMode('observation'));
        this.photoButton.addEventListener('click', () => this.gameLogic.setMode('photo'));
        this.captureButton.addEventListener('click', () => this.gameLogic.captureImage()); // Needs implementation in gameLogic

        this.saveButton.addEventListener('click', () => this.saveGame());
        this.loadButton.addEventListener('click', () => this.loadGame());

        // Modal close buttons
        document.querySelectorAll('.modal .close-modal').forEach(button => {
            button.addEventListener('click', (event) => {
                event.target.closest('.modal').style.display = 'none';
            });
        });

         // View Finder
        this.viewFinderButton.addEventListener('click', () => this.openViewFinder());
    }

    openViewFinder() {
         this.viewFinderModal.style.display = 'block';
         // Initial draw or update based on current telescope view
         this.drawViewFinder();
     }

     drawViewFinder() {
         // This needs data from gameLogic about what the telescope is seeing
         const target = this.gameLogic.getCurrentTelescopeTarget(); // Needs implementation
         const zoomLevel = this.gameLogic.getCurrentTelescopeZoom(); // Needs implementation

         const ctx = this.viewFinderCtx;
         const canvas = this.viewFinderCanvas;
         const centerX = canvas.width / 2;
         const centerY = canvas.height / 2;

         // Clear
         ctx.fillStyle = '#050510'; // Very dark blue
         ctx.fillRect(0, 0, canvas.width, canvas.height);

         // Draw crosshairs
         ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; // Faint red
         ctx.lineWidth = 1;
         ctx.beginPath();
         ctx.moveTo(centerX, 0);
         ctx.lineTo(centerX, canvas.height);
         ctx.moveTo(0, centerY);
         ctx.lineTo(canvas.width, centerY);
         ctx.stroke();

         // Draw target (example: simple circle if target exists)
         if (target) {
              // Simplified: draw based on target properties
              const apparentSize = target.baseSize * zoomLevel; // Simplified apparent size
              ctx.fillStyle = target.color || 'white';
              ctx.beginPath();
              ctx.arc(centerX + target.offsetX, centerY + target.offsetY, apparentSize / 2, 0, Math.PI * 2); // Add offsets if target isn't centered
              ctx.fill();
              ctx.fillStyle = 'yellow';
              ctx.fillText(target.name, centerX + target.offsetX + apparentSize / 2 + 5, centerY + target.offsetY);
         } else {
              ctx.fillStyle = 'grey';
              ctx.fillText("Space", centerX - 15, centerY - 15);
         }
     }

    saveGame() {
        const saveCode = this.persistenceManager.encodeGameState();
        if (saveCode) {
            this.generatedSaveCodeArea.value = saveCode;
            this.saveConfirmModal.style.display = 'block';
            this.generatedSaveCodeArea.select(); // Select text for easy copying
            console.log("Game save code generated.");
        } else {
            alert("Failed to generate save code.");
        }
    }

    loadGame() {
        const saveCode = this.saveCodeArea.value.trim();
        if (!saveCode) {
            alert("Please paste a save code into the text area first.");
            return;
        }
        if (this.persistenceManager.decodeGameState(saveCode)) {
            // Game logic's loadGameState should reset necessary states
            // UI update will happen in the next game loop via uiManager.update()
            this.saveCodeArea.value = ""; // Clear the input area
            alert("Game loaded successfully!");
            // Potentially close any open modals
            document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
        }
        // Error handling is inside decodeGameState
    }

    showMessage(message, duration = 3000) {
        // Simple temporary message display (could be improved with a dedicated element)
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.style.position = 'absolute';
        messageElement.style.bottom = '70px'; // Above control panel
        messageElement.style.left = '50%';
        messageElement.style.transform = 'translateX(-50%)';
        messageElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        messageElement.style.color = 'white';
        messageElement.style.padding = '10px 20px';
        messageElement.style.borderRadius = '5px';
        messageElement.style.zIndex = '200';
        document.getElementById('game-container').appendChild(messageElement);

        setTimeout(() => {
            messageElement.remove();
        }, duration);
    }
}