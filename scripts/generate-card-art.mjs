import { mkdir, writeFile } from "node:fs/promises";

const outDir = new URL("../public/assets/cards/generated/", import.meta.url);
await mkdir(outDir, { recursive: true });

const backgrounds = ["bg-meadow", "bg-cave", "bg-ramen"];
const characters = [
  "chiikawa", "hachiware", "usagi", "momonga", "ode", "ode-market", "ode-picnic", "ode-night",
  "kurimanju", "rakko", "shisa-furuhonya", "kani", "pochette-armor", "ramen-armor", "labor-armor",
  "master-armor", "pajama-party", "seiren", "old-lady",
];
const palette = [
  ["#ffcad4", "#ffd9ad"], ["#c8e6ff", "#d7f8ed"], ["#d9c9ff", "#ffe5f0"], ["#c9f2d0", "#fff0bd"],
  ["#ffd7a6", "#d4efff"], ["#e9d2ff", "#c5f1ed"], ["#ffc6c6", "#d5d0ff"], ["#cbe8ff", "#ffe1bf"],
];

for (let index = 0; index < 90; index += 1) {
  const tier = index < 40 ? 1 : index < 70 ? 2 : 3;
  const base = tier === 1 ? backgrounds[index % backgrounds.length] : characters[(index - 40) % characters.length];
  const [from, to] = palette[index % palette.length];
  const angle = (index * 23) % 360;
  const x = 8 + ((index * 13) % 22);
  const y = 4 + ((index * 17) % 18);
  const scale = 1.08 + ((index * 7) % 20) / 100;
  const motif = index % 4;
  const ornaments = motif === 0
    ? `<circle cx="${18 + (index % 4) * 18}" cy="${18 + (index % 3) * 12}" r="7" fill="${to}" opacity=".42"/><circle cx="82" cy="76" r="12" fill="${from}" opacity=".38"/>`
    : motif === 1
      ? `<path d="M0 70 Q25 ${45 + index % 20} 50 70 T100 70 V100 H0Z" fill="${to}" opacity=".36"/><circle cx="18" cy="20" r="5" fill="white" opacity=".7"/>`
      : motif === 2
        ? `<path d="M10 10 L18 22 L10 34 L2 22Z M86 65 L94 77 L86 89 L78 77Z" fill="${to}" opacity=".54"/>`
        : `<circle cx="${25 + index % 5 * 14}" cy="${72 - index % 4 * 9}" r="4" fill="white" opacity=".7"/><circle cx="76" cy="${18 + index % 5 * 8}" r="3" fill="${to}" opacity=".8"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient><filter id="soft"><feGaussianBlur stdDeviation=".25"/></filter></defs>
  <rect width="100" height="100" rx="16" fill="url(#g)"/>
  <image xlink:href="../${base}.png" x="-${x / 4}" y="-${y / 4}" width="${100 * scale}" height="${100 * scale}" preserveAspectRatio="xMidYMid slice" opacity=".96" filter="url(#soft)"/>
  <rect width="100" height="100" rx="16" fill="url(#g)" opacity=".${index % 4 + 1}" style="mix-blend-mode:soft-light"/>
  ${ornaments}
  <path d="M0 92 Q24 ${80 + index % 12} 50 92 T100 92" fill="none" stroke="white" stroke-width="1.5" opacity=".34"/>
  </svg>`;
  await writeFile(new URL(`card-${String(index).padStart(3, "0")}.svg`, outDir), svg);
}

console.log("generated 90 unique card art files");
