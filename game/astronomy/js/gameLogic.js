// js/gameLogic.js
class GameLogic {
    constructor() {
        // --- Game State ---
        this.funds = 100; // Starting funds
        this.gameTime = { // Represents in-game time
            day: 1,
            hours: 20, // Start at 8 PM
            minutes: 0,
            _totalMinutes: (1 * 24 * 60) + (20 * 60) + 0 // Internal tracking
        };
        this.timeScale = 60; // How many real seconds per game hour (e.g., 60 = 1 min real time -> 1 hour game time)
        this.currentMode = 'observation'; // 'observation' or 'photo'
        this.skyRotation = 0; // Current rotation of the sky in degrees (0-360)

        // --- Equipment (Basic Example) ---
         this.telescope = {
             name: "Basic Refractor",
             magnification: 50, // Example stat
             viewAngle: 5 // Degrees field of view
         };
         this.camera = null; // Player starts without a camera

         // --- Celestial Bodies ---
         this.celestialBodies = this._initializeCelestialBodies();

         // --- Internal Timers ---
        this.lastTimestamp = 0;
        this.minuteAccumulator = 0; // Accumulates real time towards game minutes
    }

     _initializeCelestialBodies() {
         // Simplified representation: positions relative to a base 'sky map'
         // Later, this needs actual orbital mechanics or pre-calculated ephemeris
         // Positions here are conceptual (e.g., degrees offset on the celestial sphere)
         // X: Angle (0-360), Y: Declination (simplified as Y pos), Size: Base visual size
         return [
             { name: 'Moon', xAngle: 30, yPos: 200, baseSize: 40, imageKey: 'moon', orbitRate: 13.17 }, // Deg/day approx
             { name: 'Mercury', xAngle: 50, yPos: 250, baseSize: 5, imageKey: 'mercury', orbitRate: 4.09 },
             { name: 'Venus', xAngle: 80, yPos: 220, baseSize: 8, imageKey: 'venus', orbitRate: 1.6 },
             { name: 'Mars', xAngle: 150, yPos: 300, baseSize: 7, imageKey: 'mars', orbitRate: 0.52 },
             { name: 'Jupiter', xAngle: 240, yPos: 180, baseSize: 15, imageKey: 'jupiter', orbitRate: 0.08 },
             { name: 'Saturn', xAngle: 290, yPos: 280, baseSize: 12, imageKey: 'saturn', orbitRate: 0.03 },
         ];
     }

    update(deltaTime) { // deltaTime is in seconds
        this.updateGameTime(deltaTime);
        this.updateSkyRotation(deltaTime);
        this.updateCelestialPositions(deltaTime); // Needs refinement for orbits
        // Add other periodic updates: check events, update market prices, etc.
    }

    updateGameTime(deltaTime) {
        this.minuteAccumulator += deltaTime;
        const secondsPerGameMinute = (3600 / this.timeScale) / 60; // Real seconds for one game minute

        while (this.minuteAccumulator >= secondsPerGameMinute) {
            this.minuteAccumulator -= secondsPerGameMinute;
            this.gameTime._totalMinutes++;

            // Update human-readable time
            const totalMinutes = this.gameTime._totalMinutes;
            this.gameTime.day = Math.floor(totalMinutes / (24 * 60)) + 1; // Day starts at 1
            const minutesInCurrentDay = totalMinutes % (24 * 60);
            this.gameTime.hours = Math.floor(minutesInCurrentDay / 60);
            this.gameTime.minutes = minutesInCurrentDay % 60;
        }
         // Clamp time if needed, or handle day/night transitions
    }

     updateSkyRotation(deltaTime) {
         // Earth rotates 360 degrees in 24 hours (1440 minutes)
         // Rotation speed: 360 / 1440 = 0.25 degrees per game minute
          const degreesPerGameMinute = 0.25;
         const secondsPerGameMinute = (3600 / this.timeScale) / 60;
         const rotationThisFrame = (deltaTime / secondsPerGameMinute) * degreesPerGameMinute;

         this.skyRotation = (this.skyRotation - rotationThisFrame + 360) % 360; // Subtract because sky moves East to West
     }

     updateCelestialPositions(deltaTime) {
         // VERY Simplified orbital movement - just update the angle based on rate
         const minutesElapsed = deltaTime * this.timeScale; // Game minutes passed
         const daysElapsed = minutesElapsed / (24 * 60);

         this.celestialBodies.forEach(body => {
             if (body.orbitRate) { // Check if it has an orbit rate defined
                 body.xAngle = (body.xAngle + body.orbitRate * daysElapsed) % 360;
             }
             // Y position (declination) would also change, but needs more complex model
         });
     }

     getCelestialBodyPositions(currentSkyRotation, pixelsPerDegree, canvasWidth, canvasHeight) {
         // Convert stored angles to screen coordinates based on current sky rotation
         return this.celestialBodies.map(body => {
             // Calculate the body's apparent angle relative to the center of the view (due to sky rotation)
             let apparentAngle = (body.xAngle - currentSkyRotation + 360) % 360;

             // Convert angle to X pixel position (simplistic linear mapping)
             // This assumes 0 degrees rotation = 0 degrees angle at the left edge, 180 center etc. Adjust as needed.
             let xPos = (apparentAngle / 360) * (canvasWidth * 2); // Map 360 degrees to double canvas width for scrolling

              // Handle wrap-around drawing: if xPos is off-screen left/right due to the way we calculated offset
              if (xPos > canvasWidth) xPos -= canvasWidth * 2;
              // if (xPos < -canvasWidth) xPos += canvasWidth * 2; // Less likely with current rotation direction


             // Y position is simpler for now, just use stored value adjusted for canvas height
             // A proper conversion would involve altitude/azimuth calculation based on time/location
             let yPos = body.yPos * (canvasHeight / 600); // Scale based on a reference height

             return {
                 name: body.name,
                 x: xPos,
                 y: yPos,
                 size: body.baseSize, // Later: adjust size based on distance/magnification
                 imageKey: body.imageKey
             };
         });
     }


    setMode(mode) {
        if (mode === 'photo' || mode === 'observation') {
            this.currentMode = mode;
            console.log(`Switched to ${mode} mode.`);
            // Potentially add logic here if switching modes has immediate effects
             if(mode === 'photo' && !this.camera) {
                 // Find the UIManager instance to show message - needs better coupling later
                 window.uiManager.showMessage("You need a camera to take photos. Visit the store!", 4000);
                 this.currentMode = 'observation'; // Switch back if no camera
             }

        }
    }

    captureImage() {
        if (this.currentMode !== 'photo') {
            console.warn("Cannot capture image outside of photo mode.");
            return;
        }
         if (!this.camera) {
             console.warn("Cannot capture image without a camera.");
              window.uiManager.showMessage("No camera equipped!", 3000); // Use UI manager
             return;
         }

        // TODO: Implement image capture logic
        // 1. Determine what's currently in the telescope's view
        // 2. Factor in camera quality, telescope quality, atmospheric conditions (future)
        // 3. Generate an 'image' object (could be data: quality, subject, time)
        // 4. Add image to player inventory (needs inventory system)
        // 5. Provide feedback to the player (e.g., "Image captured!")
         window.uiManager.showMessage("Image captured! (Feature WIP)", 2000);
        console.log("Attempting to capture image...");
        // Example: Give some money for placeholder capture
         //this.funds += 10;
         // console.log(`Placeholder: Earned $10. Funds: ${this.funds}`);
    }


    // --- Telescope Interaction (Placeholders) ---
     getCurrentTelescopeTarget() {
         // TODO: Determine what object is centered in the telescope view based on sky rotation,
         // telescope position (if controllable later), and celestial body positions.
         // For now, return a dummy target for the viewfinder example
         const targetCandidate = this.celestialBodies.find(body => {
              // Simplified check: is the body roughly in the center of the initial view?
              let apparentAngle = (body.xAngle - this.skyRotation + 360) % 360;
              return apparentAngle > 170 && apparentAngle < 190; // Example: near center (180deg)
         });
         if(targetCandidate){
             return {
                 name: targetCandidate.name,
                 baseSize: targetCandidate.baseSize,
                 color: 'lightblue', // Example color
                 offsetX: (180 - ((targetCandidate.xAngle - this.skyRotation + 360) % 360))*5, // Example offset based on angle diff from center
                 offsetY: (targetCandidate.yPos - 300)/5 // Example offset based on Y pos diff from center line
             };
         }
         return null; // No specific target centered
     }

     getCurrentTelescopeZoom() {
         return this.telescope ? this.telescope.magnification : 1;
     }


    // --- Persistence ---
    getGameStateForSave() {
        // Return a plain object with the data needed for saving
        return {
            funds: this.funds,
            time: { ...this.gameTime }, // Shallow copy is fine for this structure
            skyRotation: this.skyRotation,
             // Add current equipment, inventory, unlocked features, etc. later
             // telescope: this.telescope.name, // Example: save equipped item names
             // camera: this.camera ? this.camera.name : null
        };
    }

    loadGameState(loadedState) {
        // Update the current game state from the loaded data
        this.funds = loadedState.funds;
        this.gameTime = { ...loadedState.time }; // Assume time structure matches
        this.skyRotation = loadedState.skyRotation !== undefined ? loadedState.skyRotation : 0; // Handle missing rotation in older saves (if any)
         // Reset internal time accumulator based on loaded time
         this.gameTime._totalMinutes = ((this.gameTime.day -1) * 24 * 60) + (this.gameTime.hours * 60) + this.gameTime.minutes;
         this.minuteAccumulator = 0; // Reset accumulator on load

         // Load equipment etc. based on saved data (needs implementation)
         // Example: this.telescope = findEquipmentByName(loadedState.telescope);

        console.log("Internal game state updated from load.");
         // Potentially re-initialize celestial positions based on the loaded time/day
         // For now, the basic update loop will handle positions based on loaded time
         this._initializeCelestialBodies(); // Reset to base positions before updates based on new time
    }
}