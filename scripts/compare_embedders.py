"""
Checks that the ONNX embedder gives the same vectors as sentence-transformers.
Run from the repo root:  python -m scripts.compare_embedders
Needs sentence-transformers installed locally (it already is in your .venv).
"""

import numpy as np
from sentence_transformers import SentenceTransformer

from ml_modules.shared_embedder import OnnxMiniLMEmbedder

sentences = [
    "Electrician worked on live 11kV panel without lockout",
    "Water cooler in canteen not working",
    "Rigger standing directly under suspended drill collar during rig-up",
    "Worker almost slipped due to oil contamination on the floor",
]

torch_model = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")
onnx_model = OnnxMiniLMEmbedder()

worst = 1.0
for sentence in sentences:
    a = torch_model.encode([sentence])[0]
    b = onnx_model.encode([sentence])[0]
    cosine = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
    worst = min(worst, cosine)
    print(f"{cosine:.6f}  max diff {np.abs(a - b).max():.2e}  | {sentence}")

print()
print("PASS: embeddings match" if worst > 0.9999 else "FAIL: embeddings differ, tell Claude")
