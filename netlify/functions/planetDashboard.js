// Placed in: [root]/netlify/functions/planetDashboard.js
const fetch = require("node-fetch");

// Helper to get date strings
function getFormattedDate(dateObj) {
    return dateObj.toISOString().split("T")[0];
}
function getFormattedTime(dateObj) {
    return dateObj.toISOString().split("T")[1].substring(0, 8);
}

// Helper to process rows (for both current and forecast, slightly adapted)
function processApiRows(rows, forForecast = false) {
    if (!rows) {
        console.warn(`[Netlify Func WARN] processApiRows received null or undefined rows.`);
        return [];
    }
    console.log(`[Netlify Func LOG] processApiRows: Processing ${rows.length} rows. Forecast mode: ${forForecast}`);
    rows.forEach(row => {
        const id = row.entry?.id?.toLowerCase();
        const cell = row.cells?.[0]; // Most detailed data is usually in the first cell for /positions

        if (!id || !cell) {
            console.warn(`[Netlify Func WARN] Skipping row in processApiRows due to missing id or cell. Row: ${JSON.stringify(row)}`);
            return;
        }

        // Ensure distance object for fromEarth exists for client compatibility (primarily for current day data)
        if (!forForecast) { // Current day data needs more thorough structure for client
             if (!cell.distance) cell.distance = {};
             if (!cell.distance.fromEarth) cell.distance.fromEarth = { au: null, km: null };
        }

        // Extract apparent magnitude
        if (cell.extraInfo && (typeof cell.extraInfo.magnitude === 'string' || typeof cell.extraInfo.magnitude === 'number')) {
            const magValue = parseFloat(cell.extraInfo.magnitude);
            if (!isNaN(magValue)) {
                cell.apparentMagnitude = magValue;
                // console.log(`[Netlify Func LOG] ${id} - Mag: ${cell.apparentMagnitude}`);
            } else {
                console.warn(`[Netlify Func WARN] ${id} - Could not parse magnitude: ${cell.extraInfo.magnitude}`);
                cell.apparentMagnitude = null;
            }
        } else {
          // console.warn(`[Netlify Func WARN] ${id} - No 'extraInfo.magnitude'. extraInfo: ${JSON.stringify(cell.extraInfo)}`);
          cell.apparentMagnitude = null; 
        }
        
        // Extract current elongation for current day data (if client uses it)
        // For forecast, client will calculate elongation from RA/Dec of planet and Sun
        if (cell.extraInfo && (typeof cell.extraInfo.elongation === 'string' || typeof cell.extraInfo.elongation === 'number')) {
            const elongValue = parseFloat(cell.extraInfo.elongation);
            if(!isNaN(elongValue)){
                cell.currentElongation = elongValue;
            }
        }
        // Key data for forecast: RA/Dec for elongation calculation
        // The 'cell.position.equatorial' structure should be directly usable by client.
        // No further processing of RA/Dec needed here for the forecast.
    });
    return rows; // Return modified rows
}


exports.handler = async (event, context) => {
  console.log("[Netlify Func LOG] PlanetDashboard multi-call handler invoked.");

  const key = process.env.ASTRONOMY_API_KEY;
  const sec = process.env.ASTRONOMY_API_SECRET;

  if (!key || !sec) {
    console.error("[Netlify Func ERROR] Missing API credentials.");
    return { statusCode: 500, body: JSON.stringify({ error: "Server config error" })};
  }
  const auth = "Basic " + Buffer.from(`${key}:${sec}`).toString("base64");

  const observerLat = 0; const observerLon = 0; const observerElev = 0;
  const today = new Date();
  const todayDateStr = getFormattedDate(today);
  const currentTimeStr = getFormattedTime(today);

  let currentDayDataResult = null;
  let forecastDataResult = null;
  let errors = [];

  // --- Call 1: Current Day Data ---
  const currentBodies = "mercury,venus,mars,jupiter,saturn,uranus,neptune"; // Original set for current day
  const currentDayUrl = `https://api.astronomyapi.com/api/v2/bodies/positions?latitude=${observerLat}&longitude=${observerLon}&elevation=${observerElev}&from_date=${todayDateStr}&to_date=${todayDateStr}&time=${currentTimeStr}&bodies=${currentBodies}`;
  console.log(`[Netlify Func LOG] Current Day URL: ${currentDayUrl}`);

  try {
    const currentResponse = await fetch(currentDayUrl, { headers: { Authorization: auth } });
    console.log(`[Netlify Func LOG] Current Day API Status: ${currentResponse.status}`);
    if (!currentResponse.ok) {
      const errorBody = await currentResponse.text();
      console.error(`[Netlify Func ERROR] Current Day API request failed: ${errorBody}`);
      errors.push(`Current Day API Error ${currentResponse.status}: ${errorBody.substring(0,100)}`);
    } else {
      currentDayDataResult = await currentResponse.json();
      // Process to add apparentMagnitude directly to cells for client
      if (currentDayDataResult?.data?.table?.rows) {
        currentDayDataResult.data.table.rows = processApiRows(currentDayDataResult.data.table.rows, false);
      }
    }
  } catch (e) {
    console.error("[Netlify Func CRITICAL ERROR] Fetching current day data:", e);
    errors.push(`Workspaceing current day data failed: ${e.message}`);
  }

  // --- Call 2: Forecast Data for Observability (Next 365 days) ---
  const forecastBodies = "sun,mercury,venus,mars,jupiter,saturn,uranus,neptune"; // Sun needed for elongation
  const tomorrow = new Date(today); // Start forecast from today or tomorrow
  tomorrow.setDate(today.getDate()); // Start forecast from today
  const fromDateForecastStr = getFormattedDate(tomorrow);
  
  const futureDate = new Date(tomorrow);
  futureDate.setDate(tomorrow.getDate() + 364); // 365 days total (day 0 to day 364)
  const toDateForecastStr = getFormattedDate(futureDate);
  console.log(`[Netlify Func LOG] Forecast Range: ${fromDateForecastStr} to ${toDateForecastStr}`);

  // For the forecast, we want data at a consistent time, e.g., midnight or a specific local evening time.
  // Using 00:00:00 UTC for simplicity, or adjust to a local evening time in UTC.
  const forecastTimeStr = "12:00:00"; // Mid-day UTC, adjust as needed

  const forecastUrl = `https://api.astronomyapi.com/api/v2/bodies/positions?latitude=${observerLat}&longitude=${observerLon}&elevation=${observerElev}&from_date=${fromDateForecastStr}&to_date=${toDateForecastStr}&time=${forecastTimeStr}&bodies=${forecastBodies}`;
  console.log(`[Netlify Func LOG] Forecast URL: ${forecastUrl.substring(0,200)}...`); // Keep log shorter

  try {
    const forecastResponse = await fetch(forecastUrl, { headers: { Authorization: auth } });
    console.log(`[Netlify Func LOG] Forecast API Status: ${forecastResponse.status}`);
    if (!forecastResponse.ok) {
      const errorBody = await forecastResponse.text();
      console.error(`[Netlify Func ERROR] Forecast API request failed: ${errorBody}`);
      errors.push(`Forecast API Error ${forecastResponse.status}: ${errorBody.substring(0,100)}`);
    } else {
      const rawForecastData = await forecastResponse.json();
      // The forecast data comes as a table with one row per body, and `cells` array contains daily data.
      // We need to restructure this for easier client consumption.
      // Expected structure: { sun: [dailyData], mercury: [dailyData], ... }
      // where dailyData is { date, magnitude, position: { equatorial: {ra, dec} } }
      forecastDataResult = {};
      if (rawForecastData?.data?.table?.rows) {
        rawForecastData.data.table.rows.forEach(row => {
          const planetId = row.entry?.id?.toLowerCase();
          if (planetId && row.cells) {
            forecastDataResult[planetId] = row.cells.map(dailyCell => {
              // For each day's cell, extract needed info
              let magnitude = null;
              if (dailyCell.extraInfo && (typeof dailyCell.extraInfo.magnitude === 'string' || typeof dailyCell.extraInfo.magnitude === 'number')) {
                  const magVal = parseFloat(dailyCell.extraInfo.magnitude);
                  if (!isNaN(magVal)) magnitude = magVal;
              }
              return {
                date: dailyCell.date, // API should provide date for each cell in range
                magnitude: magnitude,
                // Pass the whole position object, client will extract raRad/decRad
                position: dailyCell.position 
              };
            });
          }
        });
        console.log(`[Netlify Func LOG] Processed forecast data for ${Object.keys(forecastDataResult).length} bodies.`);
      } else {
        console.warn("[Netlify Func WARN] Forecast data structure not as expected.");
        errors.push("Forecast data structure issue.");
      }
    }
  } catch (e) {
    console.error("[Netlify Func CRITICAL ERROR] Fetching forecast data:", e);
    errors.push(`Workspaceing forecast data failed: ${e.message}`);
  }

  if (!currentDayDataResult && !forecastDataResult && errors.length > 0) {
    // If both calls failed completely
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to fetch any planetary data.", details: errors })};
  }
  
  // Return combined data
  // Client will parse currentDayDataResult.data.table.rows for SIZE/DISTANCE
  // And currentDayDataResult.observabilityForecast for IN THE SKY
  const responseBody = {
    ...(currentDayDataResult || {}), // Spread current day data (maintains original structure like "data", "table", "rows")
    observabilityForecast: forecastDataResult || {} // Add new key for forecast
  };
  if(errors.length > 0) responseBody.partialError = errors.join('; ');


  console.log("[Netlify Func LOG] Sending combined response to client.");
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=240" },
    body: JSON.stringify(responseBody)
  };
};