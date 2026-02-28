# Semantic Python Service

This project now uses a local Python service for text vector embeddings.

## Why

- Removes browser model loading instability (`Unexpected token '<'` during model fetch)
- Uses a real sentence embedding model (`all-MiniLM-L6-v2`)
- Preserves semantic grouping behavior in the graph with better quality than hashing vectors

## Start Service

From project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r python/requirements.txt
uvicorn python.semantic_embed_server:app --host 127.0.0.1 --port 8008
```

First startup may take longer because model weights are downloaded and cached locally.

## API

- `GET /health` -> `{ "ok": true, "model": "sentence-transformers/all-MiniLM-L6-v2" }`
- `POST /embed` with payload:

```json
{
  "texts": ["clause one text", "clause two text"]
}
```

response:

```json
{
  "embeddings": [[...], [...]]
}
```

## Frontend Config

Optional env var:

- `VITE_SEMANTIC_API_BASE` (default: `http://127.0.0.1:8008`)

Example `.env.local`:

```env
VITE_SEMANTIC_API_BASE=http://127.0.0.1:8008
```
