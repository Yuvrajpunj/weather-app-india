# Isobar: weather app

Search any city and see its current conditions, a 7-day forecast, and the details that matter today (wind, UV, daylight, humidity, pressure, visibility). Plain HTML, CSS and JavaScript. No framework, no build step.

```
weather-app/
├── index.html
├── css/style.css
├── js/
│   ├── app.js       UI: state, search, rendering, loading and error states
│   ├── weather.js   Weather API: requests, response processing, condition codes
│   ├── icons.js     Inline SVG weather icons
│   └── model.js     Placeholder for your future AI/model feature
└── README.md
```

`icons.js` is the one file beyond the structure you listed. The SVG markup is bulky and unrelated to the app logic, so it lives on its own.

## 1. How it works

1. The person types a city and submits the form (`handleSearch` in `app.js`).
2. `fetchWeather()` in `weather.js` looks the city up with the Open-Meteo geocoding API, then requests its forecast. “Paris, France” works: the text after the comma narrows the match.
3. `processWeatherResponse()` converts the provider's raw response into one tidy object (`WeatherData`, documented at the top of `weather.js`). Values are metric, times are local to the city.
4. `app.js` renders that object: `updateCurrentWeather`, `updateForecast`, `updateDetails`, and `applyConditionTheme` (the current-conditions band changes tint with the weather, and goes dark at night).
5. While a request is running the page shows a loading bar and dims the old results. A city that isn't found, a network failure, or a service error shows a specific message. A newer search cancels one still in flight.

The °C/°F toggle converts temperature, wind, visibility and pressure in the browser, so no new request is needed. The units and last searched city are remembered in `localStorage`; the app works if that is unavailable.

## 2. The weather API key

The app uses **Open-Meteo**, which is free for non-commercial use and **needs no API key**. Because there is no secret to protect, the browser calls it directly and no backend is required.

In `js/weather.js`, the top of the file holds all API configuration:

```js
const API_KEY = "";   // optional, only for paid Open-Meteo plans

const API_CONFIG = {
  geocodingUrl: "https://geocoding-api.open-meteo.com/v1/search",
  forecastUrl: "https://api.open-meteo.com/v1/forecast",
  forecastDays: 7,
};
```

If you buy a commercial plan, paste the key into `API_KEY` and change both URLs to the hosts named in your plan. The key is added to requests in one place (`buildUrl`).

**If you later switch to a provider that does need a key** (for example OpenWeatherMap): a key placed in front-end code is visible to anyone who opens dev tools. For a personal project that may be acceptable, but for a public site put a small proxy (a serverless function works well) between the app and the provider. The proxy holds the key and adds it to the request; you then point `forecastUrl` at the proxy and the app needs no other change.

Open-Meteo's terms ask for attribution, which is in the page footer. Keep it.

## 3. Running it locally

The app uses JavaScript modules, which browsers block when you open `index.html` straight from disk (`file://`). Serve the folder instead. From inside `weather-app/`, any one of these works:

```bash
python3 -m http.server 8000      # then open http://localhost:8000
# or
npx serve .
```

Or use the “Live Server” extension in VS Code. An internet connection is needed for the weather data and the Public Sans font (the app falls back to the system font if the font can't load).

## 4. Adding your model later

Everything lives in `js/model.js`. It is not imported anywhere yet, and there is no model UI, so the site works completely without it.

The app gives your future code two ways to get the weather on screen:

- `getCurrentWeather()`, exported from `app.js`, returns the current `WeatherData` (or `null` before the first successful search).
- A `weather:updated` event fires on `document` after every successful search, with the data in `event.detail`.

A typical wiring, in a new file or at the bottom of `app.js`:

```js
import { getModelResponse } from "./model.js";
import { getCurrentWeather } from "./app.js";

questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  answerElement.textContent = await getModelResponse(getCurrentWeather(), questionInput.value);
});
```

The comment `FUTURE MODEL INTEGRATION` in `index.html` marks where a summary or question box would be mounted.

## 5. The function that receives the weather and the question

```js
// js/model.js
export async function getModelResponse(weatherData, userQuestion) { ... }
```

- `weatherData` is the same normalized `WeatherData` object the UI renders (location, current conditions, today's high/low, sunrise, sunset and UV, and the daily forecast). It is metric, and the shape is documented at the top of `js/weather.js`.
- `userQuestion` is free text. Pass `""` for a general summary.
- It returns a string, or `null` while the model is disabled. Flip `MODEL_ENABLED` to `true` when you are done.

Because the model always receives the normalized object and never raw API data, it keeps working if you change weather providers.

If your model needs a secret key, call it through your own backend rather than from the browser, for the same reason described in section 2.

## 6. Replacing the weather API

Only `js/weather.js` knows about the provider. To switch:

1. Update `API_CONFIG` and `API_KEY`.
2. Rewrite `geocodeCity` and `requestForecast` for the new provider's endpoints (if it takes a city name directly, you can drop the geocoding step).
3. Rewrite `processWeatherResponse` so it returns the same `WeatherData` shape.
4. Replace the `WEATHER_CODES` table in the Conditions section with the new provider's condition codes. Each entry maps to a label, an icon kind (`clear`, `partly`, `cloudy`, `fog`, `rain`, `snow`, `storm`) and a theme.

As long as `fetchWeather(query, { signal })` still returns `WeatherData` and throws `WeatherError` for expected failures, `app.js`, the HTML and the CSS need no changes. If the new provider doesn't supply a field (for example UV), set it to `null`; the page shows “—” for missing values.
