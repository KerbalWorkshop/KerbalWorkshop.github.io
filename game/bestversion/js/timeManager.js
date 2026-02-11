const TimeManager = {
  intervalId: null,
  timeMultiplier: 1,
  start() {
    this.intervalId = setInterval(() => {
      GameStateManager.state.time.setMinutes(GameStateManager.state.time.getMinutes() + 5);
      UIManager.updateDisplays();
    }, 1000);
  },
  stop() {
    clearInterval(this.intervalId);
  },
  getSunriseSunset(date) {
    const start = new Date(date.getFullYear(), 0, 1);
    const oneDay = 1000 * 60 * 60 * 24;
    let dayOfYear = Math.floor((date - start) / oneDay) + 1;
    const amplitude = 3;
    const average = 12;
    const shift = 80.75;
    const dayLength = average + amplitude * Math.sin(2 * Math.PI * (dayOfYear - shift) / 365);
    const sunrise = 12 - dayLength / 2;
    const sunset  = 12 + dayLength / 2;
    return { sunrise, sunset, dayLength };
  }
};