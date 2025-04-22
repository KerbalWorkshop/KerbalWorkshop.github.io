// Placed in: [root]/netlify/functions/planetDashboard.js
const fetch = require("node-fetch");

exports.handler = async (event, context) => {
  console.log("[Netlify Function] Received request. Event path:", event.path);

  const key = process.env.ASTRONOMY_API_KEY;
  const sec = process.env.ASTRONOMY_API_SECRET;

  if (!key || !sec) {
    console.error("[Netlify Function] ERROR: Missing ASTRONOMY_API_KEY or ASTRONOMY_API_SECRET environment variables.");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server configuration error: API credentials missing." })
    };
  }

  // Create auth header - Log carefully!
  const authString = `${key}:${sec}`;
  const auth = "Basic " + Buffer.from(authString).toString("base64");
  console.log(`[Netlify Function] Generated Authorization header: Basic [${auth.length - 6} characters]`); // Avoid logging the actual base64 string

  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const time = now.toISOString().split("T")[1].substring(0, 8);
  console.log(`[Netlify Function] Using Date: ${date}, Time: ${time}`);

  const bodies = "mercury,venus,mars,jupiter,saturn,uranus,neptune"; // Earth is observer, usually not needed in 'bodies' unless specifically querying its heliocentric pos? Check API docs. Let's keep it simple for now.
  // API requires latitude/longitude/elevation for geocentric positions (fromObserver)
  // Let's use 0,0,0 for simplicity - assumes observer at Earth center for 'fromObserver' distance.
  const observerLat = 0;
  const observerLon = 0;
  const observerElev = 0;
  const url = `https://api.astronomyapi.com/api/v2/bodies/positions?latitude=${observerLat}&longitude=${observerLon}&elevation=${observerElev}&from_date=${date}&to_date=${date}&time=${time}&bodies=${bodies}`;

  console.log(`[Netlify Function] Requesting URL: ${url}`);

  try {
    console.log("[Netlify Function] Sending request to AstronomyAPI...");
    const apiResponse = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json" // Content-Type typically for POST/PUT, but doesn't hurt on GET
      }
    });

    console.log(`[Netlify Function] AstronomyAPI Response Status: ${apiResponse.status}`);
    // console.log("[Netlify Function] AstronomyAPI Response Headers:", JSON.stringify(Object.fromEntries(apiResponse.headers.entries()), null, 2)); // Can be verbose

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      console.error(`[Netlify Function] AstronomyAPI request failed! Status: ${apiResponse.status}. Body: ${errorBody}`);
      // Try to parse errorBody as JSON if possible, otherwise return raw text
      let errorJson = { message: errorBody };
      try { errorJson = JSON.parse(errorBody); } catch(e) { /* ignore parse error */ }
      throw new Error(`AstronomyAPI Error ${apiResponse.status}: ${errorJson.message || errorBody}`);
    }

    const data = await apiResponse.json();
    console.log("[Netlify Function] Raw data received from AstronomyAPI:", JSON.stringify(data, null, 2)); // Log the raw data

    // Fallback/Data Guarantee Logic (As before, but with logging)
    const SMA = {mercury:0.387, venus:0.723, mars:1.524, jupiter:5.203, saturn:9.537, uranus:19.191, neptune:30.068};
    console.log("[Netlify Function] Starting fallback check for missing fromSun distances.");
    let modified = false;
    if (data && data.data && data.data.table && data.data.table.rows) {
        data.data.table.rows.forEach(row => {
            // Use 'id' field which seems standard in v2 position response
            const id = row.entry?.id?.toLowerCase();
            const cell = row.cells?.[0];
            if (!id || !cell) {
                console.warn("[Netlify Function] Skipping row in fallback check due to missing id or cell:", row);
                return;
            }

            // Check if heliocentric distance ('fromSun') is missing or invalid
            if (!cell.distance?.fromSun?.au) {
                 if (SMA[id]) {
                    console.warn(`[Netlify Function] Missing 'fromSun.au' distance for ${id}. Applying fallback SMA value: ${SMA[id]}`);
                    // Ensure structure exists before assigning
                    if (!cell.distance) cell.distance = {};
                    if (!cell.distance.fromSun) cell.distance.fromSun = {};
                    cell.distance.fromSun.au = SMA[id];
                    modified = true;
                } else {
                    console.warn(`[Netlify Function] Missing 'fromSun.au' distance for ${id}, but no SMA fallback available.`);
                }
            }
             // Optionally check/log 'fromObserver' distance as well
            if (!cell.distance?.fromObserver?.au) {
                 console.warn(`[Netlify Function] Missing 'fromObserver.au' distance for ${id}. Client will need fallback.`);
            } else {
                 console.log(`[Netlify Function] Found 'fromObserver.au' for ${id}: ${cell.distance.fromObserver.au}`);
            }
        });
    } else {
         console.warn("[Netlify Function] Data structure for fallback check not found (data.data.table.rows missing).");
    }
    if (modified) {
        console.log("[Netlify Function] Data after applying fallbacks:", JSON.stringify(data, null, 2));
    } else {
         console.log("[Netlify Function] No fallback distances were applied.");
    }


    console.log("[Netlify Function] Successfully processed request. Sending 200 OK response.");
    return {
      statusCode: 200,
      headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300" // Cache for 5 minutes
        },
      body: JSON.stringify(data) // Send potentially modified data
    };

  } catch (e) {
    console.error("[Netlify Function] CRITICAL ERROR in handler:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message || "An internal server error occurred." })
    };
  }
};