// File: netlify/functions/getMoonPositions.js
console.log("🏁 getMoonPositions handler start");

const fetch = require("node-fetch");

exports.handler = async (event, context) => {
  console.log("Event:", JSON.stringify(event.queryStringParameters, null, 2));

  const apiKey    = process.env.ASTRONOMY_API_KEY;
  const apiSecret = process.env.ASTRONOMY_API_SECRET;
  console.log("Loaded API creds:", !!apiKey, !!apiSecret);

  const authHeader = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  // parse
  const qs       = event.queryStringParameters || {};
  const lat      = parseFloat(qs.lat);
  const lon      = parseFloat(qs.lon);
  const start    = qs.start;
  const end      = qs.end;
  const step     = parseInt(qs.step || "15", 10);
  console.log(`Parsed params → lat:${lat}, lon:${lon}, start:${start}, end:${end}, step:${step}`);

  if (isNaN(lat) || isNaN(lon) || !start || !end) {
    console.error("❌ Validation failed");
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing/invalid lat, lon, start, or end" })
    };
  }

  // build timestamps
  let times = [];
  let cur   = new Date(start);
  const last= new Date(end);
  console.log("Building timestamps array");
  while (cur <= last) {
    times.push(new Date(cur));
    cur = new Date(cur.getTime() + step * 1000);
  }
  console.log(` → Generated ${times.length} timestamps from ${start} to ${end}`);

  // fetch for each
  const results = await Promise.all(times.map(async (d,i) => {
    const isoDate = d.toISOString();
    const [dateStr, timeStr] = isoDate.split("T");
    const timeOnly = timeStr.replace("Z","");
    const url = `https://api.astronomyapi.com/api/v2/bodies/positions`
      + `?latitude=${lat}&longitude=${lon}&elevation=0`
      + `&from_date=${dateStr}&to_date=${dateStr}`
      + `&time=${timeOnly}&bodies=moon`;
    console.log(`${i+1}/${times.length} → fetching Moon pos at ${isoDate}`);
    try {
      const res = await fetch(url, {
        headers: { Authorization: authHeader, "Content-Type": "application/json" }
      });
      console.log(`   → HTTP ${res.status}`);
      const json = await res.json();
      console.log("   → data snippet:", JSON.stringify(json.data?.table?.rows?.[0]?.cells?.[0]?.position).slice(0,100));
      const pos = json.data.table.rows[0].cells[0].position;
      return { time: isoDate, az: pos.azimuth.horizontal, alt: pos.altitude.horizontal };
    } catch (err) {
      console.error(`   → ERROR at ${isoDate}:`, err.message);
      return { time: isoDate, error: err.message };
    }
  }));

  console.log("All fetches done, returning results");
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(results)
  };
};
