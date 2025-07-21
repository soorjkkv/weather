import { put, get } from '@vercel/blob';
import fetch from 'node-fetch';

const BLOB_NAME = 'weather-data';
const BLOB_EXPIRY_MINUTES = 2;
const LAT = '12.0750375';
const LON = '75.2727863';
const API_KEY = process.env.WEATHER_API_KEY;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

function getISTISOString() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istTime = new Date(utc + 5.5 * 60 * 60000);
  return istTime.toISOString().slice(0, 16);
}

export default async function handler(req, res) {
  try {
    // Try to return cached blob if it's recent
    try {
      const blobRes = await get(BLOB_NAME);
      const blobJson = await fetch(blobRes.url).then(res => res.json());

      const lastTime = new Date(blobJson.current_weather.time).getTime();
      const now = Date.now();
      const diffMinutes = (now - lastTime) / 60000;

      if (diffMinutes < BLOB_EXPIRY_MINUTES) {
        return res.status(200).json(blobJson);
      }
    } catch (e) {
      // No existing blob or failed fetch
    }

    // Fetch from OpenWeather API
    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&units=metric&appid=${API_KEY}`;
    const apiRes = await fetch(apiUrl);

    if (!apiRes.ok) {
      return res.status(500).json({ error: 'Failed to fetch weather data' });
    }

    const data = await apiRes.json();

    const istTimeString = getISTISOString();

    const structured = {
      current_weather: {
        temperature: Math.round((data.main.temp ?? 0) * 10) / 10,
        windspeed: Math.round((data.wind.speed ?? 0) * 10) / 10,
        winddirection: data.wind.deg ?? 0,
        is_day: (new Date().getHours() >= 6 && new Date().getHours() <= 18) ? 1 : 0,
        weathercode: data.weather?.[0]?.id ?? 0,
        time: istTimeString
      },
      hourly: {
        time: [istTimeString],
        relativehumidity_2m: [Math.round(data.main.humidity ?? 0)]
      }
    };

    // Save to blob storage (cache it)
    await put(BLOB_NAME, JSON.stringify(structured), {
      access: 'public',
      token: BLOB_TOKEN,
      allowOverwrite: true,
    });

    return res.status(200).json(structured);
  } catch (err) {
    console.error('Weather error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
