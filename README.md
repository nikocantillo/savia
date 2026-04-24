# SupplyPulse – MVP

> B2B web app for restaurants to upload supplier invoices, extract line items, normalize products, track price changes, and get alerts.

## Architecture

```
apps/
├── api/          # Python 3.11 + FastAPI backend
│   ├── app/
│   │   ├── api/         # Route handlers (auth, invoices, dashboard, items, alerts)
│   │   ├── services/    # Extraction, normalization, LLM placeholder
│   │   ├── tasks/       # Celery tasks (invoice processing, daily alerts)
│   │   ├── models.py    # SQLAlchemy 2.0 models
│   │   ├── schemas.py   # Pydantic request/response schemas
│   │   ├── config.py    # Settings via pydantic-settings
│   │   ├── database.py  # Engine + session
│   │   └── main.py      # FastAPI app
│   ├── alembic/         # DB migrations
│   ├── tests/           # Unit tests
│   └── seed.py          # Sample data seeder
├── web/          # Next.js 14 (App Router) + TypeScript
│   ├── app/
│   │   ├── login/       # Login page
│   │   ├── (app)/       # Auth-protected layout
│   │   │   ├── dashboard/
│   │   │   ├── invoices/
│   │   │   └── alerts/
│   ├── components/      # Reusable components (shadcn/ui)
│   └── lib/             # API client, utils
infra/
└── docker/
    └── docker-compose.yml
```

## Tech Stack

| Layer     | Tech                                    |
| --------- | --------------------------------------- |
| Frontend  | Next.js 14, TypeScript, Tailwind, shadcn/ui, Recharts |
| Backend   | FastAPI, SQLAlchemy 2.0, Pydantic v2    |
| Database  | PostgreSQL 16                           |
| Queue     | Redis + Celery                          |
| PDF/OCR   | pdfplumber, pytesseract                 |
| Matching  | thefuzz (fuzzy string matching)         |

## How to Run Locally

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2

### 1. Clone and configure

```bash
cd supplypulse   # project root
cp .env.example .env   # optional – defaults work out of the box
```

### 2. Start all services

```bash
cd infra/docker
docker compose up --build
```

This starts **5 services**:
| Service  | URL                     | Description             |
| -------- | ----------------------- | ----------------------- |
| web      | http://localhost:3000    | Next.js frontend        |
| api      | http://localhost:8000    | FastAPI backend         |
| postgres | localhost:5432          | PostgreSQL              |
| redis    | localhost:6379          | Redis                   |
| worker   | —                       | Celery worker           |
| beat     | —                       | Celery Beat scheduler   |

On first boot the API container automatically:
1. Runs `alembic upgrade head` (creates tables)
2. Runs `python seed.py` (inserts demo data)

### 3. Login

Open **http://localhost:3000** and click **"Quick Demo Login"** or use:
- Email: `demo@supplypulse.dev`
- Password: `demo1234`

## API Endpoints

| Method | Endpoint                              | Description                    |
| ------ | ------------------------------------- | ------------------------------ |
| POST   | `/auth/register`                      | Register user + org            |
| POST   | `/auth/login`                         | Login → JWT                    |
| POST   | `/auth/mock-login`                    | Dev quick login                |
| POST   | `/invoices/upload`                    | Upload PDF/image invoice       |
| GET    | `/invoices`                           | List invoices                  |
| GET    | `/invoices/{id}`                      | Invoice detail + line items    |
| GET    | `/dashboard/summary?days=30`          | Analytics summary              |
| GET    | `/items/{id}/price-history`           | Price history for master item  |
| POST   | `/line-items/{id}/map-master-item`    | Map line item → master item    |
| GET    | `/master-items`                       | List master items              |
| POST   | `/master-items`                       | Create master item             |
| GET    | `/alerts`                             | List alerts                    |
| PUT    | `/alerts/{id}/read`                   | Mark alert as read             |
| GET    | `/health`                             | Health check                   |

Interactive API docs: **http://localhost:8000/docs**

## Running Tests

```bash
# From the api container
docker compose exec api pytest tests/ -v
```

## Extraction Pipeline

1. **Upload** → file saved to disk, Invoice record created (status: `pending`)
2. **Celery task** picks up the job
3. **Text extraction**: pdfplumber for PDFs with text, pytesseract OCR for scans/images
4. **Structured extraction**: `llm_extract_to_json(text)` → currently a heuristic mock; swap in OpenAI/Anthropic later
5. **Validation** via Pydantic schema
6. **Line items** created, each fuzzy-matched to a **master item** (or a new one is created)
7. Invoice status → `completed`

## Daily Alerts

- Celery Beat runs `compute_daily_alerts_all_orgs` daily at 07:00 UTC
- For each master item with ≥2 recent data points, compares latest price vs trailing 30-day average
- If increase ≥ org threshold (default 10%), creates an alert
- Email delivery is stubbed (logged to console)

## LLM Integration (Future)

The function `app/services/llm_placeholder.py::llm_extract_to_json()` accepts raw text and returns an `InvoiceExtracted` Pydantic model. To integrate a real LLM:

1. Set `LLM_PROVIDER=openai` in `.env`
2. Add `OPENAI_API_KEY=sk-...`
3. Implement the provider in `llm_placeholder.py` using the same interface

## License

Internal / Proprietary
