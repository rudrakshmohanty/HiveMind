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

The backend now uses MongoDB for conversation storage. If you run the backend outside Docker, make sure MongoDB is available on `http://localhost:27017` or set `MONGODB_URL` and `MONGODB_DB` accordingly.

To use Mongo Atlas, set `MONGODB_URL` to your Atlas SRV URI, for example `mongodb+srv://<user>:<password>@<cluster>/<options>`, and set `MONGODB_DB` to the database that contains your `conversations` and `messages` collections.

## Run with Docker Compose

```bash
cd /Users/rudrakshmohanty/Documents/Codes/ollama-idea-test
docker compose up --build
```

Then open:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Ollama: `http://localhost:11434`