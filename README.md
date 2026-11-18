# ServiceHub

A full-stack local home-service marketplace connecting customers with trusted local professionals (Electricians, Plumbers, Carpenters, AC Repair technicians, Cleaners, and Painters), built with **Node.js, Express, MySQL, Prisma ORM, HTML5, CSS3, and JavaScript**.

---

## Project Overview

ServiceHub provides complete end-to-end workflows for three distinct user roles:

- **Customers** can register, log in, access a dedicated **Customer Dashboard**, search and filter local providers by service category or location, book appointments, track booking status and confirmed provider arrival times, cancel eligible bookings, and update their profile.
- **Service Providers** can register with service category, location, experience, charges, and availability, log in to their **Provider Dashboard**, accept or reject booking requests with confirmed arrival schedules, mark jobs completed, and manage their public profile.
- **Administrators** can sign in via the protected **Admin Portal** to view live MySQL analytics, search and filter users/bookings, manage booking statuses, and remove customer or provider accounts safely.

---

## Main Features

- **Role-Based Authentication & Security**: Bcrypt password hashing, signed HS256 JWT tokens, strict backend role enforcement (`customer`, `provider`, `admin`), ownership checks, rate limiting on auth routes, security headers, and credential redaction in logs.
- **Dedicated Customer Dashboard**: Sidebar workspace with live booking KPIs (Total, Pending, Accepted, Completed), Upcoming Bookings, Recent Bookings, My Bookings filter/search, Booking Details modal, Cancel Booking workflow, embedded Find Services marketplace, and Edit Profile form.
- **Provider Portal**: Provider registration/login, booking request queue (accept with arrival date/time, reject, mark completed), and profile editor.
- **Admin Portal**: Protected login (CLI-provisioned admins only — no public admin registration), live MySQL platform statistics, status distribution charts, and full Customer/Provider/Booking management.
- **MySQL + Prisma ORM**: Relational schema (`customers`, `providers`, `bookings`, `admins`) with foreign keys, cascade deletes, unique constraints, indexes, and cross-platform non-destructive schema sync (`npm run db:sync`).
- **Health & Readiness Endpoints**: Liveness (`/api/live`) and truthful MySQL readiness (`/api/ready`, `/api/health`) returning HTTP `503` whenever MySQL is disconnected.

---

## Technology Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript, jQuery 3.7, AngularJS 1.8 (landing page) |
| **Backend** | Node.js (>= 20.13), Express 4, CORS, dotenv |
| **Database & ORM** | MySQL 8+, Prisma ORM (`6.19.3`), `mysql2` |
| **Authentication** | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` |

---

## Project Folder Structure

```text
service-hub/
├── .gitignore
├── README.md
├── backend/
│   ├── .env.example
│   ├── .gitignore
│   ├── README.md
│   ├── app.js
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   ├── config/
│   │   └── database.js
│   ├── controllers/
│   │   ├── adminController.js
│   │   ├── bookingController.js
│   │   ├── customerController.js
│   │   └── providerController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   ├── notFound.js
│   │   └── rateLimit.js
│   ├── prisma/
│   │   └── schema.prisma
│   ├── routes/
│   │   ├── adminRoutes.js
│   │   ├── bookingRoutes.js
│   │   ├── customerRoutes.js
│   │   └── providerRoutes.js
│   ├── scripts/
│   │   ├── checkDatabase.js
│   │   ├── createAdmin.js
│   │   ├── syncDatabase.js
│   │   ├── testApiEndpoints.js
│   │   ├── testBackendModules.js
│   │   ├── testBrowserPages.js
│   │   ├── testFrontendIntegration.js
│   │   └── testMySQLAuth.js
│   └── utils/
│       ├── asyncHandler.js
│       ├── createToken.js
│       ├── parseId.js
│       └── sanitizeUser.js
└── frontend/
    ├── favicon.svg
    ├── index.html
    ├── register.html
    ├── login.html
    ├── customer-dashboard.html
    ├── my-bookings.html
    ├── services.html
    ├── provider-details.html
    ├── service-booking.html
    ├── provider-register.html
    ├── provider-login.html
    ├── provider-dashboard.html
    ├── provider-bookings.html
    ├── provider-profile.html
    ├── admin-login.html
    ├── admin-dashboard.html
    ├── css/
    └── js/
```

---

## Prerequisites

- **Node.js** `>= 20.13.0` and **npm**
- **MySQL** `8.0+` (local MySQL Server, XAMPP, WAMP, Docker, or managed cloud MySQL)

---

## Installation Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/vishwatejagunda15-bot/service-hub.git
   cd service-hub
   ```
2. Install backend dependencies:
   ```bash
   cd backend
   npm ci
   ```

---

## Environment Variable Configuration

Copy `backend/.env.example` to `backend/.env` and replace the placeholder values with your own local or production settings (**never commit `backend/.env`**):

```env
NODE_ENV=development
PORT=3000

# MySQL Connection URL (Prisma)
DATABASE_URL=mysql://root:your-mysql-password@127.0.0.1:3306/servicehub

# JWT signing secret (use a long random string in production)
JWT_SECRET=replace-this-with-a-long-random-secret

# Allowed frontend origins (comma-separated, no trailing slash)
CLIENT_ORIGIN=http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000
```

> For managed cloud MySQL requiring TLS, append `?sslaccept=strict` to `DATABASE_URL`.

---

## MySQL Database Setup & Prisma Synchronization

1. Ensure your MySQL server is running and reachable using the credentials in `backend/.env`.
2. Generate the Prisma Client and synchronize the schema non-destructively (creates the `servicehub` database if missing and syncs `customers`, `providers`, `bookings`, and `admins` without dropping existing data):
   ```bash
   cd backend
   npm run db:generate
   npm run db:sync
   ```
3. Verify MySQL connectivity:
   ```bash
   npm run check:db
   ```
4. Provision an administrator account via CLI (no hardcoded admin credentials exist in the codebase):
   ```powershell
   $env:ADMIN_NAME="ServiceHub Admin"
   $env:ADMIN_EMAIL="admin@example.com"
   $env:ADMIN_PASSWORD="ReplaceWithStrongPassword123!"
   npm run admin:create
   ```

---

## Frontend & Backend Startup Instructions

The Express backend serves both the REST API (`/api/*`) and the static frontend files (`frontend/`):

```bash
cd backend
npm run dev    # Development mode with auto-reload
# or
npm start      # Production mode
```

Open the application in your browser:

- **Home Page**: `http://localhost:3000/index.html`
- **Customer Login / Dashboard**: `http://localhost:3000/login.html` → redirects to `/customer-dashboard.html`
- **Provider Login / Dashboard**: `http://localhost:3000/provider-login.html` → redirects to `/provider-dashboard.html`
- **Admin Login / Dashboard**: `http://localhost:3000/admin-login.html` → redirects to `/admin-dashboard.html`
- **Health & Readiness**: `http://localhost:3000/api/live`, `http://localhost:3000/api/ready`, `http://localhost:3000/api/health`

> If serving `frontend/` separately (for example via VS Code Live Server on port `5500`), `frontend/js/api.js` automatically targets `http://localhost:3000/api`. For separate production domains, set `<meta name="servicehub-api-url" content="https://api.yourdomain.com/api">`.

---

## API Overview

All API routes are mounted under `/api`. Protected endpoints require `Authorization: Bearer <token>`.

| Group | Method & Path | Access | Description |
| --- | --- | --- | --- |
| **Health** | `GET /api/live`, `GET /api/ready`, `GET /api/health` | Public | Process liveness and MySQL readiness checks |
| **Customers** | `POST /api/customers/register`, `POST /api/customers/login` | Public | Customer registration & authentication |
| **Customers** | `GET /api/customers/me`, `PATCH /api/customers/me` | Customer | Fetch or update authenticated customer profile |
| **Providers** | `POST /api/providers/register`, `POST /api/providers/login` | Public | Provider registration & authentication |
| **Providers** | `GET /api/providers`, `GET /api/providers/:id` | Public | Search/filter providers (`category`, `location`, `q`) and view details |
| **Providers** | `GET /api/providers/me`, `PATCH /api/providers/me` | Provider | Fetch or update authenticated provider profile |
| **Bookings** | `POST /api/bookings` | Customer | Create a new service booking |
| **Bookings** | `GET /api/bookings/my` | Customer | View authenticated customer's bookings |
| **Bookings** | `PATCH /api/bookings/:id/cancel` | Customer | Cancel an eligible future `Pending` or `Accepted` booking |
| **Bookings** | `GET /api/bookings/provider` | Provider | View provider's assigned booking requests |
| **Bookings** | `PATCH /api/bookings/:id/accept`, `/reject`, `/complete` | Provider | Accept (with confirmed arrival), reject, or complete bookings |
| **Admin** | `POST /api/admin/login` | Public | Administrator login |
| **Admin** | `GET /api/admin/me`, `GET /api/admin/stats` | Admin | Admin session verification & live platform statistics |
| **Admin** | `GET /api/admin/customers`, `DELETE /api/admin/customers/:id` | Admin | Search and manage customer accounts |
| **Admin** | `GET /api/admin/providers`, `DELETE /api/admin/providers/:id` | Admin | Search, filter, and manage provider accounts |
| **Admin** | `GET /api/admin/bookings`, `PATCH /api/admin/bookings/:id/status` | Admin | View all platform bookings and update non-terminal statuses |

---

## Role Functionality Summary

- **Customer**: Account registration/login with automatic redirection to `customer-dashboard.html`, live booking metrics, upcoming & recent bookings, full booking history with search/status filtering, booking details modal, booking cancellation, live provider discovery, and profile editing.
- **Service Provider**: Account registration/login with automatic redirection to `provider-dashboard.html`, booking summary metrics, booking request approval/rejection with arrival confirmation, job completion, and public profile editing.
- **Administrator**: Protected `admin-login.html` → `admin-dashboard.html`, live totals and category/status charts, searchable directories for customers/providers/bookings, and safe account deletion with confirmation dialogs.

---

## Testing Instructions

Run the verification suites from the `backend/` directory:

```bash
cd backend

# Backend controller, auth, RBAC, validation & error handler suite
npm run test:backend

# Frontend-to-backend ID, form, asset, CORS & static delivery checks
npm run test:frontend

# Real headless Chrome page, responsive layout & auth guard verification
npm run test:browser

# Live MySQL authentication & persistence verification (requires running MySQL)
npm run test:mysql

# Live HTTP endpoint smoke tests
npm run test:api
```
