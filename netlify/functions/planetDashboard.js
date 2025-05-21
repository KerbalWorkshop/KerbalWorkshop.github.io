// Placed in: [root]/netlify/functions/planetDashboard.js
const fetch = require("node-fetch");

// Static fallback data (SMA in AU) - Not directly used for magnitude/elongation but kept for consistency
const SMA = {mercury:0.387, venus:0.723, mars:1.524, jupiter:5.203, saturn:9.537, uranus:19.191, neptune:30.068};

exports.handler = async (event, context) => {
  console.log("[Netlify Func LOG] PlanetDashboard handler invoked.");

  const key = process.env.ASTRONOMY_API_KEY;
  const sec = process.env.ASTRONOMY_API_SECRET;

  if (!key || !sec) {
    console.error("[Netlify Func ERROR] Missing API credentials environment variables.");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server configuration error: API credentials missing." })
    };
  }

  const authString = `${key}:${sec}`;
  const auth = "Basic " + Buffer.from(authString).toString("base64");
  // console.log("[Netlify Func LOG] Auth header generated."); // Keep concise unless debugging auth

  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const time = now.toISOString().split("T")[1].substring(0, 8);
  console.log(`[Netlify Func LOG] Using Date: ${date}, Time: ${time}`);

  const bodies = "mercury,venus,mars,jupiter,saturn,uranus,neptune";
  const observerLat = 0; // Geocentric for general ephemeris
  const observerLon = 0;
  const observerElev = 0;

  // The /api/v2/bodies/positions endpoint should provide distance, position, and extraInfo (like magnitude)
  // For elongation, it's usually calculated or obtained from a more detailed ephemeris service for future dates.
  // This call is for CURRENT data.
  const url = `https://api.astronomyapi.com/api/v2/bodies/positions?latitude=${observerLat}&longitude=${observerLon}&elevation=${observerElev}&from_date=${date}&to_date=${date}&time=${time}&bodies=${bodies}`;

  console.log(`[Netlify Func LOG] Requesting URL: ${url}`);

  try {
    console.log("[Netlify Func LOG] Sending request to AstronomyAPI...");
    const apiResponse = await fetch(url, {
      method: "GET",
      headers: { Authorization: auth }
    });

    console.log(`[Netlify Func LOG] AstronomyAPI Response Status: ${apiResponse.status}`);

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      console.error(`[Netlify Func ERROR] AstronomyAPI request failed! Status: ${apiResponse.status}. Body: ${errorBody}`);
      // It's good to return the actual error body to the client for debugging if appropriate
      return {
        statusCode: apiResponse.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: `AstronomyAPI Error ${apiResponse.status}: ${errorBody}` })
      };
    }

    const data = await apiResponse.json();
    // For deep debugging:
    // console.log("[Netlify Func LOG] Raw data received:", JSON.stringify(data, null, 2));

    if (data?.data?.table?.rows) {
      console.log("[Netlify Func LOG] Processing API data rows...");
      data.data.table.rows.forEach(row => {
        const id = row.entry?.id?.toLowerCase();
        const cell = row.cells?.[0]; // API returns data for each body in a 'cells' array, usually with one item.
        
        if (!id || !cell) {
            console.warn(`[Netlify Func WARN] Skipping row due to missing id or cell data. Row: ${JSON.stringify(row)}`);
            return;
        }
        console.log(`[Netlify Func LOG] Processing data for planet: ${id}`);

        // Ensure distance object exists - for client-side consistency
        if (!cell.distance) cell.distance = {};
        if (!cell.distance.fromEarth) cell.distance.fromEarth = { au: null, km: null }; // Ensure structure

        // Log distance from Earth if present
        if (cell.distance.fromEarth?.au) {
            console.log(`[Netlify Func LOG] ${id} - Distance from Earth (AU): ${cell.distance.fromEarth.au}`);
        } else {
            console.warn(`[Netlify Func WARN] ${id} - Missing distance.fromEarth.au data.`);
        }

        // Extract apparent magnitude from extraInfo as per sample
        if (cell.extraInfo && typeof cell.extraInfo.magnitude === 'string') { // API sends magnitude as string
            const magValue = parseFloat(cell.extraInfo.magnitude);
            if (!isNaN(magValue)) {
                cell.apparentMagnitude = magValue; // Add it directly to the cell for easier client access
                console.log(`[Netlify Func LOG] ${id} - Apparent Magnitude: ${cell.apparentMagnitude} (parsed from string)`);
            } else {
                console.warn(`[Netlify Func WARN] ${id} - Could not parse magnitude string: ${cell.extraInfo.magnitude}`);
                cell.apparentMagnitude = null;
            }
        } else if (cell.extraInfo && typeof cell.extraInfo.magnitude === 'number') { // If API sends as number
             cell.apparentMagnitude = cell.extraInfo.magnitude;
             console.log(`[Netlify Func LOG] ${id} - Apparent Magnitude: ${cell.apparentMagnitude} (as number)`);
        } else {
          console.warn(`[Netlify Func WARN] ${id} - No 'extraInfo.magnitude' found or invalid type. extraInfo: ${JSON.stringify(cell.extraInfo)}`);
          cell.apparentMagnitude = null; // Ensure property exists for client
        }
        
        // Elongation is also in extraInfo - can be passed similarly if needed by client for *current* day
        if (cell.extraInfo && typeof cell.extraInfo.elongation === 'string') {
            const elongValue = parseFloat(cell.extraInfo.elongation);
            if(!isNaN(elongValue)){
                cell.currentElongation = elongValue;
                console.log(`[Netlify Func LOG] ${id} - Current Elongation: ${cell.currentElongation}`);
            }
        }

        // Position data logging (example)
        if (cell.position?.equatorial?.rightAscension?.hours) {
            // console.log(`[Netlify Func LOG] ${id} - RA (hours): ${cell.position.equatorial.rightAscension.hours}`);
        } else {
            // console.warn(`[Netlify Func WARN] ${id} - Missing RA data.`);
        }
      });
      console.log("[Netlify Func LOG] Finished processing API data rows.");
    } else {
      console.warn("[Netlify Func WARN] Expected data structure (data.data.table.rows) not found in API response.");
    }

    console.log("[Netlify Func LOG] Processed request successfully. Sending 200 OK.");
    return {
      statusCode: 200,
      headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=240" // Cache for 4 minutes
        },
      body: JSON.stringify(data) // Send the (potentially modified) data back
    };

  } catch (e) {
    console.error("[Netlify Func CRITICAL ERROR]", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message || "An internal server error occurred while fetching planetary data." })
    };
  }
};