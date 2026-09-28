"""
IOGP Life-Saving Rule classifier.

Predicts which of the 9 IOGP Life-Saving Rules a safety report relates to
(or "None"), using MiniLM embeddings (shared ONNX embedder) and a logistic
regression trained by scripts/train_iogp_classifier.py.
"""

from pathlib import Path

import joblib
import numpy as np

from ml_modules.shared_embedder import get_embedder

MODEL_PATH = Path(__file__).resolve().parent / "models" / "iogp_rule_classifier.joblib"

# Below this probability the prediction is shown but flagged for human review
LOW_CONFIDENCE = 0.40

_bundle = None


def _load():
    global _bundle

    if _bundle is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"IOGP rule model not found: {MODEL_PATH}. "
                "Run: python -m scripts.train_iogp_classifier"
            )
        _bundle = joblib.load(MODEL_PATH)

    return _bundle


def classify(text: str) -> dict:
    text = (text or "").strip()

    if not text:
        return {
            "rule": "None",
            "confidence": 0.0,
            "top_rules": [],
            "low_confidence": True,
        }

    bundle = _load()
    model = bundle["model"]

    vector = get_embedder().encode([text])
    probabilities = model.predict_proba(vector)[0]

    order = np.argsort(probabilities)[::-1]
    top_rules = [
        {
            "rule": str(model.classes_[index]),
            "confidence": round(float(probabilities[index]) * 100, 1),
        }
        for index in order[:3]
    ]

    best = top_rules[0]

    return {
        "rule": best["rule"],
        "confidence": best["confidence"],
        "top_rules": top_rules,
        "low_confidence": best["confidence"] < LOW_CONFIDENCE * 100,
    }
