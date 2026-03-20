# Loan Manager PWA

Proyecto base para gestión de microcréditos de ruta con `frontend` (Next.js 14) y `backend` (Fastify + Prisma).

## Requisitos

- Node.js 20+ recomendado
- Docker y Docker Compose

## Levantar infraestructura local

```bash
docker-compose up -d
```

## Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

Servidor API: `http://localhost:3001`

## Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

App web/PWA: `http://localhost:3000`

## Usuarios seed

- `superadmin@test.com / Admin123!` -> `SUPER_ADMIN`
- `admin@test.com / Admin123!` -> `ADMIN`
- `encargado@test.com / Admin123!` -> `ROUTE_MANAGER`
- `cliente@test.com / Admin123!` -> `CLIENT`
# Prestamos
