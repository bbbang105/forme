// packages/web/src/lib/weather.ts

export interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  dailyMax: number;
  dailyMin: number;
  weatherCode: number;
}

const SEOUL_LAT = 37.57;
const SEOUL_LON = 126.98;

/**
 * WMO Weather Code → Korean label + emoji
 */
export function getWeatherInfo(code: number): { label: string; icon: string } {
  if (code === 0) return { label: '맑음', icon: '☀️' };
  if (code <= 2) return { label: '대체로 맑음', icon: '🌤️' };
  if (code === 3) return { label: '흐림', icon: '☁️' };
  if (code <= 48) return { label: '안개', icon: '🌫️' };
  if (code <= 57) return { label: '이슬비', icon: '🌦️' };
  if (code <= 67) return { label: '비', icon: '🌧️' };
  if (code <= 77) return { label: '눈', icon: '❄️' };
  if (code <= 82) return { label: '소나기', icon: '🌧️' };
  if (code <= 86) return { label: '눈보라', icon: '🌨️' };
  if (code <= 99) return { label: '뇌우', icon: '⛈️' };
  return { label: '알 수 없음', icon: '🌡️' };
}

/**
 * Fetch Seoul weather from Open-Meteo (free, no API key).
 * Returns null on failure (graceful degradation).
 */
export async function getSeoulWeather(): Promise<WeatherData | null> {
  try {
    const params = new URLSearchParams({
      latitude: String(SEOUL_LAT),
      longitude: String(SEOUL_LON),
      current: 'temperature_2m,weather_code,apparent_temperature',
      daily: 'temperature_2m_max,temperature_2m_min',
      timezone: 'Asia/Seoul',
      forecast_days: '1',
    });

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) return null;

    const data = await res.json();

    return {
      temperature: Math.round(data.current.temperature_2m),
      apparentTemperature: Math.round(data.current.apparent_temperature),
      dailyMax: Math.round(data.daily.temperature_2m_max[0]),
      dailyMin: Math.round(data.daily.temperature_2m_min[0]),
      weatherCode: data.current.weather_code,
    };
  } catch {
    return null;
  }
}
