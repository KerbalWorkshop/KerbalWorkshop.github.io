const SessionManager = {
    // Check if the current equipment chain is valid for a session
    validateSetup() {
        const chain = GameStateManager.state.equipmentChain;
        if (chain.length === 0) return { valid: false, message: "No equipment setup." };

        const hasMount = chain.some(e => e.item.type === 'mount');
        const hasScope = chain.some(e => e.item.type === 'scope');
        const hasCamera = chain.some(e => e.item.type === 'camera');
        const hasEyepiece = chain.some(e => e.item.type === 'eyepiece'); 

        if (!hasMount) return { valid: false, message: "Missing: <strong>Mount</strong><br>You cannot track the stars without one." };
        if (!hasScope) return { valid: false, message: "Missing: <strong>Optical Tube</strong><br>You need a telescope to collect light." };
        if (!hasCamera && !hasEyepiece) return { valid: false, message: "Missing: <strong>Camera</strong><br>You need a way to capture or view the image." };

        return { valid: true };
    },

    // Calculate all physics stats for the current rig
    calculateRigStats() {
        const chain = GameStateManager.state.equipmentChain;
        let stats = {
            payloadWeight: 0, // WEIGHT OF SCOPE + CAMERA + ACCS
            mountWeight: 0,   // WEIGHT OF THE MOUNT ITSELF
            mountCapacity: 0,
            trackingAccuracy: 0, 
            effectiveFocalLength: 0,
            effectiveAperture: 0,
            focalRatio: 0,
            magnificationMultiplier: 1.0,
            
            // Camera specific
            hasCamera: false,
            pixelScale: 0, 
            fovWidth: 0, 
            fovHeight: 0, 
            lightCollectionScore: 0,
            
            warnings: []
        };

        // 1. Calculate Base Stats
        chain.forEach(link => {
            const item = link.item;

            if (item.type === 'mount') {
                stats.mountWeight = item.weight || 0;
                stats.mountCapacity = item.weightCapacity || 10;
                stats.trackingAccuracy = item.trackingAccuracy || 1.0;
            } else {
                // Everything else counts as PAYLOAD
                stats.payloadWeight += item.weight || 0;
            }

            if (item.type === 'scope') {
                stats.effectiveFocalLength = item.focalLength || 500;
                stats.effectiveAperture = item.aperture || 100;
            }
            if (item.type === 'barlow') { 
                stats.magnificationMultiplier *= (item.magnification || 1.0);
            }
            if (item.type === 'camera') {
                stats.hasCamera = true;
                stats.sensorWidth = item.sensorWidth;
                stats.sensorHeight = item.sensorHeight;
                stats.pixelSize = item.pixelSize;
                stats.qe = item.quantumEfficiency || 0.5;
                stats.quality = item.quality || 1.0;
            }
        });

        // 2. Apply Optical Modifiers
        stats.effectiveFocalLength *= stats.magnificationMultiplier;
        stats.focalRatio = stats.effectiveFocalLength / stats.effectiveAperture;

        // 3. Calculate Tracking Performance (Curve based on PAYLOAD vs CAPACITY)
        // Formula: BaseTracking + 0.5 * (Payload / Capacity)^2
        const loadRatio = stats.payloadWeight / stats.mountCapacity;
        // Tracking degrades quadratically as you approach/exceed limit
        const trackingPenalty = 0.5 * Math.pow(loadRatio, 2);
        stats.trackingRate = stats.trackingAccuracy + trackingPenalty;
        
        if (loadRatio > 1.0) stats.warnings.push("Mount Overloaded! (" + Math.round(loadRatio*100) + "%)");
        
        // 4. Calculate Camera Stats 
        if (stats.hasCamera) {
            stats.pixelScale = (206.265 * stats.pixelSize) / stats.effectiveFocalLength;
            stats.fovWidth = (57.3 * stats.sensorWidth) / stats.effectiveFocalLength;
            stats.fovHeight = (57.3 * stats.sensorHeight) / stats.effectiveFocalLength;

            // Light Collection Score
            stats.lightCollectionScore = (Math.pow(stats.effectiveAperture, 2) * stats.qe * stats.quality) / Math.pow(stats.focalRatio, 2);
            stats.lightCollectionScore = Math.round(stats.lightCollectionScore * 10) / 10;

            // Blur Check
            if (stats.trackingRate > stats.pixelScale) {
                stats.warnings.push("Tracking Error (" + stats.trackingRate.toFixed(2) + "\") > Pixel Scale (" + stats.pixelScale.toFixed(2) + "\"). Image will be soft.");
            }
        }

        return stats;
    },

    startSession() {
        const check = this.validateSetup();
        
        if (!check.valid) {
            // Calculate center of screen for popup to ensure visibility
            const w = window.innerWidth;
            const h = window.innerHeight;
            const pos = { left: (w/2 - 150) + "px", top: (h/2 - 50) + "px" };
            
            PopupManager.show("error", 
                `<div style="color:#ff6b6b; font-weight:bold; margin-bottom:5px;">SESSION FAILED</div>
                 <div>${check.message}</div>`, 
                pos
            );
            return;
        }

        const stats = this.calculateRigStats();
        
        // Hide Main Container, Show Session Container
        document.getElementById("container").style.display = "none";
        document.getElementById("sessionContainer").style.display = "block";
        
        // Update Session UI
        this.initSessionUI(stats);
    },

    exitSession() {
        document.getElementById("sessionContainer").style.display = "none";
        document.getElementById("container").style.display = "flex";
    },

    initSessionUI(stats) {
        // Populate the specific elements in the new split screen layout
        
        // 1. Populate Rig Stats (Bottom Bar or Overlay)
        // For now, we put the rig details in the "Right Side" control panel as a summary
        const statTarget = document.getElementById("sessionStatsContent");
        if(statTarget) {
            let html = `
                <div class="session-stat-row">
                    <span>Payload:</span>
                    <span style="color: ${stats.payloadWeight > stats.mountCapacity ? '#ff6b6b' : '#69db7c'}">
                        ${stats.payloadWeight.toFixed(1)} / ${stats.mountCapacity} kg
                    </span>
                </div>
                <div class="session-stat-row">
                    <span>Tracking:</span>
                    <span>${stats.trackingRate.toFixed(2)}"</span>
                </div>
                 <div class="session-stat-row">
                    <span>Focal Ratio:</span>
                    <span>f/${stats.focalRatio.toFixed(1)}</span>
                </div>
            `;
            
            if(stats.hasCamera) {
                 html += `
                    <div class="session-stat-row">
                        <span>FOV:</span>
                        <span>${stats.fovWidth.toFixed(2)}° x ${stats.fovHeight.toFixed(2)}°</span>
                    </div>
                     <div class="session-stat-row score-row">
                        <span>LIGHT SCORE:</span>
                        <span>${stats.lightCollectionScore}</span>
                    </div>
                `;
            }
            
            if(stats.warnings.length > 0) {
                 html += `<div class="session-warning-box">`;
                 stats.warnings.forEach(w => {
                     html += `<div>⚠ ${w}</div>`;
                 });
                 html += `</div>`;
            }
            
            statTarget.innerHTML = html;
        }
        
        // Bind Exit Button
        const exitBtn = document.getElementById("endSessionBtn");
        // Clone to remove old listeners if re-initializing
        const newExitBtn = exitBtn.cloneNode(true);
        exitBtn.parentNode.replaceChild(newExitBtn, exitBtn);
        newExitBtn.addEventListener("click", () => {
            this.exitSession();
        });
    }
};