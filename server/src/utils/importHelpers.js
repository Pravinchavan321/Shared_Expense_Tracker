/** Named constants for date and currency parsing */
const EXCEL_EPOCH = new Date(1899, 11, 30); // month 11 is December

/**
 * Parses a date string from various formats (Excel serial numbers, DD-MM-YYYY, Mar-14, ISO).
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const str = dateStr.trim();

  // Excel serial number format (e.g. "45714" or "45714.5")
  if (/^\d+(\.\d+)?$/.test(str)) {
    const serial = parseFloat(str);
    const msPerDay = 24 * 60 * 60 * 1000;
    return new Date(EXCEL_EPOCH.getTime() + Math.round(serial * msPerDay));
  }

  // Mar-14 format (assume year 2025)
  if (/^[a-zA-Z]{3}-\d{1,2}$/.test(str)) {
    const parts = str.split('-');
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mIdx = months.indexOf(parts[0].toLowerCase());
    const day = parseInt(parts[1], 10);
    if (mIdx !== -1 && !isNaN(day)) {
      return new Date(2025, mIdx, day);
    }
  }

  // DD-MM-YYYY dashed format (e.g. "01-02-2026")
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(str)) {
    const parts = str.split('-');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed month
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }

  // Standard Date parsing fallback
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Cleans and parses amount strings, handling commas, negatives, and rounding.
 */
function parseAmount(amountStr) {
  if (amountStr === undefined || amountStr === null || amountStr === '') return 0;
  const cleaned = String(amountStr).replace(/,/g, '').trim();
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

/**
 * Trims and normalizes a user's name to Title Case.
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Parses semicolon/comma delimited list of names into a cleaned array.
 */
function parseSplitWith(splitWithStr) {
  if (!splitWithStr) return [];
  return splitWithStr
    .split(/[;,]/)
    .map(n => normalizeName(n))
    .filter(n => n.length > 0);
}

/**
 * Parses split details (e.g. Aisha 30%; Rohan 30% or Aisha 2; Rohan 1) into structured objects.
 */
function parseSplitDetails(detailsStr, splitType) {
  if (!detailsStr) return [];
  
  const entries = detailsStr.split(/[;,]/);
  const result = [];

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    // Split name and value from the end of the string
    const match = trimmed.match(/^(.*?)\s+([\d.-]+%?)$/);
    if (!match) continue;

    const name = normalizeName(match[1]);
    const valStr = match[2];

    const item = { name };

    if (splitType === 'percentage') {
      item.percentage = parseFloat(valStr.replace('%', ''));
    } else if (splitType === 'share') {
      item.shares = parseFloat(valStr);
    } else {
      item.amount = parseFloat(valStr);
    }

    result.push(item);
  }

  return result;
}

module.exports = {
  parseDate,
  parseAmount,
  normalizeName,
  parseSplitWith,
  parseSplitDetails
};
