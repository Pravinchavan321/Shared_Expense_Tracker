# CSV ANOMALIES REFERENCE

This file lists every data problem the importer must detect in `expenses_export.csv`.

## Membership Timeline (Ground Truth)

| Person | Joined         | Left           | Notes                     |
|--------|----------------|----------------|---------------------------|
| Aisha  | Feb 1, 2025    | —              | Original flatmate         |
| Rohan  | Feb 1, 2025    | —              | Original flatmate         |
| Priya  | Feb 1, 2025    | —              | Original flatmate         |
| Meera  | Feb 1, 2025    | March 31, 2025 | Moved out end of March    |
| Dev    | ~March 10, 2025| ~March 20, 2025| Trip guest only           |
| Sam    | April 15, 2025 | —              | Moved in mid-April        |

---

## Anomaly #1: Duplicate Expenses
**Evidence**: "Dinner at Goa" by Dev (3200 INR) and "dinner - goa" by Dev (3200 INR) — same amount, same payer, same date, slightly different description.  
**Detection**: Compare rows with same date + same payer + similar amount. Use case-insensitive string matching, strip punctuation.  
**Policy**: Flag both rows. Keep the first occurrence. Mark second as "duplicate". Let user decide.

## Anomaly #2: Comma in Amount
**Evidence**: "Electricity" row has amount "1,200" (with comma separator).  
**Detection**: Check if amount string contains comma before parsing.  
**Policy**: Strip comma, parse as 1200. Flag as "comma_in_amount" with message "Amount contained comma formatting: 1,200 → 1200".

## Anomaly #3: Excessive Decimal Places
**Evidence**: "Cylinder refill" amount is 899.995 (3 decimal places).  
**Detection**: After parsing amount to float, check if more than 2 decimal places.  
**Policy**: Round to 2 decimals → 900.00. Flag as "excessive_decimals".

## Anomaly #4: Inconsistent Name Casing
**Evidence**: "priya" appears as paid_by (lowercase) vs "Priya" elsewhere.  
**Detection**: Check if name matches title-case version.  
**Policy**: Normalize all names to title case. Flag as "name_case" with original vs normalized.

## Anomaly #5: Settlement Logged as Expense
**Evidence**: "Rohan paid Aisha" row with note "this is a settlement" and amount 5000.  
**Detection**: Check if description matches pattern "X paid Y" or notes contain "settlement".  
**Policy**: Convert to Settlement record (paidBy=Rohan, paidTo=Aisha, amount=5000). Do NOT create an Expense. Flag as "is_settlement".

## Anomaly #6: USD Amounts Not Converted
**Evidence**: "Goa villa booking" (540 USD), "Beach shack dinner" (84 USD), "Parasailing" (150 USD), "Parasailing refund" (-30 USD), "Dinner at Thalassa" (2400 INR but note says it was USD).  
**Detection**: Check currency column = "USD".  
**Policy**: Convert to INR by multiplying by 83.0. Store originalAmount and currency for audit. Flag as "usd_needs_conversion" with conversion details.

## Anomaly #7: Negative Amount
**Evidence**: "Parasailing refund" by Dev = -30 USD.  
**Detection**: Check if parsed amount < 0.  
**Policy**: Treat as refund. The payer (Dev) gets credited back. Split participants get credited back. Flag as "negative_amount" with "Treated as refund to participants".

## Anomaly #8: Date Format Inconsistency
**Evidence**: Most dates show as "########" (Excel serial numbers that got corrupted on export). One shows as "Mar-14".  
**Detection**: Check if date is a number (Excel serial), a partial format ("Mar-14"), or standard date.  
**Policy**: Parse Excel serials as days-since-1899-12-30. Parse "Mar-14" as March 14, 2025. Flag as "date_format_issue" with parsed result.

## Anomaly #9: Non-Member in Split (Sam Before Joining)
**Evidence**: If Sam appears in split_with for any expense before April 15, 2025.  
**Detection**: For each person in split_with, check if they were a member (joinedAt <= expense.date).  
**Policy**: Remove non-member from split, recalculate split amounts. Flag as "non_member_on_date" with "Sam was not a member on [date], removed from split".

## Anomaly #10: Member Who Left Still in Split (Meera After March)
**Evidence**: Meera appears in split_with for expenses dated after March 31, 2025 (e.g., "Meera fare" by Aisha with amount 4800 and note "Meera moved out").  
**Detection**: Check if member's leftAt < expense.date.  
**Policy**: Flag as "member_left". The notes may indicate this is a farewell/settling expense — let user decide. If clear post-move-out regular expense, exclude Meera.

## Anomaly #11: Split Amounts Don't Sum to Total
**Evidence**: "Aisha birthday" 1500 INR, unequal split, split_details mention "Rohan 700" — check if specified amounts sum to 1500.  
**Detection**: For unequal/exact splits, parse split_details, sum amounts, compare to total.  
**Policy**: Flag as "split_sum_mismatch" with "Split amounts sum to X but total is Y". Let user decide which to trust.

## Anomaly #12: Zero Amount
**Evidence**: "Dinner on Priya" has amount 0 with note "M counted twice" or similar.  
**Detection**: Check if parsed amount = 0.  
**Policy**: Flag as "zero_amount" with "Expense has zero amount — may be a data entry error". Skip by default, let user override.

## Anomaly #13: Notes Contradict Split Members
**Evidence**: "Movie night" notes say "Meera skipped" but Meera IS in split_with. Or "Airport cab" notes say "M forgot to split" but member is/isn't in split_with.  
**Detection**: Parse notes for keywords like "skipped", "forgot", "not included". Cross-reference with split_with list.  
**Policy**: Flag as "skipped_member_conflict" with "Notes say [X] but split_with [includes/excludes] them". Use split_with as truth but surface for review.

## Anomaly #14: Percentage Split Doesn't Sum to 100%
**Evidence**: "Pizza Friday" 1440 INR, percentage split, "Aisha 30%; Rohan 30%" — remaining unclear or doesn't sum to 100.  
**Detection**: For percentage splits, parse all percentages, check if sum = 100.  
**Policy**: Flag as "percentage_invalid" with "Percentages sum to X%, expected 100%". If close (99-101%), normalize. Otherwise flag as error.

---

## Import Report Format (What the app generates)

```json
{
  "fileName": "expenses_export.csv",
  "totalRows": 38,
  "importedRows": 33,
  "skippedRows": 5,
  "anomalies": [
    {
      "rowNumber": 5,
      "type": "duplicate",
      "severity": "warning",
      "message": "Duplicate of row 4: 'dinner - goa' matches 'Dinner at Goa'",
      "originalValue": "dinner - goa, 3200",
      "suggestedFix": "Skip this row (keep row 4)",
      "action": "skipped"
    }
  ]
}
```
