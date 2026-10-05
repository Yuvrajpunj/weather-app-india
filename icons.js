/*
 * Weather icons as inline SVG, so they work offline and can be colored
 * from CSS (see the "Weather icons" section in style.css).
 * Icon keys come from describeCondition() in weather.js.
 */

const SUN = `
  <circle class="i-sun-fill" cx="32" cy="32" r="9"/>
  <path class="i-sun-ray" d="M46 32h5M41.9 41.9l3.5 3.5M32 46v5M22.1 41.9l-3.5 3.5M18 32h-5M22.1 22.1l-3.5-3.5M32 18v-5M41.9 22.1l3.5-3.5"/>`;

const MOON = `<path class="i-moon" transform="translate(8 0)" d="M36 17.2A16 16 0 1 0 36 46.8A14.8 14.8 0 0 1 36 17.2z"/>`;

const CLOUD = `<path class="i-cloud" d="M18 46a9 9 0 0 1-.8-17.97A14 14 0 0 1 44.2 25.5 10.5 10.5 0 0 1 46 46z"/>`;

const CLOUD_BACK = `<path class="i-cloud i-cloud--back" d="M18 46a9 9 0 0 1-.8-17.97A14 14 0 0 1 44.2 25.5 10.5 10.5 0 0 1 46 46z"/>`;

const BODY_LARGE = 'transform="translate(-4.8 -4.8) scale(1.15)"';
const BODY_SMALL = 'transform="translate(-2 -5) scale(.85)"';
const CLOUD_FRONT = 'transform="translate(6 12) scale(.85)"';

const ICONS = {
  "clear-day": `<g ${BODY_LARGE}>${SUN}</g>`,
  "clear-night": `<g ${BODY_LARGE}>${MOON}</g>`,
  "partly-day": `<g ${BODY_SMALL}>${SUN}</g><g ${CLOUD_FRONT}>${CLOUD}</g>`,
  "partly-night": `<g ${BODY_SMALL}>${MOON}</g><g ${CLOUD_FRONT}>${CLOUD}</g>`,
  cloudy: `<g transform="translate(18 2) scale(.7)">${CLOUD_BACK}</g><g transform="translate(-2 8)">${CLOUD}</g>`,
  fog: `<g transform="translate(0 -8)">${CLOUD}</g><path class="i-fog" d="M14 44h36M20 50h28M14 56h30"/>`,
  rain: `<g transform="translate(0 -4)">${CLOUD}</g><path class="i-drop" d="M24 48l-2.5 8M33 48l-2.5 8M42 48l-2.5 8"/>`,
  snow: `<g transform="translate(0 -4)">${CLOUD}</g>
    <circle class="i-snow" cx="24" cy="52" r="2.4"/>
    <circle class="i-snow" cx="33" cy="57" r="2.4"/>
    <circle class="i-snow" cx="42" cy="52" r="2.4"/>`,
  storm: `<g transform="translate(0 -6)">${CLOUD}</g><polygon class="i-bolt" points="36,38 27,51 33.5,51 30,61 42,45.5 35.5,45.5 40,38"/>`,
};

/**
 * @param {string} name   Icon key from the weather condition
 * @param {string} [label] Accessible name. Omit when the condition is already
 *                         written out next to the icon (the icon is then hidden
 *                         from screen readers).
 * @returns {string} SVG markup
 */
function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getIcon(name, label = "") {
  const markup = ICONS[name] ?? ICONS.cloudy;
  const safeLabel = escapeAttribute(label);
  const accessibility = label ? `role="img" aria-label="${safeLabel}"` : 'aria-hidden="true"';
  return `<svg class="icon" viewBox="0 0 64 64" ${accessibility} focusable="false">${markup}</svg>`;
}
