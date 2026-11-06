/* ==========================================================================
   Product artwork — Cloudinary when configured, precise SVG device renders
   otherwise so the catalogue never shows a broken image.
   ========================================================================== */

import { cldUrl, cldSrcset, cldPlaceholder, isCloudinaryConfigured } from "../cloudinary.js";
import { esc } from "../format.js";

const TONES = {
  graphite: { top: "#5a6270", bottom: "#2c2f37", rim: "#8a93a3", screen: "#080d18" },
  dark: { top: "#3a3f4b", bottom: "#171a20", rim: "#5f6878", screen: "#05080f" },
  silver: { top: "#eef1f5", bottom: "#b9c1cc", rim: "#9aa3b0", screen: "#0b1220" },
  white: { top: "#ffffff", bottom: "#dfe4ec", rim: "#c3cad4", screen: "#0b1220" },
  blue: { top: "#51688a", bottom: "#2b3a52", rim: "#7d92b0", screen: "#060c16" },
  green: { top: "#7e9a88", bottom: "#4c6455", rim: "#a3baa9", screen: "#07110c" },
  gold: { top: "#dcc49b", bottom: "#b1996e", rim: "#e5d6b8", screen: "#0b1220" },
};

let counter = 0;

function wrap(inner) {
  const uid = `art${++counter}`;
  return `<svg viewBox="0 0 400 400" role="img" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${inner(uid)}</svg>`;
}

function defs(uid, tone, accent) {
  const t = TONES[tone] || TONES.graphite;
  return `<defs>
    <linearGradient id="${uid}-body" x1="0" y1="0" x2="0.65" y2="1">
      <stop offset="0" stop-color="${t.top}"/>
      <stop offset="0.55" stop-color="${t.top}"/>
      <stop offset="1" stop-color="${t.bottom}"/>
    </linearGradient>
    <linearGradient id="${uid}-screen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#14243f"/>
      <stop offset="0.5" stop-color="${t.screen}"/>
      <stop offset="1" stop-color="#0a1526"/>
    </linearGradient>
    <linearGradient id="${uid}-glare" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.26"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${uid}-accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0.15"/>
    </linearGradient>
    <radialGradient id="${uid}-shadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#0f172a" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#0f172a" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

const shadow = (uid) => `<ellipse cx="200" cy="334" rx="98" ry="14" fill="url(#${uid}-shadow)"/>`;

function phone(p) {
  const tone = p.tone || "graphite";
  const accent = p.accent || "#0062ff";
  const t = TONES[tone] || TONES.graphite;
  return wrap((uid) => `${defs(uid, tone, accent)}${shadow(uid)}
    <rect x="128" y="46" width="144" height="286" rx="30" fill="url(#${uid}-body)"/>
    <rect x="128.75" y="46.75" width="142.5" height="284.5" rx="29.5" fill="none" stroke="${t.rim}" stroke-opacity="0.55" stroke-width="1.5"/>
    <rect x="136" y="54" width="128" height="270" rx="24" fill="url(#${uid}-screen)"/>
    <rect x="136" y="54" width="128" height="270" rx="24" fill="url(#${uid}-glare)"/>
    <rect x="182" y="64" width="36" height="9" rx="4.5" fill="#05080f"/>
    <circle cx="212" cy="68.5" r="2.2" fill="#1f2a3a"/>
    <rect x="152" y="96" width="62" height="8" rx="4" fill="#fff" fill-opacity="0.22"/>
    <rect x="152" y="112" width="42" height="6" rx="3" fill="#fff" fill-opacity="0.12"/>
    <rect x="152" y="140" width="96" height="54" rx="10" fill="url(#${uid}-accent)" opacity="0.22"/>
    <rect x="152" y="208" width="96" height="6" rx="3" fill="#fff" fill-opacity="0.14"/>
    <rect x="152" y="222" width="70" height="6" rx="3" fill="#fff" fill-opacity="0.1"/>
    <rect x="176" y="300" width="48" height="4" rx="2" fill="#fff" fill-opacity="0.45"/>
    <rect x="139" y="118" width="3" height="26" rx="1.5" fill="${t.rim}"/>
    <rect x="139" y="154" width="3" height="16" rx="1.5" fill="${t.rim}"/>
    <rect x="258" y="132" width="3" height="40" rx="1.5" fill="${t.rim}"/>
    <rect x="262" y="86" width="20" height="20" rx="7" fill="${t.bottom}"/>
    <circle cx="268" cy="92" r="4.6" fill="#0b1220"/><circle cx="268" cy="92" r="2" fill="#2e3b52"/>
    <circle cx="278" cy="100" r="4.6" fill="#0b1220"/><circle cx="278" cy="100" r="2" fill="#2e3b52"/>`);
}

function foldable(p) {
  const tone = p.tone || "dark";
  const accent = p.accent || "#0062ff";
  const t = TONES[tone] || TONES.graphite;
  return wrap((uid) => `${defs(uid, tone, accent)}${shadow(uid)}
    <rect x="76" y="70" width="120" height="256" rx="18" fill="url(#${uid}-body)"/>
    <rect x="204" y="70" width="120" height="256" rx="18" fill="url(#${uid}-body)" opacity="0.72"/>
    <rect x="84" y="78" width="104" height="240" rx="12" fill="url(#${uid}-screen)"/>
    <rect x="212" y="78" width="104" height="240" rx="12" fill="url(#${uid}-screen)" opacity="0.92"/>
    <rect x="84" y="78" width="104" height="240" rx="12" fill="url(#${uid}-glare)"/>
    <rect x="199" y="70" width="2" height="256" fill="#0b1220" opacity="0.55"/>
    <rect x="146" y="86" width="4" height="120" rx="2" fill="#1b2433"/>
    <rect x="100" y="104" width="58" height="7" rx="3.5" fill="#fff" fill-opacity="0.2"/>
    <rect x="100" y="122" width="70" height="42" rx="8" fill="${t.rim}" fill-opacity="0.18"/>
    <circle cx="244" cy="110" r="5" fill="#0b1220"/><circle cx="244" cy="110" r="2" fill="#2e3b52"/>
    <rect x="228" y="150" width="72" height="6" rx="3" fill="#fff" fill-opacity="0.14"/>
    <rect x="228" y="164" width="52" height="6" rx="3" fill="#fff" fill-opacity="0.1"/>`);
}

function tablet(p) {
  const tone = p.tone || "silver";
  const accent = p.accent || "#0062ff";
  const t = TONES[tone] || TONES.silver;
  return wrap((uid) => `${defs(uid, tone, accent)}${shadow(uid)}
    <rect x="96" y="60" width="208" height="272" rx="20" fill="url(#${uid}-body)"/>
    <rect x="96.75" y="60.75" width="206.5" height="270.5" rx="19.5" fill="none" stroke="${t.rim}" stroke-opacity="0.6" stroke-width="1.4"/>
    <rect x="106" y="70" width="188" height="252" rx="12" fill="url(#${uid}-screen)"/>
    <rect x="106" y="70" width="188" height="252" rx="12" fill="url(#${uid}-glare)"/>
    <circle cx="200" cy="66" r="2.4" fill="#0b1220"/>
    <rect x="126" y="98" width="86" height="9" rx="4.5" fill="#fff" fill-opacity="0.22"/>
    <rect x="126" y="116" width="56" height="6" rx="3" fill="#fff" fill-opacity="0.12"/>
    <rect x="126" y="144" width="148" height="78" rx="12" fill="url(#${uid}-accent)" opacity="0.24"/>
    <rect x="126" y="240" width="102" height="6" rx="3" fill="#fff" fill-opacity="0.12"/>
    <rect x="126" y="256" width="72" height="6" rx="3" fill="#fff" fill-opacity="0.09"/>`);
}

function laptop(p) {
  const tone = p.tone || "silver";
  const accent = p.accent || "#0062ff";
  const t = TONES[tone] || TONES.silver;
  return wrap((uid) => `${defs(uid, tone, accent)}${shadow(uid)}
    <rect x="86" y="84" width="228" height="166" rx="12" fill="url(#${uid}-body)"/>
    <rect x="86.75" y="84.75" width="226.5" height="164.5" rx="11.5" fill="none" stroke="${t.rim}" stroke-opacity="0.55" stroke-width="1.4"/>
    <rect x="96" y="94" width="208" height="146" rx="6" fill="url(#${uid}-screen)"/>
    <rect x="96" y="94" width="208" height="146" rx="6" fill="url(#${uid}-glare)"/>
    <circle cx="200" cy="90" r="1.8" fill="#0b1220"/>
    <rect x="112" y="112" width="74" height="7" rx="3.5" fill="#fff" fill-opacity="0.22"/>
    <rect x="112" y="128" width="48" height="5" rx="2.5" fill="#fff" fill-opacity="0.12"/>
    <rect x="112" y="152" width="176" height="56" rx="8" fill="url(#${uid}-accent)" opacity="0.22"/>
    <path d="M58 250h284l16 27c2 4-1 8-5 8H47c-4 0-7-4-5-8z" fill="url(#${uid}-body)"/>
    <path d="M58 250h284l4 7H54z" fill="${t.rim}" fill-opacity="0.35"/>
    <rect x="158" y="260" width="84" height="6" rx="3" fill="${t.bottom}" fill-opacity="0.5"/>
    <path d="M58 282h284l3 5c1 2 0 3-2 3H57c-2 0-3-1-2-3z" fill="${t.bottom}" fill-opacity="0.35"/>`);
}

function headphones(p) {
  const tone = p.tone || "dark";
  const accent = p.accent || "#0062ff";
  const t = TONES[tone] || TONES.graphite;
  return wrap((uid) => `${defs(uid, tone, accent)}${shadow(uid)}
    <path d="M116 214V176a84 84 0 0 1 168 0v38" fill="none" stroke="${t.bottom}" stroke-width="22" stroke-linecap="round"/>
    <path d="M116 214V176a84 84 0 0 1 168 0v38" fill="none" stroke="${t.top}" stroke-width="14" stroke-linecap="round" opacity="0.85"/>
    <path d="M120 168a80 80 0 0 1 160 0" fill="none" stroke="#fff" stroke-opacity="0.14" stroke-width="4" stroke-linecap="round"/>
    <rect x="82" y="192" width="66" height="106" rx="30" fill="url(#${uid}-body)"/>
    <rect x="90" y="201" width="50" height="88" rx="24" fill="${t.bottom}"/>
    <rect x="97" y="212" width="36" height="66" rx="18" fill="url(#${uid}-accent)" opacity="0.35"/>
    <rect x="88" y="206" width="4" height="78" rx="2" fill="#fff" fill-opacity="0.1"/>
    <rect x="252" y="192" width="66" height="106" rx="30" fill="url(#${uid}-body)"/>
    <rect x="260" y="201" width="50" height="88" rx="24" fill="${t.bottom}"/>
    <rect x="267" y="212" width="36" height="66" rx="18" fill="url(#${uid}-accent)" opacity="0.35"/>
    <rect x="308" y="206" width="4" height="78" rx="2" fill="#fff" fill-opacity="0.1"/>
    <circle cx="115" cy="245" r="5" fill="${t.rim}" fill-opacity="0.7"/>
    <circle cx="285" cy="245" r="5" fill="${t.rim}" fill-opacity="0.7"/>`);
}

function earbuds(p) {
  const tone = p.tone || "white";
  const accent = p.accent || "#0062ff";
  const t = TONES[tone] || TONES.white;
  return wrap((uid) => `${defs(uid, tone, accent)}${shadow(uid)}
    <rect x="122" y="188" width="156" height="126" rx="34" fill="url(#${uid}-body)"/>
    <rect x="122.75" y="188.75" width="154.5" height="124.5" rx="33.5" fill="none" stroke="${t.rim}" stroke-opacity="0.65" stroke-width="1.3"/>
    <rect x="134" y="204" width="132" height="6" rx="3" fill="#fff" fill-opacity="0.35"/>
    <path d="M122 250c22 14 134 14 156 0" fill="none" stroke="${t.rim}" stroke-opacity="0.4" stroke-width="2"/>
    <g transform="rotate(-14 168 128)">
      <ellipse cx="168" cy="128" rx="26" ry="30" fill="url(#${uid}-body)" stroke="${t.rim}" stroke-opacity="0.5"/>
      <rect x="158" y="146" width="20" height="60" rx="10" fill="url(#${uid}-body)"/>
      <circle cx="168" cy="120" r="9" fill="#0b1220"/><circle cx="168" cy="120" r="4" fill="url(#${uid}-accent)"/>
    </g>
    <g transform="rotate(14 236 128)">
      <ellipse cx="236" cy="128" rx="26" ry="30" fill="url(#${uid}-body)" stroke="${t.rim}" stroke-opacity="0.5"/>
      <rect x="226" y="146" width="20" height="60" rx="10" fill="url(#${uid}-body)"/>
      <circle cx="236" cy="120" r="9" fill="#0b1220"/><circle cx="236" cy="120" r="4" fill="url(#${uid}-accent)"/>
    </g>
    <circle cx="200" cy="284" r="3" fill="${t.rim}" fill-opacity="0.8"/>`);
}

function speaker(p) {
  const tone = p.tone || "blue";
  const accent = p.accent || "#0062ff";
  const t = TONES[tone] || TONES.blue;
  const dots = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      dots.push(`<circle cx="${168 + col * 16}" cy="${150 + row * 15}" r="3.1" fill="#0b1220" fill-opacity="0.55"/>`);
    }
  }
  return wrap((uid) => `${defs(uid, tone, accent)}${shadow(uid)}
    <rect x="142" y="96" width="116" height="228" rx="56" fill="url(#${uid}-body)"/>
    <rect x="142.75" y="96.75" width="114.5" height="226.5" rx="55.5" fill="none" stroke="${t.rim}" stroke-opacity="0.5" stroke-width="1.4"/>
    <rect x="152" y="108" width="96" height="204" rx="48" fill="#101a26" fill-opacity="0.5"/>
    ${dots.join("")}
    <rect x="152" y="116" width="96" height="204" rx="48" fill="url(#${uid}-glare)" opacity="0.5"/>
    <rect x="164" y="316" width="72" height="8" rx="4" fill="${t.rim}" fill-opacity="0.45"/>
    <circle cx="200" cy="120" r="4" fill="${t.rim}" fill-opacity="0.6"/>
    <circle cx="200" cy="300" r="4" fill="${t.rim}" fill-opacity="0.6"/>`);
}

function watch(p) {
  const tone = p.tone || "dark";
  const accent = p.accent || "#0062ff";
  const t = TONES[tone] || TONES.dark;
  return wrap((uid) => `${defs(uid, tone, accent)}${shadow(uid)}
    <path d="M168 140V108c0-10 6-16 12-16h40c6 0 12 6 12 16v32z" fill="${t.bottom}"/>
    <path d="M168 260v32c0 10 6 16 12 16h40c6 0 12-6 12-16v-32z" fill="${t.bottom}"/>
    <rect x="158" y="132" width="84" height="136" rx="30" fill="url(#${uid}-body)"/>
    <rect x="158.75" y="132.75" width="82.5" height="134.5" rx="29.5" fill="none" stroke="${t.rim}" stroke-opacity="0.7" stroke-width="1.5"/>
    <rect x="166" y="140" width="68" height="120" rx="24" fill="url(#${uid}-screen)"/>
    <rect x="166" y="140" width="68" height="120" rx="24" fill="url(#${uid}-glare)" opacity="0.6"/>
    <circle cx="200" cy="200" r="30" fill="none" stroke="url(#${uid}-accent)" stroke-width="5" stroke-opacity="0.8"/>
    <rect x="186" y="166" width="28" height="6" rx="3" fill="#fff" fill-opacity="0.28"/>
    <rect x="190" y="238" width="20" height="5" rx="2.5" fill="#fff" fill-opacity="0.2"/>
    <rect x="242" y="158" width="5" height="20" rx="2.5" fill="${t.rim}"/>
    <rect x="242" y="184" width="5" height="12" rx="2.5" fill="${t.rim}"/>`);
}

function charger(p) {
  const tone = p.tone || "white";
  const accent = p.accent || "#0062ff";
  const t = TONES[tone] || TONES.white;
  return wrap((uid) => `${defs(uid, tone, accent)}${shadow(uid)}
    <rect x="138" y="146" width="124" height="124" rx="30" fill="url(#${uid}-body)"/>
    <rect x="138.75" y="146.75" width="122.5" height="122.5" rx="29.5" fill="none" stroke="${t.rim}" stroke-opacity="0.7" stroke-width="1.4"/>
    <circle cx="200" cy="208" r="36" fill="none" stroke="${t.rim}" stroke-opacity="0.7" stroke-width="3"/>
    <circle cx="200" cy="208" r="24" fill="none" stroke="url(#${uid}-accent)" stroke-opacity="0.65" stroke-width="2.5"/>
    <circle cx="200" cy="208" r="8" fill="${t.rim}" fill-opacity="0.55"/>
    <path d="M200 270c0 26-14 34-34 42" fill="none" stroke="${t.rim}" stroke-opacity="0.55" stroke-width="7" stroke-linecap="round"/>
    <rect x="156" y="164" width="34" height="6" rx="3" fill="#fff" fill-opacity="0.35"/>`);
}

function powerbank(p) {
  const tone = p.tone || "dark";
  const accent = p.accent || "#0062ff";
  const t = TONES[tone] || TONES.dark;
  return wrap((uid) => `${defs(uid, tone, accent)}${shadow(uid)}
    <rect x="140" y="98" width="120" height="228" rx="22" fill="url(#${uid}-body)"/>
    <rect x="140.75" y="98.75" width="118.5" height="226.5" rx="21.5" fill="none" stroke="${t.rim}" stroke-opacity="0.5" stroke-width="1.4"/>
    <rect x="154" y="114" width="92" height="58" rx="10" fill="url(#${uid}-screen)"/>
    <rect x="166" y="128" width="46" height="10" rx="5" fill="url(#${uid}-accent)"/>
    <rect x="166" y="146" width="66" height="6" rx="3" fill="#fff" fill-opacity="0.2"/>
    <rect x="222" y="128" width="8" height="8" rx="2" fill="#22c55e"/>
    <rect x="164" y="196" width="22" height="10" rx="5" fill="#0b1220" fill-opacity="0.55"/>
    <rect x="192" y="196" width="22" height="10" rx="5" fill="#0b1220" fill-opacity="0.55"/>
    <rect x="220" y="196" width="16" height="10" rx="5" fill="#0b1220" fill-opacity="0.55"/>
    <rect x="164" y="230" width="72" height="5" rx="2.5" fill="#fff" fill-opacity="0.14"/>
    <rect x="164" y="243" width="50" height="5" rx="2.5" fill="#fff" fill-opacity="0.1"/>
    <rect x="168" y="292" width="16" height="8" rx="3" fill="${t.rim}" fill-opacity="0.5"/>
    <rect x="196" y="292" width="16" height="8" rx="3" fill="${t.rim}" fill-opacity="0.5"/>`);
}

function console(p) {
  const tone = p.tone || "white";
  const accent = p.accent || "#0062ff";
  const t = TONES[tone] || TONES.white;
  return wrap((uid) => `${defs(uid, tone, accent)}${shadow(uid)}
    <rect x="70" y="120" width="260" height="150" rx="46" fill="url(#${uid}-body)"/>
    <rect x="70.75" y="120.75" width="258.5" height="148.5" rx="45.5" fill="none" stroke="${t.rim}" stroke-opacity="0.55" stroke-width="1.4"/>
    <rect x="126" y="136" width="148" height="118" rx="8" fill="url(#${uid}-screen)"/>
    <rect x="126" y="136" width="148" height="118" rx="8" fill="url(#${uid}-glare)" opacity="0.5"/>
    <rect x="140" y="150" width="72" height="8" rx="4" fill="url(#${uid}-accent)" opacity="0.6"/>
    <rect x="140" y="168" width="48" height="5" rx="2.5" fill="#fff" fill-opacity="0.18"/>
    <circle cx="104" cy="180" r="13" fill="${t.bottom}" fill-opacity="0.55"/>
    <circle cx="104" cy="180" r="5" fill="${t.rim}" fill-opacity="0.6"/>
    <circle cx="296" cy="180" r="13" fill="${t.bottom}" fill-opacity="0.55"/>
    <circle cx="296" cy="180" r="5" fill="${t.rim}" fill-opacity="0.6"/>
    <g stroke="${t.rim}" stroke-opacity="0.55" stroke-width="4" stroke-linecap="round">
      <path d="M88 216h24M100 204v24"/><path d="M288 216h24"/>
    </g>`);
}

const RENDERERS = { phone, foldable, laptop, headphones, earbuds, speaker, watch, tablet, charger, powerbank, console };

export function productArt(product) {
  const render = RENDERERS[product?.art] || RENDERERS.phone;
  return render(product || {});
}

/** Unified image markup: Cloudinary <img> when a publicId exists, SVG otherwise. */
export function productImage(product, { className = "", alt = "", sizes = "(min-width:1024px) 300px, 45vw", eager = false } = {}) {
  const publicId = product?.images?.[0]?.publicId;
  if (publicId && isCloudinaryConfigured) {
    const src = cldUrl(publicId, { w: 640 });
    const srcset = cldSrcset(publicId);
    const placeholder = cldPlaceholder(publicId);
    return `<img class="${esc(className)}" src="${esc(src)}" srcset="${esc(srcset)}" sizes="${esc(sizes)}"
      width="640" height="640" loading="${eager ? "eager" : "lazy"}" decoding="async"
      alt="${esc(alt)}" style="background-image:url('${esc(placeholder)}');background-size:cover">`;
  }
  return productArt(product);
}
