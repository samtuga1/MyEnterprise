// MyEnterprise catalog definition — fictional labels, illustrative prices.
// Shared by tools/seed/generate-seed.mjs (SQL), tools/seed/generate-images.mjs and tools/photos/pixabay.mjs
// (product photographs) and tools/art/generate-art.mjs (fallback drawings).

export const COLORS = {
  'Sage': '#9CAF88', 'White': '#F3F1EB', 'Ivory': '#EEE6D6', 'Black': '#1F1F21', 'Navy': '#243149',
  'Indigo': '#33466E', 'Washed black': '#46474A', 'Terracotta': '#BF4E2E', 'Forest': '#2F4A3A',
  'Olive': '#6E6B3D', 'Sand': '#CDB992', 'Oat': '#D8CAAE', 'Charcoal': '#3E4144', 'Camel': '#B88A57',
  'Cocoa': '#6A4A36', 'Cognac': '#9A5A2E', 'Chalk': '#ECE8DF', 'Slate blue': '#5E7391',
  'Champagne': '#D8C3A0', 'Khaki': '#B5A47C', 'Light blue': '#B3C9DE', 'Grey melange': '#9C9EA0',
  'Raw indigo': '#262F4C', 'Tan': '#A87A4F', 'Brown': '#5B3B29', 'Natural': '#E4D9C2', 'Rust': '#A5502F',
  'Stone': '#BDB6A8', 'Burgundy': '#6D2A36', 'Cream': '#F0E7D4',
  // Added with the photographs (2026-11-10): the colours the photographed pieces actually are.
  'Yellow': '#EDC04F', 'Mustard': '#D9A12B', 'Blush': '#EBCFC6', 'Cornflower': '#6F8FC9', 'Blue gingham': '#AFC6DD',
  'Grey': '#7D7A78', 'Red': '#A8262C',
};

export const BRANDS = {
  'Field & Form': 'FF', 'Common Thread': 'CT', 'Sunday Goods': 'SG', 'Willow Lane': 'WL',
  'Stride Studio': 'SS', 'Atelier Nine': 'AN', 'Northbound': 'NB',
};

export const CATEGORIES = [
  // [name, slug, group, sort]
  ['Women', 'women', 'DEPARTMENT', 1],
  ['Men', 'men', 'DEPARTMENT', 2],
  ['Shirts & tops', 'tops', 'TYPE', 10],
  ['Knitwear', 'knitwear', 'TYPE', 11],
  ['Dresses & skirts', 'dresses', 'TYPE', 12],
  ['Trousers & jeans', 'trousers', 'TYPE', 13],
  ['Outerwear', 'outerwear', 'TYPE', 14],
  ['Shoes', 'shoes', 'TYPE', 15],
  ['Bags', 'bags', 'TYPE', 16],
  ['Accessories', 'accessories', 'TYPE', 17],
  ['New in', 'new-in', 'COLLECTION', 20],
  ['The linen edit', 'linen-edit', 'COLLECTION', 21],
  ['Everyday essentials', 'essentials', 'COLLECTION', 22],
];

const LETTERS_W = ['XS', 'S', 'M', 'L', 'XL'];
const LETTERS_W4 = ['XS', 'S', 'M', 'L'];
const LETTERS_M = ['S', 'M', 'L', 'XL', 'XXL'];
const LETTERS_M4 = ['S', 'M', 'L', 'XL'];

const CARE = {
  linen: 'Cold gentle wash; line dry; warm iron while damp',
  cotton: 'Machine wash at 30°C; tumble dry low',
  knit: 'Cold hand wash; dry flat; store folded',
  wool: 'Dry clean or cold wool cycle; dry flat',
  silk: 'Cold hand wash; do not wring; cool iron inside out',
  denim: 'Wash inside out at 30°C; line dry',
  coat: 'Professional dry clean only',
  tech: 'Machine wash at 30°C; do not iron; re-proof yearly',
  leather: 'Wipe clean; condition twice a year; keep dry',
  suede: 'Brush with a suede brush; protect with spray',
  canvas: 'Spot clean; air dry',
};

const COVER_CLOTHING = 'Seams, stitching, buttons and zips that fail in normal wear. Shrinkage from incorrect care, pilling, accidental damage and fit preferences are not covered — use a return for fit.';
const COVER_DURABLE = 'Sole separation, stitching, zips, buckles and hardware that fail in normal wear. Scuffs, accidental damage and normal ageing of leather are not covered.';

// measure: [spec name, unit, value for first size, step per size]
export const PRODUCTS = [
  { slug: 'relaxed-linen-shirt', name: 'Relaxed Linen Shirt', brand: 'Field & Form', art: 'shirt', dept: ['women'], type: 'tops', collections: ['linen-edit'],
    price: 58, priceChange: ['2026-08-01', 62], sizes: LETTERS_W, colors: ['White', 'Olive'], warranty: 6, pop: 5,
    material: '55% linen, 45% cotton', care: CARE.linen, fit: 'Relaxed', measure: ['Chest width', 'cm', 52, 3],
    description: 'An airy button-up with a soft collar, dropped shoulders and a curved hem. Washed linen-cotton that gets softer every time it is worn.' },
  { slug: 'ribbed-cotton-tank', name: 'Ribbed Cotton Tank', brand: 'Common Thread', art: 'tank', dept: ['women'], type: 'tops', collections: ['essentials'],
    price: 22, sizes: LETTERS_W4, colors: ['White', 'Black'], warranty: 6, pop: 4,
    material: '95% cotton, 5% elastane rib', care: CARE.cotton, fit: 'Close', measure: ['Chest width', 'cm', 38, 2],
    description: 'A fine rib tank with a scooped neck that layers under everything, from shirts to knitwear.' },
  { slug: 'everyday-cotton-tee', name: 'Everyday Cotton Tee', brand: 'Common Thread', art: 'tee', dept: ['women', 'men'], type: 'tops', collections: ['essentials'],
    price: 28, sizes: LETTERS_W, colors: ['Black', 'Ivory', 'Yellow'], warranty: 6, pop: 5,
    material: '100% organic cotton jersey, 180 g/m²', care: CARE.cotton, fit: 'Regular', measure: ['Chest width', 'cm', 46, 3],
    description: 'A clean crew neck in mid-weight organic jersey. Holds its shape wash after wash.' },
  { slug: 'silk-blend-shell-blouse', name: 'Silk-Blend Shell Blouse', brand: 'Willow Lane', art: 'blouse', dept: ['women'], type: 'tops', collections: ['new-in'],
    price: 79, sizes: LETTERS_W4, colors: ['Champagne', 'Navy'], warranty: 6, pop: 3, launched: '2026-10-06',
    material: '70% viscose, 30% mulberry silk', care: CARE.silk, fit: 'Regular', measure: ['Chest width', 'cm', 48, 3],
    description: 'A sleeveless shell with a fluid drape and a keyhole button at the back of the neck.' },
  { slug: 'soft-knit-cardigan', name: 'Soft Knit Cardigan', brand: 'Sunday Goods', art: 'cardigan', dept: ['women'], type: 'knitwear', collections: [],
    price: 68, sizes: LETTERS_W4, colors: ['Oat', 'Charcoal'], warranty: 6, pop: 4,
    material: '100% cotton, textured knit', care: CARE.knit, fit: 'Relaxed', measure: ['Chest width', 'cm', 54, 3],
    description: 'A textured button-front knit for cool mornings, with horn-look buttons and ribbed cuffs.' },
  { slug: 'merino-crew-sweater', name: 'Merino Crew Sweater', brand: 'Sunday Goods', art: 'sweater', dept: ['men'], type: 'knitwear', collections: ['essentials'],
    price: 92, sizes: LETTERS_M4, colors: ['Grey melange', 'Burgundy'], warranty: 6, pop: 4,
    material: '100% extra-fine merino wool', care: CARE.wool, fit: 'Regular', measure: ['Chest width', 'cm', 52, 3],
    description: 'Fine-gauge merino that is warm without bulk. Wears under a coat or on its own.' },
  { slug: 'chunky-rib-turtleneck', name: 'Chunky Rib Turtleneck', brand: 'Sunday Goods', art: 'turtleneck', dept: ['women'], type: 'knitwear', collections: ['new-in'],
    price: 98, sizes: LETTERS_W4, colors: ['Cream', 'Burgundy'], warranty: 6, pop: 4, launched: '2026-10-10',
    material: '60% wool, 40% recycled nylon', care: CARE.wool, fit: 'Relaxed', measure: ['Chest width', 'cm', 54, 3],
    description: 'A deep rib turtleneck with a fold-over collar, knitted heavy for the first cold weeks.' },
  { slug: 'gathered-midi-dress', name: 'Gathered Midi Dress', brand: 'Willow Lane', art: 'dress', dept: ['women'], type: 'dresses', collections: [],
    price: 96, sizes: LETTERS_W4, colors: ['Terracotta', 'Mustard'], warranty: 6, pop: 4,
    material: '100% cotton voile, cotton lining', care: CARE.cotton, fit: 'Regular', measure: ['Length', 'cm', 118, 2],
    description: 'A softly gathered waist and a flowing skirt with deep side pockets.' },
  { slug: 'wrap-midi-dress', name: 'Wrap Midi Dress', brand: 'Willow Lane', art: 'wrapdress', dept: ['women'], type: 'dresses', collections: [],
    price: 88, sizes: LETTERS_W4, colors: ['Blush', 'Cornflower'], warranty: 6, pop: 3,
    material: '100% viscose crepe', care: CARE.silk, fit: 'Adjustable waist', measure: ['Length', 'cm', 116, 2],
    description: 'An adjustable tie waist and a midi hem that moves when you walk.' },
  { slug: 'sleeveless-poplin-dress', name: 'Sleeveless Poplin Dress', brand: 'Field & Form', art: 'poplindress', dept: ['women'], type: 'dresses', collections: ['linen-edit'],
    price: 84, sizes: LETTERS_W4, colors: ['Blue gingham', 'White'], warranty: 6, pop: 3, archived: '2026-09-15',
    material: '100% cotton poplin', care: CARE.cotton, fit: 'Regular', measure: ['Length', 'cm', 112, 2],
    description: 'Crisp poplin with an easy A-line skirt and side pockets. A summer piece, now archived.' },
  { slug: 'satin-slip-skirt', name: 'Satin Slip Skirt', brand: 'Willow Lane', art: 'skirt', dept: ['women'], type: 'dresses', collections: [],
    price: 64, sizes: LETTERS_W4, colors: ['Champagne', 'Black'], warranty: 6, pop: 3,
    material: '100% recycled polyester satin', care: CARE.silk, fit: 'Bias cut', measure: ['Length', 'cm', 78, 1],
    description: 'A bias-cut midi skirt with a narrow elastic waist. Dresses up a knit, dresses down with sneakers.' },
  { slug: 'pleated-wide-leg-trousers', name: 'Pleated Wide-Leg Trousers', brand: 'Field & Form', art: 'widetrousers', dept: ['women'], type: 'trousers', collections: [],
    price: 78, sizes: LETTERS_W4, colors: ['Sand', 'Black'], warranty: 6, pop: 4,
    material: '65% recycled polyester, 33% viscose, 2% elastane', care: CARE.cotton, fit: 'Wide leg, high rise', measure: ['Inseam', 'cm', 78, 1],
    description: 'Fluid front pleats and a wide leg, cut high at the waist with a hook-and-bar fastening.' },
  { slug: 'straight-leg-jeans', name: 'Straight-Leg Jeans', brand: 'Common Thread', art: 'jeans', dept: ['women'], type: 'trousers', collections: ['essentials'],
    price: 72, sizes: ['W26', 'W27', 'W28', 'W29', 'W30'], colors: ['Indigo', 'Washed black'], warranty: 6, pop: 5,
    material: '99% cotton, 1% elastane, 12 oz denim', care: CARE.denim, fit: 'Straight, mid rise', measure: ['Waist', 'cm', 66, 2.5],
    description: 'Classic five-pocket denim with a straight leg and a comfortable mid rise.' },
  { slug: 'linen-drawstring-trousers', name: 'Linen Drawstring Trousers', brand: 'Field & Form', art: 'drawstring', dept: ['women', 'men'], type: 'trousers', collections: ['linen-edit'],
    price: 74, sizes: LETTERS_W, colors: ['Sand', 'Black'], warranty: 6, pop: 4,
    material: '100% washed linen', care: CARE.linen, fit: 'Relaxed', measure: ['Inseam', 'cm', 74, 1.5],
    description: 'Washed linen with an elastic drawstring waist and a relaxed, tapered leg.' },
  { slug: 'slim-stretch-chinos', name: 'Slim Stretch Chinos', brand: 'Common Thread', art: 'chinos', dept: ['men'], type: 'trousers', collections: ['essentials'],
    price: 70, sizes: ['W30', 'W32', 'W34', 'W36'], colors: ['Khaki', 'Grey'], warranty: 6, pop: 4,
    material: '97% cotton twill, 3% elastane', care: CARE.cotton, fit: 'Slim', measure: ['Waist', 'cm', 78, 5],
    description: 'Cotton twill with a little stretch, a slim leg and a clean, flat front.' },
  { slug: 'selvedge-straight-jeans', name: 'Selvedge Straight Jeans', brand: 'Common Thread', art: 'jeans', dept: ['men'], type: 'trousers', collections: [],
    price: 98, sizes: ['W30', 'W32', 'W34', 'W36'], colors: ['Raw indigo'], warranty: 6, pop: 3,
    material: '100% cotton, 14 oz selvedge denim', care: CARE.denim, fit: 'Straight', measure: ['Waist', 'cm', 78, 5],
    description: 'Unwashed selvedge denim that fades to the way you wear it.' },
  { slug: 'everyday-trench-coat', name: 'Everyday Trench Coat', brand: 'Field & Form', art: 'trench', dept: ['women'], type: 'outerwear', collections: [],
    price: 148, sizes: LETTERS_W4, colors: ['Sand', 'Navy'], warranty: 12, pop: 4,
    material: '100% cotton gabardine, polyester lining', care: CARE.coat, fit: 'Relaxed', measure: ['Back length', 'cm', 104, 2],
    description: 'A lightweight belted trench with storm flaps and a water-repellent finish.' },
  { slug: 'cropped-wool-blazer', name: 'Cropped Wool Blazer', brand: 'Atelier Nine', art: 'blazer', dept: ['women'], type: 'outerwear', collections: ['new-in'],
    price: 165, sizes: LETTERS_W4, colors: ['Camel', 'Black'], warranty: 12, pop: 3, launched: '2026-10-03',
    material: '80% wool, 20% polyamide; viscose lining', care: CARE.wool, fit: 'Boxy, cropped', measure: ['Back length', 'cm', 58, 1.5],
    description: 'A boxy single-breasted blazer cut short at the hip, with a fully lined body.' },
  { slug: 'quilted-weekend-jacket', name: 'Quilted Weekend Jacket', brand: 'Sunday Goods', art: 'quilted', dept: ['men'], type: 'outerwear', collections: [],
    price: 124, sizes: LETTERS_M4, colors: ['Black', 'Navy'], warranty: 12, pop: 3,
    material: '100% recycled polyester shell and fill', care: CARE.tech, fit: 'Regular', measure: ['Chest width', 'cm', 56, 3],
    description: 'A light diamond-quilted layer with a cord collar and generous patch pockets.' },
  { slug: 'wool-overcoat', name: 'Wool Overcoat', brand: 'Atelier Nine', art: 'overcoat', dept: ['men'], type: 'outerwear', collections: ['new-in'],
    price: 240, sizes: LETTERS_M4, colors: ['Camel', 'Charcoal'], warranty: 12, pop: 3, launched: '2026-10-17',
    material: '70% wool, 30% recycled polyamide', care: CARE.coat, fit: 'Regular', measure: ['Back length', 'cm', 100, 2],
    description: 'A knee-length single-breasted overcoat in dense, brushed wool.' },
  { slug: 'hooded-rain-jacket', name: 'Hooded Rain Jacket', brand: 'Northbound', art: 'rainjacket', dept: ['women', 'men'], type: 'outerwear', collections: [],
    price: 130, sizes: LETTERS_M4, colors: ['Navy', 'Yellow'], warranty: 12, pop: 3,
    material: '2.5-layer recycled nylon, 10,000 mm waterproof', care: CARE.tech, fit: 'Regular', measure: ['Chest width', 'cm', 56, 3],
    description: 'A packable waterproof shell with taped seams and an adjustable hood.' },
  { slug: 'oxford-cotton-shirt', name: 'Oxford Cotton Shirt', brand: 'Field & Form', art: 'oxford', dept: ['men'], type: 'tops', collections: ['essentials'],
    price: 62, sizes: LETTERS_M, colors: ['White', 'Light blue'], warranty: 6, pop: 5,
    material: '100% cotton oxford', care: CARE.cotton, fit: 'Regular', measure: ['Chest width', 'cm', 54, 3],
    description: 'A button-down oxford with a soft roll to the collar. The shirt you reach for first.' },
  { slug: 'heavyweight-pocket-tee', name: 'Heavyweight Pocket Tee', brand: 'Common Thread', art: 'pockettee', dept: ['men'], type: 'tops', collections: [],
    price: 34, sizes: LETTERS_M, colors: ['White', 'Black', 'Grey melange'], warranty: 6, pop: 4,
    material: '100% cotton jersey, 240 g/m²', care: CARE.cotton, fit: 'Boxy', measure: ['Chest width', 'cm', 55, 3],
    description: 'Dense, boxy jersey with a chest pocket and a collar that stays flat.' },
  { slug: 'everyday-court-sneakers', name: 'Everyday Court Sneakers', brand: 'Stride Studio', art: 'sneakers', dept: ['women', 'men'], type: 'shoes', collections: ['essentials'],
    price: 89, sizes: ['EU 37', 'EU 38', 'EU 39', 'EU 40', 'EU 41', 'EU 42', 'EU 43', 'EU 44'], colors: ['Chalk', 'Tan'], warranty: 12, pop: 5,
    material: 'Leather upper, rubber cupsole', care: CARE.leather, fit: 'True to size', measure: ['Insole length', 'cm', 23.5, 0.65],
    description: 'Clean low-top court sneakers with a padded collar and a stitched rubber cupsole.' },
  { slug: 'weekend-walking-sneakers', name: 'Weekend Walking Sneakers', brand: 'Stride Studio', art: 'runners', dept: ['women', 'men'], type: 'shoes', collections: [],
    price: 95, sizes: ['EU 38', 'EU 39', 'EU 40', 'EU 41', 'EU 42', 'EU 43', 'EU 44'], colors: ['Yellow', 'Stone'], warranty: 12, pop: 4,
    material: 'Recycled mesh upper, EVA midsole, rubber outsole', care: CARE.canvas, fit: 'Roomy toe', measure: ['Insole length', 'cm', 24.2, 0.65],
    description: 'Breathable mesh and a cushioned sole for long days on foot.' },
  { slug: 'suede-penny-loafers', name: 'Suede Penny Loafers', brand: 'Stride Studio', art: 'loafers', dept: ['women'], type: 'shoes', collections: [],
    price: 110, sizes: ['EU 36', 'EU 37', 'EU 38', 'EU 39', 'EU 40', 'EU 41'], colors: ['Cocoa', 'Black'], warranty: 12, pop: 3,
    material: 'Suede upper, leather lining, rubber sole', care: CARE.suede, fit: 'True to size', measure: ['Insole length', 'cm', 22.9, 0.65],
    description: 'Easy slip-ons with a cushioned footbed and a classic penny strap.' },
  { slug: 'leather-chelsea-boots', name: 'Leather Chelsea Boots', brand: 'Stride Studio', art: 'boots', dept: ['women'], type: 'shoes', collections: [],
    price: 160, sizes: ['EU 36', 'EU 37', 'EU 38', 'EU 39', 'EU 40', 'EU 41'], colors: ['Cognac', 'Brown'], warranty: 12, pop: 4,
    material: 'Full-grain leather, elastic gussets, rubber lug sole', care: CARE.leather, fit: 'True to size', measure: ['Insole length', 'cm', 22.9, 0.65],
    description: 'Pull-on Chelsea boots with a low stacked heel and a grippy lug sole.' },
  { slug: 'leather-derby-shoes', name: 'Leather Derby Shoes', brand: 'Stride Studio', art: 'derby', dept: ['men'], type: 'shoes', collections: [],
    price: 150, sizes: ['EU 40', 'EU 41', 'EU 42', 'EU 43', 'EU 44', 'EU 45'], colors: ['Black', 'Brown'], warranty: 12, pop: 3,
    material: 'Polished leather upper, Goodyear-welted rubber sole', care: CARE.leather, fit: 'True to size', measure: ['Insole length', 'cm', 25.5, 0.65],
    description: 'A Goodyear-welted derby that can be resoled, in polished leather.' },
  { slug: 'canvas-carryall-tote', name: 'Canvas Carryall Tote', brand: 'Sunday Goods', art: 'tote', dept: ['women', 'men'], type: 'bags', collections: ['essentials'],
    price: 38, sizes: ['One size'], colors: ['Natural', 'Black'], warranty: 6, pop: 4,
    material: '16 oz cotton canvas, leather handles', care: CARE.canvas, fit: null, measure: ['Dimensions', 'cm', '38 × 40 × 12', 0],
    description: 'A roomy canvas tote with an inner zip pocket for the small things.' },
  { slug: 'everyday-crossbody-bag', name: 'Everyday Crossbody Bag', brand: 'Willow Lane', art: 'crossbody', dept: ['women'], type: 'bags', collections: [],
    price: 64, sizes: ['One size'], colors: ['Cognac', 'Black'], warranty: 12, pop: 4,
    material: 'Vegetable-tanned leather, cotton lining', care: CARE.leather, fit: null, measure: ['Dimensions', 'cm', '22 × 16 × 6', 0],
    description: 'A compact zip-top bag with an adjustable strap, sized for a phone, keys and a card holder.' },
  { slug: 'weekender-duffle-bag', name: 'Weekender Duffle Bag', brand: 'Northbound', art: 'duffle', dept: ['women', 'men'], type: 'bags', collections: [],
    price: 135, sizes: ['One size'], colors: ['Olive', 'Tan'], warranty: 12, pop: 2,
    material: 'Waxed cotton canvas, leather trims', care: CARE.canvas, fit: null, measure: ['Dimensions', 'cm', '52 × 28 × 26', 0],
    description: 'A two-night duffle in waxed canvas with a shoe compartment and a padded strap.' },
  { slug: 'ribbed-knit-scarf', name: 'Ribbed Knit Scarf', brand: 'Common Thread', art: 'scarf', dept: ['women', 'men'], type: 'accessories', collections: [],
    price: 32, sizes: ['One size'], colors: ['Oat', 'Rust'], warranty: 6, pop: 3,
    material: '80% cotton, 20% wool', care: CARE.knit, fit: null, measure: ['Dimensions', 'cm', '180 × 30', 0],
    description: 'A soft rib-knit scarf, long enough to wrap twice.' },
  { slug: 'leather-belt', name: 'Leather Belt', brand: 'Field & Form', art: 'belt', dept: ['women', 'men'], type: 'accessories', collections: [],
    price: 45, sizes: ['80 cm', '85 cm', '90 cm', '95 cm', '100 cm'], colors: ['Black', 'Tan'], warranty: 12, pop: 3,
    material: 'Full-grain leather, brass buckle', care: CARE.leather, fit: null, measure: ['Total length', 'cm', 95, 5],
    description: 'A 3 cm full-grain belt with a solid brass buckle that ages with the leather.' },
  { slug: 'ribbed-wool-beanie', name: 'Ribbed Wool Beanie', brand: 'Common Thread', art: 'beanie', dept: ['women', 'men'], type: 'accessories', collections: ['new-in'],
    price: 26, sizes: ['One size'], colors: ['Charcoal', 'Red', 'Cream'], warranty: 6, pop: 4, launched: '2026-10-01',
    material: '100% merino wool', care: CARE.wool, fit: null, measure: ['Circumference', 'cm', '54–60', 0],
    description: 'A close rib beanie in soft merino with a deep turn-up.' },
];

export const COVERAGE = { clothing: COVER_CLOTHING, durable: COVER_DURABLE };

export const SUPPLIERS = [
  // name, contact, types it can supply, cost ratio, lead days
  { name: 'Northstar Apparel Supply', contact: 'orders@northstar-apparel.example', brands: ['Common Thread', 'Sunday Goods'], ratio: 0.42, lead: 12, moq: 12 },
  { name: 'Threadline Mills', contact: 'sales@threadline-mills.example', brands: ['Field & Form', 'Willow Lane', 'Common Thread'], ratio: 0.45, lead: 16, moq: 10 },
  { name: 'Stride Footwear Wholesale', contact: 'trade@stride-footwear.example', brands: ['Stride Studio'], ratio: 0.48, lead: 21, moq: 6 },
  { name: 'Atelier Leatherworks', contact: 'atelier@leatherworks.example', brands: ['Willow Lane', 'Field & Form', 'Northbound'], types: ['bags', 'accessories'], ratio: 0.5, lead: 18, moq: 6 },
  { name: 'Harbor Outerwear Co.', contact: 'hello@harbor-outerwear.example', brands: ['Field & Form', 'Sunday Goods', 'Atelier Nine', 'Northbound'], types: ['outerwear'], ratio: 0.47, lead: 24, moq: 6 },
  { name: 'Loomhouse Knits', contact: 'studio@loomhouse.example', brands: ['Sunday Goods', 'Common Thread'], types: ['knitwear', 'accessories'], ratio: 0.39, lead: 28, moq: 15 },
];

export const WAREHOUSES = [
  { name: 'Chicago Central', location: 'Fulton Market, Chicago, IL', capacity: 9000, share: 0.5 },
  { name: 'Austin South', location: 'South Congress, Austin, TX', capacity: 6000, share: 0.3 },
  { name: 'Newark East', location: 'Port Newark, Newark, NJ', capacity: 5000, share: 0.2 },
];

export const ADMINS = [
  { email: 'demo@gmail.com', fullName: 'Morgan Hayes', role: 'ADMINISTRATOR' },
  { email: 'priya.nair@myenterprise.example', fullName: 'Priya Nair', role: 'OPERATIONS' },
  { email: 'marcus.bell@myenterprise.example', fullName: 'Marcus Bell', role: 'CATALOG' },
  { email: 'lena.ortiz@myenterprise.example', fullName: 'Lena Ortiz', role: 'SUPPORT' },
];

export const CUSTOMER_NAMES = [
  ['Alex', 'Morgan'], ['Jordan', 'Lee'], ['Sam', 'Rivera'], ['Amara', 'Okafor'], ['Daniel', 'Kim'],
  ['Sofia', 'Martinez'], ['Ethan', 'Brooks'], ['Maya', 'Patel'], ['Lucas', 'Nguyen'], ['Chloe', 'Bennett'],
  ['Noah', 'Fischer'], ['Isabella', 'Rossi'], ['Kwame', 'Mensah'], ['Hannah', 'Schmidt'], ['Mateo', 'Alvarez'],
  ['Grace', 'Liu'], ['Oliver', 'Grant'], ['Zara', 'Ahmed'], ['Leo', 'Novak'], ['Emily', 'Carter'],
  ['Ravi', 'Shah'], ['Nora', 'Lindqvist'], ['Tomás', 'Silva'], ['Ava', 'Thompson'], ['Yusuf', 'Demir'],
  ['Lily', 'Chen'], ['Gabriel', 'Dubois'], ['Esi', 'Boateng'], ['Henry', 'Walsh'], ['Mia', 'Johansson'],
  ['Arjun', 'Rao'], ['Camila', 'Torres'], ['Felix', 'Wagner'], ['Ruby', 'Hughes'], ['Diego', 'Ramos'],
  ['Ines', 'Moreau'], ['Samuel', 'Owusu'], ['Julia', 'Kowalski'], ['Theo', 'Andersen'], ['Priscilla', 'Adjei'],
  ['Marcus', 'Reid'], ['Elena', 'Petrova'], ['Kofi', 'Asante'], ['Harper', 'Collins'], ['Jin', 'Park'],
  ['Valentina', 'Greco'], ['Omar', 'Haddad'], ['Freya', 'Nilsson'], ['Caleb', 'Morris'], ['Aisha', 'Bello'],
  ['Victor', 'Laurent'], ['Naomi', 'Sato'], ['Jonah', 'Weiss'], ['Leila', 'Karimi'], ['Adrian', 'Popescu'],
  ['Rosa', 'Jimenez'], ['Finn', 'Gallagher'], ['Tara', 'Singh'], ['Benjamin', 'Ochieng'], ['Clara', 'Hoffmann'],
];

export const ADDRESSES = [
  ['Maple Avenue', 'Chicago', 'IL', '60614'], ['Lake Shore Drive', 'Chicago', 'IL', '60611'], ['Barton Springs Road', 'Austin', 'TX', '78704'],
  ['Elm Street', 'Dallas', 'TX', '75201'], ['Atlantic Avenue', 'Brooklyn', 'NY', '11217'], ['Pine Street', 'Seattle', 'WA', '98101'],
  ['Peachtree Street', 'Atlanta', 'GA', '30309'], ['Valencia Street', 'San Francisco', 'CA', '94110'], ['Grand Avenue', 'Saint Paul', 'MN', '55105'],
  ['Colfax Avenue', 'Denver', 'CO', '80206'], ['Hawthorne Boulevard', 'Portland', 'OR', '97214'], ['Magazine Street', 'New Orleans', 'LA', '70130'],
  ['Newbury Street', 'Boston', 'MA', '02116'], ['South Street', 'Philadelphia', 'PA', '19147'], ['Broad Street', 'Columbus', 'OH', '43215'],
  ['Main Street', 'Kansas City', 'MO', '64111'], ['Mill Avenue', 'Tempe', 'AZ', '85281'], ['King Street', 'Charleston', 'SC', '29401'],
];

export const RETURN_REASONS = [
  ['Too small', 0.28], ['Too large', 0.24], ['Colour differs from the photos', 0.12],
  ['Fabric feels thinner than expected', 0.1], ['Changed my mind', 0.18], ['Arrived damaged', 0.08],
];

export const CLAIM_REASONS = {
  shoes: ['The sole is separating at the toe.', 'Stitching on the heel counter has come loose.', 'The insole lining tore after a few weeks.'],
  outerwear: ['A seam at the shoulder has opened.', 'The zip pull snapped off.', 'Lining came away from the hem.'],
  bags: ['The strap ring broke.', 'Handle stitching is unravelling.'],
  accessories: ['The buckle prong snapped.', 'Edge paint is peeling on the strap.'],
  clothing: ['Buttons came off after the first wash.', 'Side seam split in normal wear.'],
};
