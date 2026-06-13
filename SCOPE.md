# FairShare: Project Scope & Anomaly Reference

This document outlines the detailed specifications of the FairShare application, including the database schema models, membership timelines, and the CSV import anomaly log dictionary.

---

## Membership Timeline (Ground Truth)

The flatmate group timeline follows strict dates defining who was active and eligible to be included in expense splits on any given transaction date:

| User | Joined | Left | Description |
|---|---|---|---|
| **Aisha** | Feb 1, 2025 | *Still Active* | Original Flatmate |
| **Rohan** | Feb 1, 2025 | *Still Active* | Original Flatmate |
| **Priya** | Feb 1, 2025 | *Still Active* | Original Flatmate |
| **Meera** | Feb 1, 2025 | Mar 31, 2025 | Moved out end of March |
| **Dev** | Mar 10, 2025 | Mar 20, 2025 | Temporary guest for Goa trip |
| **Sam** | Apr 15, 2025 | *Still Active* | New flatmate joining in mid-April |

---

## The 14 CSV Import Anomalies

Our anomaly review system parses and processes `expenses_export.csv` with these rules:

| Anomaly Type | Problem | Evidence (CSV Rows) | App Policy / Handlers |
|---|---|---|---|
| **1. duplicate** | Matching description, identical dates, and similar amounts. | Row 5 (`dinner - marina bites`) matches Row 4; Row 24 (`Thalassa dinner`) matches Row 23. | Flags the row and highlights it. Recommends skipping duplicate entries. |
| **2. comma_in_amount** | Numeric amount column contains formatted commas. | Row 6 (`Electricity Feb` amount `"1,200"`). | Strips commas and parses cleanly as a float. Flags as warning. |
| **3. excessive_decimals** | Decimals extend to 3 or more places. | Row 9 (`Cylinder refill` amount `899.995`). | Rounds value to 2 decimal places (`900.00`). Flags as warning. |
| **4. name_case** | User names are lowercase or styled incorrectly. | Row 8 (`Movie night snacks` paid_by `"priya"`), Row 26 (`Airport cab` paid_by `"sam"`). | Automatically normalizes text to Title Case (`Priya`, `Sam`). |
| **5. is_settlement** | Debt repayment logged as an expense. | Row 13 (`Rohan paid Aisha back`). | Diverts transaction type, committing it to the `Settlement` table. |
| **6. usd_needs_conversion** | Expense registered in USD. | Row 19, 20, 22, 25 (e.g. `Goa villa booking` amount `540 USD`). | Converts to INR by multiplying by `83.0`. Stores original USD audit details. |
| **7. negative_amount** | Negative numbers in amount. | Row 25 (`Parasailing refund` amount `-30 USD`). | Interprets as refund. Credits split participants instead of debiting. |
| **8. date_format_issue** | Date is an Excel serial number or partial month. | Row 26 (`Airport cab` date `Mar-14`). | Decodes serial numbers (days since 1899-12-30) and parses partials as 2025 dates. |
| **9. non_member_on_date** | Participant is not a member on transaction date. | Row 22 (`Parasailing` split includes `Dev's Friend Kabir` who isn't a member). | Excludes the non-member and divides costs among active members. |
| **10. member_left** | Participant had left prior to transaction date. | Rows 1–3, 6, 7, 9, 10, 11, 12, 14 (Meera in 2026 splits after leaving in 2025). | Flags row. Allows exclusion of departed user from splits. |
| **11. split_sum_mismatch** | Unequal split values don't sum to total. | Row 11 (`Aisha birthday cake` sum matches, but flags if mismatched). | Checks exact split parts and flags discrepancies. |
| **12. zero_amount** | Entry amount is 0. | Row 30 (`Dinner order Swiggy` amount `0`). | Flags. Recommends skipping raw row. |
| **13. skipped_member_conflict**| Notes say member skipped, but they are in splits. | Row 8 notes mention "Meera skipped", Meera is excluded. Mismatches are flagged. | Evaluates note keywords. Warns if there is contradiction. |
| **14. percentage_invalid** | Percentage split values do not sum to 100%. | Row 14 (`Pizza Friday` sum = 110%). | Flags validation error and requires adjustment. |

---

## Database Schema Model Definitions

### 1. User
Represents registered accounts.
- `id` (Int, PK): Auto-incremented identifier.
- `name` (String, Unique): Name of the user (e.g. "Aisha").
- `email` (String, Unique): User email address.
- `password` (String): Hashed password.
- `createdAt` (DateTime): Registration timestamp.

### 2. Group
Expense splitting groups.
- `id` (Int, PK): Unique group ID.
- `name` (String): Name of the group (e.g. "Flat Expenses").
- `createdAt` (DateTime): Creation timestamp.

### 3. GroupMembership
Timeline history of users joining/leaving groups.
- `id` (Int, PK): Unique membership ID.
- `userId` (Int, FK): References `User`.
- `groupId` (Int, FK): References `Group`.
- `joinedAt` (DateTime): Joining date.
- `leftAt` (DateTime, Nullable): Date user left the group.

### 4. Expense
Shared group expenses.
- `id` (Int, PK): Unique expense ID.
- `groupId` (Int, FK): References `Group`.
- `description` (String): What the expense was for.
- `amount` (Float): Store value in INR.
- `originalAmount` (Float): Raw input amount.
- `currency` (String): Code e.g. "INR" or "USD".
- `exchangeRate` (Float): Rate used (e.g. 83.0).
- `paidById` (Int, FK): References `User`.
- `splitType` (String): equal / exact / percentage / share.
- `date` (DateTime): Transaction date.
- `notes` (String, Nullable): Optional details.
- `isSettlement` (Boolean): Identifies settlements.

### 5. ExpenseSplit
Individual debtor shares.
- `id` (Int, PK): Unique split ID.
- `expenseId` (Int, FK): References `Expense`.
- `userId` (Int, FK): References `User`.
- `amount` (Float): Share value in INR.

### 6. Settlement
Recorded repayments.
- `id` (Int, PK): Unique settlement ID.
- `groupId` (Int, FK): References `Group`.
- `paidById` (Int, FK): Payer user.
- `paidToId` (Int, FK): Recipient user.
- `amount` (Float): Paid amount.
- `date` (DateTime): Payment date.
- `notes` (String, Nullable): Notes.

### 7. ImportReport
CSV upload audit trails.
- `id` (Int, PK): Report ID.
- `groupId` (Int, FK): References `Group`.
- `fileName` (String): Uploaded file name.
- `totalRows` (Int): Rows evaluated.
- `importedRows` (Int): Rows committed.
- `anomalies` (Json): Log details.
