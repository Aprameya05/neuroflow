# Your Tasks — Sprint 1
## Goal: Get the backend running and talking to the dashboard

---

### Task 1: Create the GitHub repo

1. Go to github.com → New repository
2. Name: `neuroflow`
3. Set it to Public (important for the open-source story)
4. Do NOT initialize with README (we have one)
5. Then in your terminal:

```bash
git init
git add .
git commit -m "feat: initial project scaffold"
git remote add origin https://github.com/YOUR_USERNAME/neuroflow.git
git branch -M main
git push -u origin main
```

6. Go to Settings → Collaborators → Add Aashritha's GitHub username

---

### Task 2: Set up your Python environment

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

If you get errors installing torch (it's large), you can skip it for now:
```bash
pip install fastapi uvicorn websockets pydantic-settings numpy asyncpg sqlalchemy redis python-dotenv
```
Torch is only needed for model training (Sprint 3), not for running the server.

---

### Task 3: Run the backend

```bash
cd backend
uvicorn app.main:app --reload
```

Open http://localhost:8000/health — you should see:
```json
{"status": "ok", "version": "0.1.0"}
```

Open http://localhost:8000/docs — FastAPI auto-generates an API explorer. Show this to people. It looks impressive.

---

### Task 4: Test the WebSocket manually

In your browser console, paste this to simulate what the browser extension will send:

```javascript
const ws = new WebSocket("ws://localhost:8000/ws/signal/test-session-001");
ws.onmessage = (e) => console.log("LOAD ESTIMATE:", JSON.parse(e.data));
ws.onopen = () => {
  // Send a fake signal
  setInterval(() => {
    ws.send(JSON.stringify({
      ts: Date.now(),
      iki: 180 + Math.random() * 200,
      mv: Math.random() * 0.5,
      ma: Math.random() * 0.2,
      mdc: Math.floor(Math.random() * 5),
      sv: Math.random() * 0.1,
      er: Math.random() * 0.3,  // try setting this to 0.8 to see high load
      pause: Math.random() * 2000,
      ts_count: 0,
      cp: 0,
    }));
  }, 500);
};
```

You should see load estimates coming back every few signals.

---

### Task 5: Set up Docker (for Postgres + Redis)

```bash
cd infra/docker
docker compose up -d
```

This starts Postgres on port 5432 and Redis on 6379. The backend will need these in Sprint 2 when we wire up persistent storage.

Verify: `docker ps` should show two running containers.

---

### What to tell Aashritha

Once the backend is running, give her:
- The WebSocket URL: `ws://localhost:8000/ws/signal`
- Tell her to run the dashboard and connect to session ID `dev-session-001`
- She should see "Live" badge turn green and data start flowing

---

### When you're done with Sprint 1, open a PR titled:
`feat: Sprint 1 — backend scaffold + WebSocket hub running`
