// Standalone Code 128 (B) Barcode & Unique Barcode Generator
const db = require('../database');

// Code 128 character encodings (Patterns of bar and space widths)
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

const START_CODE_B = 104;
const STOP_CODE = 106;

/**
 * Generate a standalone SVG barcode string using Code 128 B
 */
function generateBarcodeSvg(text, options = {}) {
  const clean = String(text || '').trim();
  if (!clean) return '';

  const width = options.width || 2;
  const height = options.height || 50;
  const showText = options.showText !== false;
  const fontSize = options.fontSize || 12;

  const codes = [START_CODE_B];
  let checksum = START_CODE_B;

  for (let i = 0; i < clean.length; i++) {
    const ascii = clean.charCodeAt(i);
    const code = ascii - 32;
    codes.push(code);
    checksum += code * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(STOP_CODE);

  let barString = "";
  for (const code of codes) {
    barString += CODE128_PATTERNS[code] || "";
  }

  // Calculate total modules (sum of widths)
  let totalModules = 0;
  for (let i = 0; i < barString.length; i++) {
    totalModules += parseInt(barString[i], 10);
  }

  const quietZone = 10;
  const svgWidth = (totalModules + quietZone * 2) * width;
  const svgHeight = height + (showText ? fontSize + 8 : 4);

  let x = quietZone * width;
  let rects = "";

  for (let i = 0; i < barString.length; i++) {
    const moduleWidth = parseInt(barString[i], 10) * width;
    const isBar = i % 2 === 0;
    if (isBar) {
      rects += `<rect x="${x}" y="2" width="${moduleWidth}" height="${height}" fill="#000" />`;
    }
    x += moduleWidth;
  }

  let textSvg = "";
  if (showText) {
    const textY = height + fontSize + 2;
    textSvg = `<text x="${svgWidth / 2}" y="${textY}" font-family="Courier, monospace" font-size="${fontSize}" font-weight="bold" text-anchor="middle" fill="#000">${clean}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">${rects}${textSvg}</svg>`;
}

/**
 * Generate a unique 12-digit Indian retail barcode starting with 890
 */
function generateUniqueBarcode() {
  let isUnique = false;
  let candidate = '';
  let attempts = 0;

  while (!isUnique && attempts < 50) {
    attempts++;
    // 890 + 9 random digits = 12 digits
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000).toString();
    candidate = `890${randomDigits}`;

    // Check products
    const inProd = db.prepare('SELECT id FROM products WHERE barcode = ?').get(candidate);
    const inVar = db.prepare('SELECT id FROM product_variants WHERE barcode = ?').get(candidate);

    if (!inProd && !inVar) {
      isUnique = true;
    }
  }

  return candidate;
}

module.exports = {
  generateBarcodeSvg,
  generateUniqueBarcode
};
