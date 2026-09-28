"""
Report type classifier: Unsafe Act / Unsafe Condition / Near Miss / Incident.

MiniLM embeddings (shared ONNX embedder) + logistic regression, trained by
scripts/train_report_type_classifier.py. Its output is a suggestion:
the employee's answer and the safety officer's confirmation take priority.
"""

from pathlib import Path

import joblib
import numpy as np

from ml_modules.report_type.features import cue_features, matched_cues
from ml_modules.shared_embedder import get_embedder

MODEL_PATH = Path(__file__).resolve().parent / "models" / "report_type_classifier.joblib"
LOW_CONFIDENCE = 0.60

_bundle = None


def is_available() -> bool:
    return MODEL_PATH.exists()


def _load():
    global _bundle
    if _bundle is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Report type model not found: {MODEL_PATH}. "
                "Run: python -m scripts.train_report_type_classifier"
            )
        _bundle = joblib.load(MODEL_PATH)
    return _bundle


def classify(text: str) -> dict:
    bundle = _load()
    model = bundle["model"]
    text = (text or "").strip()
    X = get_embedder().encode([text])
    if bundle.get("use_cues"):
        X = np.hstack([X, cue_features([text])])
    probabilities = model.predict_proba(X)[0]
    order = np.argsort(probabilities)[::-1]
    top = [
        {"type": str(model.classes_[i]), "confidence": round(float(probabilities[i]) * 100, 1)}
        for i in order
    ]
    return {
        "type": top[0]["type"],
        "confidence": top[0]["confidence"],
        "alternatives": top,
        "low_confidence": top[0]["confidence"] < LOW_CONFIDENCE * 100,
        "cues": matched_cues(text),
    }
