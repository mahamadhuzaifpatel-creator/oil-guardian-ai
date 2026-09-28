"""
IOGP Life-Saving Rule classifier.

Predicts which of the 9 IOGP Life-Saving Rules a safety report relates to
(or "None"), using MiniLM embeddings (shared ONNX embedder) and a logistic
regression.

Supports two model formats in ml_modules/iogp_rule/models/:
  - Vinayak's model: iogp_rule_classifier.joblib (LogisticRegression with
    numeric classes) + iogp_rule_label_encoder.joblib (class names)
  - A model saved by scripts/train_iogp_classifier.py (a dict with "model")
"""

from pathlib import Path

import joblib
import numpy as np

from ml_modules.shared_embedder import get_embedder

MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_PATH = MODEL_DIR / "iogp_rule_classifier.joblib"
ENCODER_PATH = MODEL_DIR / "iogp_rule_label_encoder.joblib"

# Consistent display names for the 9 IOGP Life-Saving Rules
LABEL_FIXES = {
    "None/Not Applicable": "None",
    "Work Authorization": "Work Authorisation",
}

# Below this probability the prediction is shown but flagged for human review
LOW_CONFIDENCE = 0.40

_bundle = None


def _load():
    """Load the classifier once and work out the rule name for each class."""
    global _bundle

    if _bundle is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"IOGP rule model not found: {MODEL_PATH}")

        loaded = joblib.load(MODEL_PATH)

        if isinstance(loaded, dict) and "model" in loaded:
            model = loaded["model"]
            names = [str(label) for label in model.classes_]
        else:
            model = loaded
            if not ENCODER_PATH.exists():
                raise FileNotFoundError(f"IOGP label encoder not found: {ENCODER_PATH}")
            encoder = joblib.load(ENCODER_PATH)
            names = [str(label) for label in encoder.inverse_transform(model.classes_)]

        _bundle = {
            "model": model,
            "labels": [LABEL_FIXES.get(name, name) for name in names],
        }

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
    labels = bundle["labels"]

    vector = get_embedder().encode([text])
    probabilities = model.predict_proba(vector)[0]

    order = np.argsort(probabilities)[::-1]
    top_rules = [
        {
            "rule": labels[index],
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


def probabilities(text: str) -> dict:
    """Probability for every label (9 rules + "None"), as 0-1 floats."""
    bundle = _load()
    model = bundle["model"]
    vector = get_embedder().encode([(text or "").strip()])
    probs = model.predict_proba(vector)[0]
    return {str(label): float(p) for label, p in zip(model.classes_, probs)}
