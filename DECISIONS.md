# FairShare: Technical & Architectural Decisions Log

This document records the choices made during the planning and implementation of FairShare.

---

## Technical Decisions Log

| Decision Area | Options Considered | Selected Choice | Why |
|---|---|---|---|
| **Tech Stack Choice** | Next.js / Nest.js vs. React (Vite) + Express | **React (Vite) + Express** | Fits the assignment's need for simplicity, clear modularity, and easy explanation in interviews. |
| **Database ORM** | Raw pg client, Sequelize, or Prisma | **Prisma** | Provides a clean model definition schema, type safety, and automatic relational migrations out of the box. |
| **Currency Conversion Rate** | Dynamic API integration vs. Fixed constant | **Fixed USD_TO_INR = 83.0** | Ensured consistent, predictable test cases across imports and user checks without API network overhead. |
| **Rounding Strategy** | Float arithmetic vs. Round to 2 decimals | **Round to 2 decimals (`Math.round`)** | Eliminates standard JavaScript float precision issues (e.g. `0.1 + 0.2 = 0.300000004`). |
| **Settlement Detection** | Note keyword regex vs. Separate transaction types | **Fuzzy note keywords + divert row** | Allows users to log debt payments naturally in CSVs, converting them to `Settlement` models on import. |
| **Duplicate Handling** | Exact description comparison vs. Fuzzy token matching | **Token-based Jaccard similarity (>= 50%)** | Successfully catches slight edits like "Dinner at Marina Bites" vs "dinner - marina bites" as duplicates. |
| **Membership Date Enforcement** | Check during split vs. Filter database query | **Timeline-aware validation** | Prevents errors by ensuring Sam is not charged for pre-April bills, and Meera is not included after leaving. |
| **Debt Simplification** | DFS paths vs. Greedy Max Creditor/Debtor match | **Greedy Matching Algorithm** | Matches the biggest creditor and debtor iteratively, reducing transactions down to the mathematical minimum. |
| **Split Remainder Allocation** | Discard remainder vs. Allocate to payer | **Allocate remainder to payer** | Prevents cents from going missing by adding split divisions remainders to the payer's share. |
| **Zero-Amount Handling** | Fail import vs. Warning flag + skip option | **Warning Flag + Skip option** | Flags zero-amount rows (`Swiggy Swapping = 0`) as warnings but lets the user choose to skip or override them. |
| **Refund Handling (Negatives)** | Crash validation vs. Credit splits mapping | **Credit splits mapping** | Converts negative inputs (e.g. Goa parasailing refund) into credits for the participants. |
