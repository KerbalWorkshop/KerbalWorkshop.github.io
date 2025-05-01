// File: netlify/functions/getMoonPositions.js
console.log("🏁 getMoonPositions handler start");

const fetch = require("node-fetch");

exports.handler = async (event) => {
  console.log("Params:", event.queryStringParameters);
  const apiKey    = process.env.ASTRONOMY_API_KEY;
  const apiSecret = process.env.ASTRONOMY_API_SECRET;
  const authHeader= "Basic "+Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  console.log("Auth header:", authHeader.slice(0,10)+"…");

  const { lat, lon, start, end, step="15" } = event.queryStringParameters || {};
  const latitude  = parseFloat(lat), longitude = parseFloat(lon), stepSec = parseInt(step,10);
  console.log("Parsed:", { latitude, longitude, start, end, stepSec });
  if(isNaN(latitude)||isNaN(longitude)||!start||!end){
    console.error("❌ missing/invalid params");
    return { statusCode:400, body:JSON.stringify({error:"missing/invalid params"}) };
  }

  // build timestamps
  const times=[];
  for(let d=new Date(start); d<=new Date(end); d=new Date(d.getTime()+stepSec*1000)){
    times.push(new Date(d));
  }
  console.log("Will fetch timestamps:", times.map(d=>d.toISOString()));

  // fetch each
  const out = await Promise.all(times.map(async (d,i)=>{
    const iso = d.toISOString();
    const dateStr = iso.split("T")[0];
    const timeOnly= iso.split("T")[1].split("Z")[0].substring(0,8);
    const url = `https://api.astronomyapi.com/api/v2/bodies/positions`
              + `?latitude=${latitude}&longitude=${longitude}&elevation=0`
              + `&from_date=${dateStr}&to_date=${dateStr}`
              + `&time=${timeOnly}&bodies=moon&output=table`;
    console.log(`[${i+1}] FETCH → ${url}`);
    try {
      const res = await fetch(url, {
        headers:{ Authorization: authHeader }
      });
      console.log(`   ← HTTP ${res.status}`);
      // dump headers
      const hdrs = {};
      res.headers.forEach((v,k)=>hdrs[k]=v);
      console.log("   ← response headers:", JSON.stringify(hdrs));

      const text = await res.text();
      console.log("   ← raw body text (first 500 chars):", text.substring(0,500));
      let json;
      try { json = JSON.parse(text); }
      catch(e){
        console.error("   ✖ JSON.parse failed:", e.message);
        return { time:iso, error:"Invalid JSON", raw:text };
      }

      // now pick out az/alt
      const row = json.data?.table?.rows?.[0];
      if(!row){
        console.error("   ✖ no table.rows[0]", json);
        return { time:iso, error:"no rows", raw:json };
      }
      const cell = row.cells?.[0];
      const hor  = cell?.position?.horizontal;
      if(!hor){
        console.error("   ✖ missing horizontal", cell);
        return { time:iso, error:"missing horizontal", cell };
      }
      const az  = parseFloat(hor.azimuth.degrees);
      const alt = parseFloat(hor.altitude.degrees);
      console.log(`   ✔ parsed az=${az}°, alt=${alt}°`);
      return { time:iso, az, alt };
    } catch(e){
      console.error(`   ✖ fetch error @${iso}:`, e.message);
      return { time:iso, error:e.message };
    }
  }));

  console.log("✅ done getMoonPositions");
  return {
    statusCode:200,
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(out)
  };
};
