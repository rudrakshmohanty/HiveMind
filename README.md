# ollama-idea-test

## Run locally

Backend:

```bash
cd /Users/rudrakshmohanty/Documents/Codes/ollama-idea-test
source .ollama-test-venv/bin/activate
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd /Users/rudrakshmohanty/Documents/Codes/ollama-idea-test/frontend
npm run dev
```

You also need Ollama running locally on `http://localhost:11434`, or the Docker Compose stack below.

## Run with Docker Compose

```bash
cd /Users/rudrakshmohanty/Documents/Codes/ollama-idea-test
docker compose up --build
```

Then open:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Ollama: `http://localhost:11434`