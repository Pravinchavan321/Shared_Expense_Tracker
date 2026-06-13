# FairShare — Shared Expenses App: Implementation Plan

## What Is This App?

A **minimal, fully-working** shared expenses splitting app for a group of flatmates.  
Users can create groups, add expenses, split them multiple ways, import a messy CSV, and see who owes whom.

**Target size**: ~2,500–3,500 lines of code total.  
**NOT** an enterprise app. A clean, explainable project that actually works.

---

## Tech Stack (LOCKED)

| Layer        | Tech                  | Why                              |
|--------------|-----------------------|----------------------------------|
| Frontend     | React 18 + Vite       | Fast, simple, well-known         |
| Styling      | Vanilla CSS           | Full control, no extra deps      |
| Backend      | Node.js + Express     | Fast to build, simple            |
| Database     | PostgreSQL            | Relational (assignment requires) |
| ORM          | Prisma                | Clean schema, easy migrations    |
| Auth         | JWT + bcrypt          | Simple, explainable              |
| CSV Parsing  | Papa Parse (backend)  | Handles messy CSVs well          |
| HTTP Client  | Axios (frontend)      | Clean API calls                  |
| Validation   | Zod (backend)         | Schema validation                |

---

## Folder Structure

```
SpreeTail_Assignment/
├── client/                     # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/         # Reusable UI (Navbar, Layout, ProtectedRoute)
│   │   ├── pages/              # Login, Register, Dashboard, GroupDetail, ImportCSV, Balances, Settlements
│   │   ├── context/            # AuthContext.jsx
│   │   ├── services/           # api.js (axios instance + API calls)
│   │   ├── App.jsx / App.css / index.css / main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── server/                     # Express backend
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.js
│   │   └── migrations/
│   ├── src/
│   │   ├── routes/             # auth.js, groups.js, expenses.js, settlements.js, import.js
│   │   ├── middleware/         # auth.js (JWT verify)
│   │   ├── services/          # balanceService.js, importService.js, currencyService.js
│   │   ├── utils/             # importHelpers.js
│   │   └── index.js
│   ├── package.json
│   └── .env
│
├── expenses_export.csv         # The messy CSV (DO NOT EDIT)
├── README.md
├── SCOPE.md
├── DECISIONS.md
└── AI_USAGE.md
```

---

## Database Schema

```
User:         id, name (unique), email (unique), password, createdAt
Group:        id, name, createdAt
GroupMembership: id, userId→User, groupId→Group, joinedAt, leftAt (nullable)
Expense:      id, groupId→Group, description, amount (INR), originalAmount, currency, exchangeRate, paidById→User, splitType, date, notes, isSettlement, importFlag, createdAt
ExpenseSplit: id, expenseId→Expense, userId→User, amount (INR), createdAt
Settlement:   id, groupId→Group, paidById→User, paidToId→User, amount, date, notes, createdAt
ImportReport: id, groupId→Group, fileName, totalRows, importedRows, anomalies (JSON), createdAt
```

**Key design**: Amounts always stored in INR. `originalAmount` + `currency` preserved for audit.

---

## Core Business Rules

### Split Types
| Type       | Logic                                                     |
|------------|-----------------------------------------------------------|
| equal      | Total ÷ number of participants (round to 2 decimals)      |
| exact/unequal | Each person's amount specified in split_details        |
| percentage | Each person's % specified; sum must = 100%                |
| share      | Ratio-based; e.g., "Aisha 2; Rohan 1" → Aisha pays 2/3  |

### Currency: USD → INR fixed rate = **83.0**

### Membership Rules
- Expense only applies to members **active on that date**
- Active = `joinedAt <= expense.date` AND (`leftAt IS NULL` OR `leftAt >= expense.date`)
- Aisha, Rohan, Priya, Meera: joined **Feb 1, 2025**
- Meera: left **March 31, 2025**
- Dev: joined ~**March 10**, left ~**March 20** (trip only, infer from CSV)
- Sam: joined **April 15, 2025**

### Balance Calculation
- paidBy gets credit, each split participant gets debit
- Net = total credits − total debits
- Debt simplification: greedy algorithm (biggest creditor paid by biggest debtor)

### Rounding: 2 decimal places. Remainder → assigned to payer.

---

## The 14 CSV Anomalies

| #  | Anomaly                          | Evidence                                                  | Action                                         |
|----|----------------------------------|-----------------------------------------------------------|-------------------------------------------------|
| 1  | Duplicate expense                | "Dinner at Goa" / "dinner - goa" by Dev, same amount      | Flag, keep first, mark second as duplicate      |
| 2  | Amount has comma                 | "1,200" for Electricity                                   | Strip comma, parse as 1200                      |
| 3  | Excessive decimals               | "899.995" for Cylinder refill                             | Round to 899.99                                 |
| 4  | Inconsistent name case           | "priya" vs "Priya" in paid_by                             | Normalize to title case                         |
| 5  | Settlement as expense            | "Rohan paid Aisha" note: "this is a settlement"           | Convert to Settlement record                    |
| 6  | USD not converted                | Villa 540 USD, shack 84 USD, parasailing 150 USD          | Convert to INR using ×83                        |
| 7  | Negative amount                  | Parasailing refund = −30 USD                              | Treat as refund, credit back                    |
| 8  | Date format inconsistent         | "########" (Excel serial) vs "Mar-14"                     | Parse all formats consistently                  |
| 9  | Non-member in split (Sam)        | Sam in split_with for pre-April expenses                  | Exclude Sam, recalculate split                  |
| 10 | Meera after move-out             | Meera in April expense splits                             | Flag, exclude from post-March splits            |
| 11 | Unequal split doesn't sum        | "Aisha birthday" 1500 unequal with noted amounts          | Validate sum = total, flag if not               |
| 12 | Zero/missing amount              | "Dinner on Priya" = 0 INR                                 | Flag as zero-amount, skip or confirm            |
| 13 | Notes indicate person skipped    | "Meera skipped", "M forgot to split"                      | Use split_with as truth, note discrepancy       |
| 14 | Percentage split invalid         | "Pizza Friday" percentage — may not sum to 100%           | Flag and normalize if needed                    |

---

## API Routes

```
POST   /api/auth/register
POST   /api/auth/login          → returns JWT
GET    /api/auth/me

POST   /api/groups
GET    /api/groups
GET    /api/groups/:id
POST   /api/groups/:id/members
PATCH  /api/groups/:id/members/:userId

POST   /api/groups/:id/expenses
GET    /api/groups/:id/expenses
DELETE /api/groups/:id/expenses/:eid

GET    /api/groups/:id/balances
GET    /api/groups/:id/balances/:uid    # Individual breakdown

POST   /api/groups/:id/settlements
GET    /api/groups/:id/settlements

POST   /api/groups/:id/import           # Upload CSV
POST   /api/groups/:id/import/confirm   # Confirm after review
GET    /api/groups/:id/import-reports
```

---

## Frontend Pages (7 pages)

| Page          | Route                  | Purpose                                |
|---------------|------------------------|----------------------------------------|
| Login         | `/login`               | Email + password                       |
| Register      | `/register`            | Create account                         |
| Dashboard     | `/dashboard`           | List groups, quick balances            |
| Group Detail  | `/groups/:id`          | Members, expenses, actions             |
| Add Expense   | `/groups/:id/add`      | Form with split type support           |
| Import CSV    | `/groups/:id/import`   | Upload, review anomalies, confirm      |
| Balances      | `/groups/:id/balances` | Who owes whom + individual breakdown   |

---

## Session-by-Session Build Plan

### SESSION 1: Project Setup + Database + Auth (~45 min)

**Prompt for AI Agent:**

> Create a full-stack project in `d:\Desktop\SpreeTail_Assignment`. 
>
> **Backend** (`server/` folder):
> - Initialize with `npm init -y`
> - Install: express, @prisma/client, prisma, bcryptjs, jsonwebtoken, cors, dotenv, zod, multer, papaparse
> - Create Prisma schema at `server/prisma/schema.prisma` with these models: User (id, name unique, email unique, password, createdAt), Group (id, name, createdAt), GroupMembership (id, userId→User, groupId→Group, joinedAt DateTime, leftAt DateTime nullable, unique constraint on userId+groupId+joinedAt), Expense (id, groupId→Group, description, amount Float, originalAmount Float, currency String default "INR", exchangeRate Float default 1.0, paidById→User, splitType String, date DateTime, notes String nullable, isSettlement Boolean default false, importFlag String nullable, createdAt), ExpenseSplit (id, expenseId→Expense, userId→User, amount Float, createdAt), Settlement (id, groupId→Group, paidById→User, paidToId→User, amount Float, date DateTime, notes String nullable, createdAt), ImportReport (id, groupId→Group, fileName, totalRows Int, importedRows Int, anomalies Json, createdAt)
> - Use PostgreSQL provider, DATABASE_URL from .env
> - Create `server/src/index.js`: Express app on port 5000, cors enabled, JSON body parser, route mounting
> - Create `server/src/middleware/auth.js`: JWT verification middleware
> - Create `server/src/routes/auth.js`: POST /register (hash password with bcrypt, create user, return JWT), POST /login (verify password, return JWT), GET /me (return current user from token)
> - Create `server/prisma/seed.js`: seed 6 users (Aisha, Rohan, Priya, Meera, Dev, Sam) with password "password123" and create a group "Flat Expenses" with correct memberships (Aisha/Rohan/Priya/Meera join Feb 1 2025, Meera leaves March 31, Dev joins March 10 leaves March 20, Sam joins April 15)
> - Create `.env` with DATABASE_URL and JWT_SECRET
> - Every function must have a 1-line comment. Use named constants, no magic numbers. Error handling with try/catch on every route.
>
> Do NOT create the frontend yet. Only backend + database.

**Test after Session 1:**
```bash
cd server
npx prisma migrate dev --name init
npx prisma db seed
# Test with curl/Postman:
# POST /api/auth/register → should return JWT
# POST /api/auth/login → should return JWT  
# GET /api/auth/me with token → should return user
```

**Commit:** `feat: project setup, database schema, auth system`

---

### SESSION 2: Groups + Expenses + Settlements Routes (~45 min)

**Prompt for AI Agent:**

> In `d:\Desktop\SpreeTail_Assignment\server`, create the following route files. Use Prisma for all DB operations. All routes except auth must use the JWT auth middleware. Validate inputs with Zod.
>
> **`server/src/routes/groups.js`:**
> - POST `/` — create group (name), auto-add creator as member with joinedAt=now
> - GET `/` — list groups where current user is a member
> - GET `/:id` — group detail with all members (include user name, joinedAt, leftAt)
> - POST `/:id/members` — add member to group (userId, joinedAt). Validate user exists.
> - PATCH `/:id/members/:userId` — update leftAt for a member
>
> **`server/src/routes/expenses.js`:**
> - POST `/` — create expense. Body: {description, amount, currency, splitType, date, paidById, splitWith (array of {userId, amount/percentage/shares}), notes}. Split type logic:
>   - "equal": divide amount equally among splitWith users, rounding remainder to payer
>   - "exact"/"unequal": use provided amounts, validate they sum to total
>   - "percentage": use provided percentages (must sum to 100), calculate amounts
>   - "share": use provided share values, calculate proportional amounts
>   - For currency "USD": multiply by 83.0, store converted amount in `amount`, keep original in `originalAmount`, set exchangeRate=83.0
>   - Create ExpenseSplit records for each participant
> - GET `/` — list expenses for group with splits and user names
> - DELETE `/:eid` — delete expense and its splits
>
> **`server/src/routes/settlements.js`:**
> - POST `/` — record settlement {paidById, paidToId, amount, date, notes}
> - GET `/` — list settlements for group
>
> **`server/src/services/balanceService.js`:**
> - `getGroupBalances(groupId)` — for each expense: payer gets credit, each split user gets debit. For each settlement: paidBy gets debit, paidTo gets credit. Return net balance per user + simplified debts (greedy algorithm: match biggest creditor with biggest debtor, repeat).
> - `getUserBreakdown(groupId, userId)` — return every expense/settlement affecting this user with amounts, so they can see exactly why they owe what they owe.
>
> Create balance routes in expenses.js or a new balances section:
> - GET `/groups/:id/balances` — calls getGroupBalances
> - GET `/groups/:id/balances/:uid` — calls getUserBreakdown
>
> Every function must have a 1-line comment. Named constants (USD_TO_INR = 83.0). Try/catch on all routes.

**Test after Session 2:**
```bash
# Test with curl/Postman:
# POST /api/groups → create "Test Group"
# POST /api/groups/:id/members → add members
# POST /api/groups/:id/expenses → create expense (equal split)
# POST /api/groups/:id/expenses → create expense (percentage split)
# GET /api/groups/:id/balances → should show correct balances
# GET /api/groups/:id/balances/:uid → should show expense breakdown
# POST /api/groups/:id/settlements → record payment
# GET /api/groups/:id/balances → balances should update
```

**Commit:** `feat: groups, expenses, settlements, balance calculation`

---

### SESSION 3: CSV Import Engine (~60 min — most critical session)

**Prompt for AI Agent:**

> In `d:\Desktop\SpreeTail_Assignment\server`, create the CSV import system. This is the MOST IMPORTANT feature. The CSV file `expenses_export.csv` is in the project root.
>
> **`server/src/services/importService.js`:**
> Create an import service that:
> 1. Reads CSV using Papa Parse (header: true, dynamicTyping: false, skipEmptyLines: true)
> 2. Runs these anomaly detectors on every row, collecting all anomalies into an array:
>
> **Anomaly Detectors (implement each as a separate function):**
> - `detectDuplicates(rows)` — find rows with same description (case-insensitive, fuzzy match) + similar amount + same date. Flag: "duplicate"
> - `detectCommaInAmount(row)` — amount contains comma (e.g., "1,200"). Fix: strip comma. Flag: "comma_in_amount"
> - `detectExcessiveDecimals(row)` — amount has 3+ decimal places. Fix: round to 2. Flag: "excessive_decimals"
> - `detectNameCase(row)` — paid_by or names in split_with not title case. Fix: normalize. Flag: "name_case"
> - `detectSettlement(row)` — description contains "paid" or notes contains "settlement". Flag: "is_settlement"
> - `detectUSDNotConverted(row)` — currency is "USD". Flag: "usd_needs_conversion". Fix: multiply by 83.0
> - `detectNegativeAmount(row)` — amount < 0. Flag: "negative_amount". Interpret as refund.
> - `detectDateFormat(row)` — parse various date formats (Excel serial numbers, "Mar-14", "YYYY-MM-DD", "MM/DD/YYYY"). Flag: "date_format_issue" if non-standard
> - `detectNonMember(row, memberships)` — person in split_with was not a member on the expense date. Flag: "non_member_on_date"
> - `detectMemberLeftBefore(row, memberships)` — member in split_with had already left by expense date. Flag: "member_left"
> - `detectSplitMismatch(row)` — for unequal/exact splits, check if split amounts sum to total. Flag: "split_sum_mismatch"
> - `detectZeroAmount(row)` — amount is 0. Flag: "zero_amount"
> - `detectSkippedMember(row)` — notes mention someone skipped but they're in split_with (or vice versa). Flag: "skipped_member_conflict"
> - `detectPercentageInvalid(row)` — for percentage splits, percentages don't sum to 100. Flag: "percentage_invalid"
>
> 3. For each row, return: { originalRow, parsedRow (cleaned), anomalies: [{type, message, suggestedFix}], status: "ok"|"warning"|"error" }
>
> **`server/src/routes/import.js`:**
> - POST `/` — accept multipart file upload (multer). Parse CSV, run anomaly detection, return full report WITHOUT importing. Response: { totalRows, rows: [{originalRow, parsedRow, anomalies, status}] }
> - POST `/confirm` — accept array of approved row indices. For each approved row, create Expense (or Settlement if flagged). Create ImportReport record. Return summary.
> - GET `/import-reports` — list past import reports
>
> **`server/src/utils/importHelpers.js`:**
> - `parseDate(dateStr)` — handle Excel serial numbers (days since 1900-01-01), "Mar-14" (assume 2025), ISO dates
> - `parseAmount(amountStr)` — strip commas, handle negatives, round to 2 decimals
> - `normalizeName(name)` — trim + title case
> - `parseSplitWith(splitWithStr)` — parse "Aisha;Rohan;Priya;Meera" into array
> - `parseSplitDetails(detailsStr, splitType)` — parse "Aisha 30%; Rohan 30%; Priya 40%" or "Aisha 2; Rohan 1" into structured objects
>
> Use named constants: `const USD_TO_INR = 83.0; const EXCEL_EPOCH = new Date(1899, 11, 30);`
> Every function must have a 1-line comment explaining what it does.
> DO NOT modify the CSV file.

**Test after Session 3:**
```bash
# Copy expenses_export.csv to project root
# Test:
# POST /api/groups/:id/import (upload CSV) → should return anomaly report
# Verify all 14 anomaly types are detected
# POST /api/groups/:id/import/confirm with approved rows → should import
# GET /api/groups/:id/expenses → should show imported expenses
# GET /api/groups/:id/balances → should show correct balances
# GET /api/groups/:id/import-reports → should show report
```

**Commit:** `feat: CSV import engine with 14 anomaly detectors`

---

### SESSION 4: React Frontend — Auth + Layout + Dashboard (~45 min)

**Prompt for AI Agent:**

> In `d:\Desktop\SpreeTail_Assignment`, create the React frontend.
>
> **Setup:**
> - Initialize with Vite in `client/` folder: React template, JavaScript
> - Install: axios, react-router-dom
> - Configure Vite proxy to backend (`http://localhost:5000`)
>
> **Design system** (`client/src/index.css`):
> - Dark theme with glassmorphism cards
> - Color palette: background #0f0f23, cards rgba(255,255,255,0.05) with backdrop-blur, primary accent #6c63ff (purple), secondary #00d4aa (teal), danger #ff6b6b, text #e0e0e0
> - Use Google Font "Inter" (import via CSS)
> - Smooth transitions on all interactive elements (0.2s ease)
> - Responsive: max-width 1200px container, flex/grid layouts
> - Card style: border-radius 16px, border 1px solid rgba(255,255,255,0.1), padding 24px
> - Button styles: primary (purple gradient), secondary (outlined), danger (red)
> - Input styles: dark background, light border, focus glow
> - Table styles: striped, hover highlight
>
> **Components:**
> - `Navbar.jsx` — logo "FairShare", nav links (Dashboard, Logout), show current user name
> - `Layout.jsx` — Navbar + main content wrapper
> - `ProtectedRoute.jsx` — redirect to /login if no JWT
>
> **Context:**
> - `AuthContext.jsx` — store JWT in localStorage, provide login/logout/user state
>
> **Services:**
> - `api.js` — axios instance with baseURL and auth header interceptor. Export functions: login(), register(), getGroups(), getGroup(), createGroup(), addMember(), updateMember(), getExpenses(), createExpense(), deleteExpense(), getBalances(), getUserBreakdown(), getSettlements(), createSettlement(), uploadCSV(), confirmImport(), getImportReports()
>
> **Pages:**
> - `Login.jsx` — email + password form, call login API, redirect to dashboard
> - `Register.jsx` — name + email + password form, call register, redirect
> - `Dashboard.jsx` — list user's groups as cards, "Create Group" button, each card shows group name + member count
>
> **App.jsx:** React Router setup with all routes, ProtectedRoute wrapping authenticated pages
>
> Make it look PREMIUM. Dark glassmorphism, smooth hover effects, subtle animations. NOT a basic bootstrap look.

**Test after Session 4:**
```bash
cd client && npm run dev
# Visit http://localhost:5173
# Register → should redirect to dashboard
# Login → should work
# Create group → should appear on dashboard
# Verify dark theme, glassmorphism, responsive layout
```

**Commit:** `feat: React frontend - auth, layout, dashboard`

---

### SESSION 5: Frontend — Group Detail, Expenses, Balances (~45 min)

**Prompt for AI Agent:**

> In `d:\Desktop\SpreeTail_Assignment\client`, create the remaining pages. Use the existing design system from index.css and the api.js service functions.
>
> **`GroupDetail.jsx`** (`/groups/:id`):
> - Show group name, member list with join/leave dates
> - "Add Member" form (select user, pick join date)
> - "Mark as Left" button per member
> - Tabs: Expenses | Balances | Settlements | Import
> - Expenses tab: list all expenses as cards (description, amount, currency, paid by, split type, date, who's involved)
> - "Add Expense" button → opens inline form or modal
>
> **Add Expense Form** (inline in GroupDetail or separate):
> - Fields: description, amount, currency (INR/USD), split type dropdown, date, paid by (dropdown of members), notes
> - Dynamic split section based on type:
>   - Equal: just show who's included (checkboxes)
>   - Exact: show amount input per person
>   - Percentage: show % input per person (show running total)
>   - Share: show share input per person
> - Submit → create expense, refresh list
>
> **Balances Tab** (`/groups/:id` with tab):
> - Summary cards: each person's net balance (green if owed money, red if owes)
> - "Simplified Debts" section: "A pays B ₹X" list (Aisha's requirement)
> - Click on a person → show full breakdown of all expenses affecting them (Rohan's requirement)
> - "Record Settlement" button → form: from, to, amount, date
>
> **Settlements Tab:**
> - List of all settlements with date, from, to, amount
>
> Use the dark glassmorphism design. Smooth transitions when switching tabs. Currency amounts formatted with ₹ or $ symbol.

**Test after Session 5:**
```bash
# Run both server and client
# Login → go to group
# Add members with correct dates
# Create expense (test each split type)
# Check balances update correctly
# Record settlement
# Verify balance changes after settlement
# Click person for breakdown (Rohan's requirement)
```

**Commit:** `feat: group detail, expenses, balances, settlements UI`

---

### SESSION 6: Frontend — CSV Import Page (~45 min)

**Prompt for AI Agent:**

> In `d:\Desktop\SpreeTail_Assignment\client/src/pages`, create `ImportCSV.jsx` (accessible from GroupDetail's Import tab).
>
> This is the MOST IMPORTANT UI page. It must clearly show every anomaly found in the CSV.
>
> **Upload Section:**
> - File input (accept .csv only) with drag-and-drop zone
> - "Upload & Analyze" button
> - Show loading spinner during analysis
>
> **Review Section** (shown after upload):
> - Summary bar: "X rows total | Y clean | Z warnings | W errors"
> - Table of ALL rows with columns: Row #, Date, Description, Amount, Currency, Paid By, Split Type, Status (green/yellow/red badge)
> - Each row expandable to show anomalies:
>   - Anomaly type badge (e.g., "DUPLICATE", "USD_CONVERSION", "NON_MEMBER")
>   - Description of the problem
>   - Suggested fix
>   - Original value → Fixed value (shown side by side)
> - Checkbox per row to approve/reject
> - "Select All Clean" button, "Deselect All Errors" button
> - Color coding: green rows = clean, yellow = warning (fixable), red = error (needs review)
>
> **Confirm Section:**
> - "Import X Selected Rows" button
> - After import: show success summary + link to view import report
>
> **Import Report View:**
> - List of past imports
> - Click to see full anomaly log for that import
>
> Design: dark theme, clear color coding for anomaly severity, expandable row animations. This page must be CLEAN and INFORMATIVE — it's the core evaluation feature.

**Test after Session 6:**
```bash
# Upload expenses_export.csv through the UI
# Verify ALL 14 anomaly types show up
# Check anomaly descriptions are clear
# Approve some rows, reject others
# Confirm import
# Go to Expenses tab → imported expenses should appear
# Go to Balances → should reflect imported data
# View import report
```

**Commit:** `feat: CSV import UI with anomaly review`

---

### SESSION 7: Documentation + Polish + Deploy (~30 min)

**Prompt for AI Agent:**

> In `d:\Desktop\SpreeTail_Assignment`, create the following documentation files:
>
> **`README.md`:**
> - Project name: FairShare
> - One-line description
> - Tech stack table
> - Setup instructions (clone, install deps, setup DB, seed, run dev servers)
> - Environment variables needed
> - AI tools used (mention the tool)
>
> **`SCOPE.md`:**
> - List every CSV anomaly found (all 14) with: what the problem is, which CSV row(s), how the app handles it
> - Database schema (copy from Prisma schema, explain each model)
> - Membership timeline
>
> **`DECISIONS.md`:**
> - Decision log format: Decision | Options Considered | Choice | Why
> - Include decisions: currency conversion rate, rounding strategy, settlement detection, duplicate handling, membership date inference, debt simplification algorithm, split remainder handling, tech stack choices, zero-amount handling, refund handling
>
> **`AI_USAGE.md`:**
> - AI tool used and how
> - Key prompts (3-5 examples)
> - 3+ cases where AI was wrong: what it generated, how you caught it, what you changed
>
> Also: create `.gitignore` (node_modules, .env, dist, .prisma), fix any CSS polish issues, ensure all pages work end to end.

**Test after Session 7:**
```bash
# Full end-to-end test:
# 1. Register/login
# 2. Create group "Flat Expenses"  
# 3. Add all 6 members with correct dates
# 4. Import CSV
# 5. Review and approve anomalies
# 6. Check balances make sense
# 7. Record a settlement
# 8. Check individual breakdown
# 9. All docs readable
```

**Commit:** `docs: README, SCOPE, DECISIONS, AI_USAGE`

---

### SESSION 8: Deployment (~20 min)

**Prompt for AI Agent:**

> Deploy the FairShare app.
>
> **Backend + DB → Railway:**
> - Create Railway project
> - Add PostgreSQL service
> - Add Node.js service from GitHub repo (root directory: server)
> - Set environment variables: DATABASE_URL (from Railway Postgres), JWT_SECRET, PORT=5000, CLIENT_URL (Vercel URL)
> - Build command: `npx prisma migrate deploy && npx prisma db seed && node src/index.js`
>
> **Frontend → Vercel:**
> - Deploy client/ folder
> - Set VITE_API_URL to Railway backend URL
> - Build command: `npm run build`
>
> Update CORS in backend to allow Vercel domain.
> Update README with deployed URLs.

**Commit:** `deploy: Railway backend + Vercel frontend`

---

## Test Cases Checklist

### Auth
- [ ] Register with valid data → success
- [ ] Register duplicate email → error
- [ ] Login with correct creds → JWT returned
- [ ] Login with wrong password → error
- [ ] Access protected route without token → 401

### Groups
- [ ] Create group → success
- [ ] Add member with join date → success
- [ ] Mark member as left → leftAt updated
- [ ] List groups → only user's groups shown

### Expenses
- [ ] Create equal split (4 people, 1000) → each owes 250
- [ ] Create equal split (3 people, 100) → 33.34, 33.33, 33.33 (remainder to payer)
- [ ] Create exact split → amounts match input
- [ ] Create percentage split → percentages sum to 100%
- [ ] Create share split → proportional calculation correct
- [ ] USD expense → stored as INR (×83)
- [ ] Delete expense → splits also deleted

### Balances
- [ ] Net balance calculation correct after multiple expenses
- [ ] Settlement reduces balances
- [ ] Simplified debts minimize transactions
- [ ] Individual breakdown shows every expense detail

### CSV Import
- [ ] Upload parses all rows
- [ ] Each of 14 anomalies detected
- [ ] Anomaly messages are human-readable
- [ ] Approve/reject per row works
- [ ] Confirmed rows create correct Expense/Settlement records
- [ ] Import report saved and viewable
- [ ] Membership dates enforced (Sam not in March expenses)
- [ ] Meera not in April+ expenses
- [ ] USD converted correctly
- [ ] Negative amount handled as refund
- [ ] Settlement row creates Settlement, not Expense

### Flatmate Requirements
- [ ] Aisha: one-number summary per person ✓ (simplified debts)
- [ ] Rohan: see which expenses make up balance ✓ (individual breakdown)
- [ ] Priya: USD properly converted ✓ (×83 rate)
- [ ] Sam: not charged for pre-April expenses ✓ (membership dates)
- [ ] Meera: approves deletions/changes ✓ (import review UI)

---

## Approximate Line Count

| Part                      | Lines   |
|---------------------------|---------|
| Prisma schema + seed      | ~140    |
| Backend routes (5 files)  | ~500    |
| Backend services (3)      | ~400    |
| Backend middleware + utils | ~150    |
| Backend entry point       | ~40     |
| Frontend pages (7)        | ~900    |
| Frontend components (5)   | ~300    |
| Frontend context + api    | ~150    |
| CSS                       | ~400    |
| Config files              | ~70     |
| **TOTAL**                 | **~3,050** |
