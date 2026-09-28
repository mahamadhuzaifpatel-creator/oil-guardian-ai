"""
Train and honestly evaluate the IOGP Life-Saving Rule classifier.

Run from the repo root (venv active):
    python -m scripts.train_iogp_classifier

What it does:
 1. Loads ml_modules/near_miss/data/raw/near_miss_800_varied_dataset.csv
 2. Embeds every report with the shared MiniLM ONNX embedder
 3. Evaluation A: stratified 80/20 split (standard test)
 4. Evaluation B: grouped 5-fold by barrier_failure (stricter: the test
    reports use hazard wording the model never saw in training)
 5. Evaluation C: the team's 12-report external test set (never trained on)
 6. Trains the final model on all data and saves it with its metrics
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import GroupKFold, train_test_split

from ml_modules.shared_embedder import MODEL_REPO, get_embedder

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "ml_modules" / "near_miss" / "data" / "raw" / "near_miss_800_varied_dataset.csv"
OUT_DIR = ROOT / "ml_modules" / "iogp_rule" / "models"
MODEL_PATH = OUT_DIR / "iogp_rule_classifier.joblib"
METRICS_PATH = OUT_DIR / "iogp_rule_metrics.json"

RANDOM_STATE = 42

LABEL_FIXES = {
    "Work Authorization": "Work Authorisation",
    "None/Not Applicable": "None",
}

# Team test set (see project status document, section 8). Never used for training.
EXTERNAL_TESTS = [
    ("Electrician worked on live 11kV panel without lockout or isolation verification", "Energy Isolation"),
    ("Welder started cutting on crude pipeline at GGS without gas test and without hot work permit", "Hot Work"),
    ("Helper entered mud tank to clean it without gas testing and no standby person outside", "Confined Space"),
    ("Rigger stood directly under suspended drill collar while crane was lifting it", "Safe Mechanical Lifting"),
    ("Derrickman climbed to monkey board at 25 m without full-body harness", "Working at Height"),
    ("Pressure safety valve on separator found gagged to keep production running", "Bypassing Safety Controls"),
    ("Worker stood in front of pressurised hose connection during pressure test, hose whipped and missed him by a metre", "Line of Fire"),
    ("Contractor drove pickup inside field at high speed while using mobile phone, no seatbelt", "Driving"),
    ("Maintenance crew started pump overhaul without a valid work permit", "Work Authorisation"),
    ("Worker almost slipped on oil spill near maintenance area, no injury", "None"),
    ("Water cooler in canteen not working", "None"),
    ("Office staff not wearing ID card inside admin building", "None"),
]


def new_model():
    return LogisticRegression(
        max_iter=3000,
        class_weight="balanced",
        C=1.0,
        random_state=RANDOM_STATE,
    )


def main():
    df = pd.read_csv(DATA_PATH)
    df = df.dropna(subset=["report_text", "iogp_life_saving_rule"])
    df = df.drop_duplicates(subset=["report_text"]).reset_index(drop=True)
    df["label"] = df["iogp_life_saving_rule"].replace(LABEL_FIXES)

    print(f"Reports: {len(df)}")
    print(df["label"].value_counts().to_string(), "\n")

    embedder = get_embedder()
    print("Embedding reports...")
    X = embedder.encode(df["report_text"].tolist())
    y = df["label"].to_numpy()
    groups = df["barrier_failure"].fillna("unknown").to_numpy()

    # ---------- Evaluation A: stratified 80/20 ----------
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
    )
    model_a = new_model().fit(X_tr, y_tr)
    pred_a = model_a.predict(X_te)
    acc_a = accuracy_score(y_te, pred_a)
    f1_a = f1_score(y_te, pred_a, average="macro")

    print("=" * 70)
    print("A) Stratified 80/20 split")
    print("=" * 70)
    print(classification_report(y_te, pred_a, zero_division=0))

    # ---------- Evaluation B: grouped by barrier_failure ----------
    y_true_b, y_pred_b = [], []
    for train_idx, test_idx in GroupKFold(n_splits=5).split(X, y, groups):
        fold_model = new_model().fit(X[train_idx], y[train_idx])
        y_true_b.extend(y[test_idx])
        y_pred_b.extend(fold_model.predict(X[test_idx]))
    acc_b = accuracy_score(y_true_b, y_pred_b)
    f1_b = f1_score(y_true_b, y_pred_b, average="macro")

    print("=" * 70)
    print("B) Grouped 5-fold by barrier_failure (unseen hazard wording)")
    print("=" * 70)
    print(classification_report(y_true_b, y_pred_b, zero_division=0))

    # ---------- Final model on all data ----------
    final_model = new_model().fit(X, y)

    # ---------- Evaluation C: external 12-report test set ----------
    print("=" * 70)
    print("C) External team test set (never trained on)")
    print("=" * 70)
    ext_texts = [text for text, _ in EXTERNAL_TESTS]
    ext_expected = [label for _, label in EXTERNAL_TESTS]
    ext_proba = final_model.predict_proba(embedder.encode(ext_texts))
    ext_pred = final_model.classes_[ext_proba.argmax(axis=1)]
    ext_correct = 0
    external_rows = []
    for text, expected, predicted, proba in zip(ext_texts, ext_expected, ext_pred, ext_proba):
        ok = expected == predicted
        ext_correct += ok
        print(f"{'PASS' if ok else 'FAIL'}  expected={expected:<26} got={predicted:<26} {proba.max()*100:5.1f}%  | {text[:60]}")
        external_rows.append({"text": text, "expected": expected, "predicted": str(predicted), "confidence": round(float(proba.max()) * 100, 1), "pass": bool(ok)})
    print(f"\nExternal: {ext_correct}/{len(EXTERNAL_TESTS)} correct")

    # ---------- Save ----------
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    metrics = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "data": str(DATA_PATH.relative_to(ROOT)),
        "n_reports": int(len(df)),
        "labels": sorted(set(y.tolist())),
        "embedder": MODEL_REPO,
        "sklearn_version": sklearn.__version__,
        "stratified_80_20": {"accuracy": round(acc_a, 4), "macro_f1": round(f1_a, 4)},
        "grouped_by_barrier_failure": {"accuracy": round(acc_b, 4), "macro_f1": round(f1_b, 4)},
        "external_test_set": {"correct": int(ext_correct), "total": len(EXTERNAL_TESTS), "rows": external_rows},
    }
    joblib.dump({"model": final_model, "metrics": metrics}, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"A) Stratified 80/20      accuracy {acc_a:.1%}   macro F1 {f1_a:.1%}")
    print(f"B) Grouped (strict)      accuracy {acc_b:.1%}   macro F1 {f1_b:.1%}")
    print(f"C) External test set     {ext_correct}/{len(EXTERNAL_TESTS)}")
    print(f"Saved model:   {MODEL_PATH.relative_to(ROOT)}")
    print(f"Saved metrics: {METRICS_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
