const GameStateManager = {
  state: {
    money: 2000, // Increased starting money for testing
    inventory: {},
    equipmentChain: [],
    time: new Date(2025, 0, 1),
    // Updated Shop Items with Physics Data
    shopItems: [
      // MOUNTS
      { 
        id: "mount1", type: "mount", name: "Orion Sirius EQ-G", price: 1200, 
        weight: 15, weightCapacity: 13, trackingAccuracy: 1.0, // Baseline tracking arcsec
        topDiameter: null, bottomDiameter: null 
      },
      { 
        id: "mount2", type: "mount", name: "Celestron Advanced VX", price: 900, 
        weight: 12, weightCapacity: 14, trackingAccuracy: 1.2, 
        topDiameter: null, bottomDiameter: null 
      },
      { 
        id: "mount3", type: "mount", name: "Sky-Watcher EQ6-R Pro", price: 1600, 
        weight: 25, weightCapacity: 20, trackingAccuracy: 0.6, 
        topDiameter: null, bottomDiameter: null 
      },

      // OPTICAL TUBES (SCOPES)
      { 
        id: "scope1", type: "scope", name: "Orion SkyQuest XT8", price: 400, 
        weight: 9, aperture: 203, focalLength: 1200, 
        topDiameter: "1.25", bottomDiameter: null 
      },
      { 
        id: "scope2", type: "scope", name: "Meade LX90 8\"", price: 1200, 
        weight: 14, aperture: 203, focalLength: 2000, 
        topDiameter: "2", bottomDiameter: null 
      },
      { 
        id: "scope3", type: "scope", name: "RedCat 51", price: 800, 
        weight: 2.5, aperture: 51, focalLength: 250, 
        topDiameter: "1.25", bottomDiameter: null 
      },

      // CAMERAS
      { 
        id: "camera1", type: "camera", name: "ZWO ASI120MM Mini", price: 150, 
        weight: 0.1, sensorWidth: 4.8, sensorHeight: 3.6, pixelSize: 3.75, 
        resolutionX: 1280, resolutionY: 960, quantumEfficiency: 0.75, quality: 1.0,
        topDiameter: null, bottomDiameter: "1.25" 
      },
      { 
        id: "camera2", type: "camera", name: "ZWO ASI1600MM Pro", price: 1200, 
        weight: 0.4, sensorWidth: 17.7, sensorHeight: 13.4, pixelSize: 3.8, 
        resolutionX: 4656, resolutionY: 3520, quantumEfficiency: 0.60, quality: 2.5,
        topDiameter: null, bottomDiameter: "1.25" 
      },
      { 
        id: "camera3", type: "camera", name: "QHY600M Pro", price: 4000, 
        weight: 0.8, sensorWidth: 36, sensorHeight: 24, pixelSize: 3.76, 
        resolutionX: 9576, resolutionY: 6388, quantumEfficiency: 0.87, quality: 5.0,
        topDiameter: null, bottomDiameter: "2" 
      },

      // BARLOWS & MODIFIERS
      { 
        id: "barlow1", type: "barlow", name: "2x Barlow Lens", price: 50, 
        weight: 0.2, magnification: 2.0, 
        topDiameter: "1.25", bottomDiameter: "1.25" 
      },
      { 
        id: "reducer1", type: "barlow", name: "0.63x Reducer", price: 120, 
        weight: 0.3, magnification: 0.63, 
        topDiameter: "2", bottomDiameter: "2" 
      }
    ]
  },
  getTotalCount(itemId) {
    const stored = this.state.inventory[itemId]?.count || 0;
    const placed = this.state.equipmentChain.filter(x => x.item.id === itemId).length;
    return stored + placed;
  },
  purchaseItem(item) {
    if (this.state.money >= item.price) {
      this.state.money -= item.price;
      if (!this.state.inventory[item.id]) {
        this.state.inventory[item.id] = { item: item, count: 0 };
      }
      this.state.inventory[item.id].count++;
      return true;
    }
    return false;
  },
  sellItem(item) {
    if (this.state.inventory[item.id]?.count > 0) {
      this.state.inventory[item.id].count--;
      this.state.money += item.price;
      return true;
    }
    return false;
  }
};