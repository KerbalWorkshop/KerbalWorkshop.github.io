const PopupManager = {
  currentPopup: null,

  // Initialize the global click listener
  init() {
    document.addEventListener('click', (e) => {
      // If we are clicking INSIDE a popup, do nothing (let the button handlers work)
      if (e.target.closest('.global-popup')) {
        return;
      }
      // If we click OUTSIDE, close the popup
      this.close();
    });
  },

  show(type, content, position, originId = "") {
    this.close(); // Ensure only one popup is open at a time.
    this.currentPopup = this.createPopupElement(type, content);
    if(originId) {
      this.currentPopup.dataset.origin = originId;
    }
    this.positionPopup(this.currentPopup, position);
    // Append popup to leftSide container to maintain consistent positioning.
    document.getElementById("leftSide").appendChild(this.currentPopup);
  },

  createPopupElement(type, content) {
    const popup = document.createElement("div");
    popup.className = "global-popup popup-" + type;
    popup.innerHTML = content;
    return popup;
  },

  positionPopup(popup, position) {
    popup.style.left = position.left;
    popup.style.top = position.top;
  },

  close() {
    if (this.currentPopup) {
      this.currentPopup.remove();
      this.currentPopup = null;
    }
  },

  showEquipmentInfoPopup(event, item, equipDiv) {
    // This popup is for equipment info (with a remove button).
    if (!equipDiv.dataset.equipId) {
      equipDiv.dataset.equipId = "equip-" + Date.now() + "-" + Math.random().toString(36).substr(2,5);
    }
    
    // Check if we are clicking the same equipment again (toggle behavior handled by caller usually, but good to check)
    let existing = document.getElementById("equipmentInfoPopup");
    if (existing && existing.dataset.equipId === equipDiv.dataset.equipId) {
      this.close();
      return;
    }
    
    this.close(); // Close any other popup

    let popup = document.createElement("div");
    popup.id = "equipmentInfoPopup";
    popup.className = "global-popup";
    popup.dataset.equipId = equipDiv.dataset.equipId;
    
    let html = `<div style="text-decoration:underline; font-weight:bold;">${item.name}</div>
                <div>Value: $${item.price}</div>`;
    
    if (item.topDiameter || item.bottomDiameter) {
      if (item.topDiameter) { html += `<div>Upper Diameter: ${item.topDiameter}</div>`; }
      if (item.bottomDiameter) { html += `<div>Lower Diameter: ${item.bottomDiameter}</div>`; }
    }
    popup.innerHTML = html;
    
    const removeBtn = document.createElement("button");
    removeBtn.className = "btn";
    removeBtn.textContent = "Remove";
    
    // Logic to disable remove button if it's not the last item in chain
    const index = GameStateManager.state.equipmentChain.findIndex(e => e.domId === equipDiv.dataset.equipId);
    const isTop = index === GameStateManager.state.equipmentChain.length - 1;
    removeBtn.disabled = !isTop;
    
    removeBtn.addEventListener("click", (e) => {
      // STOP PROPAGATION: Prevent the document listener from firing on a detached element
      e.stopPropagation();
      EquipmentManager.removeEquipment(equipDiv.dataset.equipId);
      UIManager.updateGearDisplay();
      this.close();
    });
    
    popup.appendChild(removeBtn);
    
    let rect = equipDiv.getBoundingClientRect();
    // Simple positioning logic
    popup.style.left = (rect.right + 5) + "px";
    popup.style.top = rect.top + "px";
    
    document.body.appendChild(popup);
    this.currentPopup = popup;
  }
};