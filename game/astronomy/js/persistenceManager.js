// js/persistenceManager.js
class PersistenceManager {
    constructor(gameLogic) {
        this.gameLogic = gameLogic;
        this.version = "AstroTycoon_v0.1"; // Version identifier
        this.separator = "|"; // Choose a separator unlikely to be in data
    }

    encodeGameState() {
        try {
            const state = this.gameLogic.getGameStateForSave();
            // Simple initial encoding: version|funds|currentTime|currentDay|...more data later
            const dataString = [
                this.version,
                state.funds,
                state.time.hours,
                state.time.minutes,
                state.time.day,
                // Add more game state variables here, separated by the separator
                // e.g., JSON.stringify(state.inventory) if needed
            ].join(this.separator);

            // Basic Base64 encoding to make it a bit less readable and handle special chars
            return btoa(dataString);
        } catch (error) {
            console.error("Error encoding game state:", error);
            return null; // Indicate failure
        }
    }

    decodeGameState(saveCode) {
        if (!saveCode) {
            console.warn("No save code provided.");
            return false; // Indicate failure
        }

        try {
            const decodedString = atob(saveCode);
            const parts = decodedString.split(this.separator);

            if (parts[0] !== this.version) {
                console.warn(`Save code version mismatch. Expected ${this.version}, got ${parts[0]}. Loading might fail or be incorrect.`);
                // Potentially add logic here to handle older versions if needed in the future
            }

            // Basic initial decoding
            const loadedState = {
                funds: parseInt(parts[1], 10),
                time: {
                    hours: parseInt(parts[2], 10),
                    minutes: parseInt(parts[3], 10),
                    day: parseInt(parts[4], 10),
                }
                // Add parsing for more complex data here
            };

            // Validate loaded data (basic checks)
            if (isNaN(loadedState.funds) || isNaN(loadedState.time.hours) || isNaN(loadedState.time.minutes) || isNaN(loadedState.time.day)) {
                 throw new Error("Invalid data found in save code.");
            }


            this.gameLogic.loadGameState(loadedState);
            console.log("Game state loaded successfully.");
            return true; // Indicate success
        } catch (error) {
            console.error("Error decoding game state:", error);
            alert(`Failed to load save game. The code might be corrupted or from an incompatible version.\nError: ${error.message}`);
            return false; // Indicate failure
        }
    }
}