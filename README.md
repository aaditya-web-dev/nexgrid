# Nexgrid: A Collaborative API Testing Workspace

MCA final project — Week 1 scaffold (environment setup, backend/frontend boilerplate, DB connection).

## Structure

```
nexgrid/
├── backend/     # FastAPI + SQLAlchemy
└── frontend/    # React (Vite) + Tailwind CSS
```

<!-- ## Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Backend runs at **http://127.0.0.1:8000**
- `GET /` — root status
- `GET /api/hello` — sanity check
- `GET /api/health` — confirms DB connectivity
- Interactive docs: **http://127.0.0.1:8000/docs**

A local SQLite DB file (`nexgrid.db`) is created automatically on first run.
Switch to MySQL later by changing `DATABASE_URL` in `.env`
(e.g. `mysql+pymysql://user:password@localhost/nexgrid`) and installing `pymysql`.

## Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend runs at **http://127.0.0.1:5173** and will show a "Backend connected" indicator
once it successfully reaches the FastAPI server.

## Run Both Together

Open two terminals — one for `backend` (`uvicorn app.main:app --reload`), one for
`frontend` (`npm run dev`) — with the backend started first.

## What's Done (Week 1)

- [x] FastAPI project scaffolded with modular structure (`routers`, `models`, `schemas`, `services`, `websocket`, `core`)
- [x] React (Vite) project scaffolded with Tailwind CSS
- [x] CORS configured so the frontend can call the backend
- [x] SQLAlchemy DB session wired up, verified via `/api/health`
- [x] Placeholder `User` model to confirm table creation works
- [x] End-to-end verified: frontend fetches `/api/hello` and `/api/health` and displays live status

## Next Up (Week 2)

- Full ER diagram: Users, Workspaces, WorkspaceMembers, Collections, Folders, Requests,
  Environments, EnvironmentVariables, Comments, Notifications, TestCases, TestResults
- Alembic migrations set up
- Models implemented for all core entities -->
