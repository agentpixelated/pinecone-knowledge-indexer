# Pinecone Knowledge Indexer

A premium document ingestion and semantic search website powered by **FastAPI** + **Pinecone Vector Database**.

**Live at:** `http://192.168.0.155:8000` (LAN only)

---

## What it does

Upload any file (PDF, DOCX, or plain text) — the site extracts the text, chunks it, generates vector embeddings, and indexes them into a Pinecone vector index called `knowledge`. You can then search across all ingested documents with semantic (meaning-based) search, not just keyword matching.

## Features

- **File upload** — drag-and-drop or click to select PDF, DOCX, TXT
- **Real-time progress** — live SSE stream showing parse → embed → upsert stages
- **Semantic search** — natural language queries return the most relevant text chunks
- **Premium dark UI** — slate-zinc theme with emerald accents
- **Parallel ingestion** — concurrent embedding pipeline with rate-limit protection
- **Auto-retry** — exponential backoff if Pinecone API rate limits are hit
- **Stats dashboard** — see total vectors, index dimension, and connection status

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Python / FastAPI / Uvicorn |
| Vector DB | Pinecone (serverless, `knowledge` index) |
| Embeddings | `llama-text-embed-v2` (1024-dim) |
| Frontend | Vanilla HTML + CSS + JS |
| Styling | High-End Visual Design / Taste Skill |

## How to Use

### From your browser

Open `http://192.168.0.155:8000` in any browser on the local network.

1. **Upload** a file via the drop zone
2. Watch the progress bars as it parses, embeds, and indexes
3. Use the **search bar** to query your documents
4. Browse results with highlighted matching terms

### From the server terminal

```bash
cd ~/projects/file-to-pinecone
source venv/bin/activate
export PINECONE_API_KEY="your-key"
python main.py
```

The server binds to `0.0.0.0:8000` so it's accessible from any device on the LAN.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Web UI |
| `GET` | `/api/health` | Health check + Pinecone status |
| `GET` | `/api/stats` | Index stats (vector count, dimension, model) |
| `POST` | `/api/upload` | Upload a file (returns SSE progress stream) |
| `GET` | `/api/search?query=...&top_k=5` | Semantic search |

## Project Structure

```
~/projects/file-to-pinecone/
├── main.py              # FastAPI app (routes, embeddings, Pinecone ops)
├── venv/                # Python virtual environment
├── static/
│   ├── index.html       # Web UI
│   ├── style.css        # Premium dark theme
│   ├── script.js        # Frontend logic (upload, search, progress)
│   └── hero.jpg         # Hero background image
└── requirements.txt     # Python dependencies
```

## Built With

- [Pinecone](https://www.pinecone.io) — Managed vector database
- [FastAPI](https://fastapi.tiangolo.com) — Python web framework
- [Antigravity CLI](https://antigravity.google) — AI coding agent
- [Taste Skill Pack](https://github.com/Leonxlnx/taste-skill) — Premium UI design skills
