from __future__ import annotations

from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer


class EmbedRequest(BaseModel):
    texts: List[str]


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]


app = FastAPI(title="Semantic Embedding Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_model: SentenceTransformer | None = None


@app.on_event("startup")
def startup_event():
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)


@app.get("/health")
def health():
    return {"ok": _model is not None, "model": MODEL_NAME}


@app.post("/embed", response_model=EmbedResponse)
def embed(payload: EmbedRequest):
    texts = payload.texts or []
    if len(texts) == 0:
        return EmbedResponse(embeddings=[])

    if _model is None:
        raise RuntimeError("SentenceTransformer model is not initialized.")

    vectors = _model.encode(
        texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    return EmbedResponse(embeddings=vectors.tolist())
