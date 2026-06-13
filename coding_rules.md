# CODING RULES — For AI Agent (Do NOT Violate)

## Hard Constraints
1. **JavaScript only** — NO TypeScript, NO .ts/.tsx files
2. **Vanilla CSS only** — NO Tailwind, NO MUI, NO Chakra, NO styled-components
3. **PostgreSQL only** — NO MongoDB, NO SQLite for production
4. **Prisma ORM only** — NO raw SQL queries, NO Sequelize, NO Knex
5. **DO NOT edit `expenses_export.csv`** — import it exactly as-is
6. **Every route** must have try/catch error handling
7. **Every function** must have a 1-line JSDoc or comment
8. **No magic numbers** — use named constants (e.g., `const USD_TO_INR = 83.0`)
9. **Max file length: 250 lines** — split into modules if bigger
10. **No `console.log` for debugging** — use proper error responses

## Naming Conventions
| Thing          | Convention    | Example                  |
|----------------|--------------|--------------------------|
| JS files       | camelCase    | `balanceService.js`      |
| React components | PascalCase | `GroupDetail.jsx`        |
| CSS classes    | kebab-case   | `.expense-card`          |
| DB models      | PascalCase   | `GroupMembership`        |
| API routes     | lowercase    | `/api/groups/:id/expenses` |
| Constants      | UPPER_SNAKE  | `USD_TO_INR`             |
| Variables      | camelCase    | `totalAmount`            |

## Required Patterns
- Auth middleware on ALL routes except register/login
- Zod validation on ALL POST/PATCH request bodies
- Return proper HTTP status codes (200, 201, 400, 401, 404, 500)
- CORS enabled for frontend origin
- Amounts stored in INR, rounded to 2 decimal places
- Dates stored as ISO DateTime in UTC

## Forbidden Patterns
- No `any` type workarounds
- No global state in backend (no module-level mutable vars)
- No `eval()` or dynamic require
- No hardcoded passwords or secrets (use .env)
- No synchronous file reads in request handlers
- No inline styles in React (use CSS classes)
- No component libraries (MUI, AntD, etc.)

## Git Commit Messages
Format: `type: description`  
Types: `feat`, `fix`, `docs`, `refactor`, `test`, `deploy`  
Examples:  
- `feat: add expense creation with split types`  
- `fix: correct rounding in equal split`  
- `docs: add SCOPE.md with anomaly log`
