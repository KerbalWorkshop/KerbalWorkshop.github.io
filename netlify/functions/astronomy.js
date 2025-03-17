/**
 * This Netlify function serves TWO purposes:
 * 1) Ephemeris data (the original code for your live map).
 * 2) Star chart images (for the quiz), triggered by `ra` and `dec` query params.
 *
 * If `ra` & `dec` are provided in the query string, we call the "Star Chart" endpoint.
 * Otherwise, we return the original ephemeris data.
 */

const fetch = require("node-fetch");

exports.handler = async (event, context) => {
  // Common authentication
  const apiKey = process.env.ASTRONOMY_API_KEY;
  const apiSecret = process.env.ASTRONOMY_API_SECRET;
  const authHeader = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  // Parse query params
  const queryParams = event.queryStringParameters || {};
  const raParam = queryParams.ra;
  const decParam = queryParams.dec;

  // Current date/time for both calls
  const now = new Date();
  const dateString = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const timeString = now.toISOString().split("T")[1].split("Z")[0].substring(0, 8); // HH:MM:SS

  try {
    // 1) If RA/DEC are given, return a STAR CHART
    if (raParam !== undefined && decParam !== undefined) {
      const ra = parseFloat(raParam);
      const dec = parseFloat(decParam);

      // Call Astronomy API's "Studio / Star Chart" endpoint
      const starChartUrl = "https://api.astronomyapi.com/api/v2/studio/star-chart";
      // You can customize style or zoom below as you wish:
      const requestBody = {
        style: "inverted",
        observer: {
          latitude: 0,
          longitude: 0,
          date: dateString,
          time: timeString
        },
        view: {
          type: "area",
          parameters: {
            position: {
              equatorial: {
                rightAscension: ra,
                declination: dec
              }
            },
            zoom: 2
          }
        }
      };

      const starChartResponse = await fetch(starChartUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      if (!starChartResponse.ok) {
        return {
          statusCode: starChartResponse.status,
          body: JSON.stringify({ error: "Star Chart request failed" })
        };
      }

      const starChartData = await starChartResponse.json();
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(starChartData)
      };
    }

    // 2) Otherwise, return the original EPHEMERIS data
    const bodies = "sun,moon,mercury,venus,mars,jupiter,saturn,uranus,neptune,pluto";
    const latitude = 0,
      longitude = 0,
      elevation = 0;
    const ephemerisUrl = `https://api.astronomyapi.com/api/v2/bodies/positions?latitude=${latitude}&longitude=${longitude}&elevation=${elevation}&from_date=${dateString}&to_date=${dateString}&time=${timeString}&bodies=${bodies}`;

    const response = await fetch(ephemerisUrl, {
      method: "GET",
      headers: {
        Authorization: authHeader,
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
      body: JSON.stringify({ error: error.message })
    };
  }
};
