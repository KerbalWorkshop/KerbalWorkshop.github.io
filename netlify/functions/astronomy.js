// netlify/functions/astronomy.js
const fetch = require("node-fetch");

exports.handler = async (event, context) => {
  // Retrieve query parameters from the frontend if needed
  // e.g., ?latitude=0&longitude=0
  const { latitude = 0, longitude = 0, elevation = 0 } = event.queryStringParameters;
  
  // Use environment variables for secure API keys
  const apiKey = process.env.ASTRONOMY_API_KEY;
  const apiSecret = process.env.ASTRONOMY_API_SECRET;

  // Prepare the date/time strings
  const now = new Date();
  const dateString = now.toISOString().split("T")[0];
  const timeString = now.toISOString().split("T")[1].split("Z")[0].substring(0,8);

  const bodies = "sun,moon,mercury,venus,mars,jupiter,saturn,uranus,neptune,pluto";

  const url = `https://api.astronomyapi.com/api/v2/bodies/positions?latitude=${latitude}&longitude=${longitude}&elevation=${elevation}&from_date=${dateString}&to_date=${dateString}&time=${timeString}&bodies=${bodies}`;

  const authHeader = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: "Astronomy API request failed" })
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error", details: error.message })
    };
  }
};
