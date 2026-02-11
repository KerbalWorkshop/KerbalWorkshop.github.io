// This file handles event listeners and initialization
document.addEventListener('DOMContentLoaded', () => {

    /***** EVENT HANDLERS & MODAL MANAGEMENT *****/
    
    // Debug Money Button
    const devBtn = document.getElementById("devAddMoneyBtn");
    if(devBtn) {
        devBtn.addEventListener("click", function() {
            GameStateManager.state.money += 1000;
            UIManager.updateDisplays();
            UIManager.generateShopContent();
        });
    }
    
    // Modal Management
    const modalOverlay = document.getElementById("modalOverlay");
    function openModal(modalId) {
      modalOverlay.style.display = "block";
      document.getElementById(modalId).style.display = "block";
    }
    function closeModal(modalId) {
      document.getElementById(modalId).style.display = "none";
      modalOverlay.style.display = "none";
    }
    
    modalOverlay.addEventListener("click", () => {
      document.querySelectorAll(".modal").forEach(m => m.style.display = "none");
      modalOverlay.style.display = "none";
    });
    
    document.querySelectorAll(".modal-close").forEach(btn => {
      btn.addEventListener("click", (e) => {
        closeModal(e.target.getAttribute("data-modal"));
      });
    });
    
    // Right-side Buttons
    document.getElementById("settingsCog").addEventListener("click", () => openModal("settingsModal"));
    document.getElementById("storeBtn").addEventListener("click", () => { UIManager.generateShopContent(); openModal("shopModal"); });
    document.getElementById("equipmentBtn").addEventListener("click", () => { UIManager.updateGearDisplay(); openModal("gearModal"); });
    
    // NEW LOGIC: Begin Session Button
    document.getElementById("beginSessionBtn").addEventListener("click", () => {
        // Instead of opening a modal immediately, we ask SessionManager to start.
        // It will handle validation and UI switching.
        SessionManager.startSession();
    });

    document.getElementById("upgradesBtn").addEventListener("click", () => openModal("upgradesModal"));
    
    // Event Delegation for Shop Content (Buy & Info buttons)
    document.getElementById("shopContent").addEventListener("click", function(e) {
      const target = e.target;
      if (target.classList.contains("buy-btn")) {
        const itemId = target.getAttribute("data-item-id");
        const item = GameStateManager.state.shopItems.find(i => i.id === itemId);
        if (item && GameStateManager.purchaseItem(item)) {
          UIManager.updateDisplays();
          UIManager.generateShopContent();
        }
      } else if (target.classList.contains("info-btn")) {
        const itemId = target.getAttribute("data-item-id");
        const item = GameStateManager.state.shopItems.find(i => i.id === itemId);
        if (item) {
          const rect = target.getBoundingClientRect();
          const position = {
            left: (rect.right + 5) + "px",
            top: rect.top + "px"
          };
          let content = `<div style="text-decoration:underline; font-weight:bold;">${item.name}</div>
                         <div>Value: $${item.price}</div>`;
          // Enhanced Info for Physics Props
          if(item.weight) content += `<div>Weight: ${item.weight}kg</div>`;
          if(item.aperture) content += `<div>Aperture: ${item.aperture}mm</div>`;
          if(item.focalLength) content += `<div>FL: ${item.focalLength}mm</div>`;
          if(item.pixelSize) content += `<div>Pixel: ${item.pixelSize}µm</div>`;
          
          if (item.topDiameter || item.bottomDiameter) {
            if (item.topDiameter) content += `<div>Upper Diameter: ${item.topDiameter}</div>`;
            if (item.bottomDiameter) content += `<div>Lower Diameter: ${item.bottomDiameter}</div>`;
          }
          PopupManager.show("itemInfo", content, position);
          e.stopPropagation(); // Stop global closer
        }
      }
    });
    
    // Event Delegation for Gear Content (Sell & Info buttons)
    document.getElementById("gearContent").addEventListener("click", function(e) {
      const target = e.target;
      if (target.classList.contains("sell-btn")) {
        const itemId = target.getAttribute("data-item-id");
        const item = GameStateManager.state.shopItems.find(i => i.id === itemId);
        if (item && GameStateManager.sellItem(item)) {
          UIManager.updateDisplays();
          UIManager.updateGearDisplay();
        }
      } else if (target.classList.contains("info-btn")) {
        const itemId = target.getAttribute("data-item-id");
        const item = GameStateManager.state.shopItems.find(i => i.id === itemId);
        if (item) {
          const rect = target.getBoundingClientRect();
          const position = {
            left: (rect.right + 5) + "px",
            top: rect.top + "px"
          };
          let content = `<div style="text-decoration:underline; font-weight:bold;">${item.name}</div>
                         <div>Value: $${item.price}</div>`;
          if(item.weight) content += `<div>Weight: ${item.weight}kg</div>`;
          if (item.topDiameter || item.bottomDiameter) {
            if (item.topDiameter) content += `<div>Upper Diameter: ${item.topDiameter}</div>`;
            if (item.bottomDiameter) content += `<div>Lower Diameter: ${item.bottomDiameter}</div>`;
          }
          PopupManager.show("itemInfo", content, position);
          e.stopPropagation(); // Stop global closer
        }
      }
    });

    // Initial Start
    PopupManager.init(); // Initialize the global click listener
    UIManager.updateDisplays();
    EquipmentManager.createInitialPlus();
    TimeManager.start();
});