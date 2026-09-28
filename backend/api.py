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
from ensemble.sif_scoring import score_sif

from ml_modules.iogp_rule.inference import classify as classify_iogp_rule


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
        classify_iogp_rule(sample)
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

    # SIF scoring v2 (EEI-style). The old equal-weight soft vote is kept
    # only for comparison; see scripts/evaluate_sif.py for the evidence.
    ensemble = score_sif(text, unsafe_act["confidence"])

    ensemble["legacy_soft_vote"] = soft_vote(
        near_miss["confidence"] / 100,
        unsafe_act["confidence"] / 100,
        unsafe_condition["confidence"] / 100
    )

    # One trained classifier decides the IOGP Life-Saving Rule for the report.
    # The old keyword-based labels are kept as "keyword_rule" for reference.
    try:
        rule_result = classify_iogp_rule(text)
    except Exception as error:
        print("IOGP rule classifier error:", error)
        raise HTTPException(
            status_code=500,
            detail="IOGP rule classification failed. Please try again."
        )

    for model_output in (near_miss, unsafe_act, unsafe_condition):
        model_output["keyword_rule"] = model_output.get("iogp_rule")
        model_output["iogp_rule"] = rule_result["rule"]

    ensemble["iogp_rule"] = rule_result["rule"]
    ensemble["iogp_rule_confidence"] = rule_result["confidence"]
    ensemble["iogp_top_rules"] = rule_result["top_rules"]
    ensemble["iogp_low_confidence"] = rule_result["low_confidence"]

    return {
        "text": text,

        "models": {
            "near_miss": near_miss,
            "unsafe_act": unsafe_act,
            "unsafe_condition": unsafe_condition
        },

        "ensemble": ensemble
    }