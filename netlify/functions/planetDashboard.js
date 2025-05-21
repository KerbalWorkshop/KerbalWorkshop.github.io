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

  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const time = now.toISOString().split("T")[1].substring(0, 8);
  console.log(`[Netlify Func LOG] Using Date: ${date}, Time: ${time}`);

  const bodies = "mercury,venus,mars,jupiter,saturn,uranus,neptune";
  const observerLat = 0; 
  const observerLon = 0;
  const observerElev = 0;

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
        // The API nests the primary data for each body inside a 'cells' array, usually with one element.
        const cell = row.cells?.[0]; 
        
        if (!id || !cell) {
            console.warn(`[Netlify Func WARN] Skipping row due to missing id or cell data. Row: ${JSON.stringify(row)}`);
            return;
        }
        // console.log(`[Netlify Func LOG] Processing data for planet: ${id}. Cell data: ${JSON.stringify(cell)}`);


        // Ensure distance object exists - for client-side consistency
        // The original client code expects `cell.distance.fromEarth.au`
        if (!cell.distance) cell.distance = {};
        if (!cell.distance.fromEarth) cell.distance.fromEarth = { au: null, km: null }; 

        if (cell.distance.fromEarth?.au) {
            // console.log(`[Netlify Func LOG] ${id} - Distance from Earth (AU): ${cell.distance.fromEarth.au}`);
        } else {
            console.warn(`[Netlify Func WARN] ${id} - Missing distance.fromEarth.au data.`);
        }
        
        // Extract apparent magnitude from extraInfo as per sample
        // The original client code structure for liveApiData expects 'apparentMagnitude' directly on the cell.
        if (cell.extraInfo && (typeof cell.extraInfo.magnitude === 'string' || typeof cell.extraInfo.magnitude === 'number')) {
            const magValue = parseFloat(cell.extraInfo.magnitude);
            if (!isNaN(magValue)) {
                cell.apparentMagnitude = magValue; 
                // console.log(`[Netlify Func LOG] ${id} - Apparent Magnitude: ${cell.apparentMagnitude}`);
            } else {
                console.warn(`[Netlify Func WARN] ${id} - Could not parse magnitude: ${cell.extraInfo.magnitude}`);
                cell.apparentMagnitude = null;
            }
        } else {
          console.warn(`[Netlify Func WARN] ${id} - No 'extraInfo.magnitude' found or invalid type. extraInfo: ${JSON.stringify(cell.extraInfo)}`);
          cell.apparentMagnitude = null; 
        }
        
        // Pass current elongation if available, client might use it or ignore it for now
        if (cell.extraInfo && (typeof cell.extraInfo.elongation === 'string' || typeof cell.extraInfo.elongation === 'number')) {
            const elongValue = parseFloat(cell.extraInfo.elongation);
            if(!isNaN(elongValue)){
                cell.currentElongation = elongValue; // Add as new property
                // console.log(`[Netlify Func LOG] ${id} - Current Elongation: ${cell.currentElongation}`);
            }
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
          "Cache-Control": "public, max-age=240" 
        },
      body: JSON.stringify(data) 
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