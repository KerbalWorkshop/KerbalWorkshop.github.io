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
    // console.log(`[Netlify Func LOG] processApiRows: Processing ${rows.length} rows. Forecast mode: ${forForecast}`);
    rows.forEach(row => {
        const id = row.entry?.id?.toLowerCase();
        const cell = row.cells?.[0]; 
        
        if (!id || !cell) {
            console.warn(`[Netlify Func WARN] Skipping row in processApiRows due to missing id or cell. Row: ${JSON.stringify(row)}`);
            return;
        }

        if (!forForecast) { 
             if (!cell.distance) cell.distance = {};
             if (!cell.distance.fromEarth) cell.distance.fromEarth = { au: null, km: null };
        }

        if (cell.extraInfo && (typeof cell.extraInfo.magnitude === 'string' || typeof cell.extraInfo.magnitude === 'number')) {
            const magValue = parseFloat(cell.extraInfo.magnitude);
            if (!isNaN(magValue)) {
                cell.apparentMagnitude = magValue;
            } else {
                // console.warn(`[Netlify Func WARN] ${id} - Could not parse magnitude: ${cell.extraInfo.magnitude}`);
                cell.apparentMagnitude = null;
            }
        } else {
          cell.apparentMagnitude = null; 
        }
        
        if (cell.extraInfo && (typeof cell.extraInfo.elongation === 'string' || typeof cell.extraInfo.elongation === 'number')) {
            const elongValue = parseFloat(cell.extraInfo.elongation);
            if(!isNaN(elongValue)){
                cell.currentElongation = elongValue;
            }
        }
    });
    return rows; 
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
  const currentBodies = "mercury,venus,mars,jupiter,saturn,uranus,neptune"; 
  const currentDayUrl = `https://api.astronomyapi.com/api/v2/bodies/positions?latitude=${observerLat}&longitude=${observerLon}&elevation=${observerElev}&from_date=${todayDateStr}&to_date=${todayDateStr}&time=${currentTimeStr}&bodies=${currentBodies}`;
  console.log(`[Netlify Func LOG] Current Day URL: ${currentDayUrl}`);

  try {
    const currentResponse = await fetch(currentDayUrl, { headers: { Authorization: auth } });
    console.log(`[Netlify Func LOG] Current Day API Status: ${currentResponse.status}`);
    if (!currentResponse.ok) {
      const errorBody = await currentResponse.text();
      console.error(`[Netlify Func ERROR] Current Day API request failed: ${errorBody.substring(0, 500)}`);
      errors.push(`Current Day API Error ${currentResponse.status}`);
    } else {
      currentDayDataResult = await currentResponse.json();
      // This will be the `rawData` on client. Client expects to parse `rawData.data.table.rows`
      // We need to ensure apparentMagnitude is added to the cells within this structure.
      if (currentDayDataResult?.data?.table?.rows) {
        // The processApiRows function modifies the rows in place.
        processApiRows(currentDayDataResult.data.table.rows, false);
        console.log("[Netlify Func LOG] Current day data processed and magnitudes added to cells.");
      } else {
        console.warn("[Netlify Func WARN] Current day data structure unexpected:", currentDayDataResult);
      }
    }
  } catch (e) {
    console.error("[Netlify Func CRITICAL ERROR] Fetching current day data:", e);
    errors.push(`Workspaceing current day data failed: ${e.message}`);
  }

  // --- Call 2: Forecast Data for Observability (Next 365 days) ---
  const forecastBodies = "sun,mercury,venus,mars,jupiter,saturn,uranus,neptune"; 
  const fromDateForecast = new Date(today); // Start forecast from today
  const fromDateForecastStr = getFormattedDate(fromDateForecast);
  
  const toDateForecast = new Date(fromDateForecast);
  toDateForecast.setDate(fromDateForecast.getDate() + 364); // 365 days total
  const toDateForecastStr = getFormattedDate(toDateForecast);
  console.log(`[Netlify Func LOG] Forecast Range: ${fromDateForecastStr} to ${toDateForecastStr}`);
  const forecastTimeStr = "12:00:00"; // Mid-day UTC

  const forecastUrl = `https://api.astronomyapi.com/api/v2/bodies/positions?latitude=${observerLat}&longitude=${observerLon}&elevation=${observerElev}&from_date=${fromDateForecastStr}&to_date=${toDateForecastStr}&time=${forecastTimeStr}&bodies=${forecastBodies}`;
  // console.log(`[Netlify Func LOG] Forecast URL: ${forecastUrl.substring(0,200)}...`);

  try {
    const forecastResponse = await fetch(forecastUrl, { headers: { Authorization: auth } });
    console.log(`[Netlify Func LOG] Forecast API Status: ${forecastResponse.status}`);
    if (!forecastResponse.ok) {
      const errorBody = await forecastResponse.text();
      console.error(`[Netlify Func ERROR] Forecast API request failed: ${errorBody.substring(0,500)}`);
      errors.push(`Forecast API Error ${forecastResponse.status}`);
    } else {
      const rawForecastDataFromApi = await forecastResponse.json();
      forecastDataResult = {}; // This will hold the structured forecast data
      if (rawForecastDataFromApi?.data?.table?.rows) {
        rawForecastDataFromApi.data.table.rows.forEach(row => {
          const planetId = row.entry?.id?.toLowerCase();
          if (planetId && row.cells) {
            // The 'cells' array from API for a date range contains one entry per day.
            // We process these cells to extract only what's needed.
            forecastDataResult[planetId] = row.cells.map(dailyCell => {
              let magnitude = null;
              if (dailyCell.extraInfo && (typeof dailyCell.extraInfo.magnitude === 'string' || typeof dailyCell.extraInfo.magnitude === 'number')) {
                  const magVal = parseFloat(dailyCell.extraInfo.magnitude);
                  if (!isNaN(magVal)) magnitude = magVal;
              }
              return {
                date: dailyCell.date, 
                magnitude: magnitude,
                position: dailyCell.position // Pass the whole position object
              };
            });
          }
        });
        console.log(`[Netlify Func LOG] Processed forecast data for ${Object.keys(forecastDataResult).length} bodies.`);
      } else {
        console.warn("[Netlify Func WARN] Forecast data structure not as expected in API response.");
        errors.push("Forecast data structure issue from API.");
      }
    }
  } catch (e) {
    console.error("[Netlify Func CRITICAL ERROR] Fetching forecast data:", e);
    errors.push(`Workspaceing forecast data failed: ${e.message}`);
  }

  const responseBody = {
    // The `currentDayDataResult` IS the original full response structure for the current day.
    // Client's original parsing `rawData.data.table.rows` will work on this.
    ...(currentDayDataResult || { data: { table: { rows: []}} }), // Ensure `data.table.rows` exists
    observabilityForecast: forecastDataResult || {} // Add new key for structured forecast
  };
  if(errors.length > 0) responseBody.partialError = errors.join('; ');

  console.log("[Netlify Func LOG] Sending combined response to client.");
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=240" },
    body: JSON.stringify(responseBody)
  };
};