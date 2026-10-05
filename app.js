import {
  fetchWeather,
  fetchWeatherByCoords,
  fetchWeatherForLocation,
  fetchSuggestions,
} from "./weather.js";
import { getIcon } from "./icons.js";

/* ---------- Configuration ---------- */

const DEFAULT_CITY = "Delhi";
const STORAGE_KEYS = { units: "isobar.units", city: "isobar.lastCity" };

/* ---------- State and DOM references ---------- */

const state = {
  weather: null,
  units: "metric", // "metric" or "imperial"
  activeRequest: null, // AbortController of the in-flight search
  suggestions: [],
  selectedSuggestionIndex: -1,
  suggestionsController: null,
  isDetectingLocation: false,
};

const $ = (id) => document.getElementById(id);

const els = {
  main: $("main"),
  form: $("search-form"),
  input: $("city-input"),
  clearBtn: $("search-clear"),
  locationBtn: $("location-btn"),
  suggestionsList: $("suggestions-list"),
  unitButtons: document.querySelectorAll("[data-units]"),
  loading: $("loading"),
  loadingText: $("loading-text"),
  error: $("error"),
  empty: $("empty"),
  results: $("results"),

  current: $("current"),
  city: $("city-name"),
  region: $("region"),
  localTime: $("local-time"),
  currentIcon: $("current-icon"),
  temperature: $("temperature"),
  temperatureUnit: $("temperature-unit"),
  condition: $("condition"),
  feelsLike: $("feels-like"),
  highLow: $("high-low"),
  factHumidity: $("fact-humidity"),
  factWind: $("fact-wind"),
  factVisibility: $("fact-visibility"),
  factPressure: $("fact-pressure"),
  factSunrise: $("fact-sunrise"),
  factSunset: $("fact-sunset"),

  forecastList: $("forecast-list"),
  forecastTemplate: $("forecast-row-template"),

  windSpeed: $("wind-speed"),
  windNote: $("wind-note"),
  uvValue: $("uv-value"),
  uvLevel: $("uv-level"),
  uvFill: $("uv-fill"),
  daylightLength: $("daylight-length"),
  daylightFill: $("daylight-fill"),
  daylightStatus: $("daylight-status"),
  detailSunrise: $("detail-sunrise"),
  detailSunset: $("detail-sunset"),
  humidityValue: $("humidity-value"),
  humidityLevel: $("humidity-level"),
  pressureValue: $("pressure-value"),
  pressureLevel: $("pressure-level"),
  visibilityValue: $("visibility-value"),
  visibilityLevel: $("visibility-level"),
};

/* ---------- Storage (optional conveniences; the app works without them) ---------- */

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable, ignore */
  }
}

/* ---------- Formatting ---------- */

const NO_VALUE = "—";
const isMissing = (value) => value === null || value === undefined || Number.isNaN(value);
const isImperial = () => state.units === "imperial";

function formatTemperature(celsius) {
  if (isMissing(celsius)) return NO_VALUE;
  const value = isImperial() ? (celsius * 9) / 5 + 32 : celsius;
  return `${Math.round(value)}°`;
}

function formatWind(kmh) {
  if (isMissing(kmh)) return NO_VALUE;
  return isImperial() ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;
}

function formatDistance(meters) {
  if (isMissing(meters)) return NO_VALUE;
  const value = isImperial() ? meters / 1609.344 : meters / 1000;
  const rounded = value >= 10 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${isImperial() ? "mi" : "km"}`;
}

function formatPressure(hpa) {
  if (isMissing(hpa)) return NO_VALUE;
  return isImperial() ? `${(hpa * 0.02953).toFixed(2)} inHg` : `${Math.round(hpa)} hPa`;
}

function formatPercent(value) {
  return isMissing(value) ? NO_VALUE : `${Math.round(value)}%`;
}

// The API returns local times for the searched city ("2026-10-05T14:30").
// Reading them as UTC and printing in UTC keeps them from shifting to the
// viewer's own time zone.
function parseLocal(isoLocal) {
  return isoLocal ? new Date(`${isoLocal}Z`) : null;
}

function formatClock(isoLocal) {
  const date = parseLocal(isoLocal);
  if (!date || Number.isNaN(date.getTime())) return NO_VALUE;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

function formatLocalDateTime(isoLocal) {
  const date = parseLocal(isoLocal);
  return date.toLocaleString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours}h ${minutes}m`;
}

const COMPASS_POINTS = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
];

function toCompassPoint(degrees) {
  return COMPASS_POINTS[Math.round(degrees / 45) % 8];
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/* ---------- Plain-language descriptions ---------- */

function describeUv(index) {
  if (index < 3) return "Low";
  if (index < 6) return "Moderate";
  if (index < 8) return "High";
  if (index < 11) return "Very high";
  return "Extreme";
}

function describeHumidity(percent) {
  if (percent < 30) return "Dry";
  if (percent < 60) return "Comfortable";
  if (percent < 80) return "Humid";
  return "Very humid";
}

function describePressure(hpa) {
  if (hpa < 1000) return "Low";
  if (hpa <= 1020) return "Normal";
  return "High";
}

function describeVisibility(meters) {
  const km = meters / 1000;
  if (km >= 10) return "Excellent";
  if (km >= 5) return "Good";
  if (km >= 2) return "Moderate";
  if (km >= 1) return "Poor";
  return "Very poor";
}

/* ---------- Updating the page ---------- */

function renderWeather(weather) {
  applyConditionTheme(weather.current.condition);
  updateCurrentWeather(weather);
  updateDetails(weather);
  updateForecast(weather);
  document.title = `${weather.location.name} weather | Isobar`;
  els.empty.hidden = true;
  els.results.hidden = false;
}

// Background and icon colors follow the current condition (see data-theme in style.css).
function applyConditionTheme(condition) {
  els.current.dataset.theme = condition.theme;
}

function updateCurrentWeather({ location, current, today }) {
  const { condition } = current;

  els.city.textContent = location.name;
  els.region.textContent = [location.region, location.country].filter(Boolean).join(", ");
  els.localTime.textContent = `Local time ${formatLocalDateTime(current.time)}`;

  els.currentIcon.innerHTML = getIcon(condition.icon, condition.label);
  els.temperature.textContent = formatTemperature(current.temperatureC);
  els.temperatureUnit.textContent = isImperial() ? "F" : "C";
  els.condition.textContent = condition.label;
  els.feelsLike.textContent = `Feels like ${formatTemperature(current.feelsLikeC)}`;
  els.highLow.textContent = `High ${formatTemperature(today.highC)}, low ${formatTemperature(today.lowC)}`;

  els.factHumidity.textContent = formatPercent(current.humidity);
  els.factWind.textContent = formatWind(current.windSpeedKmh);
  els.factVisibility.textContent = formatDistance(current.visibilityM);
  els.factPressure.textContent = formatPressure(current.pressureHpa);
  els.factSunrise.textContent = formatClock(today.sunrise);
  els.factSunset.textContent = formatClock(today.sunset);
}

function updateForecast({ daily, current }) {
  const todayDate = current.time.slice(0, 10);
  const weekLow = Math.min(...daily.map((day) => day.lowC));
  const weekHigh = Math.max(...daily.map((day) => day.highC));
  const span = weekHigh - weekLow || 1;

  const rows = daily.map((day) => {
    const row = els.forecastTemplate.content.cloneNode(true);
    const date = new Date(day.date);

    row.querySelector(".forecast__weekday").textContent =
      day.date === todayDate
        ? "Today"
        : date.toLocaleDateString([], { weekday: "short", timeZone: "UTC" });
    row.querySelector(".forecast__date").textContent = date.toLocaleDateString([], {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

    row.querySelector(".forecast__icon").innerHTML = getIcon(day.condition.icon);
    row.querySelector(".forecast__condition").textContent = day.condition.label;
    row.querySelector(".forecast__precip").textContent =
      day.precipitationChance >= 10 ? `${day.precipitationChance}% precipitation` : "";

    row.querySelector(".js-low").textContent = formatTemperature(day.lowC);
    row.querySelector(".js-high").textContent = formatTemperature(day.highC);

    const fill = row.querySelector(".forecast__range-fill");
    fill.style.left = `${((day.lowC - weekLow) / span) * 100}%`;
    fill.style.width = `${Math.max(((day.highC - day.lowC) / span) * 100, 6)}%`;

    return row;
  });

  els.forecastList.replaceChildren(...rows);
}

function updateDetails({ current, today }) {
  updateWindDetail(current);
  updateUvDetail(today);
  updateDaylightDetail(current, today);
  updateAirDetail(current);
}

function updateWindDetail(current) {
  els.windSpeed.textContent = formatWind(current.windSpeedKmh);

  const notes = [];
  if (!isMissing(current.windDirectionDeg)) {
    notes.push(`From the ${toCompassPoint(current.windDirectionDeg)}`);
  }
  if (!isMissing(current.windGustKmh)) {
    notes.push(`gusts up to ${formatWind(current.windGustKmh)}`);
  }
  els.windNote.textContent = notes.length ? capitalize(notes.join(", ")) : "";
}

function updateUvDetail(today) {
  const uv = today.uvIndexMax;
  els.uvValue.textContent = isMissing(uv) ? NO_VALUE : uv.toFixed(1);
  els.uvLevel.textContent = isMissing(uv) ? "" : describeUv(uv);
  els.uvFill.style.width = isMissing(uv) ? "0%" : `${clamp(uv / 11, 0, 1) * 100}%`;
}

function updateDaylightDetail(current, today) {
  els.detailSunrise.textContent = formatClock(today.sunrise);
  els.detailSunset.textContent = formatClock(today.sunset);

  const now = parseLocal(current.time)?.getTime();
  const sunrise = parseLocal(today.sunrise)?.getTime();
  const sunset = parseLocal(today.sunset)?.getTime();

  if ([now, sunrise, sunset].some(isMissing)) {
    els.daylightLength.textContent = NO_VALUE;
    els.daylightFill.style.width = "0%";
    els.daylightStatus.textContent = "";
    return;
  }

  els.daylightLength.textContent = `${formatDuration((sunset - sunrise) / 60000)} of daylight`;
  els.daylightFill.style.width = `${clamp((now - sunrise) / (sunset - sunrise), 0, 1) * 100}%`;
  els.daylightStatus.textContent =
    now < sunrise ? "Before sunrise" : now > sunset ? "After sunset" : "Sun is up";
}

function updateAirDetail(current) {
  els.humidityValue.textContent = formatPercent(current.humidity);
  els.humidityLevel.textContent = isMissing(current.humidity) ? "" : describeHumidity(current.humidity);

  els.pressureValue.textContent = formatPressure(current.pressureHpa);
  els.pressureLevel.textContent = isMissing(current.pressureHpa) ? "" : describePressure(current.pressureHpa);

  els.visibilityValue.textContent = formatDistance(current.visibilityM);
  els.visibilityLevel.textContent = isMissing(current.visibilityM) ? "" : describeVisibility(current.visibilityM);
}

/* ---------- Loading and error states ---------- */

function setLoading(isLoading, query = "") {
  els.main.setAttribute("aria-busy", String(isLoading));
  els.loading.hidden = !isLoading;
  els.loadingText.textContent = isLoading ? `Loading weather for ${query}…` : "";
}

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = false;
}

function clearError() {
  els.error.hidden = true;
  els.error.textContent = "";
}

/* ---------- Search & Suggestions ---------- */

let debounceTimer = null;

function hideSuggestions() {
  els.suggestionsList.hidden = true;
  els.input.setAttribute("aria-expanded", "false");
  state.suggestions = [];
  state.selectedSuggestionIndex = -1;
  els.suggestionsList.innerHTML = "";
  els.input.removeAttribute("aria-activedescendant");
}

function showSuggestions() {
  if (state.suggestions.length > 0) {
    els.suggestionsList.hidden = false;
    els.input.setAttribute("aria-expanded", "true");
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderSuggestions(suggestions, query) {
  state.suggestions = suggestions;
  state.selectedSuggestionIndex = -1;

  if (suggestions.length === 0) {
    els.suggestionsList.innerHTML = `
      <li class="suggestion-empty">No cities found matching “${escapeHtml(query)}”</li>
    `;
    els.suggestionsList.hidden = false;
    els.input.setAttribute("aria-expanded", "true");
    return;
  }

  const queryLower = query.trim().toLowerCase();

  const itemsHtml = suggestions
    .map((place, index) => {
      const name = place.name;
      const lowerName = name.toLowerCase();
      let highlightedName = escapeHtml(name);

      const matchIdx = lowerName.indexOf(queryLower);
      if (matchIdx !== -1) {
        const before = escapeHtml(name.slice(0, matchIdx));
        const match = escapeHtml(name.slice(matchIdx, matchIdx + queryLower.length));
        const after = escapeHtml(name.slice(matchIdx + queryLower.length));
        highlightedName = `${before}<span class="suggestion-item__match">${match}</span>${after}`;
      }

      const details = [place.region, place.country].filter(Boolean).join(", ");
      const badge = place.countryCode
        ? `<span class="suggestion-item__badge">${escapeHtml(place.countryCode)}</span>`
        : "";

      return `
        <li class="suggestion-item" role="option" id="suggestion-item-${index}" data-index="${index}" aria-selected="false">
          <div class="suggestion-item__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 21s-6-5.333-6-10a6 6 0 0 1 12 0c0 4.667-6 10-6 10z"/>
              <circle cx="12" cy="11" r="2.5"/>
            </svg>
          </div>
          <div class="suggestion-item__main">
            <span class="suggestion-item__name">${highlightedName}</span>
            ${details ? `<span class="suggestion-item__details">${escapeHtml(details)}</span>` : ""}
          </div>
          ${badge}
        </li>
      `;
    })
    .join("");

  els.suggestionsList.innerHTML = itemsHtml;
  els.suggestionsList.hidden = false;
  els.input.setAttribute("aria-expanded", "true");
}

function updateSelectedSuggestion(newIndex) {
  const items = els.suggestionsList.querySelectorAll(".suggestion-item");
  if (!items.length) return;

  items.forEach((item) => {
    item.setAttribute("aria-selected", "false");
    item.classList.remove("is-selected");
  });

  if (newIndex >= 0 && newIndex < items.length) {
    state.selectedSuggestionIndex = newIndex;
    const activeItem = items[newIndex];
    activeItem.setAttribute("aria-selected", "true");
    activeItem.classList.add("is-selected");
    activeItem.scrollIntoView({ block: "nearest" });
    els.input.setAttribute("aria-activedescendant", activeItem.id);
  } else {
    state.selectedSuggestionIndex = -1;
    els.input.removeAttribute("aria-activedescendant");
  }
}

function selectSuggestion(index) {
  const item = state.suggestions[index];
  if (!item) return;

  const displayName = [item.name, item.country].filter(Boolean).join(", ");
  els.input.value = displayName;
  els.clearBtn.hidden = false;
  hideSuggestions();
  handleSearch(displayName, item);
}

function handleInputChange() {
  const value = els.input.value;
  els.clearBtn.hidden = !value.trim();

  clearTimeout(debounceTimer);

  const query = value.trim();
  if (query.length < 2) {
    state.suggestionsController?.abort();
    hideSuggestions();
    return;
  }

  debounceTimer = setTimeout(async () => {
    state.suggestionsController?.abort();
    const controller = new AbortController();
    state.suggestionsController = controller;

    try {
      const results = await fetchSuggestions(query, controller.signal);
      renderSuggestions(results, query);
    } catch (err) {
      if (err.name === "AbortError") return;
      hideSuggestions();
    }
  }, 250);
}

function handleInputKeydown(event) {
  if (els.suggestionsList.hidden || !state.suggestions.length) {
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    const nextIndex =
      state.selectedSuggestionIndex < state.suggestions.length - 1
        ? state.selectedSuggestionIndex + 1
        : 0;
    updateSelectedSuggestion(nextIndex);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    const prevIndex =
      state.selectedSuggestionIndex > 0
        ? state.selectedSuggestionIndex - 1
        : state.suggestions.length - 1;
    updateSelectedSuggestion(prevIndex);
  } else if (event.key === "Enter") {
    if (state.selectedSuggestionIndex >= 0) {
      event.preventDefault();
      selectSuggestion(state.selectedSuggestionIndex);
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    hideSuggestions();
  }
}

async function handleSearch(rawQuery, locationObject = null) {
  const query = rawQuery.trim().replace(/\s+/g, " ");
  if (!query && !locationObject) {
    showError("Enter a city name to search.");
    els.input.focus();
    return;
  }

  // A newer search replaces any request still in flight.
  state.activeRequest?.abort();
  const controller = new AbortController();
  state.activeRequest = controller;

  clearError();
  hideSuggestions();
  setLoading(true, locationObject ? locationObject.name : query);

  try {
    const weather = locationObject
      ? await fetchWeatherForLocation(locationObject, { signal: controller.signal })
      : await fetchWeather(query, { signal: controller.signal });

    state.weather = weather;
    renderWeather(weather);
    const savedName = [weather.location.name, weather.location.country].filter(Boolean).join(", ");
    els.input.value = savedName;
    els.clearBtn.hidden = false;
    writeStorage(STORAGE_KEYS.city, savedName);
    notifyWeatherUpdated(weather);
  } catch (error) {
    if (error.name === "AbortError") return;
    showError(
      error.name === "WeatherError"
        ? error.message
        : "Something went wrong while loading the weather. Try again."
    );
  } finally {
    if (state.activeRequest === controller) setLoading(false);
  }
}

function handleSearchSubmit(event) {
  event.preventDefault();
  hideSuggestions();
  handleSearch(els.input.value);
}

/* ---------- Current Location ---------- */

function handleLocationSearch() {
  if (state.isDetectingLocation) return;

  if (!navigator.geolocation) {
    showError("Geolocation is not supported by your browser. Please search for a city manually.");
    return;
  }

  hideSuggestions();
  clearError();
  state.isDetectingLocation = true;
  els.locationBtn.classList.add("is-loading");
  els.locationBtn.disabled = true;
  setLoading(true, "your current location");

  state.activeRequest?.abort();
  const controller = new AbortController();
  state.activeRequest = controller;

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      try {
        const weather = await fetchWeatherByCoords(latitude, longitude, { signal: controller.signal });
        state.weather = weather;
        renderWeather(weather);
        const displayName = [weather.location.name, weather.location.country].filter(Boolean).join(", ");
        els.input.value = displayName;
        els.clearBtn.hidden = false;
        writeStorage(STORAGE_KEYS.city, displayName);
        notifyWeatherUpdated(weather);
      } catch (error) {
        if (error.name === "AbortError") return;
        showError(
          error.name === "WeatherError"
            ? error.message
            : "Could not load weather for your current location. Please try searching for your city."
        );
      } finally {
        if (state.activeRequest === controller) setLoading(false);
        state.isDetectingLocation = false;
        els.locationBtn.classList.remove("is-loading");
        els.locationBtn.disabled = false;
      }
    },
    (geoError) => {
      if (state.activeRequest === controller) setLoading(false);
      state.isDetectingLocation = false;
      els.locationBtn.classList.remove("is-loading");
      els.locationBtn.disabled = false;

      let message = "Could not detect your location. Try searching for a city.";
      switch (geoError.code) {
        case geoError.PERMISSION_DENIED:
          message = "Location access was denied. Please allow location permissions in your browser or search for a city.";
          break;
        case geoError.POSITION_UNAVAILABLE:
          message = "Location information is unavailable. Please check your network or GPS connection.";
          break;
        case geoError.TIMEOUT:
          message = "Location request timed out. Please try again or search manually.";
          break;
      }
      showError(message);
    },
    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000,
    }
  );
}

/* ---------- Units ---------- */

function setUnits(units) {
  state.units = units;
  writeStorage(STORAGE_KEYS.units, units);
  els.unitButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.units === units));
  });
  if (state.weather) renderWeather(state.weather);
}

/* ---------- FUTURE MODEL INTEGRATION ----------
 * Hooks for js/model.js. Nothing here depends on the model.
 *   - getCurrentWeather() returns the WeatherData currently on screen.
 *   - "weather:updated" fires on document after every successful search,
 *     with the WeatherData in event.detail.
 * A future module can import { getModelResponse } from "./model.js" and
 * use these two hooks to feed it. See README.
 */

export function getCurrentWeather() {
  return state.weather;
}

function notifyWeatherUpdated(weather) {
  document.dispatchEvent(new CustomEvent("weather:updated", { detail: weather }));
}

/* ---------- Start ---------- */

function init() {
  setUnits(readStorage(STORAGE_KEYS.units) === "imperial" ? "imperial" : "metric");

  els.form.addEventListener("submit", handleSearchSubmit);
  els.input.addEventListener("input", handleInputChange);
  els.input.addEventListener("keydown", handleInputKeydown);
  els.input.addEventListener("focus", () => {
    if (els.input.value.trim().length >= 2 && state.suggestions.length > 0) {
      showSuggestions();
    }
  });

  els.clearBtn.addEventListener("click", () => {
    els.input.value = "";
    els.clearBtn.hidden = true;
    hideSuggestions();
    els.input.focus();
  });

  els.locationBtn.addEventListener("click", handleLocationSearch);

  els.suggestionsList.addEventListener("click", (event) => {
    const item = event.target.closest(".suggestion-item");
    if (!item) return;
    const index = parseInt(item.dataset.index, 10);
    selectSuggestion(index);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-box")) {
      hideSuggestions();
    }
  });

  els.unitButtons.forEach((button) => {
    button.addEventListener("click", () => setUnits(button.dataset.units));
  });

  const initialCity = readStorage(STORAGE_KEYS.city) || DEFAULT_CITY;
  els.input.value = initialCity;
  els.clearBtn.hidden = !initialCity;
  handleSearch(initialCity);
}

init();
