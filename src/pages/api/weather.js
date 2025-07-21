import { put, get } from '@vercel/blob';
import fetch from 'node-fetch';

const BLOB_NAME = 'weather-data';
const BLOB_EXPIRY_MINUTES = 2;
const LAT = '12.0750375';
const LON = '75.2727863';
const API_KEY = process.env.WEATHER_API_KEY;

export default async function handler(req, res) {
  try {
    try {
      const blobRes = await get(BLOB_NAME);
      const blobJson = await fetch(blobRes.url).then(res => res.json());
      const lastTime = new Date(blobJson.current_weather.time).getTime();
      const now = Date.now();
      const diffMinutes = (now - lastTime) / 60000;

      if (diffMinutes < BLOB_EXPIRY_MINUTES) {
        return res.status(200).json(blobJson);
      }
    } catch {
      // No blob or failed to parse – continue to fetch
    }

    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&units=metric&appid=${API_KEY}`;
    const apiRes = await fetch(apiUrl);

    if (!apiRes.ok) {
      return res.status(500).json({ error: 'Failed to fetch weather data' });
    }

    const data = await apiRes.json();

    const structured = {
      current_weather: {
        temperature: Math.round((data.main.temp ?? 0) * 10) / 10,
        windspeed: Math.round((data.wind.speed ?? 0) * 10) / 10,
        winddirection: data.wind.deg ?? 0,
        is_day: (new Date().getHours() >= 6 && new Date().getHours() <= 18) ? 1 : 0,
        weathercode: data.weather?.[0]?.id ?? 0,
        time: new Date().toISOString().slice(0, 16)
      },
      hourly: {
        time: [new Date().toISOString().slice(0, 16)],
        relativehumidity_2m: [Math.round(data.main.humidity ?? 0)]
      }
    };

    const encoded = JSON.stringify(structured);

    await put(BLOB_NAME, encoded, {
      access: 'public',
    });

    return res.status(200).json(structured);
  } catch (err) {
    console.error('Weather error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
