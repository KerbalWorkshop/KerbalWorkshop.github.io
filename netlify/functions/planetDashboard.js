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
  const observerLat = 0; // Using a geocentric observer for general data
  const observerLon = 0;
  const observerElev = 0;
  // Requesting positions and magnitudes.
  // The API's /positions endpoint should include magnitude data.
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
    // console.log("[Netlify Function] Raw data received:", JSON.stringify(data, null, 2));

    if (data?.data?.table?.rows) {
      console.log("[Netlify Function] Processing API data rows...");
      data.data.table.rows.forEach(row => {
        const id = row.entry?.id?.toLowerCase();
        const cell = row.cells?.[0];
        if (!id || !cell) return;

        // Ensure distance object exists if not provided by API
        if (!cell.distance) cell.distance = {};

        // Fallback for fromSun distance ONLY if missing
        if (!cell.distance.fromSun?.au && SMA[id]) {
          console.warn(`[Netlify Function] API missing 'fromSun.au' for ${id}. Adding SMA fallback: ${SMA[id]}`);
          if (!cell.distance.fromSun) cell.distance.fromSun = {};
          cell.distance.fromSun.au = SMA[id];
        }

        // Check if fromObserver (distance from Earth) is present
        if (!cell.distance.fromEarth?.au) { // Corrected from 'fromObserver' to 'fromEarth' based on typical API use
            // Note: AstronomyAPI might return distance from observer under `distance.fromEarth.au`
            // or similar. The client processes `distEarth`. If this field is different, adjust here.
            console.warn(`[Netlify Function] API response may lack 'distance.fromEarth.au' for ${id}.`);
        } else {
            console.log(`[Netlify Function] API response 'distance.fromEarth.au' for ${id}: ${cell.distance.fromEarth.au}`);
        }

        // Extract apparent magnitude
        // The API structure for magnitude is typically: cell.magnitudes[0].value where type is "apparent"
        if (cell.magnitudes && Array.isArray(cell.magnitudes) && cell.magnitudes.length > 0) {
            const apparentMagnitudeEntry = cell.magnitudes.find(m => m.type === 'apparent');
            if (apparentMagnitudeEntry && typeof apparentMagnitudeEntry.value === 'number') {
                cell.apparentMagnitude = apparentMagnitudeEntry.value; // Add it directly to the cell for easier client access
                console.log(`[Netlify Function] Apparent Magnitude for ${id}: ${cell.apparentMagnitude}`);
            } else {
                 // Fallback or log if not found or value is not a number
                const firstMag = cell.magnitudes[0];
                if (firstMag && typeof firstMag.value === 'number') {
                    cell.apparentMagnitude = firstMag.value;
                     console.warn(`[Netlify Function] Using first available magnitude for ${id} as apparent: ${cell.apparentMagnitude}`);
                } else {
                    console.warn(`[Netlify Function] No valid apparent magnitude found for ${id}. Magnitudes data:`, JSON.stringify(cell.magnitudes));
                }
            }
        } else {
          console.warn(`[Netlify Function] No 'magnitudes' array or it's empty for ${id}.`);
        }
      });
      console.log("[Netlify Function] Finished processing API data rows.");
    } else {
      console.warn("[Netlify Function] Expected data structure (data.data.table.rows) not found in API response.");
    }

    console.log("[Netlify Function] Processed request successfully. Sending 200 OK.");
    return {
      statusCode: 200,
      headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=240" // Cache for 4 minutes (240 seconds)
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