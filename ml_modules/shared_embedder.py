"""
Shared MiniLM embedder used by the Near Miss and Unsafe Condition models.

Default backend is ONNX Runtime, which produces the same embeddings as
sentence-transformers' all-MiniLM-L6-v2 but without PyTorch, so the whole
ML backend fits in Render's 512 MB free plan.

Set EMBEDDER_BACKEND=torch to use sentence-transformers instead
(e.g. on a larger server that already has torch installed).
"""

import os

import numpy as np

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

MODEL_REPO = "sentence-transformers/all-MiniLM-L6-v2"
MAX_SEQ_LENGTH = 256  # same limit sentence-transformers uses for this model

LOCAL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "embedder_onnx")
MODEL_PATH = os.path.join(LOCAL_DIR, "onnx", "model.onnx")
TOKENIZER_PATH = os.path.join(LOCAL_DIR, "tokenizer.json")

_embedder = None


def download_embedder():
    """Download the ONNX model and tokenizer into ml_modules/embedder_onnx/."""
    from huggingface_hub import hf_hub_download

    for filename in ["onnx/model.onnx", "tokenizer.json"]:
        hf_hub_download(repo_id=MODEL_REPO, filename=filename, local_dir=LOCAL_DIR)

    print(f"Embedder files ready in {LOCAL_DIR}")


class OnnxMiniLMEmbedder:
    """Drop-in replacement for SentenceTransformer('all-MiniLM-L6-v2').encode()."""

    def __init__(self):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        if not (os.path.exists(MODEL_PATH) and os.path.exists(TOKENIZER_PATH)):
            download_embedder()

        self.tokenizer = Tokenizer.from_file(TOKENIZER_PATH)
        self.tokenizer.enable_truncation(max_length=MAX_SEQ_LENGTH)
        self.tokenizer.no_padding()

        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1

        self.session = ort.InferenceSession(
            MODEL_PATH,
            sess_options=options,
            providers=["CPUExecutionProvider"],
        )
        self.input_names = {item.name for item in self.session.get_inputs()}

        # Use the token-level output (shape: batch x tokens x 384)
        outputs = self.session.get_outputs()
        self.output_name = next(
            (item.name for item in outputs if len(item.shape) == 3),
            outputs[0].name,
        )

    def _embed_one(self, text):
        encoding = self.tokenizer.encode(text)

        input_ids = np.array([encoding.ids], dtype=np.int64)
        attention_mask = np.array([encoding.attention_mask], dtype=np.int64)

        feeds = {"input_ids": input_ids, "attention_mask": attention_mask}
        if "token_type_ids" in self.input_names:
            feeds["token_type_ids"] = np.array([encoding.type_ids], dtype=np.int64)

        token_embeddings = self.session.run([self.output_name], feeds)[0]

        # Mean pooling over real tokens, then L2 normalisation
        # (exactly what the sentence-transformers model does)
        mask = attention_mask[..., None].astype(np.float32)
        summed = (token_embeddings * mask).sum(axis=1)
        counts = np.clip(mask.sum(axis=1), 1e-9, None)
        pooled = summed / counts

        norm = np.clip(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-12, None)
        return (pooled / norm)[0]

    def encode(self, texts, **kwargs):
        single = isinstance(texts, str)
        if single:
            texts = [texts]

        vectors = np.vstack([self._embed_one(text) for text in texts]).astype(np.float32)
        return vectors[0] if single else vectors


def get_embedder():
    global _embedder

    if _embedder is None:
        backend = os.getenv("EMBEDDER_BACKEND", "onnx").lower()

        if backend == "torch":
            import torch
            from sentence_transformers import SentenceTransformer

            torch.set_num_threads(1)
            print("Loading shared embedder (sentence-transformers / torch)")
            _embedder = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")
        else:
            print("Loading shared embedder (ONNX Runtime)")
            _embedder = OnnxMiniLMEmbedder()

        print("Shared embedder loaded.")

    return _embedder


if __name__ == "__main__":
    # Used by the Render build command to fetch the model ahead of time
    download_embedder()
