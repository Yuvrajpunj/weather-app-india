/*
 * FUTURE MODEL INTEGRATION
 *
 * Nothing in the app imports or calls this file yet, and the website works
 * fully without it. When you are ready to add an AI/model feature, implement
 * getModelResponse() below and wire it to the UI (see README, "Adding your
 * model later").
 *
 * Ideas this interface is meant to support:
 *   - plain-language weather summaries
 *   - explaining why conditions look the way they do
 *   - personalized suggestions (what to wear, when to go out)
 *   - answering questions about the current weather or the forecast
 */

/** Flip to true once getModelResponse() is implemented and a UI exists for it. */
export const MODEL_ENABLED = false;

/**
 * @param {import("./weather.js").WeatherData} weatherData
 *   The same normalized object the UI renders: location, current, today, daily.
 *   Values are metric; see the WeatherData typedef in weather.js.
 * @param {string} userQuestion
 *   Free text from the person using the app. Pass an empty string to request a
 *   general summary of the weather data.
 * @returns {Promise<string|null>} The model's answer, or null while disabled.
 */
export async function getModelResponse(weatherData, userQuestion) {
  // Future AI/model integration goes here.
  return null;
}
