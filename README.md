# ZedEarn – Standalone Project

ZedEarn is Zambia's #1 earning platform. This standalone project contains both the **backend** (Node.js/Express/MongoDB) and **frontend** (React/Vite) applications, fully decoupled from the parent monorepo.

---

## Project Structure

```
zedearn-standalone/
├── backend/          # Express API (Node.js + MongoDB + Redis)
│   ├── config/       # DB and Redis configuration
│   ├── middleware/   # Auth middleware
│   ├── models/       # Mongoose models
│   ├── routes/       # API route handlers
│   ├── utils/        # Utility functions
│   ├── server.js     # App entry point
│   ├── seed.js       # Database seeder
│   └── .env.example
│
├── frontend/         # React + Vite SPA
│   ├── src/
│   │   ├── api/      # Axios client
│   │   ├── components/ # Shared UI components
│   │   ├── context/  # React context (Auth)
│   │   └── pages/    # Login, Register, Dashboard, Tasks, Wallet, Profile
│   ├── index.html
│   └── .env.example
│
└── README.md
```

---

## Prerequisites

- **Node.js** ≥ 18
- **MongoDB** (local or Atlas cloud instance)
- **Redis** (local or cloud — e.g., Redis Cloud free tier)

---

## Backend Setup

```bash
cd zedearn-standalone/backend

# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, Redis URL, Cloudinary keys

# 3. (Optional) Seed the database with sample data
npm run seed

# 4. Start in development mode (hot-reload)
npm run dev

# 5. Or start in production mode
npm start
```

### Backend `.env` variables

| Variable               | Description                                  | Example                            |
|------------------------|----------------------------------------------|------------------------------------|
| `PORT`                 | Server port                                  | `5001`                             |
| `MONGO_URI`            | MongoDB connection string                    | `mongodb+srv://...`                |
| `JWT_SECRET`           | Long random string for signing JWTs          | `supersecretkey123`                |
| `JWT_EXPIRE`           | JWT expiry duration                          | `7d`                               |
| `REDIS_URL`            | Redis connection URL                         | `redis://localhost:6379`           |
| `CLOUDINARY_CLOUD_NAME`| Cloudinary cloud name (for image uploads)    | `mycloudname`                      |
| `CLOUDINARY_API_KEY`   | Cloudinary API key                           | `123456789012345`                  |
| `CLOUDINARY_API_SECRET`| Cloudinary API secret                        | `abc123secret`                     |
| `CLIENT_URL`           | Frontend URL (for CORS)                      | `http://localhost:5173`            |
| `NODE_ENV`             | Environment                                  | `development`                      |

The backend API runs on **http://localhost:5001** by default.

---

## Frontend Setup

```bash
cd zedearn-standalone/frontend

# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Set VITE_API_URL to your backend URL

# 3. Start in development mode
npm run dev

# 4. Build for production
npm run build

# 5. Preview production build
npm run preview
```

### Frontend `.env` variables

| Variable       | Description              | Example                    |
|----------------|--------------------------|----------------------------|
| `VITE_API_URL` | Backend API base URL     | `http://localhost:5001`    |

The frontend dev server runs on **http://localhost:5173** by default.

---

## Running Both Together

Open two terminals:

**Terminal 1 – Backend**
```bash
cd zedearn-standalone/backend
npm install
npm run dev
```

**Terminal 2 – Frontend**
```bash
cd zedearn-standalone/frontend
npm install
npm run dev
```

Then visit **http://localhost:5173** in your browser.

---

## Default Seed Credentials

After running `npm run seed` in the backend:

| Role       | Email                       | Password      |
|------------|-----------------------------|---------------|
| Admin      | admin@zedearn.zm            | Admin1234!    |
| Super Admin| superadmin@zedearn.zm       | Super1234!    |
| User       | chanda@gmail.com            | Password123!  |
| VIP Gold   | mwamba@yahoo.com            | Password123!  |
| Merchant   | thandiwe@zedearn.zm         | Password123!  |

---

## API Overview

| Method | Endpoint                  | Description                  |
|--------|---------------------------|------------------------------|
| POST   | `/api/auth/register`      | Register new user            |
| POST   | `/api/auth/login`         | Login                        |
| GET    | `/api/auth/me`            | Get current user             |
| GET    | `/api/tasks`              | List available tasks         |
| POST   | `/api/tasks/:id/complete` | Complete a task              |
| GET    | `/api/wallet`             | Wallet balances + recent tx  |
| GET    | `/api/wallet/transactions`| Transaction history          |
| POST   | `/api/wallet/recharge`    | Initiate a deposit           |
| POST   | `/api/wallet/withdraw`    | Request a withdrawal         |
| GET    | `/api/notifications`      | Notifications                |
| GET    | `/api/referrals`          | Referral info                |
| GET    | `/api/vip`                | VIP plans                    |
| GET    | `/api/marketplace`        | Marketplace listings         |
| GET    | `/health`                 | Health check                 |

---

## Deployment

### Backend (e.g., Railway / Render / Heroku)
- Set all environment variables from `.env.example`
- Start command: `npm start`

### Frontend (e.g., Vercel / Netlify)
- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_API_URL` to your deployed backend URL

---

## License

MIT
