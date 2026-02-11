const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Future rendering logic goes here
  requestAnimationFrame(render);
}

// Start the loop
render();