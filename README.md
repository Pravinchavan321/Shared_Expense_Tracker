# FairShare

FairShare is a minimal, premium dark glassmorphic shared expense splitting web application designed to help flatmates split bills, track settlements, optimize debts, and import messy Excel/CSV transactions with an anomaly review engine.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19 + Vite | Fast page load times and component modularity |
| **Styling** | Vanilla CSS | Custom dark theme, transitions, and glassmorphic designs |
| **Backend** | Node.js + Express | Lightweight, reliable REST API server |
| **Database** | PostgreSQL | Robust relational database mappings |
| **ORM** | Prisma | Clean schema modeling and database migrations |
| **Parsing** | Papa Parse | Robust parsing for raw multi-format CSV files |
| **Validation**| Zod | Request body schema parsing and type safety |
| **Security** | JSON Web Tokens + bcrypt | Safe session handling and password hashing |

---

## Environment Variables

### Backend (`server/.env`)
Create a file at `server/.env` with the following variables:
```env
PORT=5000
DATABASE_URL="postgresql://username:password@localhost:5432/fairshare?schema=public"
JWT_SECRET="your-super-secret-key-here"
```

---

## Setup Instructions

### 1. Database Setup & Migrations
Ensure PostgreSQL is running locally, then initialize database tables and seeds:
```bash
cd server
npm install
npx prisma migrate dev --name init
npx prisma db seed
```
This registers 6 default users (`Aisha`, `Rohan`, `Priya`, `Meera`, `Dev`, `Sam`) and creates the `Flat Expenses` group with their historical membership timelines.

### 2. Run Backend Server
```bash
npm run dev
```
The backend server runs on `http://localhost:5000`.

### 3. Setup React Client
In another terminal, build the client app:
```bash
cd client
npm install
npm run dev
```
The Vite frontend dev server starts on `http://localhost:5173`. Open your browser and navigate to this address.

---

## Deployment Guidelines

### 1. Backend + Database (Railway)
1. Set up a Railway project and spin up a **PostgreSQL Database** service.
2. Link your repository and set up a **Node.js** service pointing to the `server/` root directory.
3. Configure the following environment variables on Railway:
   - `DATABASE_URL`: Set automatically by the Railway PostgreSQL link.
   - `JWT_SECRET`: A secure random secret string.
   - `PORT`: `5000`
   - `CLIENT_URL`: Your Vercel frontend URL (e.g. `https://fairshare.vercel.app`).
4. Set the build command:
   ```bash
   npx prisma migrate deploy && npx prisma db seed && node src/index.js
   ```

### 2. Frontend (Vercel)
1. Create a Vercel project linked to your repository and target the `client/` folder.
2. Add the environment variable:
   - `VITE_API_URL`: Your deployed Railway backend URL (e.g. `https://fairshare-backend.up.railway.app`).
3. Set the build command:
   ```bash
   npm run build
   ```

---

## AI Tools Used
Developed in collaboration with **Antigravity**, a pair-programming AI agent created by Google DeepMind.
