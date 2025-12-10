// api/services/weather.service.js
const axios = require('axios');

class WeatherService {
  constructor() {
    this.apiKey = process.env.OPENWEATHER_API_KEY;
    this.baseUrl = 'https://api.openweathermap.org/data/2.5';
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
  }

  async getCurrentWeather(lat = 14.6937, lon = -17.4441) {
    const cacheKey = `current_${lat}_${lon}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/weather`, {
        params: {
          lat,
          lon,
          appid: this.apiKey,
          units: 'metric',
          lang: 'fr'
        }
      });

      const data = this.formatWeatherData(response.data);
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      
      return data;
    } catch (error) {
      console.error('Weather API Error:', error.message);
      throw new Error('Impossible de récupérer les données météo');
    }
  }

  formatWeatherData(raw) {
    return {
      temp: Math.round(raw.main.temp),
      feels_like: Math.round(raw.main.feels_like),
      humidity: raw.main.humidity,
      pressure: raw.main.pressure,
      wind_speed: raw.wind.speed,
      wind_direction: raw.wind.deg,
      visibility: Math.round(raw.visibility / 1000),
      description: raw.weather[0].description,
      icon: this.mapWeatherIcon(raw.weather[0].icon),
      clouds: raw.clouds.all,
      sunrise: new Date(raw.sys.sunrise * 1000),
      sunset: new Date(raw.sys.sunset * 1000)
    };
  }

  mapWeatherIcon(code) {
    const iconMap = {
      '01d': 'sun', '01n': 'moon',
      '02d': 'cloud-sun', '02n': 'cloud-moon',
      '03d': 'cloud', '03n': 'cloud',
      '04d': 'cloud', '04n': 'cloud',
      '09d': 'cloud-rain', '09n': 'cloud-rain',
      '10d': 'cloud-drizzle', '10n': 'cloud-drizzle',
      '11d': 'cloud-lightning', '11n': 'cloud-lightning',
      '13d': 'cloud-snow', '13n': 'cloud-snow',
      '50d': 'wind', '50n': 'wind'
    };
    return iconMap[code] || 'cloud';
  }

  async getForecast(lat = 14.6937, lon = -17.4441) {
    const cacheKey = `forecast_${lat}_${lon}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/forecast`, {
        params: {
          lat,
          lon,
          appid: this.apiKey,
          units: 'metric',
          lang: 'fr'
        }
      });

      const forecast = this.processForecast(response.data.list);
      this.cache.set(cacheKey, { data: forecast, timestamp: Date.now() });
      
      return forecast;
    } catch (error) {
      console.error('Forecast API Error:', error.message);
      throw new Error('Impossible de récupérer les prévisions');
    }
  }

  processForecast(list) {
    const days = {};
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    
    list.forEach(item => {
      const date = new Date(item.dt * 1000);
      const dayKey = date.toDateString();
      
      if (!days[dayKey]) {
        days[dayKey] = {
          day: dayNames[date.getDay()],
          temps: [],
          rain_probs: [],
          rain_volumes: [],
          icons: []
        };
      }
      
      days[dayKey].temps.push(item.main.temp);
      days[dayKey].rain_probs.push((item.pop || 0) * 100);
      days[dayKey].rain_volumes.push(item.rain?.['3h'] || 0);
      days[dayKey].icons.push(item.weather[0].icon);
    });

    return Object.values(days).slice(0, 5).map(day => ({
      day: day.day,
      temp_max: Math.round(Math.max(...day.temps)),
      temp_min: Math.round(Math.min(...day.temps)),
      rain_chance: Math.round(Math.max(...day.rain_probs)),
      rain_volume: day.rain_volumes.reduce((a, b) => a + b, 0),
      icon: this.mapWeatherIcon(this.getMostFrequent(day.icons))
    }));
  }

  getMostFrequent(arr) {
    return arr.sort((a, b) =>
      arr.filter(v => v === a).length - arr.filter(v => v === b).length
    ).pop();
  }
}

module.exports = new WeatherService();