// File: netlify/functions/getFlightPaths.js
console.log("🏁 getFlightPaths handler start");

const fetch = require("node-fetch");

exports.handler = async (event) => {
  console.log("Params:", event.queryStringParameters);
  const apiKey    = process.env.FR24_API_KEY;
  const apiSecret = process.env.FR24_API_SECRET;
  const authHeader= "Basic "+Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  console.log("Auth header:", authHeader.slice(0,10)+"…");

  const { lat, lon, start, end, step="15", radiusKm="50" } = event.queryStringParameters||{};
  const latitude=parseFloat(lat), longitude=parseFloat(lon),
        stepSec=parseInt(step,10), radius=parseFloat(radiusKm);
  console.log("Parsed:",{ latitude,longitude,start,end,stepSec,radius });
  if(isNaN(latitude)||isNaN(longitude)||!start||!end){
    console.error("❌ missing/invalid params");
    return { statusCode:400, body:JSON.stringify({error:"missing/invalid params"}) };
  }

  // bounding box
  const delta=radius/111;
  const [minLat,maxLat]=[latitude-delta,latitude+delta];
  const [minLon,maxLon]=[longitude-delta,longitude+delta];
  console.log("BBox:",{minLat,maxLat,minLon,maxLon});

  // list flights IDs
  const ids=new Set();
  for(let d=new Date(start); d<=new Date(end); d=new Date(d.getTime()+stepSec*1000)){
    const ts=Math.floor(d.getTime()/1000);
    const url=`https://api.flightradar24.com/common/v1/flight/list.json`
            +`?bounds=${minLat},${minLon},${maxLat},${maxLon}&timestamp=${ts}`;
    console.log("FETCH list →",url);
    try {
      const res=await fetch(url,{headers:{Authorization:authHeader}});
      console.log("   ← HTTP",res.status);
      const text=await res.text();
      console.log("   ← raw text:",text.substring(0,500));
      let json=JSON.parse(text);
      const arr=json.data?.result?.response?.data||json.data?.result?.data||json.data||[];
      console.log("   → found flight objects:",arr.length);
      arr.forEach(f=>f.identification?.id && ids.add(f.identification.id));
    } catch(e){
      console.error("   ✖ error listing flights:",e.message);
    }
  }
  console.log("Unique IDs:",[...ids]);

  // fetch each flight history
  const flights=[];
  for(let id of ids){
    const url=`https://api.flightradar24.com/flight/v1/data/full/${id}`
            +`?flight_datetime_from=${start}&flight_datetime_to=${end}`;
    console.log("FETCH history →",url);
    try {
      const res=await fetch(url,{headers:{Authorization:authHeader}});
      console.log("   ← HTTP",res.status);
      const text=await res.text();
      console.log("   ← raw text:",text.substring(0,500));
      const json=JSON.parse(text);
      const raw=json.data?.track?.positions||json.positions||[];
      console.log("   → raw positions:",raw.length);

      const sampled=raw.filter(p=>{
        const t0=new Date(p.time);
        return t0>=new Date(start) && t0<=new Date(end);
      }).map(p=>({
        time:new Date(p.time).toISOString(),
        latitude:p.latitude,longitude:p.longitude,altitude:p.altitude
      }));
      console.log("   → sampled:",sampled.length);
      flights.push({id,positions:sampled});
    } catch(e){
      console.error(`   ✖ error history ${id}:`,e.message);
    }
  }

  console.log("✅ done getFlightPaths");
  return {
    statusCode:200,
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({flights})
  };
};
