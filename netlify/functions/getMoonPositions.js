// File: netlify/functions/getMoonPositions.js
console.log("🏁 getMoonPositions handler start");

const fetch = require("node-fetch");

exports.handler = async (event, context) => {
  console.log("Received queryStringParameters:", event.queryStringParameters);

  const apiKey    = process.env.ASTRONOMY_API_KEY;
  const apiSecret = process.env.ASTRONOMY_API_SECRET;
  console.log("API_KEY loaded:", !!apiKey, "API_SECRET loaded:", !!apiSecret);
  const authHeader = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  const { lat, lon, start, end, step = "15" } = event.queryStringParameters || {};
  const latitude  = parseFloat(lat);
  const longitude = parseFloat(lon);
  const stepSec   = parseInt(step, 10);
  console.log("Parsed params:", { latitude, longitude, start, end, stepSec });

  if (isNaN(latitude) || isNaN(longitude) || !start || !end) {
    console.error("❌ Validation failed – required parameters missing or invalid");
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing/invalid lat, lon, start, or end" })
    };
  }

  // build timestamps array
  const times = [];
  let cur = new Date(start), last = new Date(end);
  while (cur <= last) {
    times.push(new Date(cur));
    cur = new Date(cur.getTime() + stepSec * 1000);
  }
  console.log(`Will fetch ${times.length} moon positions (every ${stepSec}s)`);

  // fetch moon at each timestamp
  const results = await Promise.all(times.map(async (d,i) => {
    const iso = d.toISOString();
    const dateStr = iso.split("T")[0];
    // only HH:mm:ss (no milliseconds) to satisfy API's "time" format
    const timeOnly = iso.split("T")[1].split("Z")[0].substring(0,8);
    const url = 
      `https://api.astronomyapi.com/api/v2/bodies/positions` +
      `?latitude=${latitude}&longitude=${longitude}&elevation=0` +
      `&from_date=${dateStr}&to_date=${dateStr}` +
      `&time=${timeOnly}&bodies=moon&output=table`;
    console.log(`[${i+1}/${times.length}] GET ${url}`);

    try {
      const res  = await fetch(url, {
        headers: { Authorization: authHeader, "Content-Type": "application/json" }
      });
      console.log(`   → HTTP ${res.status}`);
      const json = await res.json();
      console.log("   → raw JSON snippet:", JSON.stringify(json).slice(0,300));

      // navigate table.rows
      const rows = json.data?.table?.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        console.error("   → Unexpected JSON structure:", JSON.stringify(json).slice(0,300));
        return { time: iso, error: "Unexpected JSON structure", raw: json };
      }

      const cell = rows[0].cells?.[0];
      const hor  = cell?.position?.horizontal;
      if (!hor) {
        console.error("   → Missing horizontal coords:", JSON.stringify(cell).slice(0,200));
        return { time: iso, error: "Missing horizontal coords", cell };
      }

      const az  = parseFloat(hor.azimuth.degrees);
      const alt = parseFloat(hor.altitude.degrees);
      console.log(`   → Parsed: az=${az}°, alt=${alt}°`);
      return { time: iso, az, alt };

    } catch (e) {
      console.error(`   → Fetch error at ${iso}:`, e.message);
      return { time: iso, error: e.message };
    }
  }));

  console.log("✅ getMoonPositions complete");
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(results)
  };
};
