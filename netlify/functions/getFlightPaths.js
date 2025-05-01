// File: netlify/functions/getFlightPaths.js
console.log("🏁 getFlightPaths handler start");

const fetch = require("node-fetch");

exports.handler = async (event, context) => {
  console.log("Event params:", JSON.stringify(event.queryStringParameters, null, 2));
  const apiKey    = process.env.FR24_API_KEY;
  const apiSecret = process.env.FR24_API_SECRET;
  console.log("Loaded FR24 creds:", !!apiKey, !!apiSecret);
  const authHeader= "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  const qs       = event.queryStringParameters || {};
  const lat      = parseFloat(qs.lat);
  const lon      = parseFloat(qs.lon);
  const startISO = qs.start;
  const endISO   = qs.end;
  const stepSec  = parseInt(qs.step  || "15", 10);
  const radiusKm = parseFloat(qs.radiusKm || "50");
  console.log(`Parsed params → lat:${lat}, lon:${lon}, start:${startISO}, end:${endISO}, step:${stepSec}, radiusKm:${radiusKm}`);

  if (isNaN(lat) || isNaN(lon) || !startISO || !endISO) {
    console.error("❌ Validation failed");
    return { statusCode: 400, body: JSON.stringify({ error: "Need lat, lon, start, end" }) };
  }

  // bounding box
  const delta = radiusKm / 111;
  const minLat= lat - delta, maxLat = lat + delta;
  const minLon= lon - delta, maxLon = lon + delta;
  console.log(`Bounding box → lat:[${minLat},${maxLat}], lon:[${minLon},${maxLon}]`);

  // collect flight IDs
  const flightIds = new Set();
  let tCur = new Date(startISO), tEnd = new Date(endISO), count=0;
  while (tCur <= tEnd) {
    count++;
    const ts = Math.floor(tCur.getTime()/1000);
    const listUrl = `https://api.flightradar24.com/common/v1/flight/list.json`
      + `?bounds=${minLat},${minLon},${maxLat},${maxLon}&timestamp=${ts}`;
    console.log(`(${count}) fetching flights-in-area @ ${new Date(ts*1000).toISOString()}`);
    try {
      const res = await fetch(listUrl, { headers:{ Authorization: authHeader } });
      console.log(`   → HTTP ${res.status}`);
      const js  = await res.json();
      const arr = js.data?.result?.response?.data || [];
      console.log(`   → found ${arr.length} flights`);
      arr.forEach(f => {
        const id = f.identification?.id;
        if (id) flightIds.add(id);
      });
    } catch (err) {
      console.error("   → ERROR in flights-in-area:", err.message);
    }
    tCur = new Date(tCur.getTime() + stepSec * 1000);
  }
  console.log(`Collected ${flightIds.size} unique flight IDs`);

  // fetch histories
  const flights = [];
  for (let id of flightIds) {
    console.log(`Fetching history for flight ID: ${id}`);
    try {
      const histUrl = `https://api.flightradar24.com/flight/v1/data/full/${id}`
                    + `?flight_datetime_from=${startISO}&flight_datetime_to=${endISO}`;
      console.log("   → URL:", histUrl);
      const res = await fetch(histUrl, { headers:{ Authorization: authHeader } });
      console.log(`   → HTTP ${res.status}`);
      const js  = await res.json();
      const positions = js.data?.track?.positions || [];
      console.log(`   → total positions: ${positions.length}`);
      const sampled = positions.map(p => ({
        time:     new Date(p.time).toISOString(),
        latitude: p.latitude,
        longitude:p.longitude,
        altitude: p.altitude
      }));
      flights.push({ id, callsign: js.data.identification?.callsign || "", positions: sampled });
    } catch (err) {
      console.error(`   → ERROR fetching history for ${id}:`, err.message);
    }
  }
  console.log(`Returning ${flights.length} flight histories`);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flights })
  };
};
