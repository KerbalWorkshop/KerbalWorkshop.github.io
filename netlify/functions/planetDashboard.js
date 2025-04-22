// Placed in: [root]/netlify/functions/planetDashboard.js
const fetch = require("node-fetch");

// Static fallback data (SMA in AU)
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

  const bodies = "mercury,venus,mars,jupiter,saturn,uranus,neptune";
  const observerLat = 0;
  const observerLon = 0;
  const observerElev = 0;
  // Attempting standard API call structure
  const url = `https://api.astronomyapi.com/api/v2/bodies/positions?latitude=${observerLat}&longitude=${observerLon}&elevation=${observerElev}&from_date=${date}&to_date=${date}&time=${time}&bodies=${bodies}`;
  // NOTE: If 'fromObserver' is consistently missing, the API might require specific 'view' parameters, e.g., &view=distance,positions
  // Or the distance might be under a different field name entirely. The logging below aims to check this.

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
    // console.log("[Netlify Function] Raw data received:", JSON.stringify(data, null, 2)); // Full raw data if needed

    // --- Detailed Inspection & Optional Fallback ---
    if (data?.data?.table?.rows) {
        console.log("[Netlify Function] Inspecting distance data received from API...");
        data.data.table.rows.forEach(row => {
            const id = row.entry?.id?.toLowerCase();
            const cell = row.cells?.[0];
            if (!id || !cell) return;

            // *** ADDED LOGGING: Inspect the 'distance' object structure ***
            if (cell.distance) {
                 console.log(`[Netlify Function] Distance object for ${id}:`, JSON.stringify(cell.distance));
            } else {
                 console.log(`[Netlify Function] NO distance object found for ${id}.`);
            }
            // *** END ADDED LOGGING ***


            // Ensure distance object exists before attempting fallbacks
            if (!cell.distance) cell.distance = {};

            // Fallback for fromSun distance ONLY if missing
            if (!cell.distance.fromSun?.au && SMA[id]) {
                console.warn(`[Netlify Function] API missing 'fromSun.au' for ${id}. Adding SMA fallback: ${SMA[id]}`);
                // Ensure fromSun object exists before assigning
                if (!cell.distance.fromSun) cell.distance.fromSun = {};
                 cell.distance.fromSun.au = SMA[id];
            }

            // Check if fromObserver is present (client relies on this)
            if (!cell.distance.fromObserver?.au) {
                 console.warn(`[Netlify Function] API response LACKS 'fromObserver.au' for ${id}. Client must handle this.`);
            } else {
                 console.log(`[Netlify Function] API response INCLUDES 'fromObserver.au' for ${id}: ${cell.distance.fromObserver.au}`);
            }
        });
        console.log("[Netlify Function] Finished inspecting/enhancing distance data.");
    } else {
        console.warn("[Netlify Function] Expected data structure (data.data.table.rows) not found in API response.");
    }
    // --- End Inspection/Enhancement ---

    console.log("[Netlify Function] Processed request successfully. Sending 200 OK.");
    return {
      statusCode: 200,
      headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=240" // Cache for 4 minutes
        },
      body: JSON.stringify(data)
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