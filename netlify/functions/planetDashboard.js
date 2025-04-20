const fetch = require("node-fetch");

exports.handler = async () => {
  const key = process.env.ASTRONOMY_API_KEY;
  const sec = process.env.ASTRONOMY_API_SECRET;
  const auth = "Basic " + Buffer.from(`${key}:${sec}`).toString("base64");

  const now   = new Date();
  const date  = now.toISOString().split("T")[0];
  const time  = now.toISOString().split("T")[1].substring(0,8);

  const bodies = "mercury,venus,mars,jupiter,saturn,uranus,neptune";
  const url = `https://api.astronomyapi.com/api/v2/bodies/positions?latitude=0&longitude=0&elevation=0&from_date=${date}&to_date=${date}&time=${time}&bodies=${bodies}`;

  try{
    const r = await fetch(url,{method:"GET",headers:{Authorization:auth,"Content-Type":"application/json"}});
    if(!r.ok) throw new Error('AstronomyAPI '+r.status);
    const data = await r.json();

    /* guarantee heliocentric distance */
    const SMA={mercury:0.387,venus:0.723,mars:1.524,jupiter:5.203,saturn:9.537,uranus:19.191,neptune:30.068};
    (data?.data?.table?.rows||[]).forEach(row=>{
      const id=row.entry.name.toLowerCase();
      const cell=row.cells?.[0];if(!cell)return;
      if(!cell.distance.fromSun) cell.distance.fromSun={au:SMA[id]};
    });

    return {statusCode:200,headers:{"Content-Type":"application/json"},body:JSON.stringify(data)};
  }catch(e){
    return {statusCode:500,body:JSON.stringify({error:e.message})};
  }
};
