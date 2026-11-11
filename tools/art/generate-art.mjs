#!/usr/bin/env node
// Generates the product artwork: one studio-style SVG per product × colour.
//
//   tools/art/products/{slug}/{colour-slug}.svg   source pictures: tools/seed/generate-images.mjs
//                                                 loads them into the ProductImage table
//   public/media/fallback.svg                     shown by the site when a product has no picture
//
// Each drawing is a clean "flat-lay / ghost mannequin" illustration on a warm
// studio ground, filled with the variant's real colour (catalog COLORS) and
// shaded from it, so a colour swatch always shows the right garment colour.
// A photograph in tools/photos/ takes the drawing's place in the seed, and admins
// can add or replace pictures at any time from the admin.
//
// Zero dependencies, deterministic output.   Usage: node tools/art/generate-art.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, COLORS } from '../seed/catalog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'tools', 'art', 'products');
const FALLBACK = join(ROOT, 'public', 'media', 'fallback.svg');

// Same slug rule as tools/seed/generate-images.mjs, which reads these files.
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ------------------------------------------------------------------ colour
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h) => {
  const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function palette(c) {
  const L = lum(c);
  const light = L > 0.5, dark = L < 0.075;
  const line = light ? mix(c, '#3b3129', 0.34) : dark ? mix(c, '#000000', 0.5) : mix(c, '#000000', 0.32);
  const seam = dark ? mix(c, '#ffffff', 0.3) : mix(c, '#000000', light ? 0.24 : 0.3);
  const fold = dark ? '#ffffff' : '#2a2018';
  const foldOp = dark ? 0.07 : light ? 0.07 : 0.11;
  return {
    c, light, dark,
    hi: mix(c, '#ffffff', light ? 0.45 : dark ? 0.14 : 0.18),
    lo: mix(c, '#000000', light ? 0.09 : dark ? 0.28 : 0.2),
    deep: mix(c, '#000000', light ? 0.2 : dark ? 0.45 : 0.36),
    line, seam,
    hl: dark ? mix(c, '#ffffff', 0.22) : mix(c, '#ffffff', 0.5),
    body: 'fill="url(#b)"',
    out: `stroke="${line}" stroke-width="2" stroke-linejoin="round"`,
    sm: `fill="none" stroke="${seam}" stroke-width="1.6" stroke-opacity=".75" stroke-linecap="round"`,
    st: `fill="none" stroke="${seam}" stroke-width="1.4" stroke-dasharray="5 4" stroke-opacity=".8" stroke-linecap="round"`,
    fd: `fill="${fold}" fill-opacity="${foldOp}"`,
    fline: `fill="none" stroke="${fold}" stroke-opacity="${foldOp * 1.6}" stroke-width="3" stroke-linecap="round"`,
  };
}

const BRASS = '#B8924C', BRASS_HI = '#E3C47E', SILVER = '#B9B6AE', HORN = '#5A4434', PEARL = '#F5F1E9';

// ------------------------------------------------------------------ geometry
const f = (n) => String(Math.round(n * 10) / 10);

// A symmetric silhouette from its left half. The half starts at the top centre
// line (x = 400) and runs down the left side; the right side is the mirror image.
function sym(segs) {
  const parts = [];
  const pts = [];
  let cur = null;
  for (const [t, ...n] of segs) {
    if (t === 'M') { cur = [n[0], n[1]]; parts.push(`M${f(n[0])} ${f(n[1])}`); continue; }
    const to = [n[n.length - 2], n[n.length - 1]];
    const ctrl = [];
    for (let i = 0; i < n.length - 2; i += 2) ctrl.push([n[i], n[i + 1]]);
    pts.push({ t, from: cur, ctrl, to });
    parts.push(t + [...ctrl.flat(), ...to].map(f).join(' '));
    cur = to;
  }
  const m = ([x, y]) => [800 - x, y];
  if (Math.abs(cur[0] - 400) > 0.01) parts.push(`L${f(800 - cur[0])} ${f(cur[1])}`);
  for (let i = pts.length - 1; i >= 0; i--) {
    const s = pts[i];
    parts.push(s.t + [...[...s.ctrl].reverse().map(m).flat(), ...m(s.from)].map(f).join(' '));
  }
  return parts.join('') + 'Z';
}

// Mirror an absolute path (M L H V Q C Z) across the centre line x = 400.
function mirD(d) {
  return d.replace(/([MLHVQCZ])([^MLHVQCZ]*)/g, (_, cmd, args) => {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    if (cmd === 'H') return 'H' + n.map((x) => f(800 - x)).join(' ');
    if (cmd === 'V' || cmd === 'Z') return cmd + n.map(f).join(' ');
    return cmd + n.map((v, i) => (i % 2 === 0 ? f(800 - v) : f(v))).join(' ');
  });
}
const both = (d, attrs) => `<path d="${d}" ${attrs}/><path d="${mirD(d)}" ${attrs}/>`;
const p = (d, attrs) => `<path d="${d}" ${attrs}/>`;
const dot = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}" ${extra}/>`;

// The silhouette is drawn once as <path id="s"> and reused for gloss, texture and clipping.
const silhouette = (d, P, extra = '') =>
  `<path id="s" d="${d}" ${P.body} ${P.out}/>${extra}<use xlink:href="#s" fill="url(#gl)"/>`;

const button = (x, y, r, fill = PEARL) =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}" stroke="${mix(fill, '#000000', 0.3)}" stroke-width="1"/>` +
  `<circle cx="${f(x - r * 0.28)}" cy="${f(y)}" r="${Math.max(0.8, r * 0.14)}" fill="${mix(fill, '#000000', 0.45)}"/>` +
  `<circle cx="${f(x + r * 0.28)}" cy="${f(y)}" r="${Math.max(0.8, r * 0.14)}" fill="${mix(fill, '#000000', 0.45)}"/>`;

const buttonFor = (P) => (P.dark ? '#2b2420' : P.light ? PEARL : HORN);

// Texture patterns (fine, low-contrast; tile in user space).
const pat = {
  rib: (P, w = 9, op = 0.22) => `<pattern id="rib" width="${w}" height="20" patternUnits="userSpaceOnUse"><path d="M${w / 2} 0V20" stroke="${P.dark ? '#fff' : P.seam}" stroke-opacity="${P.dark ? op * 0.5 : op}" stroke-width="${Math.max(1.2, w / 6)}"/></pattern>`,
  knit: (P) => `<pattern id="knit" width="8" height="9" patternUnits="userSpaceOnUse"><path d="M0 1l4 5 4-5" fill="none" stroke="${P.dark ? '#fff' : P.seam}" stroke-opacity="${P.dark ? 0.07 : 0.15}" stroke-width="1"/></pattern>`,
  twill: (P) => `<pattern id="tw" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)"><path d="M0 0V6" stroke="#ffffff" stroke-opacity="${P.dark ? 0.08 : 0.12}" stroke-width="1.6"/><path d="M3 0V6" stroke="#000000" stroke-opacity=".06" stroke-width="1"/></pattern>`,
  weave: (P) => `<pattern id="cv" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 2.5H5M2.5 0V5" stroke="${P.dark ? '#fff' : '#000'}" stroke-opacity="${P.dark ? 0.06 : 0.05}" stroke-width="1"/></pattern>`,
  dots: (P, id = 'dt', gap = 7, op = 0.12) => `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse"><circle cx="${gap / 2}" cy="${gap / 2}" r="1.1" fill="${P.dark ? '#fff' : '#000'}" fill-opacity="${P.dark ? op * 0.6 : op}"/></pattern>`,
  slub: (P) => `<pattern id="sl" width="40" height="14" patternUnits="userSpaceOnUse"><path d="M2 3h14M22 9h12M8 12h7" stroke="${P.dark ? '#fff' : '#000'}" stroke-opacity="${P.dark ? 0.05 : 0.06}" stroke-width="1.2" stroke-linecap="round"/></pattern>`,
};

// ------------------------------------------------------------------ tops
function shirt(P, o = {}) {
  const ox = !!o.oxford;
  const g = ox ? {
    d: sym([['M', 400, 196], ['L', 348, 178], ['L', 198, 210], ['C', 174, 330, 132, 470, 104, 598], ['L', 170, 628], ['C', 190, 530, 212, 450, 232, 402], ['C', 224, 520, 220, 620, 218, 716], ['Q', 260, 766, 400, 772]]),
    hem: 772, cuff: 'M110,560L174,588L170,628L104,598Z', cuffSt: 'M114,572L172,598', cuffBtn: [154, 610],
    seam: 'M202,214Q216,320 232,402', side: 'M232,408C224,520 220,620 218,716L250,724C250,620 254,520 262,422Z',
    sleeve: 'M232,404C212,460 192,540 178,606L194,610C206,550 226,470 246,420Z', hemSt: 'M222,704Q262,756 398,760',
    leaf: 'M352,180C348,202 340,220 332,238L397,226L400,204Z', leafSt: 'M354,194C350,210 344,222 338,232',
    pocket: `<path d="M456,304H520V372H456Z" ${P.body} stroke="${P.line}" stroke-width="1.3"/><path d="M460,314H516" ${P.st}/>`,
  } : {
    d: sym([['M', 400, 196], ['L', 346, 178], ['L', 190, 214], ['C', 164, 330, 118, 460, 88, 586], ['L', 158, 618], ['C', 182, 520, 206, 446, 226, 404], ['C', 214, 520, 208, 620, 206, 712], ['Q', 252, 772, 400, 780]]),
    hem: 780, cuff: 'M96,548L164,578L158,618L88,586Z', cuffSt: 'M100,560L160,588', cuffBtn: [140, 598],
    seam: 'M194,218Q210,320 226,404', side: 'M226,410C214,520 208,620 206,712L238,726C238,620 242,520 250,424Z',
    sleeve: 'M226,406C204,460 182,540 168,600L184,604C198,546 218,470 240,420Z', hemSt: 'M210,700Q252,762 398,768',
    leaf: 'M350,180C346,206 336,228 326,250L398,228L400,202Z', leafSt: 'M352,194C348,212 340,228 334,240',
    pocket: `<path d="M456,300H526V368L491,384L456,368Z" ${P.body} stroke="${P.line}" stroke-width="1.3"/><path d="M460,310H522" ${P.st}/>`,
  };
  const btn = P.dark ? '#d8d2c6' : PEARL;
  let buttons = '';
  for (let y = 262; y < g.hem - 40; y += 74) buttons += button(400, y, 6.5, btn);
  return {
    shadow: [400, g.hem + 8, 230, 18],
    defs: pat.slub(P),
    body:
      silhouette(g.d, P, `<use xlink:href="#s" fill="url(#sl)"/>${both(g.side, P.fd)}${both(g.sleeve, P.fd)}`) +
      both(g.seam, P.st) +
      both(g.cuff, `${P.body} stroke="${P.line}" stroke-width="1.5"`) + both(g.cuffSt, P.st) +
      button(g.cuffBtn[0], g.cuffBtn[1], 4, btn) + button(800 - g.cuffBtn[0], g.cuffBtn[1], 4, btn) +
      `<path d="M389,222H411V${g.hem - 6}H389Z" ${P.body} stroke="${P.line}" stroke-width="1" stroke-opacity=".6"/>` +
      p(`M392,228V${g.hem - 10}`, P.st) + p(`M408,228V${g.hem - 10}`, P.st) +
      g.pocket + buttons +
      p('M318,420Q310,580 320,740', P.fline) + p('M480,430Q492,580 478,750', P.fline) +
      both(g.hemSt, P.st) +
      `<path d="M346,178Q400,160 454,178L450,190Q400,174 350,190Z" fill="${P.lo}" ${P.out}/>` +
      both(g.leaf, `${P.body} ${P.out}`) + both(g.leafSt, P.st) +
      (ox ? button(340, 230, 3.6, btn) + button(460, 230, 3.6, btn) : ''),
  };
}

function tee(P, o = {}) {
  const g = o.boxy ? {
    d: sym([['M', 400, 228], ['Q', 364, 226, 350, 190], ['L', 220, 220], ['L', 112, 352], ['L', 182, 410], ['L', 214, 378], ['C', 210, 500, 208, 620, 208, 738], ['L', 400, 740]]),
    hem: 740, neck: 'M350,190Q364,226 400,228Q436,226 450,190L438,186Q428,212 400,214Q372,212 362,186Z', inner: 'M362,186Q372,212 400,214Q428,212 438,186Q400,174 362,186Z',
    sleeveSt: 'M124,342L190,396', arm: 'M220,220L214,378', side: 'M214,382C210,500 208,620 208,738L242,738C242,620 244,500 250,396Z', hemSt: 'M210,722L400,724',
  } : {
    d: sym([['M', 400, 232], ['Q', 362, 230, 348, 192], ['L', 232, 222], ['L', 122, 344], ['L', 188, 400], ['L', 230, 366], ['C', 226, 500, 224, 640, 224, 762], ['L', 400, 764]]),
    hem: 764, neck: 'M348,192Q362,230 400,232Q438,230 452,192L440,188Q430,216 400,218Q370,216 360,188Z', inner: 'M360,188Q370,216 400,218Q430,216 440,188Q400,176 360,188Z',
    sleeveSt: 'M134,332L198,386', arm: 'M232,222L230,366', side: 'M230,370C226,500 224,640 224,762L258,762C258,640 260,500 266,384Z', hemSt: 'M226,746L400,748',
  };
  const pocket = o.pocket ? `<path d="M454,320H522V392H454Z" ${P.body} stroke="${P.line}" stroke-width="1.3"/><path d="M458,332H518" ${P.st}/>` : '';
  return {
    shadow: [400, g.hem + 8, 220, 17],
    defs: pat.dots(P, 'dt', 5, 0.06),
    body:
      silhouette(g.d, P, `<use xlink:href="#s" fill="url(#dt)"/>${both(g.side, P.fd)}`) +
      both(g.arm, P.sm) + both(g.sleeveSt, P.st) + both(g.hemSt, P.st) +
      p('M320,300Q310,520 324,720', P.fline) + p('M478,320Q490,540 474,730', P.fline) +
      `<path d="${g.neck}" fill="${P.lo}" ${P.out}/><path d="${g.inner}" fill="${P.deep}" fill-opacity=".55"/>` + pocket,
  };
}

function tank(P) {
  const d = sym([['M', 400, 300], ['Q', 326, 294, 312, 170], ['L', 270, 168], ['Q', 270, 272, 226, 336], ['C', 230, 480, 232, 620, 234, 752], ['L', 400, 756]]);
  return {
    shadow: [400, 764, 190, 15],
    defs: pat.rib(P, 8, 0.2),
    body:
      silhouette(d, P, `<use xlink:href="#s" fill="url(#rib)"/>${both('M228,340C232,480 234,620 236,752L268,752C266,620 264,480 262,350Z', P.fd)}`) +
      both('M270,168Q270,272 226,336', `fill="none" stroke="${P.lo}" stroke-width="7" stroke-linecap="round"`) +
      p('M312,170Q326,294 400,300Q474,294 488,170', `fill="none" stroke="${P.lo}" stroke-width="7"`) +
      `<path d="M312,170Q326,294 400,300Q474,294 488,170Q476,164 472,174Q458,282 400,286Q342,282 328,174Q324,164 312,170Z" fill="${P.deep}" fill-opacity=".25"/>` +
      both('M236,738L400,740', P.st) + p('M340,350Q330,560 342,730', P.fline),
  };
}

function blouse(P) {
  const d = sym([['M', 400, 214], ['Q', 366, 212, 350, 180], ['L', 268, 188], ['Q', 270, 296, 232, 354], ['C', 224, 480, 216, 620, 210, 748], ['Q', 300, 772, 400, 768]]);
  return {
    shadow: [400, 776, 210, 15],
    defs: '<clipPath id="cl"><use xlink:href="#s"/></clipPath>',
    body:
      silhouette(d, P,
        `<g clip-path="url(#cl)"><path d="M290,250C340,420 360,580 340,790L376,790C396,580 380,420 326,240Z" fill="#fff" fill-opacity=".16"/>` +
        `<path d="M480,260C450,420 462,620 498,790L522,790C488,620 480,420 504,262Z" fill="#fff" fill-opacity=".1"/>` +
        `<path d="M392,300C410,460 404,620 420,790L452,790C430,620 436,460 414,300Z" ${P.fd}/>` +
        both('M234,360C226,480 220,620 214,770L250,776C254,620 260,480 266,372Z', P.fd) + '</g>') +
      p('M350,180Q366,212 400,214Q434,212 450,180', `fill="none" stroke="${P.lo}" stroke-width="5"`) +
      both('M268,188Q270,296 232,354', `fill="none" stroke="${P.lo}" stroke-width="4"`) +
      both('M238,440L300,418', P.sm) + both('M214,736Q300,758 398,754', P.st),
  };
}

function knitTop(P, kind) {
  const relaxed = kind === 'turtleneck' || kind === 'cardigan';
  const sh = relaxed ? 214 : 224, side = relaxed ? 226 : 236;
  const neck = kind === 'cardigan' ? 400 : 200;
  const segs = [['M', 400, neck], kind === 'cardigan' ? ['L', 348, 166] : ['Q', 362, 198, 348, 166],
    ['L', sh, 196], ['C', sh - 30, 320, 150, 470, 124, 598], ['L', 126, 656], ['L', 192, 672], ['L', 194, 612],
    ['C', 206, 500, 222, 420, side + 8, 372], ['C', side + 2, 540, side, 640, side, 690], ['L', side + 2, 760], ['L', 400, 762]];
  const d = sym(segs);
  const ribW = kind === 'turtleneck' ? 16 : 8;
  const hemD = sym([['M', 400, 692], ['L', side, 690], ['L', side + 2, 760], ['L', 400, 762]]);
  let extra = '';
  if (kind === 'cardigan') {
    let b = '';
    for (let y = 440; y < 750; y += 72) b += button(400, y, 8, P.dark ? '#2b2420' : '#7a5c45');
    extra =
      both('M262,582H336V664H262Z', `${P.body} stroke="${P.line}" stroke-width="1.3"`) + both('M264,594H334', P.st) +
      both('M352,168L398,400L398,762', `fill="none" stroke="${P.lo}" stroke-width="22" stroke-linejoin="round"`) +
      both('M352,168L398,400L398,762', 'fill="none" stroke="url(#rib)" stroke-width="22"') +
      p('M402,400V762', P.sm) + b;
  } else if (kind === 'turtleneck') {
    const col = 'M346,176C344,142 348,114 352,100L448,100C452,114 456,142 454,176Q400,194 346,176Z';
    extra = `<path d="${col}" ${P.body} ${P.out}/><path d="${col}" fill="url(#rib)"/>` +
      `<path d="M348,130Q400,144 452,130" fill="none" stroke="${P.deep}" stroke-opacity=".35" stroke-width="3"/>` +
      `<path d="M352,100Q400,86 448,100Q400,112 352,100Z" fill="${P.deep}" fill-opacity=".6"/>`;
  } else {
    const band = 'M348,166Q362,198 400,200Q438,198 452,166L438,160Q428,186 400,188Q372,186 362,160Z';
    extra = `<path d="${band}" ${P.body} ${P.out}/><path d="${band}" fill="url(#rib)"/>` +
      `<path d="M362,160Q372,186 400,188Q428,186 438,160Q400,150 362,160Z" fill="${P.deep}" fill-opacity=".5"/>`;
  }
  const back = kind === 'cardigan' ? `<path d="M348,166L452,166L400,400Z" fill="${P.deep}"/>` : '';
  return {
    shadow: [400, 770, 220, 16],
    defs: pat.rib(P, ribW, kind === 'turtleneck' ? 0.26 : 0.24) + pat.knit(P),
    body:
      back + silhouette(d, P,
        `<use xlink:href="#s" fill="url(#${kind === 'turtleneck' ? 'rib' : 'knit'})"/>` +
        both(`M${side + 8},376C${side + 2},540 ${side},640 ${side},690L${side + 34},690C${side + 34},640 ${side + 36},540 ${side + 40},392Z`, P.fd) +
        both(`M${side + 8},378C214,440 196,520 190,604L206,606C212,526 226,452 ${side + 20},396Z`, P.fd)) +
      both('M124,598L194,612L192,672L126,656Z', `${P.body} stroke="${P.line}" stroke-width="1.5"`) + both('M124,598L194,612L192,672L126,656Z', 'fill="url(#rib)"') +
      `<path d="${hemD}" ${P.body} stroke="${P.line}" stroke-width="1.5"/><path d="${hemD}" fill="url(#rib)"/>` +
      both(`M${sh + 4},200Q${sh + 20},300 ${side + 8},372`, P.st) + extra,
  };
}

// ------------------------------------------------------------------ dresses & skirts
function dress(P) {
  const d = sym([['M', 400, 214], ['Q', 372, 212, 358, 180], ['L', 306, 188], ['C', 270, 186, 244, 214, 240, 262], ['Q', 252, 300, 282, 298], ['L', 296, 300], ['Q', 296, 380, 304, 432], ['C', 284, 560, 236, 760, 198, 900], ['Q', 300, 922, 400, 916]]);
  let gathers = '';
  for (let i = 0; i <= 12; i++) {
    const x = 312 + i * 14.7;
    gathers += p(`M${f(x)},438Q${f(x + (x - 400) * 0.05)},470 ${f(x + (x - 400) * 0.14)},${505 + ((i * 7) % 3) * 9}`, P.sm.replace('.75', '.45'));
  }
  let folds = '';
  for (let i = 0; i < 6; i++) {
    const x0 = 322 + i * 31, x1 = 236 + i * 66;
    folds += p(`M${x0},470C${f(x0 + (x1 - x0) * 0.2)},620 ${f(x1 - 6)},780 ${x1},906L${x1 + 22},908C${f(x1 + 14)},780 ${f(x0 + (x1 - x0) * 0.25 + 10)},620 ${x0 + 9},470Z`, P.fd);
  }
  return {
    shadow: [400, 922, 230, 18],
    defs: '<clipPath id="cl"><use xlink:href="#s"/></clipPath>',
    body:
      silhouette(d, P, `<g clip-path="url(#cl)">${folds}</g>`) +
      p('M304,432Q400,444 496,432', P.sm) + gathers +
      both('M306,188C300,214 292,236 290,262', P.sm.replace('.75', '.4')) +
      both('M246,272Q262,292 286,290', P.st) +
      p('M358,180Q372,212 400,214Q428,212 442,180', `fill="none" stroke="${P.lo}" stroke-width="4"`) +
      both('M206,884Q300,904 398,900', P.st),
  };
}

function wrapdress(P) {
  const d = sym([['M', 400, 282], ['L', 354, 176], ['L', 300, 186], ['C', 262, 190, 238, 226, 236, 276], ['Q', 262, 300, 290, 296], ['Q', 298, 370, 306, 442], ['C', 290, 580, 246, 760, 214, 898], ['Q', 300, 916, 400, 912]]);
  return {
    shadow: [400, 918, 210, 17],
    defs: '<clipPath id="cl"><use xlink:href="#s"/></clipPath>',
    body:
      `<path d="M354,176L446,176L400,282Z" fill="${P.deep}"/>` +
      silhouette(d, P,
        `<g clip-path="url(#cl)"><path d="M400,282L470,444L456,456L392,300Z" ${P.fd}/>` +
        `<path d="M470,452C452,600 468,760 520,914L548,914C498,760 484,600 488,452Z" ${P.fd}/>` +
        `<path d="M330,470C318,620 290,780 270,906L298,908C314,780 336,620 344,470Z" ${P.fd}/>` +
        `<path d="M420,470C428,620 440,780 452,906L470,906C458,780 444,620 432,470Z" fill="#fff" fill-opacity=".07"/></g>`) +
      p('M354,176L470,444', `fill="none" stroke="${P.line}" stroke-width="2"`) +
      p('M470,452C452,600 468,760 520,912', `fill="none" stroke="${P.line}" stroke-width="2"`) +
      `<path d="M304,438Q400,450 496,438L497,460Q400,472 303,460Z" ${P.body} ${P.out}/>` +
      `<path d="M300,446C276,428 252,430 252,446C252,462 278,466 300,456Z" ${P.body} ${P.out}/>` +
      `<path d="M300,450C318,424 340,428 338,446C336,462 316,464 300,456Z" ${P.body} ${P.out}/>` +
      `<path d="M294,458C288,520 280,570 266,616L282,622C294,574 302,522 306,460Z" ${P.body} ${P.out}/>` +
      `<path d="M304,460C306,530 304,590 312,640L328,636C320,588 318,528 316,462Z" ${P.body} ${P.out}/>` +
      dot(300, 452, 7, P.lo, `stroke="${P.line}" stroke-width="1.5"`) +
      both('M300,186C294,214 290,240 290,262', P.sm.replace('.75', '.4')) +
      both('M222,884Q300,902 398,898', P.st),
  };
}

function poplindress(P) {
  const d = sym([['M', 400, 206], ['Q', 368, 204, 352, 172], ['L', 300, 178], ['Q', 300, 270, 272, 330], ['Q', 282, 400, 296, 450], ['C', 282, 600, 250, 760, 226, 876], ['Q', 310, 890, 400, 886]]);
  return {
    shadow: [400, 892, 200, 16],
    defs: '<clipPath id="cl"><use xlink:href="#s"/></clipPath>',
    body:
      silhouette(d, P,
        `<g clip-path="url(#cl)">${both('M300,470L268,880L300,882Z', P.fd)}${both('M372,470L352,884L372,886Z', P.fd)}` +
        `<path d="M396,470L398,886L414,886Z" fill="#fff" fill-opacity=".09"/></g>`) +
      both('M330,196Q318,330 330,452C322,600 300,760 290,880', P.sm) +
      p('M296,452Q400,462 504,452', P.sm.replace('.75', '.45')) +
      both('M300,492L320,566', P.sm) +
      p('M352,172Q368,204 400,206Q432,204 448,172', `fill="none" stroke="${P.lo}" stroke-width="4"`) +
      both('M358,184Q372,198 400,198', P.st) +
      both('M300,178Q300,270 272,330', `fill="none" stroke="${P.lo}" stroke-width="4"`) +
      both('M234,862Q310,876 398,872', P.st),
  };
}

function skirt(P) {
  const d = sym([['M', 400, 262], ['L', 300, 264], ['L', 298, 296], ['C', 290, 460, 262, 700, 232, 884], ['Q', 318, 900, 400, 896]]);
  let elastic = '';
  for (let x = 304; x <= 496; x += 8) elastic += p(`M${x},268Q${x + 3},280 ${x},292`, P.sm.replace('.75', '.4'));
  return {
    shadow: [400, 902, 190, 15],
    defs: '<clipPath id="cl"><use xlink:href="#s"/></clipPath>',
    body:
      silhouette(d, P,
        `<g clip-path="url(#cl)"><path d="M352,298C330,480 300,680 286,900L330,900C344,690 370,500 380,298Z" fill="#fff" fill-opacity=".2"/>` +
        `<path d="M430,298C450,500 488,700 520,900L548,900C512,690 470,500 452,298Z" fill="#fff" fill-opacity=".13"/>` +
        `<path d="M382,298C380,500 372,700 360,900L392,900C400,700 404,500 400,298Z" ${P.fd}/>` +
        `<path d="M300,300C292,480 270,700 244,900L276,900C292,700 306,480 316,300Z" ${P.fd}/>` +
        `<path d="M470,300C490,500 512,700 540,900L566,900C536,700 506,480 486,300Z" ${P.fd}/></g>`) +
      `<path d="M300,264L500,264L502,296L298,296Z" ${P.body} ${P.out}/>` + elastic +
      both('M238,872Q318,888 398,884', P.st),
  };
}

// ------------------------------------------------------------------ trousers
function trousers(P, kind, ctx = {}) {
  const spec = {
    widetrousers: { top: 158, band: 200, legs: [['C', 282, 330, 248, 620, 212, 902], ['L', 384, 904], ['C', 390, 700, 394, 540, 398, 452], ['L', 400, 446]], w: 294, hem: 902 },
    drawstring: { top: 176, band: 226, legs: [['C', 280, 400, 270, 640, 262, 884], ['L', 378, 884], ['C', 384, 700, 392, 560, 398, 480], ['L', 400, 474]], w: 290, hem: 884 },
    chinos: { top: 168, band: 206, legs: [['C', 290, 380, 282, 640, 286, 890], ['L', 378, 890], ['C', 384, 700, 392, 560, 398, 462], ['L', 400, 456]], w: 300, hem: 890 },
    jeans: { top: 166, band: 206, legs: [['C', 282, 380, 276, 640, 276, 894], ['L', 382, 894], ['C', 386, 700, 392, 560, 398, 464], ['L', 400, 458]], w: 294, hem: 894 },
  }[kind];
  const d = sym([['M', 400, spec.top], ['L', spec.w, spec.top], ['L', spec.w - 1, spec.band], ...spec.legs]);
  const isJeans = kind === 'jeans';
  const thread = isJeans ? (P.c.toLowerCase() === '#46474a' ? '#9A9A94' : '#C98B3E') : null;
  const thr = isJeans ? `fill="none" stroke="${thread}" stroke-width="1.6" stroke-dasharray="5 3.5" stroke-linecap="round"` : P.st;
  const band = `<path d="M${spec.w},${spec.top}H${800 - spec.w}V${spec.band}H${spec.w - 1}Z" ${P.body} ${P.out}/>`;
  const hem = spec.hem;
  const inner = { widetrousers: [384, 212], drawstring: [378, 262], chinos: [378, 286], jeans: [382, 276] }[kind];
  const legFold = `M${inner[0] - 2},${hem - 4}C${inner[0] + 4},700 ${inner[0] + 10},560 396,470L380,474C374,560 366,700 ${inner[0] - 24},${hem - 4}Z`;
  const creaseX = (inner[0] + inner[1]) / 2;
  let extra = '';
  if (kind === 'widetrousers') {
    extra = both('M338,200Q336,262 332,326', P.sm) + both('M364,200Q364,252 360,304', P.sm) +
      both(`M318,330C312,560 304,760 ${f(creaseX)},${hem - 6}`, `fill="none" stroke="#fff" stroke-opacity="${P.dark ? 0.12 : 0.28}" stroke-width="2"`) +
      both('M296,206L322,322', P.sm) + p('M412,200L413,300Q413,326 398,336', P.st) +
      both(`M312,${spec.top - 2}h10v${spec.band - spec.top + 6}h-10z`, `${P.body} stroke="${P.line}" stroke-width="1.2"`) +
      both(`M216,${hem - 14}L382,${hem - 12}`, P.st);
  } else if (kind === 'drawstring') {
    let gather = '';
    for (let x = 296; x <= 504; x += 9) gather += p(`M${x},182Q${x + 4},200 ${x},220`, P.sm.replace('.75', '.35'));
    const cord = P.light ? mix(P.c, '#8a7a66', 0.25) : mix(P.c, '#ffffff', 0.35);
    extra = gather + p(`M${spec.w},186H${800 - spec.w}`, P.st) + p(`M${spec.w},216H${800 - spec.w}`, P.st) +
      dot(390, 200, 4, P.deep) + dot(410, 200, 4, P.deep) +
      p('M390,200C384,252 394,292 380,352', `fill="none" stroke="${cord}" stroke-width="5" stroke-linecap="round"`) +
      p('M410,200C418,256 404,296 420,356', `fill="none" stroke="${cord}" stroke-width="5" stroke-linecap="round"`) +
      dot(380, 356, 6.5, cord) + dot(420, 360, 6.5, cord) +
      both('M292,232L318,330', P.sm) +
      both(`M${f(creaseX + 2)},300C${f(creaseX - 2)},560 ${f(creaseX)},760 ${f(creaseX)},${hem - 4}`, P.fline) +
      both(`M266,${hem - 14}L378,${hem - 12}`, P.st);
  } else if (kind === 'chinos') {
    extra = both('M300,212Q312,262 338,304', P.sm) + both('M304,214Q316,260 340,296', P.st) +
      p('M412,206L412,300Q412,322 396,330', P.st) +
      dot(400, 187, 6, P.deep, `stroke="${P.line}" stroke-width="1"`) +
      [314, 356, 444, 486].map((x) => `<path d="M${x},${spec.top - 3}h9v${spec.band - spec.top + 8}h-9z" ${P.body} stroke="${P.line}" stroke-width="1.2"/>`).join('') +
      both(`M${f(creaseX + 4)},300C${f(creaseX)},560 ${f(creaseX + 2)},760 ${f(creaseX + 2)},${hem - 4}`, `fill="none" stroke="#fff" stroke-opacity="${P.dark ? 0.1 : 0.22}" stroke-width="2"`) +
      both(`M290,${hem - 14}L378,${hem - 12}`, P.st);
  } else {
    const rivet = '#B87333';
    const button = P.c.toLowerCase() === '#46474a' ? SILVER : '#A9A398';
    extra =
      both('M340,208C338,252 318,284 296,292', `fill="none" stroke="${P.deep}" stroke-width="1.6"`) + both('M334,210C332,248 314,276 296,284', thr) +
      `<path d="M308,212L338,212L336,248L310,250Z" fill="none" stroke="${P.deep}" stroke-width="1.2"/>` + p('M310,220L336,220', thr) +
      p('M414,206L414,300Q414,330 398,338', thr) + p('M420,206L420,302Q420,338 400,346', thr) +
      dot(340, 211, 3.4, rivet) + dot(297, 291, 3.4, rivet) + dot(460, 211, 3.4, rivet) + dot(503, 291, 3.4, rivet) +
      dot(400, 186, 8, button, 'stroke="#6f6a62" stroke-width="1.5"') + dot(400, 186, 3, '#6f6a62') +
      p(`M${spec.w},180H${800 - spec.w}`, thr) + p(`M${spec.w},198H${800 - spec.w}`, thr) +
      [310, 352, 448, 490].map((x) => `<path d="M${x},${spec.top - 3}h10v${spec.band - spec.top + 8}h-10z" ${P.body} stroke="${P.deep}" stroke-width="1.2"/>`).join('') +
      both('M366,410Q382,420 392,436', `fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="3" stroke-linecap="round"`) +
      both('M360,432Q378,440 390,452', `fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="3" stroke-linecap="round"`) +
      both(`M286,${hem - 14}L382,${hem - 12}`, thr);
    if (/selvedge/.test(ctx.slug || '')) {
      const cuff = mix(P.c, '#ffffff', 0.32);
      extra += both(`M277,${hem - 46}L382,${hem - 44}L382,${hem}L276,${hem}Z`, `fill="${cuff}" stroke="${P.deep}" stroke-width="1.5"`) +
        both(`M277,${hem - 46}h7v46h-7z`, 'fill="#F3F0E8"') + both(`M280,${hem - 46}v46`, 'stroke="#B8312F" stroke-width="2"');
    }
  }
  return {
    shadow: [400, hem + 8, 160, 15],
    defs: (isJeans ? pat.twill(P) : kind === 'drawstring' ? pat.slub(P) : pat.weave(P)) + '<clipPath id="cl"><use xlink:href="#s"/></clipPath>',
    body:
      silhouette(d, P,
        `<use xlink:href="#s" fill="url(#${isJeans ? 'tw' : kind === 'drawstring' ? 'sl' : 'cv'})"/><g clip-path="url(#cl)">${both(legFold, P.fd)}` +
        (isJeans ? both('M326,330C310,420 314,540 330,600', `fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="44" stroke-linecap="round"`) : '') +
        both(`M${spec.w - 1},${spec.band}C${spec.w - 6},420 ${inner[1]},700 ${inner[1]},${hem}L${inner[1] + 18},${hem}C${inner[1] + 20},700 ${spec.w + 14},420 ${spec.w + 18},${spec.band}Z`, P.fd) + '</g>') +
      band + extra,
  };
}

// ------------------------------------------------------------------ outerwear
function lapels(P, { neck = 162, notch = 232, point = 292, bottom = 470, width = 1 }) {
  const L = `M352,${neck}L${f(400 - 96 * width)},${notch}L${f(400 - 70 * width)},${notch + 8}L${f(400 - 106 * width)},${point}L392,${bottom}L376,${neck + 14}Z`;
  return `<path d="M376,${neck + 14}L424,${neck + 14}L400,${bottom - 20}Z" fill="${P.deep}"/>` +
    both(L, `${P.body} ${P.out}`) +
    both(`M${f(400 - 66 * width)},${notch + 14}L${f(400 - 98 * width)},${point - 2}L390,${bottom - 10}`, P.st);
}

function coat(P, kind) {
  let d, hem, ex = '';
  const btn = P.light ? HORN : P.dark ? '#1e1a17' : mix(P.c, '#000000', 0.5);
  if (kind === 'trench') {
    d = sym([['M', 400, 166], ['L', 346, 158], ['L', 226, 196], ['C', 200, 320, 178, 470, 168, 622], ['L', 176, 652], ['L', 240, 664], ['C', 248, 530, 258, 430, 272, 374], ['C', 262, 560, 242, 760, 222, 906], ['L', 400, 914]]);
    hem = 912;
    ex =
      `<path d="M350,168L238,202L254,318L312,328L322,240Z" ${P.body} ${P.out}/>` + p('M262,308L306,316', P.st) +
      lapels(P, { neck: 162, notch: 226, point: 288, bottom: 474 }) +
      p('M408,474C430,500 446,530 448,560L448,910', `fill="none" stroke="${P.line}" stroke-width="2"`) +
      p('M440,560V906', P.st) +
      [[352, 486], [430, 486], [352, 612], [430, 612], [352, 690], [430, 690]].map(([x, y]) => button(x, y, 8, btn)).join('') +
      both('M350,164L248,196L252,212L350,180Z', `${P.body} stroke="${P.line}" stroke-width="1.4"`) + button(262, 204, 4.5, btn) + button(538, 204, 4.5, btn) +
      `<path d="M262,536Q400,548 538,536L538,572Q400,584 262,572Z" ${P.body} ${P.out}/>` + p('M264,544Q400,556 536,544', P.st) + p('M264,564Q400,576 536,564', P.st) +
      `<rect x="314" y="536" width="38" height="38" rx="5" fill="none" stroke="${btn}" stroke-width="5"/>` + p('M333,540V570', `stroke="${btn}" stroke-width="3"`) +
      `<path d="M300,566L286,664L306,668L320,570Z" ${P.body} ${P.out}/>` +
      both('M172,588L238,606L236,624L170,606Z', `${P.body} stroke="${P.line}" stroke-width="1.4"`) +
      both('M290,642L344,626L350,644L296,662Z', `${P.body} stroke="${P.line}" stroke-width="1.4"`) +
      both('M226,198Q250,290 272,374', P.st) + both('M226,892L398,898', P.st);
  } else if (kind === 'overcoat') {
    d = sym([['M', 400, 166], ['L', 346, 158], ['L', 232, 194], ['C', 212, 320, 196, 480, 188, 640], ['L', 192, 676], ['L', 254, 686], ['C', 258, 540, 264, 440, 274, 380], ['C', 270, 560, 262, 760, 256, 906], ['L', 400, 910]]);
    hem = 908;
    ex = lapels(P, { neck: 162, notch: 222, point: 270, bottom: 424, width: 0.85 }) +
      p('M402,424V906', `fill="none" stroke="${P.line}" stroke-width="2"`) + p('M410,430V902', P.st) +
      [452, 544, 636].map((y) => button(392, y, 9, btn)).join('') +
      both('M290,640L356,636L356,656L290,660Z', `${P.body} stroke="${P.line}" stroke-width="1.4"`) +
      `<path d="M444,330L496,322L497,334L445,342Z" fill="${P.lo}" stroke="${P.line}" stroke-width="1.2"/>` +
      both('M234,198Q256,300 274,380', P.st) +
      [0, 1, 2].map((i) => button(210 + i * 9, 662 + i * 2, 3.6, btn) + button(590 - i * 9, 662 + i * 2, 3.6, btn)).join('');
  } else {
    // cropped blazer
    d = sym([['M', 400, 166], ['L', 350, 158], ['L', 208, 190], ['C', 196, 330, 188, 520, 184, 738], ['L', 250, 750], ['C', 254, 560, 260, 440, 270, 368], ['L', 266, 690], ['Q', 330, 704, 400, 706]]);
    hem = 748;
    ex = lapels(P, { neck: 160, notch: 220, point: 278, bottom: 452, width: 0.95 }) +
      p('M402,452V700', `fill="none" stroke="${P.line}" stroke-width="2"`) +
      button(394, 488, 10, btn) + button(394, 572, 10, btn) +
      both('M290,600L352,596L352,614L290,618Z', `${P.body} stroke="${P.line}" stroke-width="1.4"`) +
      `<path d="M446,320L496,314L497,326L447,332Z" fill="${P.lo}" stroke="${P.line}" stroke-width="1.2"/>` +
      both('M208,190Q238,206 246,248Q256,300 270,368', P.st) +
      [0, 1, 2].map((i) => button(204 + i * 10, 724 + i * 2, 3.6, btn) + button(596 - i * 10, 724 + i * 2, 3.6, btn)).join('') +
      both('M268,684Q330,698 398,700', P.st);
  }
  return {
    shadow: [400, hem + 8, 220, 17],
    defs: (kind === 'overcoat' ? pat.dots(P, 'dt', 4, 0.07) : pat.weave(P)) + '<clipPath id="cl"><use xlink:href="#s"/></clipPath>',
    body: silhouette(d, P,
      `<use xlink:href="#s" fill="url(#${kind === 'overcoat' ? 'dt' : 'cv'})"/><g clip-path="url(#cl)">` +
      both('M272,378C264,560 250,760 236,904L268,906C278,760 290,560 298,392Z', P.fd) +
      both('M272,380C254,450 240,540 232,650L248,652C256,546 270,456 290,398Z', P.fd) + '</g>') + ex,
  };
}

function quilted(P) {
  const d = sym([['M', 400, 176], ['L', 348, 164], ['L', 222, 196], ['C', 196, 320, 160, 470, 140, 612], ['L', 146, 660], ['L', 210, 674], ['L', 212, 624], ['C', 222, 520, 236, 430, 250, 374], ['L', 244, 740], ['L', 400, 746]]);
  const cord = P.c.toLowerCase() === '#1f1f21' ? '#4a3a2e' : '#6B4A33';
  let snaps = '';
  for (let y = 250; y < 730; y += 94) snaps += dot(400, y, 5, SILVER, 'stroke="#7d7a73" stroke-width="1"');
  return {
    shadow: [400, 754, 220, 16],
    defs:
      `<radialGradient id="pf"><stop offset="0" stop-color="#fff" stop-opacity="${P.dark ? 0.1 : 0.16}"/><stop offset="1" stop-color="#000" stop-opacity="${P.dark ? 0.12 : 0.08}"/></radialGradient>` +
      `<pattern id="q" width="54" height="54" patternUnits="userSpaceOnUse" patternTransform="rotate(45 400 480)"><rect width="54" height="54" fill="url(#pf)"/><path d="M0 0H54M0 0V54" fill="none" stroke="${P.seam}" stroke-width="1.6" stroke-dasharray="4 3"/></pattern>` +
      `<pattern id="cd" width="5" height="10" patternUnits="userSpaceOnUse"><path d="M2.5 0V10" stroke="#fff" stroke-opacity=".18" stroke-width="2"/></pattern>`,
    body:
      silhouette(d, P, `<use xlink:href="#s" fill="url(#q)"/>${both('M250,378L244,740L276,742L282,392Z', P.fd)}`) +
      p(d, `fill="none" stroke="${P.lo}" stroke-width="5" stroke-linejoin="round"`) +
      both('M140,612L212,624L210,674L146,660Z', `fill="${P.lo}" stroke="${P.line}" stroke-width="1.4"`) +
      `<path d="M392,200H408V744H392Z" fill="${P.lo}" stroke="${P.line}" stroke-width="1.2"/>` + snaps +
      both('M270,580H360V700H270Z', `${P.body} stroke="${P.line}" stroke-width="1.4"`) +
      both('M266,570H364V606H266Z', `fill="${P.lo}" stroke="${P.line}" stroke-width="1.4"`) +
      dot(315, 590, 4, SILVER) + dot(485, 590, 4, SILVER) +
      `<path d="M346,164Q400,150 454,164L478,218Q400,240 322,218Z" fill="${cord}" stroke="${mix(cord, '#000000', 0.35)}" stroke-width="2"/>` +
      `<path d="M346,164Q400,150 454,164L478,218Q400,240 322,218Z" fill="url(#cd)"/>`,
  };
}

function rainjacket(P) {
  const d = sym([['M', 400, 96], ['C', 350, 96, 308, 120, 300, 170], ['C', 296, 196, 300, 214, 310, 226], ['L', 230, 234], ['C', 204, 340, 170, 490, 152, 628], ['L', 158, 664], ['L', 220, 676], ['L', 222, 628], ['C', 230, 520, 242, 440, 256, 388], ['L', 250, 770], ['L', 400, 774]]);
  const teeth = P.dark ? '#7c7c78' : '#2e2e2c';
  const hood = 'M340,142C340,120 368,112 400,112C432,112 460,120 460,142L456,232Q400,252 344,232Z';
  return {
    shadow: [400, 782, 220, 16],
    defs: '<clipPath id="cl"><use xlink:href="#s"/></clipPath>',
    body:
      silhouette(d, P,
        `<g clip-path="url(#cl)"><path d="M290,300C280,460 276,640 280,780L320,780C314,640 316,460 326,300Z" fill="#fff" fill-opacity=".13"/>` +
        `<path d="M476,300C492,460 498,640 492,780L512,780C518,640 512,460 496,300Z" fill="#fff" fill-opacity=".08"/>` +
        both('M256,392L250,770L282,772L288,404Z', P.fd) + both('M230,238C210,340 186,490 168,628L186,630C200,490 224,350 246,248Z', 'fill="#fff" fill-opacity=".09"') + '</g>') +
      `<path d="${hood}" fill="${P.deep}"/><path d="${hood}" fill="none" stroke="${P.c}" stroke-width="10"/><path d="${hood}" fill="none" stroke="${P.line}" stroke-width="1.5"/>` +
      p('M366,240C362,270 368,290 360,312', `fill="none" stroke="${P.deep}" stroke-width="3"`) + p('M434,240C438,270 432,290 440,312', `fill="none" stroke="${P.deep}" stroke-width="3"`) +
      `<rect x="352" y="310" width="14" height="20" rx="5" fill="#2f2f2d"/><rect x="434" y="310" width="14" height="20" rx="5" fill="#2f2f2d"/>` +
      p('M400,248V772', `stroke="${teeth}" stroke-width="5" stroke-dasharray="2 2"`) +
      `<path d="M404,248H420V772H404Z" ${P.body} stroke="${P.line}" stroke-width="1.2"/>` +
      `<rect x="394" y="252" width="12" height="26" rx="4" fill="#3a3a38"/>` +
      p('M446,332L508,314', `stroke="${teeth}" stroke-width="4" stroke-dasharray="2 2"`) + `<rect x="502" y="312" width="8" height="18" rx="3" fill="#3a3a38" transform="rotate(-16 506 321)"/>` +
      both('M230,234L310,226', P.sm) +
      both('M158,636L208,648L208,662L158,650Z', `fill="${P.lo}" stroke="${P.line}" stroke-width="1.2"`) +
      `<rect x="262" y="752" width="12" height="20" rx="4" fill="#2f2f2d"/><rect x="526" y="752" width="12" height="20" rx="4" fill="#2f2f2d"/>` +
      both('M252,758L398,762', P.st),
  };
}

// ------------------------------------------------------------------ shoes
// Profile drawings in local coordinates: toe at x≈0, heel at x≈480, ground y=0, up is negative.
function shoeArt(kind, P) {
  const soleLight = P.c.toLowerCase() === '#1f1f21' && kind === 'sneakers' ? '#F2EEE6' : '#F2EEE6';
  const lace = P.dark ? '#2a2826' : P.light ? '#F7F4EE' : mix(P.c, '#ffffff', 0.55);
  const eyes = (pts, r = 3.4) => pts.map(([x, y]) => dot(x, y, r, P.dark ? '#8c8880' : '#5e5850')).join('');
  const lacing = (pts) => {
    let d = '';
    pts.forEach(([x, y]) => { d += `M${x + 2},${y + 1}L${x - 7},${y - 16}`; });
    const [tx, ty] = pts[pts.length - 1];
    const bow = `M${tx - 7},${ty - 16}C${tx + 8},${ty - 34} ${tx + 26},${ty - 26} ${tx + 6},${ty - 14}M${tx - 7},${ty - 16}C${tx - 20},${ty - 36} ${tx - 40},${ty - 26} ${tx - 18},${ty - 12}M${tx - 7},${ty - 16}L${tx + 10},${ty + 14}M${tx - 7},${ty - 16}L${tx - 2},${ty + 20}`;
    return p(d, `fill="none" stroke="${lace}" stroke-width="5" stroke-linecap="round"`) +
      p(bow, `fill="none" stroke="${lace}" stroke-width="3.5" stroke-linecap="round"`) +
      p(d, `fill="none" stroke="#000" stroke-opacity=".15" stroke-width="1"`);
  };
  if (kind === 'sneakers') {
    const up = 'M10,-42C4,-70 20,-98 70,-108C130,-120 180,-128 222,-152L300,-188C322,-200 350,-200 362,-188L398,-170C430,-182 462,-182 482,-168C492,-130 494,-80 490,-44Z';
    const ey = [[236, -140], [252, -148], [268, -156], [284, -164], [300, -172]];
    return `<path d="M214,-146L298,-192C306,-214 340,-220 356,-200L362,-188L300,-176L232,-138Z" fill="${P.lo}" ${P.out}/>` +
      `<path d="M6,-46C-8,-36 -6,-8 22,-3L462,-3C488,-3 496,-22 492,-48Z" fill="${soleLight}" stroke="#c9c1b2" stroke-width="2"/>` +
      p('M18,-26L478,-26', 'stroke="#b5ab9b" stroke-width="1.4" stroke-dasharray="5 4" fill="none"') + p('M18,-8H470', 'stroke="#d6cec0" stroke-width="5"') +
      `<path d="${up}" ${P.body} ${P.out}/><path d="${up}" fill="url(#gl)"/>` +
      `<path d="M356,-192C380,-176 420,-174 478,-170C450,-188 410,-190 362,-190Z" fill="${P.deep}"/>` +
      `<path d="M300,-188C306,-214 338,-220 356,-200L362,-188Z" fill="${P.lo}" ${P.out}/>` +
      `<path d="M222,-150L300,-186L330,-150L252,-112Z" fill="${P.lo}" stroke="${P.line}" stroke-width="1.5"/>` +
      `<path d="M468,-176C486,-150 490,-110 488,-62L462,-62C464,-110 460,-150 450,-178Z" fill="${P.lo}" stroke="${P.line}" stroke-width="1.5"/>` +
      p('M96,-44C92,-80 102,-104 124,-114', P.sm) + p('M252,-112C300,-92 360,-72 462,-62', P.sm) + p('M258,-104C304,-86 362,-66 460,-56', P.st) +
      Array.from({ length: 12 }, (_, i) => dot(36 + (i % 4) * 12, -60 - Math.floor(i / 4) * 12, 1.6, P.seam, 'fill-opacity=".6"')).join('') +
      eyes(ey) + lacing(ey);
  }
  if (kind === 'runners') {
    const up = 'M6,-52C0,-86 30,-112 84,-118C150,-126 196,-136 236,-158L306,-196C330,-208 356,-206 368,-192L400,-176C432,-190 466,-188 486,-172C496,-136 498,-96 494,-62Z';
    const ey = [[248, -148], [264, -157], [280, -166], [296, -175]];
    return `<path d="M228,-154L304,-200C312,-220 344,-224 368,-206L372,-192L310,-184L246,-146Z" fill="${P.lo}" ${P.out}/>` +
      `<path d="M18,-14L470,-14C484,-14 486,0 470,0L24,0C8,0 6,-14 18,-14Z" fill="#6E6A64"/>` +
      `<path d="M0,-56C-6,-32 6,-14 26,-14L466,-14C490,-14 500,-38 494,-66Z" fill="#F4F1EB" stroke="#cdc5b6" stroke-width="2"/>` +
      p('M24,-36C120,-28 200,-50 300,-42S440,-30 482,-50', 'fill="none" stroke="#d9d1c2" stroke-width="2"') +
      `<path d="${up}" ${P.body} ${P.out}/><path d="${up}" fill="url(#ms)"/><path d="${up}" fill="url(#gl)"/>` +
      `<path d="M428,-180C470,-186 494,-160 494,-62L420,-60C430,-100 426,-150 428,-180Z" fill="${P.lo}" stroke="${P.line}" stroke-width="1.5"/>` +
      `<path d="M8,-56C10,-84 36,-104 80,-112L96,-60Z" fill="${P.lo}" stroke="${P.line}" stroke-width="1.5"/>` +
      p('M90,-66C180,-82 300,-84 420,-66', `fill="none" stroke="${P.lo}" stroke-width="9" stroke-linecap="round"`) +
      `<path d="M370,-196C374,-214 400,-220 410,-206L404,-176Z" fill="${P.lo}" ${P.out}/>` +
      `<path d="M472,-178L482,-210L498,-206L490,-174Z" fill="${P.deep}"/>` +
      `<path d="M236,-156L306,-194L334,-160L262,-122Z" fill="${P.lo}" fill-opacity=".85" stroke="${P.line}" stroke-width="1.4"/>` +
      eyes(ey) + lacing(ey);
  }
  if (kind === 'loafers') {
    const up = 'M10,-30C2,-58 30,-86 90,-96C160,-108 220,-112 270,-118C300,-122 320,-128 340,-130C380,-124 420,-118 470,-122C482,-100 484,-62 480,-30Z';
    const sole = P.dark ? '#2a221d' : '#6A4A35';
    return `<path d="M8,-32C0,-26 2,-12 20,-10L372,-10L372,0L478,0L480,-32Z" fill="${sole}"/>` +
      p('M372,-10H478M374,-20H479', `stroke="${mix(sole, '#ffffff', 0.25)}" stroke-width="1.2"`) +
      `<path d="${up}" ${P.body} ${P.out}/><path d="${up}" fill="url(#sd)"/>` +
      `<path d="M300,-124C350,-122 420,-116 470,-122C430,-108 360,-110 302,-116Z" fill="#C49A6C"/>` +
      p('M60,-80C110,-108 200,-116 272,-116', P.sm) + p('M48,-66C96,-98 190,-110 270,-110', P.st) +
      `<path d="M236,-118L300,-125L304,-94L240,-88Z" fill="${P.lo}" stroke="${P.line}" stroke-width="1.6"/>` +
      `<path d="M260,-110L271,-117L283,-110L271,-103Z" fill="${P.deep}"/>` +
      p('M20,-32H476', P.st) + p('M360,-126C400,-100 440,-70 474,-60', P.sm.replace('.75', '.4'));
  }
  if (kind === 'boots') {
    const up = 'M12,-42C4,-74 34,-104 100,-112C170,-122 220,-150 250,-210L262,-372C300,-382 400,-382 458,-372C462,-300 472,-200 478,-140C486,-100 486,-70 482,-42Z';
    let lugs = '';
    for (let x = 20; x < 290; x += 26) lugs += `<rect x="${x}" y="-12" width="18" height="12" rx="3" fill="#2B2826"/>`;
    for (let x = 306; x < 470; x += 26) lugs += `<rect x="${x}" y="-12" width="18" height="12" rx="3" fill="#2B2826"/>`;
    const heel = P.dark ? '#2f2925' : '#3B2E26';
    return `<path d="M6,-44C-2,-32 2,-14 24,-12L300,-12L300,-8L482,-8L484,-44Z" fill="#2E2A27"/>` + lugs +
      `<path d="M300,-46L482,-46L482,-8L300,-8Z" fill="${heel}"/>` + p('M302,-34H480M302,-22H480', 'stroke="#5a4c42" stroke-width="1.2"') +
      `<path d="${up}" ${P.body} ${P.out}/><path d="${up}" fill="url(#gl)"/>` +
      `<path d="M318,-374L412,-374Q374,-280 366,-232Q358,-280 318,-374Z" fill="${mix(P.c, '#000000', 0.45)}"/>` +
      `<path d="M318,-374L412,-374Q374,-280 366,-232Q358,-280 318,-374Z" fill="url(#el)"/>` +
      `<path d="M446,-372L452,-414Q466,-422 478,-412L468,-368Z" fill="${P.lo}" ${P.out}/>` +
      `<path d="M262,-372L258,-410Q270,-416 282,-410L282,-372Z" fill="${P.lo}" ${P.out}/>` +
      p('M262,-372C300,-382 400,-382 458,-372', `fill="none" stroke="${P.deep}" stroke-width="3"`) +
      p('M268,-232C304,-188 336,-160 368,-150C404,-140 440,-140 478,-140', P.st) +
      p('M16,-46H482', P.st) +
      `<ellipse cx="96" cy="-82" rx="44" ry="12" fill="#fff" fill-opacity=".16" transform="rotate(-10 96 -82)"/>`;
  }
  // derby
  const up = 'M10,-34C4,-64 30,-92 92,-100C160,-110 200,-118 236,-138L300,-170C320,-178 344,-176 352,-166L380,-150C420,-160 460,-160 476,-148C484,-112 484,-70 480,-34Z';
  const sole = P.dark ? '#1D1B1A' : '#3B2A20';
  const ey = [[248, -132], [264, -141], [280, -150], [296, -159]];
  return `<path d="M226,-136L298,-174C306,-192 330,-198 346,-182L352,-166L300,-160L236,-128Z" fill="${P.lo}" ${P.out}/>` +
    `<path d="M6,-34C-2,-24 2,-12 22,-10L360,-10L360,0L478,0L480,-34Z" fill="${sole}"/>` +
    `<path d="M4,-40H482V-32H4Z" fill="${mix(sole, '#ffffff', 0.18)}"/>` + p('M8,-36H478', `stroke="${mix(sole, '#ffffff', 0.5)}" stroke-width="1.2" stroke-dasharray="4 3"`) +
    p('M362,-10H478M362,-20H478', `stroke="${mix(sole, '#ffffff', 0.25)}" stroke-width="1.2"`) +
    `<path d="${up}" ${P.body} ${P.out}/><path d="${up}" fill="url(#gl)"/>` +
    p('M98,-40C94,-70 106,-94 130,-104', P.sm) + p('M110,-40C106,-68 116,-90 138,-100', P.st) +
    `<path d="M300,-170C306,-190 330,-196 346,-180L352,-166Z" fill="${P.lo}" ${P.out}/>` +
    `<path d="M232,-138L300,-170L318,-150Q300,-118 262,-104Z" ${P.body} ${P.out}/>` +
    p('M262,-104C330,-80 400,-74 478,-80', P.sm) +
    eyes(ey, 3) + lacing(ey) +
    `<ellipse cx="80" cy="-74" rx="48" ry="13" fill="#fff" fill-opacity=".24" transform="rotate(-12 80 -74)"/>`;
}

function shoes(P, kind) {
  const shoe = shoeArt(kind, P);
  const P2 = palette(mix(P.c, '#000000', P.dark ? 0.0 : 0.1));
  const backShoe = shoeArt(kind, P2).replaceAll('url(#b)', 'url(#b2)');
  const tall = kind === 'boots';
  const front = tall ? 'translate(70 820) scale(1.12)' : 'translate(66 760) scale(1.2)';
  const back = tall ? 'translate(196 700) scale(1.04)' : 'translate(192 630) scale(1.1)';
  return {
    shadow: [410, tall ? 826 : 766, 300, 20],
    extraShadow: `<ellipse cx="${tall ? 460 : 470}" cy="${tall ? 704 : 634}" rx="240" ry="14" fill="#3b3128" opacity=".1" filter="url(#bl)"/>`,
    defs: (kind === 'runners' ? pat.dots(P, 'ms', 6, 0.16) : '') + (kind === 'loafers' ? pat.dots(P, 'sd', 3, 0.08) : '') +
      (kind === 'boots' ? `<pattern id="el" width="6" height="10" patternUnits="userSpaceOnUse"><path d="M3 0V10" stroke="#fff" stroke-opacity=".14" stroke-width="2"/></pattern>` : ''),
    defs2: `<linearGradient id="b2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P2.hi}"/><stop offset=".5" stop-color="${P2.c}"/><stop offset="1" stop-color="${P2.lo}"/></linearGradient>`,
    body: `<g transform="${back}">${backShoe}</g><g transform="${front}">${shoe}</g>`,
  };
}

// ------------------------------------------------------------------ bags & accessories
function tote(P) {
  const leather = P.dark ? '#3A2A20' : '#8A5A36';
  const body = 'M236,392L564,392L586,858Q586,872 572,872L228,872Q214,872 214,858Z';
  const patch = (x) => `<rect x="${x - 14}" y="398" width="28" height="56" rx="4" fill="${leather}"/>` + dot(x, 412, 3.2, BRASS) + dot(x, 440, 3.2, BRASS);
  return {
    shadow: [400, 880, 210, 16],
    defs: pat.weave(P),
    body:
      p('M318,402C318,240 350,170 400,170C450,170 482,240 482,402', `fill="none" stroke="${mix(leather, '#000000', 0.3)}" stroke-width="20" stroke-linecap="round"`) +
      `<path d="M236,392Q400,404 564,392Q400,372 236,392Z" fill="${P.deep}"/>` +
      `<path id="s" d="${body}" ${P.body} ${P.out}/><use xlink:href="#s" fill="url(#cv)"/><use xlink:href="#s" fill="url(#gl)"/>` +
      `<path d="M236,392L564,392L566,432L234,432Z" fill="${P.lo}" stroke="${P.line}" stroke-width="1.5"/>` + p('M236,402H564M234,424H566', P.st) +
      p('M236,436L216,858', `fill="none" stroke="${P.deep}" stroke-opacity=".35" stroke-width="10"`) + p('M564,436L584,858', `fill="none" stroke="${P.deep}" stroke-opacity=".35" stroke-width="10"`) +
      p('M222,850H578', P.st) +
      p('M300,420C300,262 330,190 400,190C470,190 500,262 500,420', `fill="none" stroke="${leather}" stroke-width="20" stroke-linecap="round"`) +
      p('M300,420C300,262 330,190 400,190C470,190 500,262 500,420', `fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2" stroke-dasharray="5 4"`) +
      patch(300) + patch(500),
  };
}

function crossbody(P) {
  const body = 'M250,560Q250,540 270,540L530,540Q550,540 550,560L556,770Q556,792 534,792L266,792Q244,792 244,770Z';
  const strap = P.light ? mix(P.c, '#000000', 0.12) : P.c;
  return {
    shadow: [400, 800, 170, 14],
    defs: '',
    body:
      p('M262,540C230,330 290,150 400,150C510,150 570,330 538,540', `fill="none" stroke="${mix(strap, '#000000', 0.25)}" stroke-width="18" stroke-linecap="round"`) +
      p('M262,540C230,330 290,150 400,150C510,150 570,330 538,540', `fill="none" stroke="${strap}" stroke-width="14" stroke-linecap="round"`) +
      p('M262,540C230,330 290,150 400,150C510,150 570,330 538,540', `fill="none" stroke="${P.dark ? '#ffffff' : P.seam}" stroke-opacity=".35" stroke-width="1.2" stroke-dasharray="4 3"`) +
      `<rect x="242" y="404" width="24" height="30" rx="3" fill="none" stroke="${BRASS}" stroke-width="5" transform="rotate(2 254 419)"/>` +
      `<path id="s" d="${body}" ${P.body} ${P.out}/><use xlink:href="#s" fill="url(#gl)"/>` +
      `<path d="M258,552L542,552L548,776L252,776Z" fill="none" stroke="${P.dark ? '#ffffff' : P.seam}" stroke-opacity=".4" stroke-width="1.4" stroke-dasharray="5 4"/>` +
      p('M268,556H532', `stroke="${P.dark ? '#7a7670' : '#3a332c'}" stroke-width="5" stroke-dasharray="2 2"`) +
      `<path d="M512,554h16v30q-8 8-16 0z" fill="${BRASS}" stroke="${mix(BRASS, '#000000', 0.3)}" stroke-width="1"/>` +
      p('M270,622Q400,634 530,622', P.sm) +
      `<rect x="252" y="532" width="20" height="16" rx="6" fill="none" stroke="${BRASS}" stroke-width="4"/>` +
      `<rect x="528" y="532" width="20" height="16" rx="6" fill="none" stroke="${BRASS}" stroke-width="4"/>`,
  };
}

function duffle(P) {
  const leather = P.c.toLowerCase() === '#a87a4f' ? '#5C3B24' : '#8B5A33';
  const webbing = mix(P.c, '#000000', 0.3);
  const body = 'M170,520C170,470 210,450 260,450L540,450C590,450 630,470 630,520L630,760C630,800 600,820 560,820L240,820C200,820 170,800 170,760Z';
  return {
    shadow: [400, 828, 250, 16],
    defs: pat.weave(P),
    body:
      p('M196,540C150,320 300,190 400,190C520,190 650,320 604,540', `fill="none" stroke="${webbing}" stroke-width="12" stroke-linecap="round"`) +
      `<rect x="181" y="376" width="26" height="32" rx="3" fill="none" stroke="${SILVER}" stroke-width="5" transform="rotate(12 194 392)"/>` +
      `<path id="s" d="${body}" ${P.body} ${P.out}/><use xlink:href="#s" fill="url(#cv)"/><use xlink:href="#s" fill="url(#gl)"/>` +
      `<path d="M170,520C170,470 210,450 240,452C214,470 204,600 210,760C212,800 230,818 240,820C200,820 170,800 170,760Z" fill="${P.lo}"/>` +
      p('M240,452C214,470 204,600 210,760C212,800 230,818 240,820', `fill="none" stroke="${leather}" stroke-width="6"`) +
      p('M188,560C186,620 188,700 196,760', `stroke="${P.dark ? '#888' : '#3a332c'}" stroke-width="4" stroke-dasharray="2 2" fill="none"`) +
      p('M262,452H540', `stroke="${P.dark ? '#888' : '#33302b'}" stroke-width="6" stroke-dasharray="2 2"`) +
      `<path d="M534,446h12v34h-12z" fill="${leather}"/>` + dot(540, 450, 4, BRASS) +
      p('M300,452C300,320 500,320 500,452', `fill="none" stroke="${mix(leather, '#000000', 0.25)}" stroke-width="18" stroke-linecap="round"`) +
      p('M300,452C300,334 500,334 500,452', `fill="none" stroke="${leather}" stroke-width="18" stroke-linecap="round"`) +
      `<rect x="372" y="334" width="56" height="26" rx="6" fill="${mix(leather, '#000000', 0.15)}"/>` +
      [300, 500].map((x) => `<path d="M${x - 14},452H${x + 14}V820H${x - 14}Z" fill="${leather}"/>` + p(`M${x - 10},456V816M${x + 10},456V816`, 'stroke="#fff" stroke-opacity=".3" stroke-width="1.2" stroke-dasharray="4 3"') + dot(x, 470, 4, BRASS)).join('') +
      `<path d="M240,820L300,820L300,790Q260,792 240,800Z" fill="${leather}"/><path d="M560,820L500,820L500,790Q540,792 560,800Z" fill="${leather}"/>` +
      p('M244,806H556', P.st),
  };
}

function scarf(P) {
  const fringe = (xa, ya, xb, yb, len, seed) => {
    let d = '';
    const n = Math.round(Math.hypot(xb - xa, yb - ya) / 6);
    for (let i = 0; i <= n; i++) {
      const x = xa + ((xb - xa) * i) / n, y = ya + ((yb - ya) * i) / n;
      d += `M${f(x)},${f(y)}L${f(x + ((i * 7 + seed) % 5) - 2)},${f(y + len - ((i * 3 + seed) % 4) * 3)}`;
    }
    return p(d, `stroke="${P.c}" stroke-width="3.2" stroke-linecap="round"`) + p(d, `stroke="${P.seam}" stroke-opacity=".35" stroke-width="1"`);
  };
  const back = 'M404,198Q458,178 512,204C528,400 548,620 570,818L452,838C438,620 420,400 404,198Z';
  return {
    shadow: [400, 924, 190, 14],
    defs: pat.rib(P, 7, 0.24),
    body:
      `<path d="${back}" fill="${P.lo}" ${P.out}/><path d="${back}" fill="url(#rib)"/>` +
      p('M404,198C420,400 438,620 452,838L486,834C470,620 448,400 428,204Z', P.fd) +
      fringe(452, 838, 570, 818, 40, 1) +
      `<path id="s" d="M290,190Q354,156 424,188C414,400 398,640 380,884L252,874C266,640 280,400 290,190Z" ${P.body} ${P.out}/>` +
      '<use xlink:href="#s" fill="url(#rib)"/><use xlink:href="#s" fill="url(#gl)"/>' +
      p('M296,300C290,500 280,700 268,866L298,868C308,700 318,500 324,300Z', P.fd) +
      p('M292,192Q354,160 422,190', `fill="none" stroke="${P.hl}" stroke-opacity=".5" stroke-width="3"`) +
      fringe(252, 874, 380, 884, 42, 3),
  };
}

function belt(P) {
  // An S-curved strap built from a centre line offset to both sides.
  const bez = (t) => {
    const p0 = [400, 236], p1 = [540, 420], p2 = [260, 700], p3 = [400, 860];
    const u = 1 - t;
    const pt = [0, 1].map((i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]);
    const dv = [0, 1].map((i) => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]));
    const len = Math.hypot(dv[0], dv[1]);
    return { pt, n: [-dv[1] / len, dv[0] / len], tan: [dv[0] / len, dv[1] / len] };
  };
  const N = 48, W = 34;
  const left = [], right = [], st1 = [], st2 = [];
  for (let i = 0; i <= N; i++) {
    const { pt, n } = bez(i / N);
    left.push([pt[0] + n[0] * W, pt[1] + n[1] * W]); right.push([pt[0] - n[0] * W, pt[1] - n[1] * W]);
    st1.push([pt[0] + n[0] * (W - 7), pt[1] + n[1] * (W - 7)]); st2.push([pt[0] - n[0] * (W - 7), pt[1] - n[1] * (W - 7)]);
  }
  const end = bez(1);
  const tip = [end.pt[0] + end.tan[0] * 34, end.pt[1] + end.tan[1] * 34];
  const poly = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)},${f(y)}`).join('');
  const d = poly(left) + `Q${f(tip[0] + end.n[0] * 18)},${f(tip[1] + end.n[1] * 18)} ${f(tip[0])},${f(tip[1])}Q${f(tip[0] - end.n[0] * 18)},${f(tip[1] - end.n[1] * 18)} ${f(right[N][0])},${f(right[N][1])}` + poly([...right].reverse()).replace(/^M/, 'L') + 'Z';
  let holes = '';
  for (const t of [0.72, 0.77, 0.82, 0.87, 0.92]) { const { pt } = bez(t); holes += `<ellipse cx="${f(pt[0])}" cy="${f(pt[1])}" rx="4.5" ry="5.5" fill="#1e1a17" fill-opacity=".75"/>`; }
  const k = bez(0.12);
  const ang = (Math.atan2(k.tan[1], k.tan[0]) * 180) / Math.PI;
  return {
    shadow: [400, 900, 120, 14],
    defs: '',
    body:
      silhouette(d, P) + p(poly(st1), P.st) + p(poly(st2), P.st) + holes +
      `<g transform="translate(${f(k.pt[0])} ${f(k.pt[1])}) rotate(${f(ang - 90)})"><rect x="-44" y="-12" width="88" height="24" rx="4" fill="${P.lo}" stroke="${P.line}" stroke-width="1.6"/></g>` +
      `<rect x="336" y="164" width="128" height="98" rx="26" fill="none" stroke="${mix(BRASS, '#000000', 0.2)}" stroke-width="14"/>` +
      `<rect x="336" y="164" width="128" height="98" rx="26" fill="none" stroke="${BRASS}" stroke-width="10"/>` +
      `<path d="M346,180Q350,170 366,168" fill="none" stroke="${BRASS_HI}" stroke-width="3" stroke-linecap="round"/>` +
      p('M400,262V182', `stroke="${mix(BRASS, '#000000', 0.15)}" stroke-width="8" stroke-linecap="round"`),
  };
}

function beanie(P) {
  const dome = 'M214,560C206,390 280,286 400,278C520,286 594,390 586,560Z';
  const cuff = 'M200,540Q400,516 600,540L604,760Q400,786 196,760Z';
  let ribs = '';
  for (let i = -8; i <= 8; i++) ribs += p(`M${400 + i * 21},548Q${f(400 + i * 18)},400 ${f(400 + i * 3)},290`, `fill="none" stroke="${P.dark ? '#fff' : P.seam}" stroke-opacity="${P.dark ? 0.12 : 0.3}" stroke-width="2"`);
  return {
    shadow: [400, 778, 230, 16],
    defs: pat.rib(P, 12, 0.3) + '<clipPath id="cl"><path d="' + dome + '"/></clipPath>',
    body:
      silhouette(dome, P, `<g clip-path="url(#cl)">${ribs}<path d="M520,300C566,350 586,440 586,560L546,560C546,450 532,360 500,310Z" ${P.fd}/></g>`) +
      `<path d="${cuff}" ${P.body} ${P.out}/><path d="${cuff}" fill="url(#rib)"/><path d="${cuff}" fill="url(#gl)"/>` +
      p('M206,546Q400,522 594,546', `fill="none" stroke="${P.hl}" stroke-opacity=".45" stroke-width="4"`) +
      p('M198,752Q400,778 602,752', `fill="none" stroke="${P.deep}" stroke-opacity=".3" stroke-width="5"`),
  };
}

// ------------------------------------------------------------------ registry
const ART = {
  shirt: (P) => shirt(P), oxford: (P) => shirt(P, { oxford: true }),
  tee: (P) => tee(P), pockettee: (P) => tee(P, { boxy: true, pocket: true }), tank, blouse,
  cardigan: (P) => knitTop(P, 'cardigan'), sweater: (P) => knitTop(P, 'sweater'), turtleneck: (P) => knitTop(P, 'turtleneck'),
  dress, wrapdress, poplindress, skirt,
  widetrousers: (P) => trousers(P, 'widetrousers'), drawstring: (P) => trousers(P, 'drawstring'),
  chinos: (P) => trousers(P, 'chinos'), jeans: (P, ctx) => trousers(P, 'jeans', ctx),
  trench: (P) => coat(P, 'trench'), overcoat: (P) => coat(P, 'overcoat'), blazer: (P) => coat(P, 'blazer'), quilted, rainjacket,
  sneakers: (P) => shoes(P, 'sneakers'), runners: (P) => shoes(P, 'runners'), loafers: (P) => shoes(P, 'loafers'),
  boots: (P) => shoes(P, 'boots'), derby: (P) => shoes(P, 'derby'),
  tote, crossbody, duffle, scarf, belt, beanie,
};

// Studio grounds, very slightly different per department so a grid feels natural.
const GROUND = {
  tops: ['#F3EEE6', '#E6DDD0'], knitwear: ['#F3EDE4', '#E5DCCE'], dresses: ['#F3EDE6', '#E7DDD1'],
  trousers: ['#F1EDE7', '#E3DCD1'], outerwear: ['#F0EAE1', '#E2D9CB'], shoes: ['#F2EFEA', '#E4DFD6'],
  bags: ['#F4EFE7', '#E7DECF'], accessories: ['#F3EDE4', '#E6DDCE'],
};

function render(product, colorName) {
  const c = COLORS[colorName];
  if (!c) throw new Error(`no colour hex for ${colorName}`);
  const P = palette(c);
  const art = ART[product.art];
  if (!art) throw new Error(`no drawing for art key ${product.art}`);
  const r = art(P, { slug: product.slug });
  const [g0, g1] = GROUND[product.type] || GROUND.tops;
  const [sx, sy, srx, sry] = r.shadow;
  const body = r.body;
  const label = `${product.name} in ${colorName}`.replace(/&/g, '&amp;');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 800 1000" role="img" aria-label="${label}">` +
    `<defs>` +
    `<radialGradient id="bg" cx=".5" cy=".42" r=".78"><stop offset="0" stop-color="${g0}"/><stop offset="1" stop-color="${g1}"/></radialGradient>` +
    `<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P.hi}"/><stop offset=".5" stop-color="${c}"/><stop offset="1" stop-color="${P.lo}"/></linearGradient>` +
    `<radialGradient id="gl" cx=".3" cy=".22" r=".8"><stop offset="0" stop-color="#fff" stop-opacity="${P.dark ? 0.14 : 0.2}"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<filter id="bl" x="-30%" y="-300%" width="160%" height="700%"><feGaussianBlur stdDeviation="16"/></filter>` +
    (r.defs || '') + (r.defs2 || '') + `</defs>` +
    `<rect width="800" height="1000" fill="url(#bg)"/>` +
    `<ellipse cx="${sx}" cy="${sy}" rx="${srx}" ry="${sry}" fill="#3b3128" opacity=".2" filter="url(#bl)"/>` + (r.extraShadow || '') +
    body + `</svg>\n`;
}

function fallback() {
  const [g0, g1] = GROUND.tops;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" role="img" aria-label="Product image coming soon">` +
    `<defs><radialGradient id="bg" cx=".5" cy=".42" r=".78"><stop offset="0" stop-color="${g0}"/><stop offset="1" stop-color="${g1}"/></radialGradient></defs>` +
    `<rect width="800" height="1000" fill="url(#bg)"/>` +
    `<g fill="none" stroke="#B5A995" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M400,420V392C400,376 412,368 424,360C440,350 446,334 440,318C432,298 404,292 388,306C380,313 378,322 378,330"/>` +
    `<path d="M400,420L218,540Q204,552 222,556H578Q596,552 582,540Z"/></g></svg>\n`;
}

// ------------------------------------------------------------------ write
let count = 0, total = 0, max = 0, maxName = '';
for (const product of PRODUCTS) {
  const dir = join(OUT, product.slug);
  mkdirSync(dir, { recursive: true });
  for (const color of product.colors) {
    const svg = render(product, color);
    const file = join(dir, `${slugify(color)}.svg`);
    writeFileSync(file, svg);
    count++;
    total += svg.length;
    if (svg.length > max) { max = svg.length; maxName = `${product.slug}/${slugify(color)}.svg`; }
  }
}
writeFileSync(FALLBACK, fallback());
console.log(`wrote ${count} product SVGs to tools/art/products and public/media/fallback.svg (avg ${(total / count / 1024).toFixed(1)} KB, max ${(max / 1024).toFixed(1)} KB ${maxName})`);
