// packages/web/src/components/features/dashboard/weather-widget.tsx
import { getSeoulWeather, getWeatherInfo } from '@/lib/weather';

export async function WeatherWidget() {
  const weather = await getSeoulWeather();

  if (!weather) return null;

  const { icon, label } = getWeatherInfo(weather.weatherCode);

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="text-lg" title={label}>{icon}</span>
      <span className="font-medium text-foreground">{weather.temperature}°</span>
      <span className="text-xs">
        체감 {weather.apparentTemperature}° · {weather.dailyMin}° / {weather.dailyMax}°
      </span>
    </div>
  );
}
