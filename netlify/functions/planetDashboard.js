// Placed in: [root]/netlify/functions/planetDashboard.js
const fetch = require("node-fetch");

// Static fallback data (SMA in AU) - useful if API fails or lacks data points
const SMA = {mercury:0.387, venus:0.723, mars:1.524, jupiter:5.203, saturn:9.537, uranus:19.191, neptune:30.068};

exports.handler = async (event, context) => {
  console.log("[Netlify Function] Handler invoked.");

  const key = process.env.ASTRONOMY_API_KEY;
  const sec = process.env.ASTRONOMY_API_SECRET;

  if (!key || !sec) {
    console.error("[Netlify Function] ERROR: Missing API credentials environment variables.");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server configuration error: API credentials missing." })
    };
  }

  const authString = `${key}:${sec}`;
  const auth = "Basic " + Buffer.from(authString).toString("base64");
  console.log("[Netlify Function] Auth header generated.");

  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const time = now.toISOString().split("T")[1].substring(0, 8);
  console.log(`[Netlify Function] Using Date: ${date}, Time: ${time}`);

  // Request positions for these bodies relative to observer at 0,0,0
  const bodies = "mercury,venus,mars,jupiter,saturn,uranus,neptune";
  const observerLat = 0;
  const observerLon = 0;
  const observerElev = 0;
  const url = `https://api.astronomyapi.com/api/v2/bodies/positions?latitude=${observerLat}&longitude=${observerLon}&elevation=${observerElev}&from_date=${date}&to_date=${date}&time=${time}&bodies=${bodies}`;

  console.log(`[Netlify Function] Requesting URL: ${url}`);

  try {
    console.log("[Netlify Function] Sending request to AstronomyAPI...");
    const apiResponse = await fetch(url, {
      method: "GET",
      headers: { Authorization: auth }
    });

    console.log(`[Netlify Function] AstronomyAPI Response Status: ${apiResponse.status}`);

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      console.error(`[Netlify Function] AstronomyAPI request failed! Status: ${apiResponse.status}. Body: ${errorBody}`);
      throw new Error(`AstronomyAPI Error ${apiResponse.status}: ${errorBody}`);
    }

    const data = await apiResponse.json();
    // console.log("[Netlify Function] Raw data received:", JSON.stringify(data, null, 2)); // Log raw data if needed for deep debug

    // --- Optional: Enhance data with fallbacks ONLY if API data is missing ---
    // This ensures the client gets *something* even if the API glitches,
    // but client logic dictates whether to USE the fallback (SMA) or live data.
    if (data?.data?.table?.rows) {
      data.data.table.rows.forEach(row => {
        const id = row.entry?.id?.toLowerCase();
        const cell = row.cells?.[0];
        if (!id || !cell) return;

        // Ensure distance object exists
        if (!cell.distance) cell.distance = {};

        // Fallback for fromSun distance if missing
        if (!cell.distance.fromSun?.au && SMA[id]) {
          console.warn(`[Netlify Function] API missing 'fromSun.au' for ${id}. Adding SMA fallback: ${SMA[id]}`);
          cell.distance.fromSun = { au: SMA[id] };
        }
         // Fallback for fromObserver distance IS NOT ADDED HERE
         // If fromObserver is missing, the client modes relying on it will fail gracefully or show error
         if (!cell.distance.fromObserver?.au) {
             console.warn(`[Netlify Function] API missing 'fromObserver.au' for ${id}. Client must handle this.`);
         }
      });
    }
    // --- End Optional Enhancement ---

    console.log("[Netlify Function] Processed request successfully. Sending 200 OK.");
    return {
      statusCode: 200,
      headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=240" // Cache for 4 minutes (slightly less than client refresh)
        },
      body: JSON.stringify(data) // Send raw (or lightly enhanced) data
    };

  } catch (e) {
    console.error("[Netlify Function] CRITICAL ERROR:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message || "An internal server error occurred." })
    };
  }
};