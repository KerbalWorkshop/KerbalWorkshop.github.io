const UIManager = {
  components: {
    moneyDisplay: document.getElementById("moneyDisplay"),
    timeDisplay: document.getElementById("timeDisplay"),
    shopContent: document.getElementById("shopContent"),
    gearContent: document.getElementById("gearContent")
  },
  updateDisplays() {
    // Re-fetch elements if missing (in case script runs before DOM is fully ready, though script order handles this)
    if(!this.components.moneyDisplay) this.components.moneyDisplay = document.getElementById("moneyDisplay");
    
    this.components.moneyDisplay.textContent = "Money: $" + GameStateManager.state.money;
    let t = GameStateManager.state.time;
    const timeStr = t.getFullYear() + "-" + String(t.getMonth()+1).padStart(2, '0') + "-" + String(t.getDate()).padStart(2, '0') +
                    " " + String(t.getHours()).padStart(2, '0') + ":" + String(t.getMinutes()).padStart(2, '0');
    this.components.timeDisplay.textContent = "Time: " + timeStr;
    this.updateDayNightStyle();
  },
  updateDayNightStyle() {
    const body = document.body;
    const { sunrise, sunset } = TimeManager.getSunriseSunset(GameStateManager.state.time);
    const currentHour = GameStateManager.state.time.getHours() + GameStateManager.state.time.getMinutes()/60;
    if (currentHour >= sunrise && currentHour < sunset) {
      body.classList.add("day-mode");
      body.classList.remove("night-mode");
      document.getElementById("dayNightStatus").innerText = "Day";
      const btn = document.getElementById("beginSessionBtn");
      btn.disabled = true;
      btn.style.backgroundColor = "grey";
      btn.title = "Begin session available at night only.";
      btn.style.cursor = "not-allowed";
    } else {
      body.classList.add("night-mode");
      body.classList.remove("day-mode");
      document.getElementById("dayNightStatus").innerText = "Night";
      const btn = document.getElementById("beginSessionBtn");
      btn.disabled = false;
      btn.style.backgroundColor = "green";
      btn.title = "";
      btn.style.cursor = "pointer";
    }
  },
  createItemCardHTML(item, totalCount, mode) {
    let html = `<div class="item-card" data-item-id="${item.id}">`;
    html += `<span class="item-name">${item.name}</span>`;
    if (mode === "shop") {
      html += `<div class="divider"></div><span class="item-price">$${item.price}</span>`;
    }
    html += `<div class="divider"></div>`;
    html += `<button class="btn info-btn" data-item-id="${item.id}">i</button>`;
    if (mode === "shop") {
      html += `<div class="divider"></div>`;
      html += `<button class="btn buy-btn" data-item-id="${item.id}" ${GameStateManager.state.money < item.price ? "disabled title='Insufficient funds.'" : ""}>Buy</button>`;
    } else if (mode === "inventory") {
      html += `<div class="divider"></div>`;
      html += `<button class="btn sell-btn" data-item-id="${item.id}" ${ (GameStateManager.state.inventory[item.id]?.count || 0) <= 0 ? "disabled title='Cannot sell: item is in use.'" : ""}>Sell</button>`;
    }
    html += `<span class="item-count">${totalCount > 0 ? totalCount + "x" : ""}</span>`;
    html += `</div>`;
    return html;
  },
  generateShopContent() {
    const shopContent = this.components.shopContent || document.getElementById("shopContent");
    shopContent.innerHTML = "";
    const groups = {};
    GameStateManager.state.shopItems.forEach(item => {
      if (!groups[item.type]) groups[item.type] = [];
      groups[item.type].push(item);
    });
    for (const type in groups) {
      const section = document.createElement("div");
      section.className = "shop-section";
      const header = document.createElement("h3");
      header.innerText = type.charAt(0).toUpperCase() + type.slice(1);
      section.appendChild(header);
      groups[type].forEach(item => {
        let totalCount = GameStateManager.getTotalCount(item.id);
        const cardHTML = this.createItemCardHTML(item, totalCount, "shop");
        let cardContainer = document.createElement("div");
        cardContainer.innerHTML = cardHTML;
        section.appendChild(cardContainer.firstChild);
      });
      shopContent.appendChild(section);
    }
  },
  updateGearDisplay() {
    const gearContent = this.components.gearContent || document.getElementById("gearContent");
    gearContent.innerHTML = "";
    GameStateManager.state.shopItems.forEach(item => {
      let stored = GameStateManager.state.inventory[item.id]?.count || 0;
      if (stored > 0) {
        let totalCount = GameStateManager.getTotalCount(item.id);
        const cardHTML = this.createItemCardHTML(item, totalCount, "inventory");
        let cardContainer = document.createElement("div");
        cardContainer.innerHTML = cardHTML;
        gearContent.appendChild(cardContainer.firstChild);
      }
    });
  },
  createButton(label, options) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.innerText = label;
    if (options && options.onClick) {
      btn.addEventListener("click", options.onClick);
    }
    return btn;
  }
};