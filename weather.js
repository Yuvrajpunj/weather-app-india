/*
 * Weather data layer.
 *
 * Everything that depends on the weather provider lives in this file:
 * URLs, query parameters, the shape of the raw response and the condition
 * codes. The rest of the app only sees the normalized object returned by
 * fetchWeather(), so swapping providers means editing this file only.
 *
 * Provider: Open-Meteo (https://open-meteo.com). Free for non-commercial use
 * and needs no API key, so the browser can call it directly.
 */

/**
 * @typedef {Object} WeatherData
 * @property {{name: string, region: string, country: string, latitude: number, longitude: number, timezone: string}} location
 * @property {{time: string, temperatureC: number, feelsLikeC: number, humidity: number, pressureHpa: number,
 *   windSpeedKmh: number, windGustKmh: number, windDirectionDeg: number, visibilityM: number,
 *   isDay: boolean, condition: Condition}} current
 * @property {{highC: number, lowC: number, sunrise: string, sunset: string, uvIndexMax: number}} today
 * @property {Array<{date: string, condition: Condition, highC: number, lowC: number, precipitationChance: number}>} daily
 *
 * All values are metric. Times are local to the city, as "YYYY-MM-DDTHH:mm".
 * Unit conversion happens in the UI, not here.
 */

/**
 * @typedef {Object} Condition
 * @property {string} label  Human-readable text, e.g. "Light rain"
 * @property {string} icon   Key understood by icons.js
 * @property {string} theme  One of: clear, clouds, fog, rain, snow, storm, night
 */

/* ---------- API configuration (change these to switch provider) ---------- */

// Optional. Leave empty for the free tier. Only paid Open-Meteo plans use a key.
const API_KEY = "";

const API_CONFIG = {
  geocodingUrl: "https://geocoding-api.open-meteo.com/v1/search",
  forecastUrl: "https://api.open-meteo.com/v1/forecast",
  forecastDays: 7,
};

/* ---------- Errors ---------- */

export class WeatherError extends Error {
  /**
   * @param {string} message Safe to show to the person using the app
   * @param {"not-found"|"network"|"service"} code
   */
  constructor(message, code) {
    super(message);
    this.name = "WeatherError";
    this.code = code;
  }
}

/* ---------- Public API ---------- */

/**
 * Reverse geocode latitude and longitude to find city and country name.
 * Falls back gracefully to "Current Location" if offline or unreachable.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {AbortSignal} [signal]
 * @returns {Promise<{name: string, region: string, country: string, latitude: number, longitude: number}>}
 */
export async function reverseGeocode(latitude, longitude, signal) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error("Reverse geocode failed");
    const data = await response.json();
    const name = data.city || data.locality || data.principalSubdivision || "Current Location";
    const region = data.principalSubdivision && data.principalSubdivision !== name ? data.principalSubdivision : "";
    const country = data.countryName || "";
    return {
      name,
      region,
      country,
      latitude,
      longitude,
    };
  } catch (error) {
    if (error.name === "AbortError") throw error;
    return {
      name: "Current Location",
      region: "",
      country: "",
      latitude,
      longitude,
    };
  }
}

/**
 * Look up weather by geographic coordinates.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<WeatherData>}
 */
export async function fetchWeatherByCoords(latitude, longitude, options = {}) {
  const signal = options.signal;
  const location = await reverseGeocode(latitude, longitude, signal);
  const forecast = await requestForecast(location, signal);
  return processWeatherResponse(location, forecast);
}

/**
 * Look up a city by name and return its current weather and forecast.
 * Accepts "Paris" or "Paris, France" (the part after the comma narrows the match).
 *
 * @param {string} query
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<WeatherData>}
 */
export async function fetchWeather(query, options = {}) {
  const location = await geocodeCity(query, options.signal);
  const forecast = await requestForecast(location, options.signal);
  return processWeatherResponse(location, forecast);
}

/**
 * Get weather directly for a known location object (e.g. chosen from suggestions).
 *
 * @param {{name: string, region: string, country: string, latitude: number, longitude: number}} location
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<WeatherData>}
 */
export async function fetchWeatherForLocation(location, options = {}) {
  const forecast = await requestForecast(location, options.signal);
  return processWeatherResponse(location, forecast);
}

/**
 * Fetch city suggestions matching a search term for autocomplete.
 *
 * @param {string} query
 * @param {AbortSignal} [signal]
 * @returns {Promise<Array<{id: number, name: string, region: string, country: string, countryCode: string, latitude: number, longitude: number}>>}
 */
export async function fetchSuggestions(query, signal) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const [namePart] = trimmed.split(",");
  const searchName = namePart.trim();
  if (!searchName) return [];

  const url = buildUrl(API_CONFIG.geocodingUrl, {
    name: searchName,
    count: 7,
    language: "en",
    format: "json",
  });

  try {
    const data = await requestJson(url, signal);
    const results = data.results ?? [];
    const seen = new Set();
    const suggestions = [];

    for (const place of results) {
      const region = place.admin1 ?? place.admin2 ?? "";
      const country = place.country ?? "";
      const key = `${place.name}|${region}|${country}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push({
          id: place.id,
          name: place.name,
          region,
          country,
          countryCode: place.country_code ? place.country_code.toUpperCase() : "",
          latitude: place.latitude,
          longitude: place.longitude,
        });
      }
    }
    return suggestions;
  } catch (error) {
    if (error.name === "AbortError") throw error;
    return [];
  }
}

/**
 * Turn the provider's raw forecast response into the app's WeatherData shape.
 */
export function processWeatherResponse(location, raw) {
  const { current, daily } = raw;
  const isDay = current.is_day === 1;

  const days = daily.time.map((date, index) => ({
    date,
    condition: describeCondition(daily.weather_code[index], true),
    highC: daily.temperature_2m_max[index],
    lowC: daily.temperature_2m_min[index],
    precipitationChance: daily.precipitation_probability_max[index],
  }));

  return {
    location: { ...location, timezone: raw.timezone },
    current: {
      time: current.time,
      temperatureC: current.temperature_2m,
      feelsLikeC: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      pressureHpa: current.pressure_msl,
      windSpeedKmh: current.wind_speed_10m,
      windGustKmh: current.wind_gusts_10m,
      windDirectionDeg: current.wind_direction_10m,
      visibilityM: current.visibility,
      isDay,
      condition: describeCondition(current.weather_code, isDay),
    },
    today: {
      highC: days[0].highC,
      lowC: days[0].lowC,
      sunrise: daily.sunrise[0],
      sunset: daily.sunset[0],
      uvIndexMax: daily.uv_index_max[0],
    },
    daily: days,
  };
}

/* ---------- Requests ---------- */

async function geocodeCity(query, signal) {
  const [rawName, ...rest] = query.split(",");
  const name = rawName.trim();
  const hint = rest.join(",").trim().toLowerCase();

  const notFound = new WeatherError(
    `No city found for “${query}”. Check the spelling, or add a country, like “Paris, France”.`,
    "not-found"
  );
  if (!name) throw notFound;

  const url = buildUrl(API_CONFIG.geocodingUrl, {
    name,
    count: 10,
    language: "en",
    format: "json",
  });
  const data = await requestJson(url, signal);
  const results = data.results ?? [];

  const match = (hint && results.find((place) => matchesHint(place, hint))) || results[0];
  if (!match) throw notFound;

  return {
    name: match.name,
    region: match.admin1 ?? "",
    country: match.country ?? "",
    latitude: match.latitude,
    longitude: match.longitude,
  };
}

function matchesHint(place, hint) {
  const names = [place.country, place.admin1];
  return (
    names.some((value) => value && value.toLowerCase().startsWith(hint)) ||
    place.country_code?.toLowerCase() === hint
  );
}

function requestForecast(location, signal) {
  const url = buildUrl(API_CONFIG.forecastUrl, {
    latitude: location.latitude,
    longitude: location.longitude,
    current: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "is_day",
      "weather_code",
      "pressure_msl",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "visibility",
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "sunrise",
      "sunset",
      "uv_index_max",
      "precipitation_probability_max",
    ].join(","),
    forecast_days: API_CONFIG.forecastDays,
    timezone: "auto",
  });
  return requestJson(url, signal);
}

function buildUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  if (API_KEY) url.searchParams.set("apikey", API_KEY);
  return url;
}

async function requestJson(url, signal) {
  let response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new WeatherError(
      "Couldn't reach the weather service. Check your connection and try again.",
      "network"
    );
  }

  if (!response.ok) {
    const message =
      response.status === 429
        ? "Too many requests right now. Wait a minute and try again."
        : `The weather service returned an error (${response.status}). Try again in a moment.`;
    throw new WeatherError(message, "service");
  }
  return response.json();
}

/* ---------- Conditions ---------- */

// WMO weather codes used by Open-Meteo: [label, kind]
const WEATHER_CODES = {
  0: ["Clear sky", "clear"],
  1: ["Mainly clear", "clear"],
  2: ["Partly cloudy", "partly"],
  3: ["Overcast", "cloudy"],
  45: ["Fog", "fog"],
  48: ["Freezing fog", "fog"],
  51: ["Light drizzle", "rain"],
  53: ["Drizzle", "rain"],
  55: ["Heavy drizzle", "rain"],
  56: ["Freezing drizzle", "rain"],
  57: ["Heavy freezing drizzle", "rain"],
  61: ["Light rain", "rain"],
  63: ["Rain", "rain"],
  65: ["Heavy rain", "rain"],
  66: ["Freezing rain", "rain"],
  67: ["Heavy freezing rain", "rain"],
  71: ["Light snow", "snow"],
  73: ["Snow", "snow"],
  75: ["Heavy snow", "snow"],
  77: ["Snow grains", "snow"],
  80: ["Light showers", "rain"],
  81: ["Showers", "rain"],
  82: ["Heavy showers", "rain"],
  85: ["Light snow showers", "snow"],
  86: ["Heavy snow showers", "snow"],
  95: ["Thunderstorm", "storm"],
  96: ["Thunderstorm with hail", "storm"],
  99: ["Severe thunderstorm with hail", "storm"],
};

const THEME_BY_KIND = {
  clear: "clear",
  partly: "clouds",
  cloudy: "clouds",
  fog: "fog",
  rain: "rain",
  snow: "snow",
  storm: "storm",
};

/**
 * @param {number} code WMO weather code
 * @param {boolean} isDay
 * @returns {Condition}
 */
function describeCondition(code, isDay) {
  const [label, kind] = WEATHER_CODES[code] ?? ["Unknown conditions", "cloudy"];
  const hasDayVariant = kind === "clear" || kind === "partly";

  return {
    label: code === 0 && !isDay ? "Clear night" : label,
    icon: hasDayVariant ? `${kind}-${isDay ? "day" : "night"}` : kind,
    theme: isDay ? THEME_BY_KIND[kind] : "night",
  };
}
