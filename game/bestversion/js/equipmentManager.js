const EquipmentManager = {
  addEquipment(item, plusElement) {
    if (plusElement) plusElement.remove();
    if (GameStateManager.state.inventory[item.id]) {
      GameStateManager.state.inventory[item.id].count--;
    }
    UIManager.updateGearDisplay();
    // Create a new equipment object with a unique domId.
    const newEquipment = {
      item: item,
      domId: "equip-" + Date.now() + "-" + Math.random().toString(36).substr(2,5),
      plusElement: null,
      domElement: null
    };
    // Create DOM element for the equipment.
    const equipDiv = document.createElement("div");
    equipDiv.className = "setup-equipment";
    equipDiv.innerText = item.name;
    equipDiv.dataset.equipId = newEquipment.domId;
    let posX, posY;
    if (GameStateManager.state.equipmentChain.length === 0) {
      posX = 50; posY = 50;
    } else {
      let lastEquipment = GameStateManager.state.equipmentChain[GameStateManager.state.equipmentChain.length - 1];
      let parentRect = lastEquipment.domElement.getBoundingClientRect();
      let containerRect = document.getElementById("leftSide").getBoundingClientRect();
      posX = ((parentRect.left + parentRect.width/2) - containerRect.left) / containerRect.width * 100;
      posY = (((parentRect.top) - containerRect.top) / containerRect.height * 100) - 10;
    }
    equipDiv.style.left = posX + "%";
    equipDiv.style.top = posY + "%";
    equipDiv.style.transform = "translate(-50%, -50%)";
    
    // Clicking on the equipment toggles its info popup.
    equipDiv.addEventListener("click", (e) => {
      // STOP PROPAGATION: Don't let this click hit the document listener
      e.stopPropagation();
      PopupManager.showEquipmentInfoPopup(e, item, equipDiv);
    });
    
    document.getElementById("leftSide").appendChild(equipDiv);
    newEquipment.domElement = equipDiv;
    GameStateManager.state.equipmentChain.push(newEquipment);
    EquipmentManager.updatePlusButtons();
    return newEquipment;
  },
  
  removeEquipment(domId) {
    const index = GameStateManager.state.equipmentChain.findIndex(e => e.domId === domId);
    if (index !== -1) {
      let removed = GameStateManager.state.equipmentChain.splice(index, 1)[0];
      if (GameStateManager.state.inventory[removed.item.id]) {
        GameStateManager.state.inventory[removed.item.id].count++;
      } else {
        GameStateManager.state.inventory[removed.item.id] = { item: removed.item, count: 1 };
      }
      if (removed.domElement) removed.domElement.remove();
      if (removed.plusElement) removed.plusElement.remove();
      UIManager.updateGearDisplay();
      EquipmentManager.updatePlusButtons();
    }
  },
  
  updatePlusButtons() {
    const leftSide = document.getElementById("leftSide");
    // Remove existing plus buttons.
    const existingPluses = leftSide.querySelectorAll(".plus-btn");
    existingPluses.forEach(btn => btn.remove());
    
    if (GameStateManager.state.equipmentChain.length === 0) {
      EquipmentManager.createInitialPlus();
    } else {
      const last = GameStateManager.state.equipmentChain[GameStateManager.state.equipmentChain.length - 1];
      const criteria = EquipmentManager.getAllowedChildCriteria(last.item);
      if (criteria.allowedTypes.length > 0) {
        const newPlus = document.createElement("button");
        newPlus.innerText = "+";
        newPlus.className = "btn plus-btn";
        newPlus.style.position = "absolute";
        let equipRect = last.domElement.getBoundingClientRect();
        let containerRect = document.getElementById("leftSide").getBoundingClientRect();
        let newX = ((equipRect.left + equipRect.width/2) - containerRect.left) / containerRect.width * 100;
        let newY = (((equipRect.top) - containerRect.top) / containerRect.height * 100) - 10;
        newPlus.style.left = newX + "%";
        newPlus.style.top = newY + "%";
        newPlus.style.transform = "translate(-50%, -50%)";
        
        newPlus.addEventListener("click", (e) => {
          // STOP PROPAGATION: Don't let this click hit the document listener
          e.stopPropagation();
          
          // Toggle behavior: if a popup is open, close it; otherwise, open the plus popup.
          // Note: Since we stopped propagation, the global closer won't run, so we manage logic here.
          if (PopupManager.currentPopup) {
            // If the current popup is this button's popup, close it.
            if(PopupManager.currentPopup.dataset.origin === newPlus.dataset.plusId) {
               PopupManager.close();
            } else {
               // If it's a different popup, close old one and open new one
               EquipmentManager.handlePlusClick(newPlus, last.item);
            }
          } else {
            EquipmentManager.handlePlusClick(newPlus, last.item);
          }
        });
        
        leftSide.appendChild(newPlus);
        last.plusElement = newPlus;
      }
    }
  },
  
  createInitialPlus() {
    const leftSide = document.getElementById("leftSide");
    if (GameStateManager.state.equipmentChain.length === 0 && !leftSide.querySelector("#setupPlusBtn")) {
      let plusBtn = document.createElement("button");
      plusBtn.id = "setupPlusBtn";
      plusBtn.innerText = "+";
      plusBtn.className = "btn plus-btn";
      plusBtn.style.position = "absolute";
      plusBtn.style.left = "50%";
      plusBtn.style.top = "50%";
      plusBtn.style.transform = "translate(-50%, -50%)";
      
      plusBtn.addEventListener("click", (e) => {
        // STOP PROPAGATION
        e.stopPropagation();
        
        if (PopupManager.currentPopup) {
             if(PopupManager.currentPopup.dataset.origin === plusBtn.dataset.plusId) {
               PopupManager.close();
            } else {
               EquipmentManager.handlePlusClick(plusBtn, null);
            }
        } else {
          EquipmentManager.handlePlusClick(plusBtn, null);
        }
      });
      
      leftSide.appendChild(plusBtn);
    }
  },
  
  getAllowedChildCriteria(parentEquipment) {
    if (!parentEquipment) {
      return { allowedTypes: ["mount"], requiredBottom: null };
    }
    if (parentEquipment.type === "mount") {
      return { allowedTypes: ["scope"], requiredBottom: null };
    }
    if (parentEquipment.type === "scope" || parentEquipment.type === "barlow") {
      return { allowedTypes: ["collimator", "barlow", "camera"], requiredBottom: parentEquipment.topDiameter };
    }
    return { allowedTypes: [], requiredBottom: null };
  },
  
  handlePlusClick(plusElement, parentEquipment) {
    // Note: We handled the toggle logic in the event listener above. 
    // This function now strictly OPENS the popup.
    
    plusElement.dataset.plusId = plusElement.dataset.plusId || "plus-" + Math.random().toString(36).substr(2,5);
    let criteria = EquipmentManager.getAllowedChildCriteria(parentEquipment);
    let compatible = [];
    for (let id in GameStateManager.state.inventory) {
      const inv = GameStateManager.state.inventory[id];
      if (inv.count > 0 && criteria.allowedTypes.includes(inv.item.type)) {
        if (criteria.requiredBottom && inv.item.bottomDiameter !== criteria.requiredBottom) continue;
        compatible.push(inv.item);
      }
    }
    const leftSide = document.getElementById("leftSide");
    let rect = plusElement.getBoundingClientRect();
    let containerRect = leftSide.getBoundingClientRect();
    let position = {
      left: (rect.right - containerRect.left + 5) + "px",
      top: (rect.top - containerRect.top) + "px"
    };
    
    let content = "";
    if (compatible.length === 0) {
      content = "<div>No compatible equipment in inventory.</div>";
    } else {
      compatible.forEach(item => {
        let count = GameStateManager.state.inventory[item.id] ? GameStateManager.state.inventory[item.id].count : 0;
        content += UIManager.createItemCardHTML(item, count, "setup");
      });
    }
    
    PopupManager.show("setupSelection", content, position, plusElement.dataset.plusId);
    
    // Add click listeners to the new cards inside the popup
    if (compatible.length > 0) {
      let popup = PopupManager.currentPopup;
      if (popup) {
        popup.querySelectorAll(".item-card").forEach(card => {
          card.addEventListener("click", (e) => {
            e.stopPropagation(); // Stop propagation here too!
            const itemId = card.getAttribute("data-item-id");
            const item = GameStateManager.state.shopItems.find(i => i.id === itemId);
            if (item) {
              EquipmentManager.addEquipment(item, plusElement);
              PopupManager.close();
            }
          });
        });
      }
    }
  }
};