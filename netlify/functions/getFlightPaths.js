// File: netlify/functions/getFlightPaths.js
console.log("🏁 getFlightPaths handler start");

const fetch = require("node-fetch");

exports.handler = async (event, context) => {
  console.log("Received queryStringParameters:", event.queryStringParameters);

  const apiKey    = process.env.FR24_API_KEY;
  const apiSecret = process.env.FR24_API_SECRET;
  console.log("FR24_API_KEY loaded:", !!apiKey, "FR24_API_SECRET loaded:", !!apiSecret);
  const authHeader= "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  const { lat, lon, start, end, step = "15", radiusKm = "50" } = event.queryStringParameters || {};
  const latitude  = parseFloat(lat);
  const longitude = parseFloat(lon);
  const stepSec   = parseInt(step, 10);
  const radius    = parseFloat(radiusKm);
  console.log("Parsed params:", { latitude, longitude, start, end, stepSec, radius });

  if (isNaN(latitude)||isNaN(longitude)||!start||!end) {
    console.error("❌ Validation failed – need lat, lon, start, end");
    return { statusCode: 400, body: JSON.stringify({ error:"Missing/invalid params" }) };
  }

  const delta = radius / 111;
  const minLat = latitude - delta, maxLat = latitude + delta;
  const minLon = longitude- delta, maxLon = longitude+ delta;
  console.log("Computed bounding box:", { minLat, maxLat, minLon, maxLon });

  const flightIds = new Set();
  let t = new Date(start), tEnd = new Date(end), snap=0;
  while (t <= tEnd) {
    snap++;
    const ts = Math.floor(t.getTime()/1000);
    const listUrl = 
      `https://api.flightradar24.com/common/v1/flight/list.json` +
      `?bounds=${minLat},${minLon},${maxLat},${maxLon}&timestamp=${ts}`;
    console.log(`[${snap}] GET flights-in-area @ ${new Date(ts*1000).toISOString()}`);
    console.log("   → URL:", listUrl);

    try {
      const res = await fetch(listUrl, { headers:{ Authorization: authHeader } });
      console.log("   → HTTP",res.status);
      const js  = await res.json();
      console.log("   → raw snippet:", JSON.stringify(js).slice(0,300));

      const arr = js.data?.result?.response?.data || js.data?.result?.data || js.data || [];
      console.log("   → flights-in-area array length:", Array.isArray(arr)?arr.length:0);
      Array.isArray(arr)&&arr.forEach(f=>{
        const id = f.identification?.id;
        if (id) flightIds.add(id);
      });
    } catch (e) {
      console.error("   → Error listing flights:", e.message);
    }
    t = new Date(t.getTime() + stepSec * 1000);
  }
  console.log("Unique flight IDs collected:", flightIds.size);

  const flights = [];
  for (let id of flightIds) {
    console.log("Fetching history for flight ID:", id);
    const histUrl = 
      `https://api.flightradar24.com/flight/v1/data/full/${id}` +
      `?flight_datetime_from=${start}&flight_datetime_to=${end}`;
    console.log("   → URL:", histUrl);

    try {
      const res = await fetch(histUrl, { headers:{ Authorization: authHeader } });
      console.log("   → HTTP",res.status);
      const js  = await res.json();
      console.log("   → raw snippet:", JSON.stringify(js).slice(0,300));

      const rawPositions = js.data?.track?.positions || js.positions || [];
      console.log("   → rawPositions count:", rawPositions.length);
      const sampled = rawPositions
        .filter(p => {
          const t0 = new Date(p.time);
          return t0 >= new Date(start) && t0 <= new Date(end);
        })
        .map(p=>({
          time: new Date(p.time).toISOString(),
          latitude: p.latitude, longitude: p.longitude, altitude: p.altitude
        }));
      console.log("   → sampled positions:", sampled.length);

      flights.push({
        id,
        callsign: js.data?.identification?.callsign || js.callsign || "",
        positions: sampled
      });
    } catch (e) {
      console.error(`   → Error for ${id}:`, e.message);
    }
  }

  console.log("✅ getFlightPaths complete – returning", flights.length, "flights");
  return {
    statusCode: 200,
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ flights })
  };
};
