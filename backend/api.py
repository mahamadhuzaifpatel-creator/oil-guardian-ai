import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ml_modules.near_miss.inference import (
    analyze as analyze_near_miss
)

from ml_modules.unsafe_act.inference import (
    analyze as analyze_unsafe_act
)

from ml_modules.unsafe_condition.inference import (
    analyze as analyze_unsafe_condition
)

from ensemble.soft_voting import soft_vote


app = FastAPI(
    title="OIL Guardian AI API",
    description="Industrial safety monitoring and AI risk analysis API",
    version="1.0.0"
)


# Allowed frontend origins. Extra origins can be added on Render with
# ALLOWED_ORIGINS="https://a.com,https://b.com"
DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://oil-guardian-ai-xxhn.onrender.com",
]

extra_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=DEFAULT_ORIGINS + extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def warmup_models():
    """
    Optionally load every model at startup so the first real request is fast.
    Enabled with WARMUP_MODELS=1 (set in the Hugging Face Dockerfile).
    Left off on small servers, where loading everything at once may not fit.
    """
    if os.getenv("WARMUP_MODELS") != "1":
        return

    print("Warming up models...")
    sample = "Worker observed near rotating equipment without guard."

    try:
        analyze_near_miss(sample)
        analyze_unsafe_act(sample)
        analyze_unsafe_condition(sample)
        print("All models loaded and ready.")
    except Exception as error:
        print("Model warmup failed:", error)


class AnalyzeRequest(BaseModel):
    text: str


@app.get("/")
def root():
    return {
        "message": "OIL Guardian AI API is running",
        "status": "online"
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": "OIL Guardian AI"
    }


@app.post("/api/analyze")
def analyze_report(request: AnalyzeRequest):

    text = request.text.strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Safety observation text is required."
        )

    try:
        near_miss = analyze_near_miss(text)
        unsafe_act = analyze_unsafe_act(text)
        unsafe_condition = analyze_unsafe_condition(text)
    except Exception as error:
        print("Model inference error:", error)
        raise HTTPException(
            status_code=500,
            detail="AI model inference failed. Please try again."
        )

    ensemble = soft_vote(
        near_miss["confidence"] / 100,
        unsafe_act["confidence"] / 100,
        unsafe_condition["confidence"] / 100
    )

    return {
        "text": text,

        "models": {
            "near_miss": near_miss,
            "unsafe_act": unsafe_act,
            "unsafe_condition": unsafe_condition
        },

        "ensemble": ensemble
    }