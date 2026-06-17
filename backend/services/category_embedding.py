from __future__ import annotations

import numpy as np
from sentence_transformers import SentenceTransformer


def encode_texts(model: SentenceTransformer, texts: list[str]) -> np.ndarray:
    if not texts:
        return np.empty((0, 0))
    return model.encode(texts, normalize_embeddings=True, show_progress_bar=False)


def best_match(
    query_embedding: np.ndarray,
    candidate_embeddings: np.ndarray,
) -> tuple[int, float]:
    if candidate_embeddings.size == 0:
        return -1, 0.0
    similarities = np.dot(candidate_embeddings, query_embedding)
    best_idx = int(np.argmax(similarities))
    return best_idx, float(similarities[best_idx])


def best_match_among(
    query_embedding: np.ndarray,
    candidate_embeddings: np.ndarray,
    allowed_indices: list[int],
) -> tuple[int, float]:
    if not allowed_indices:
        return -1, 0.0
    sub = candidate_embeddings[allowed_indices]
    local_idx, score = best_match(query_embedding, sub)
    if local_idx < 0:
        return -1, 0.0
    return allowed_indices[local_idx], score
