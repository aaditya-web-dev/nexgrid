# Nexgrid – Collaborative API Testing Workspace

Nexgrid is a collaborative API testing platform inspired by Postman. It allows developers and teams to organize, manage, execute, and test REST APIs within shared workspaces.

The platform provides API request management, environment configuration, authentication support, real-time collaboration, and centralized workspace management.

## Features

- **Workspace Management** – Create and manage collaborative workspaces.
- **Team Collaboration** – Invite members and manage workspace roles.
- **Role-Based Access Control (RBAC)** – Support for Owner, Editor, and Viewer permissions.
- **Collections Management** – Organize API requests into collections.
- **API Request Builder** – Create, configure, and execute HTTP requests.
- **HTTP Methods** – Support for GET, POST, PUT, PATCH, and DELETE.
- **Environment Management** – Manage environment-specific variables.
- **Authentication** – JWT-based user authentication.
- **Real-Time Collaboration** – WebSocket-based communication.
- **Request Locking** – Prevent conflicting edits during collaborative work.
- **Comments** – Collaborate through workspace discussions.
- **Notifications** – Receive updates about workspace activities.

## Tech Stack

### Frontend
- React.js
- Vite
- React Router DOM
- Zustand
- TanStack React Query
- Tailwind CSS
- Axios
- Zod
- React Hook Form

### Backend
- Python
- FastAPI
- SQLAlchemy
- Pydantic
- Alembic
- JWT Authentication
- WebSockets

### Database
- SQLite (Development)
- MySQL (Optional)

### Development Tools
- Git & GitHub
- VS Code
- Postman

## Project Structure

```text
nexgrid/
│
├── frontend/
│   ├── public/
│   ├── src/
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── alembic/
│   ├── app/
│   │   ├── core/
│   │   ├── models/
│   │   ├── routers/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── websocket/
│   │   ├── main.py
│   │   └── __init__.py
│   │
│   ├── scripts/
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── .env
│   └── nexgrid.db
│
└── README.md
```

## Installation & Setup

### Prerequisites

Make sure you have installed:

- Python 3.10+
- Node.js and npm
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/aaditya-web-dev/nexgrid.git
cd nexgrid
```

### 2. Backend Setup

Navigate to the backend directory:

```bash
cd backend
```

Create a virtual environment:

**Windows:**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Configure environment variables by creating a `.env` file using your local configuration.

Start the FastAPI server:

```bash
python -m uvicorn app.main:app --reload
```

Backend runs at:

http://127.0.0.1:8000

### 3. Frontend Setup

Open another terminal and navigate to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Configure the frontend environment variables using your local configuration.

Start the development server:

```bash
npm run dev
```

Frontend runs at:

http://127.0.0.1:5173

## API Documentation

Nexgrid uses FastAPI to provide REST API endpoints.

Once the backend server is running, access the interactive API documentation:

- **Swagger UI:** http://127.0.0.1:8000/docs
- **ReDoc:** http://127.0.0.1:8000/redoc

## Real-Time Communication

Nexgrid uses WebSockets to support real-time collaboration between workspace members.

The WebSocket layer supports collaborative events and communication between connected workspace clients.

## Database & Migrations

Nexgrid uses SQLAlchemy as its ORM and Alembic for database schema migrations.

Run migrations using:

```bash
alembic upgrade head
```

Create a new migration:

```bash
alembic revision --autogenerate -m "migration message"
```

## Security

- JWT-based authentication.
- Password hashing.
- Workspace membership validation.
- Role-based authorization.
- Environment-based configuration.
- Protected API endpoints.

## Project Goal

The goal of Nexgrid is to simplify API testing and make it collaborative by combining API request management, workspace organization, access control, and real-time communication in one platform.

## Author

**Aaditya Pandey**

- GitHub: https://github.com/aaditya-web-dev

---

*Built with React.js, FastAPI, Python, and SQLAlchemy.*