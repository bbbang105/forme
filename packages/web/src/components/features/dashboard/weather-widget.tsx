// packages/web/src/components/features/dashboard/weather-widget.tsx
import { getSeoulWeather, getWeatherInfo } from '@/lib/weather';

export async function WeatherWidget() {
  const weather = await getSeoulWeather();

  if (!weather) return null;

  const { icon, label } = getWeatherInfo(weather.weatherCode);

  return (
    <div
      className="flex items-center gap-2 text-sm text-muted-foreground"
      aria-label={`현재 날씨: ${label}, 기온 ${weather.temperature}도, 체감 ${weather.apparentTemperature}도, 최저 ${weather.dailyMin}도 / 최고 ${weather.dailyMax}도`}
    >
      <span className="text-lg" aria-hidden="true">{icon}</span>
      <span className="font-medium text-foreground" aria-hidden="true">{weather.temperature}°</span>
      <span className="text-xs" aria-hidden="true">
        체감 {weather.apparentTemperature}° · {weather.dailyMin}° / {weather.dailyMax}°
      </span>
    </div>
  );
}
