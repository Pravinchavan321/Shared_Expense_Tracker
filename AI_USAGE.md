# FairShare: AI Usage and Code-Generation Reference

This document details the role of AI in building FairShare, including prompt highlights, and debugging history.

---

## AI Collaboration Summary

The FairShare codebase was built in collaboration with **Antigravity** (Google DeepMind advanced pair-programmer agent). 
- **Role of AI**: Scaffolding directories, generating database seed timelines, implementing Zod schema constraints, creating the 14 anomaly detectors, and building the premium dark glassmorphic React components.
- **Human Role**: Prompting, specifying database timelines, writing custom mathematical tests, verifying calculations, and checking UI compatibility.

---

## Key Prompts Used

### 1. Database Schema Definition (Session 1)
> *Prompt*: Create Prisma schema at server/prisma/schema.prisma with models: User, Group, GroupMembership, Expense, ExpenseSplit, Settlement, ImportReport. Build explicit relationships for paidById, paidToId, joinedAt, and leftAt.

### 2. Splitting Math and Remainder Rounding (Session 2)
> *Prompt*: Implement equal, exact, percentage, and share splits. For equal split, divide amount among participants and round to 2 decimals. Any division remainder must be added to the payer's split to keep total balance exactly matching.

### 3. CSV Anomaly review engine (Session 3)
> *Prompt*: Build importService.js with 14 anomaly detectors (duplicates, commas, dates, excessive decimals, non-member on dates, member left, zero amounts, percentage validations). Return reports with status badges and suggested fixes.

### 4. Tab Layout & Interactive Drawers (Session 5)
> *Prompt*: Implement GroupDetail.jsx tabs: Expenses, Balances, Settlements, and Import. In the Balances tab, click a person to slide open a drawer containing their user breakdown transactions list.

---

## Case History: AI Mistakes & Debugged Solutions

Here are three instances where the AI generated flawed code, how it was caught, and how we resolved it:

### 1. Settlement Math Sign Inversion
- **What was generated**: In `balanceService.js`, the AI coded settlements as reducing the payer's balance (`balances[set.paidById].netBalance -= set.amount`) and increasing the payee's balance (`+=`).
- **How we caught it**: Ran `test_logic.js`. After Aisha (who owed Rohan 215 INR) paid Rohan 215 INR, her net balance went to `-430 INR` and Rohan's went to `+530 INR` (making their debts worse).
- **The fix**: Adjusted the signs in `balanceService.js` so that recording a settlement credits the payer (`+= set.amount`) and debits the payee (`-= set.amount`) to neutralize the debt.

### 2. Duplicate Detection Missing Soft Matches
- **What was generated**: Initial duplicate check did a simple case-insensitive character strip match on the description string.
- **How we caught it**: Running the CSV upload test didn't flag row 5 (`dinner - marina bites`) as a duplicate of row 4 (`Dinner at Marina Bites`) because of the stop-word "at".
- **The fix**: Rewrote duplicate checks using token Jaccard similarity. The words are split, common stop-words (`at`, `for`, `the`, `in`) are ignored, and if the intersection of words is >= 50%, it flags it as a duplicate.

### 3. Vite Server Imports Relative Resolution Failures
- **What was generated**: Relative require paths inside the test script folder lookup were written as relative to the script location.
- **How we caught it**: Running the script through npm commands resulted in `MODULE_NOT_FOUND` because relative directories crossed drive roots on Windows.
- **The fix**: Standardized imports using absolute path targets or running scripts in NODE_PATH environment settings.
