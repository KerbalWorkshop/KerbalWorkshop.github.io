// File: netlify/functions/getMoonPositions.js
console.log("🏁 getMoonPositions handler start");

const fetch = require("node-fetch");

exports.handler = async (event, context) => {
  console.log("Received queryStringParameters:", event.queryStringParameters);

  const { ASTRONOMY_API_KEY: apiKey, ASTRONOMY_API_SECRET: apiSecret } = process.env;
  console.log("API_KEY present:", !!apiKey, "API_SECRET present:", !!apiSecret);
  const authHeader = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  const { lat, lon, start, end, step = "15" } = event.queryStringParameters || {};
  const latitude  = parseFloat(lat);
  const longitude = parseFloat(lon);
  const stepSec   = parseInt(step, 10);
  console.log("Parsed params:", { latitude, longitude, start, end, stepSec });

  if (isNaN(latitude) || isNaN(longitude) || !start || !end) {
    console.error("❌ Validation failed – missing or invalid params");
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing or invalid lat, lon, start, or end" })
    };
  }

  // Build array of timestamps
  const times = [];
  let cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    times.push(new Date(cur));
    cur = new Date(cur.getTime() + stepSec * 1000);
  }
  console.log(`Will fetch ${times.length} Moon positions (every ${stepSec}s)`);

  // Fetch Moon position at each timestamp
  const results = await Promise.all(times.map(async (d, i) => {
    const iso = d.toISOString();
    const [dateStr, timeStrWithZ] = iso.split("T");
    const timeOnly = timeStrWithZ.replace("Z", "");
    const url = `https://api.astronomyapi.com/api/v2/bodies/positions`
              + `?latitude=${latitude}&longitude=${longitude}&elevation=0`
              + `&from_date=${dateStr}&to_date=${dateStr}`
              + `&time=${timeOnly}&bodies=moon`;
    console.log(`[${i+1}/${times.length}] Fetching Moon @ ${iso}`);
    console.log("   → URL:", url);

    try {
      const res  = await fetch(url, {
        headers: { Authorization: authHeader, "Content-Type": "application/json" }
      });
      console.log(`   → HTTP status ${res.status}`);
      const json = await res.json();
      console.log("   → Raw JSON snippet:", JSON.stringify(json).slice(0, 300));

      // Validate structure
      if (!json.data || !json.data.table || !Array.isArray(json.data.table.rows) || json.data.table.rows.length === 0) {
        console.error("   → Unexpected JSON shape:", JSON.stringify(json).slice(0, 300));
        return { time: iso, error: "Unexpected JSON structure", raw: json };
      }

      const cell = json.data.table.rows[0].cells?.[0];
      if (!cell || !cell.position || !cell.position.horizontal) {
        console.error("   → Missing position.horizontal:", JSON.stringify(cell).slice(0, 200));
        return { time: iso, error: "Missing position.horizontal", cell };
      }

      const { horizontal } = cell.position;
      const az  = horizontal.azimuth?.degrees;
      const alt = horizontal.altitude?.degrees;
      console.log(`   → Parsed coords: az=${az}°, alt=${alt}°`);

      return { time: iso, az, alt };
    } catch (e) {
      console.error(`   → Fetch error at ${iso}:`, e.message);
      return { time: iso, error: e.message };
    }
  }));

  console.log("✅ getMoonPositions complete, returning results");
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(results)
  };
};
