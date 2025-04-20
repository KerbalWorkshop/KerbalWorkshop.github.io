/**
 * planetDashboard.js – dedicated endpoint for the dashboard page.
 * Returns distance.fromEarth.au (live) and distance.fromSun.au (SMA fallback).
 */
const fetch = require("node-fetch");

exports.handler = async () => {
  const apiKey    = process.env.ASTRONOMY_API_KEY;
  const apiSecret = process.env.ASTRONOMY_API_SECRET;
  const auth      = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  const now       = new Date();
  const dateStr   = now.toISOString().split("T")[0];
  const timeStr   = now.toISOString().split("T")[1].substring(0,8);

  const bodies    = "mercury,venus,mars,jupiter,saturn,uranus,neptune";
  const url       = `https://api.astronomyapi.com/api/v2/bodies/positions?latitude=0&longitude=0&elevation=0&from_date=${dateStr}&to_date=${dateStr}&time=${timeStr}&bodies=${bodies}`;

  try{
    const resp = await fetch(url,{ method:"GET", headers:{ Authorization:auth,"Content-Type":"application/json"}});
    if(!resp.ok) throw new Error('AstronomyAPI '+resp.status);
    const data = await resp.json();

    /* mean SMA fallback for heliocentric */
    const SMA = { mercury:0.387, venus:0.723, mars:1.524, jupiter:5.203, saturn:9.537, uranus:19.191, neptune:30.068 };
    (data?.data?.table?.rows || []).forEach(r=>{
      const id = r.entry.name.toLowerCase();
      r.entry.distance.fromSun = { au: SMA[id] };
    });

    return { statusCode:200, headers:{ "Content-Type":"application/json" }, body:JSON.stringify(data) };
  }catch(err){
    return { statusCode:500, body:JSON.stringify({ error:err.message }) };
  }
};
