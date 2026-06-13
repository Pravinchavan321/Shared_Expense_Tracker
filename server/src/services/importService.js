const Papa = require('papaparse');
const { parseDate, parseAmount, normalizeName, parseSplitWith, parseSplitDetails } = require('../utils/importHelpers');

/**
 * Parses and processes a CSV string, performing anomaly detection on each row.
 */
async function analyzeCSV(csvText, memberships) {
  // Parse CSV file content with Papa Parse
  const parsedCSV = Papa.parse(csvText, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true
  });

  const rawRows = parsedCSV.data;
  const processedRows = [];

  // 1. Initial parsing and single-row anomaly detections
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const anomalies = [];
    let status = 'ok';

    // Check zero amount
    const zeroAmountAnomaly = detectZeroAmount(raw);
    if (zeroAmountAnomaly) {
      anomalies.push(zeroAmountAnomaly);
      status = 'warning';
    }

    // Check negative amount
    const negativeAnomaly = detectNegativeAmount(raw);
    if (negativeAnomaly) {
      anomalies.push(negativeAnomaly);
      status = 'warning';
    }

    // Check comma in amount
    const commaAnomaly = detectCommaInAmount(raw);
    if (commaAnomaly) anomalies.push(commaAnomaly);

    // Check excessive decimals
    const decimalAnomaly = detectExcessiveDecimals(raw);
    if (decimalAnomaly) anomalies.push(decimalAnomaly);

    // Check name casing
    const nameCaseAnomaly = detectNameCase(raw);
    if (nameCaseAnomaly) anomalies.push(nameCaseAnomaly);

    // Check date formatting
    const dateAnomaly = detectDateFormat(raw);
    if (dateAnomaly) anomalies.push(dateAnomaly);

    // Check USD conversion need
    const usdAnomaly = detectUSDNotConverted(raw);
    if (usdAnomaly) anomalies.push(usdAnomaly);

    // Check if it's a settlement
    const settlementAnomaly = detectSettlement(raw);
    if (settlementAnomaly) anomalies.push(settlementAnomaly);

    // Parse values for further validation
    const parsedAmt = parseAmount(raw.amount);
    const parsedDt = parseDate(raw.date);
    const exchangeRate = (raw.currency && raw.currency.toUpperCase() === 'USD') ? 83.0 : 1.0;
    const finalAmount = Math.round(Math.abs(parsedAmt) * exchangeRate * 100) / 100;

    const paidByNormalized = normalizeName(raw.paid_by);
    const splitWithArray = parseSplitWith(raw.split_with);
    const splitDetailsParsed = parseSplitDetails(raw.split_details, raw.split_type);

    // Timeline and membership checks
    if (parsedDt) {
      // Check non-members on date
      const nonMemberAnomaly = detectNonMember(raw, parsedDt, splitWithArray, memberships);
      if (nonMemberAnomaly) {
        anomalies.push(nonMemberAnomaly);
        status = 'warning';
      }

      // Check members who already left
      const leftAnomaly = detectMemberLeftBefore(raw, parsedDt, splitWithArray, memberships);
      if (leftAnomaly) {
        anomalies.push(leftAnomaly);
        status = 'warning';
      }
    }

    // Split calculations check
    const splitTypeLower = raw.split_type ? raw.split_type.toLowerCase() : '';
    if (splitTypeLower === 'exact' || splitTypeLower === 'unequal') {
      const mismatchAnomaly = detectSplitMismatch(raw, parsedAmt, splitDetailsParsed);
      if (mismatchAnomaly) {
        anomalies.push(mismatchAnomaly);
        status = 'warning';
      }
    } else if (splitTypeLower === 'percentage') {
      const pctAnomaly = detectPercentageInvalid(raw, splitDetailsParsed);
      if (pctAnomaly) {
        anomalies.push(pctAnomaly);
        status = 'warning';
      }
    }

    // Notes vs split members contradiction check
    const skipConflictAnomaly = detectSkippedMember(raw, splitWithArray);
    if (skipConflictAnomaly) {
      anomalies.push(skipConflictAnomaly);
      status = 'warning';
    }

    // Generate parsed row preview
    const parsedRow = {
      date: parsedDt ? parsedDt.toISOString().split('T')[0] : null,
      description: raw.description ? raw.description.trim() : '',
      paid_by: paidByNormalized,
      amount: finalAmount,
      originalAmount: Math.abs(parsedAmt),
      currency: (raw.currency && raw.currency.toUpperCase() === 'USD') ? 'INR' : (raw.currency || 'INR'),
      split_type: raw.split_type || 'equal',
      split_with: splitWithArray,
      split_details: splitDetailsParsed,
      notes: raw.notes || null,
      isSettlement: settlementAnomaly !== null,
      isRefund: parsedAmt < 0
    };

    processedRows.push({
      rowIndex: i,
      originalRow: raw,
      parsedRow,
      anomalies,
      status
    });
  }

  // 2. Multi-row duplicate detection
  detectDuplicates(processedRows);

  return {
    totalRows: rawRows.length,
    rows: processedRows
  };
}

/**
 * Extracts normalized tokens from a string ignoring common stop words.
 */
function getTokens(str) {
  const stopWords = new Set(['at', 'for', 'the', 'in', 'and', 'a', 'an', 'to', 'of', 'on', 'with', 'by']);
  return (str || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 0 && !stopWords.has(t));
}

/**
 * Checks if two strings are fuzzy matches (at least 50% shared non-stop tokens).
 */
function areFuzzyEqual(str1, str2) {
  const tokens1 = getTokens(str1);
  const tokens2 = getTokens(str2);
  if (tokens1.length === 0 || tokens2.length === 0) return false;
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  let intersection = 0;
  for (const t of set1) {
    if (set2.has(t)) intersection++;
  }
  const union = new Set([...tokens1, ...tokens2]).size;
  return (intersection / union) >= 0.5;
}

/**
 * Finds rows with same description (fuzzy), similar amount, and same date.
 */
function detectDuplicates(processedRows) {
  for (let i = 0; i < processedRows.length; i++) {
    const rowA = processedRows[i];
    if (rowA.parsedRow.isSettlement) continue;

    for (let j = i + 1; j < processedRows.length; j++) {
      const rowB = processedRows[j];
      if (rowB.parsedRow.isSettlement) continue;

      const sameDate = rowA.parsedRow.date === rowB.parsedRow.date;
      const sameDesc = areFuzzyEqual(rowA.parsedRow.description, rowB.parsedRow.description);
      
      const amountDiff = Math.abs(rowA.parsedRow.amount - rowB.parsedRow.amount);
      const similarAmount = amountDiff < 0.05 * Math.max(rowA.parsedRow.amount, rowB.parsedRow.amount) || amountDiff < 5;

      if (sameDate && sameDesc && similarAmount) {
        rowB.anomalies.push({
          type: 'duplicate',
          message: `Possible duplicate of row ${i + 1}: '${rowB.originalRow.description}' matches '${rowA.originalRow.description}'`,
          suggestedFix: 'Skip importing this duplicate row'
        });
        rowB.status = 'warning';
      }
    }
  }
}

/**
 * Checks if amount contains comma formatting.
 */
function detectCommaInAmount(row) {
  if (row.amount && String(row.amount).includes(',')) {
    return {
      type: 'comma_in_amount',
      message: `Amount contains comma formatting: "${row.amount}"`,
      suggestedFix: 'Strip commas and parse value'
    };
  }
  return null;
}

/**
 * Checks if amount has 3 or more decimal places.
 */
function detectExcessiveDecimals(row) {
  if (row.amount && /\.\d{3,}/.test(String(row.amount))) {
    return {
      type: 'excessive_decimals',
      message: `Amount has excessive decimal places: "${row.amount}"`,
      suggestedFix: 'Round amount to 2 decimal places'
    };
  }
  return null;
}

/**
 * Checks if paid_by or any name in split_with is not formatted in Title Case.
 */
function detectNameCase(row) {
  const checkName = (name) => {
    if (!name) return false;
    const norm = normalizeName(name);
    return name.trim() !== norm;
  };

  const nameIssue = checkName(row.paid_by) || (row.split_with && parseSplitWith(row.split_with).some(n => checkName(n)));
  if (nameIssue) {
    return {
      type: 'name_case',
      message: 'One or more user names are not in Title Case',
      suggestedFix: 'Format all names to Title Case'
    };
  }
  return null;
}

/**
 * Checks if the expense description or notes represent a settlement repayment.
 */
function detectSettlement(row) {
  const descLower = row.description ? row.description.toLowerCase() : '';
  const notesLower = row.notes ? row.notes.toLowerCase() : '';
  if (descLower.includes(' paid ') || descLower.includes('paid back') || notesLower.includes('settlement')) {
    return {
      type: 'is_settlement',
      message: 'Transaction appears to be a settlement debt repayment, not a shared expense',
      suggestedFix: 'Record transaction as a Settlement instead of Expense'
    };
  }
  return null;
}

/**
 * Checks if currency is USD and needs conversion to INR.
 */
function detectUSDNotConverted(row) {
  if (row.currency && row.currency.toUpperCase() === 'USD') {
    return {
      type: 'usd_needs_conversion',
      message: 'Currency is in USD and requires conversion to INR',
      suggestedFix: 'Convert amount to INR using 83.0 exchange rate'
    };
  }
  return null;
}

/**
 * Checks if amount is negative, indicating a refund.
 */
function detectNegativeAmount(row) {
  const parsedAmt = parseAmount(row.amount);
  if (parsedAmt < 0) {
    return {
      type: 'negative_amount',
      message: `Amount is negative (${row.amount}), indicating a refund`,
      suggestedFix: 'Import as a refund (credit back to participants)'
    };
  }
  return null;
}

/**
 * Checks if date formatting is non-standard (e.g. Excel serial number or partial month format).
 */
function detectDateFormat(row) {
  const str = row.date ? String(row.date).trim() : '';
  if (/^\d+$/.test(str) || /^[a-zA-Z]{3}-\d{2}$/.test(str)) {
    return {
      type: 'date_format_issue',
      message: `Date is in a non-standard Excel serial or shorthand format: "${row.date}"`,
      suggestedFix: 'Normalize to YYYY-MM-DD standard date'
    };
  }
  return null;
}

/**
 * Checks if any person in split_with was not a group member on the expense date.
 */
function detectNonMember(row, expenseDate, splitWithArray, memberships) {
  const nonMembers = [];
  for (const name of splitWithArray) {
    const member = memberships.find(m => m.user.name.toLowerCase() === name.toLowerCase());
    if (!member || new Date(member.joinedAt) > expenseDate) {
      nonMembers.push(name);
    }
  }

  if (nonMembers.length > 0) {
    return {
      type: 'non_member_on_date',
      message: `Users in split list were not members on the transaction date: ${nonMembers.join(', ')}`,
      suggestedFix: 'Exclude non-members from split'
    };
  }
  return null;
}

/**
 * Checks if any member in split_with had already left the group on the expense date.
 */
function detectMemberLeftBefore(row, expenseDate, splitWithArray, memberships) {
  const leftMembers = [];
  for (const name of splitWithArray) {
    const member = memberships.find(m => m.user.name.toLowerCase() === name.toLowerCase());
    if (member && member.leftAt && new Date(member.leftAt) < expenseDate) {
      leftMembers.push(name);
    }
  }

  if (leftMembers.length > 0) {
    return {
      type: 'member_left',
      message: `Users in split list had already left the group on transaction date: ${leftMembers.join(', ')}`,
      suggestedFix: 'Review if they should be excluded from split'
    };
  }
  return null;
}

/**
 * Checks if split details sum matches the total expense amount.
 */
function detectSplitMismatch(row, totalAmount, splitDetails) {
  const sum = splitDetails.reduce((acc, item) => acc + (item.amount || 0), 0);
  if (Math.abs(sum - totalAmount) > 0.01) {
    return {
      type: 'split_sum_mismatch',
      message: `Split amounts sum to ${sum} but total is ${totalAmount}`,
      suggestedFix: 'Adjust split details to match total amount exactly'
    };
  }
  return null;
}

/**
 * Checks if amount is exactly zero.
 */
function detectZeroAmount(row) {
  const parsedAmt = parseAmount(row.amount);
  if (parsedAmt === 0) {
    return {
      type: 'zero_amount',
      message: 'Expense has zero amount',
      suggestedFix: 'Skip row or verify amount with invoice'
    };
  }
  return null;
}

/**
 * Checks if notes indicate skipping a member but that member is included in the split_with (or vice versa).
 */
function detectSkippedMember(row, splitWithArray) {
  const notesLower = row.notes ? row.notes.toLowerCase() : '';
  if (notesLower.includes('skipped') || notesLower.includes('not charged') || notesLower.includes('excluded')) {
    // Look for matching names in splitWith
    const contradictions = [];
    for (const name of splitWithArray) {
      if (notesLower.includes(name.toLowerCase())) {
        contradictions.push(name);
      }
    }
    if (contradictions.length > 0) {
      return {
        type: 'skipped_member_conflict',
        message: `Notes indicate members were skipped but they are in split list: ${contradictions.join(', ')}`,
        suggestedFix: 'Remove skipped members from split list'
      };
    }
  }
  return null;
}

/**
 * Checks if split percentages sum to exactly 100%.
 */
function detectPercentageInvalid(row, splitDetails) {
  const sum = splitDetails.reduce((acc, item) => acc + (item.percentage || 0), 0);
  if (Math.abs(sum - 100) > 0.01) {
    return {
      type: 'percentage_invalid',
      message: `Split percentages sum to ${sum}%, expected 100%`,
      suggestedFix: 'Adjust percentages to sum exactly to 100%'
    };
  }
  return null;
}

module.exports = {
  analyzeCSV
};
