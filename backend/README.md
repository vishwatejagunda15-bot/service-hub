# ServiceHub API (MySQL & Prisma Edition)

Express API backed by **MySQL** and **Prisma ORM**. Customer and provider passwords are hashed with bcrypt. Login returns a signed JWT; send it as `Authorization: Bearer <token>` to protected routes.

## MySQL Database Setup

1. Make sure MySQL is running locally (e.g. XAMPP, WAMP, MySQL Windows Service, or Docker) or on a cloud MySQL provider (e.g. Aiven, PlanetScale, Railway, AWS RDS).
2. In `backend/.env`, configure your database URL:
   ```env
   DATABASE_URL=mysql://root:password@127.0.0.1:3306/servicehub
   ```
   Or use individual parameters:
   ```env
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=servicehub
   ```
3. Push the Prisma schema to create all tables, foreign keys, and indexes in MySQL:
   ```powershell
   npm run db:push
   ```

## Available Scripts

```powershell
cd backend

# Push Prisma schema to MySQL:
npm run db:push

# Generate Prisma Client:
npm run db:generate

# Test MySQL database connection:
npm run check:db

# Run full MySQL + Prisma automated test suite:
npm run test:mysql

# Start development server with file watch:
npm run dev

# Start production server:
npm start
```

## API Routes

All routes use the `/api` prefix. Private routes require the matching customer, provider, or admin token.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Public | API health check |
| POST | `/customers/register` | Public | Create customer account |
| POST | `/customers/login` | Public | Customer login |
| GET/PATCH | `/customers/me` | Customer | Read or update customer profile |
| POST | `/providers/register` | Public | Create provider account |
| POST | `/providers/login` | Public | Provider login |
| GET | `/providers?category=&location=` | Public | Search and filter provider listings |
| GET | `/providers/:id` | Public | Provider details |
| GET/PATCH | `/providers/me` | Provider | Read or update provider profile |
| POST | `/bookings` | Customer | Create booking request |
| GET | `/bookings/my` | Customer | List customer's own bookings |
| PATCH | `/bookings/:id/cancel` | Customer | Cancel an eligible future booking |
| GET | `/bookings/provider` | Provider | List provider's assigned bookings |
| PATCH | `/bookings/:id/accept` | Provider | Accept pending request & set arrival time |
| PATCH | `/bookings/:id/reject` | Provider | Reject pending request |
| PATCH | `/bookings/:id/complete` | Provider | Mark accepted booking as completed |
| POST | `/admin/login` | Public | Admin login |
| GET | `/admin/stats` | Admin | Dashboard metrics & booking statistics |
| GET | `/admin/customers` | Admin | List all registered customers |
| DELETE | `/admin/customers/:id` | Admin | Delete customer account |
| GET | `/admin/providers` | Admin | List all registered providers |
| DELETE | `/admin/providers/:id` | Admin | Delete provider account |
| GET | `/admin/bookings` | Admin | View all bookings across the platform |
