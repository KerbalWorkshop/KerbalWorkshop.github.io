// js/renderingEngine.js
class RenderingEngine {
    constructor(canvasId, assetManager, gameLogic) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.assetManager = assetManager;
        this.gameLogic = gameLogic; // To get positions, time, etc.

        this.skyRotationAngle = 0; // Angle in degrees for sky rotation
        this.pixelsPerDegree = 2; // How many pixels the sky moves per degree of rotation

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        console.log(`Canvas resized to: <span class="math-inline">\{this\.canvas\.width\}x</span>{this.canvas.height}`);
         // Recalculate any size-dependent properties if needed
        this.pixelsPerDegree = this.canvas.width / 180; // Example: sky scrolls 180 degrees across the width
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawBackground() {
        const bgImage = this.assetManager.getImage('background');
        if (bgImage) {
            // Simple background draw, assuming it fills the canvas or is tiled appropriately
             this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            // Fallback solid color if image not loaded
            this.ctx.fillStyle = '#000010'; // Very dark blue/black
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    drawSky() {
        // Placeholder for drawing stars and rotating sky
         this.ctx.save();
         this.ctx.fillStyle = '#FFFFFF'; // White stars

         // Simple star field - replace with actual celestial simulation later
         if (!this.stars) { // Generate stars once
             this.stars = [];
             for (let i = 0; i < 200; i++) {
                 this.stars.push({
                     x: Math.random() * this.canvas.width * 2, // Wider than canvas for rotation
                     y: Math.random() * this.canvas.height,
                     radius: Math.random() * 1.5
                 });
             }
         }

          // Calculate the offset based on rotation
         const skyOffset = (this.skyRotationAngle * this.pixelsPerDegree) % (this.canvas.width * 2); // Wrap around

         this.stars.forEach(star => {
              // Calculate position with wrap-around
              let drawX = star.x - skyOffset;
              if (drawX < 0) drawX += this.canvas.width * 2; // Wrap from left
              if (drawX > this.canvas.width) drawX -= this.canvas.width * 2; // Wrap from right (less common with this offset but good practice)

              // Draw star if visible
              if(drawX >=0 && drawX <= this.canvas.width){
                  this.ctx.beginPath();
                  this.ctx.arc(drawX, star.y, star.radius, 0, Math.PI * 2);
                  this.ctx.fill();
              }
         });

         this.ctx.restore();

         // Draw celestial bodies based on gameLogic positions
         this.drawCelestialBodies();
    }

     drawCelestialBodies() {
        const bodies = this.gameLogic.getCelestialBodyPositions(this.skyRotationAngle, this.pixelsPerDegree, this.canvas.width, this.canvas.height);
        // Example: bodies = [{ name: 'moon', x: 100, y: 150, size: 30, imageKey: 'moon' }, ...]

        bodies.forEach(body => {
            const img = this.assetManager.getImage(body.imageKey);
            if (img) {
                const drawSize = body.size * (this.canvas.height / 600); // Scale size based on canvas height (adjust base 600 as needed)
                const drawX = body.x - drawSize / 2;
                const drawY = body.y - drawSize / 2;

                // Only draw if on screen (basic check)
                if (drawX + drawSize > 0 && drawX < this.canvas.width && drawY + drawSize > 0 && drawY < this.canvas.height) {
                    this.ctx.drawImage(img, drawX, drawY, drawSize, drawSize);
                     // Optional: Draw label
                     // this.ctx.fillStyle = 'yellow';
                     // this.ctx.fillText(body.name, drawX, drawY - 5);
                }
            } else {
                // Fallback if image not ready
                this.ctx.fillStyle = 'grey';
                this.ctx.beginPath();
                this.ctx.arc(body.x, body.y, body.size/2, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
    }

    drawTelescope() {
        const telescopeImg = this.assetManager.getImage('telescopeBasic'); // Later: get from gameLogic based on player gear
        if (telescopeImg) {
            const scale = 0.3; // Example scale
            const imgWidth = telescopeImg.width * scale;
            const imgHeight = telescopeImg.height * scale;
            // Center the telescope near the bottom
            const x = (this.canvas.width - imgWidth) / 2;
            const y = this.canvas.height - imgHeight - 20; // 20px from bottom

            this.ctx.drawImage(telescopeImg, x, y, imgWidth, imgHeight);
        }
    }

    // Main render loop call
    render(gameState) {
        this.skyRotationAngle = gameState.skyRotation; // Get rotation from game logic

        this.clearCanvas();
        this.drawBackground(); // Draw static backyard first
        this.drawSky(); // Draw rotating stars and celestial bodies behind telescope
        this.drawTelescope(); // Draw telescope on top
        // Add other rendering elements (UI overlays on canvas, effects, etc.)
    }
}