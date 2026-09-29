// "Chromy around the world": mounts the globe with public aggregate stats + a local guess of "you".
import { createGlobe } from './globe.js';
import { fetchStats, guessCountry, countryName } from './fun.js';

/**
 * @param {HTMLElement} root element containing: canvas.globe, .globe-tip, .globe-caption, ol.globe-top
 */
export async function mountWorld(root) {
  const canvas = root.querySelector('canvas.globe');
  const tip = root.querySelector('.globe-tip');
  const caption = root.querySelector('.globe-caption');
  const top = root.querySelector('.globe-top');

  const data = await fetch(chrome.runtime.getURL('data/globe.json')).then((r) => r.json());
  const you = guessCountry();

  const globe = createGlobe(canvas, {
    dots: data.dots,
    centroids: data.countries,
    you: you && data.countries[you] ? you : null,
    onHover(hit) {
      if (!hit) {
        tip.hidden = true;
        return;
      }
      tip.textContent = hit.you
        ? `You're probably in ${countryName(hit.code)} (we guessed locally from your time zone; humans guess too)`
        : `${countryName(hit.code)}: ${hit.count.toLocaleString()} Chromy users`;
      tip.style.left = `${hit.x}px`;
      tip.style.top = `${hit.y}px`;
      tip.hidden = false;
    }
  });

  const { countries, updated } = await fetchStats();
  globe.setHighlights(countries);

  const total = countries.reduce((s, c) => s + c.count, 0);
  if (countries.length) {
    caption.textContent = `${total.toLocaleString()} Chromy users in ${countries.length} countries${
      updated ? ` · updated ${updated}` : ''
    }. Aggregate Chrome Web Store numbers; Chromy itself collects nothing.`;
    top.replaceChildren(
      ...countries.slice(0, 5).map((c) => {
        const li = document.createElement('li');
        li.textContent = `${countryName(c.code)} · ${Math.round((c.count / total) * 100)}%`;
        if (c.code === you) li.className = 'you';
        return li;
      })
    );
  } else {
    caption.textContent = you
      ? `Chromy is brand new. ${countryName(you)} could light up first ⚡ (Your country is guessed on your device and never sent anywhere.)`
      : 'Chromy is brand new. Your country could light up first ⚡';
    top.replaceChildren();
  }
  return globe;
}
