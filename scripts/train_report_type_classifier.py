"""
Train and honestly evaluate the report type classifier
(Unsafe Act / Unsafe Condition / Near Miss / Incident).

Run from the repo root (venv active):
    python -m scripts.train_report_type_classifier

Training data
  - synthetic datasets (one writing template each; label/outcome sentences removed),
    capped at 300 per type so their template style doesn't dominate
  - ml_modules/report_type/data/field_style_reports.csv: 424 short, varied,
    field-style reports (abbreviations, first person, some Hinglish), including
    the "Incident" type; weighted 3x because they are closest to real use

Three variants are compared:
  V1  synthetic only, embeddings                      (the previous model)
  V2  synthetic + field-style, embeddings
  V3  synthetic + field-style, embeddings + cue words (ml_modules/report_type/features.py)

Evaluation (never trained on)
  E1  Vinayak's hazardous reports (30, written by someone else)   <- main number
  E2  all 72 evaluation reports (half are "controlled" safe-work twins whose type
      label is only the module they were written for, so this is pessimistic)
  E3  5-fold cross-validation on the field-style data (optimistic: same author)
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import StratifiedKFold

from ml_modules.report_type.features import cue_features
from ml_modules.shared_embedder import get_embedder

ROOT = Path(__file__).resolve().parents[1]
UA_PATH = ROOT / "ml_modules" / "unsafe_act" / "data" / "raw" / "unsafe_act_v3_contrast_balanced.csv"
UC_PATH = ROOT / "ml_modules" / "unsafe_condition" / "data" / "seed_reports (1).csv"
NM_PATH = ROOT / "ml_modules" / "near_miss" / "data" / "raw" / "near_miss_800_varied_dataset.csv"
FIELD_PATH = ROOT / "ml_modules" / "report_type" / "data" / "field_style_reports.csv"
EVAL_PATH = ROOT / "evaluation" / "sif_eval_set.csv"
OUT_DIR = ROOT / "ml_modules" / "report_type" / "models"
MODEL_PATH = OUT_DIR / "report_type_classifier.joblib"
METRICS_PATH = OUT_DIR / "report_type_metrics.json"

RANDOM_STATE = 42
SYNTHETIC_PER_TYPE = 300
FIELD_WEIGHT = 3.0
LABELS = ["Unsafe Act", "Unsafe Condition", "Near Miss", "Incident"]

LEAKY_SENTENCE = re.compile(
    r"[^.]*\b(sif potential|safe work practice|credible potential|"
    r"job proceeded|supervisor reviewed|corrected before resuming)\b[^.]*\.?",
    re.IGNORECASE,
)


def clean(text):
    text = LEAKY_SENTENCE.sub(" ", str(text))
    return re.sub(r"\s+", " ", text).strip()


def load_synthetic():
    ua = pd.read_csv(UA_PATH)
    ua = ua[ua["category"] == "Unsafe Act"]
    parts = [
        pd.DataFrame({"text": ua["report_text"], "label": "Unsafe Act"}),
        pd.DataFrame({"text": pd.read_csv(UC_PATH)["description_clean"], "label": "Unsafe Condition"}),
        pd.DataFrame({"text": pd.read_csv(NM_PATH)["report_text"], "label": "Near Miss"}),
    ]
    out = []
    for part in parts:
        part = part.dropna(subset=["text"]).copy()
        part["text"] = part["text"].map(clean)
        part = part[part["text"].str.len() > 10].drop_duplicates("text")
        out.append(part.sample(n=min(SYNTHETIC_PER_TYPE, len(part)), random_state=RANDOM_STATE))
    df = pd.concat(out, ignore_index=True)
    df["weight"] = 1.0
    df["source"] = "synthetic"
    return df


def load_field():
    df = pd.read_csv(FIELD_PATH)[["text", "label"]].copy()
    df["weight"] = FIELD_WEIGHT
    df["source"] = "field_style"
    return df


def features(embeddings, texts, use_cues):
    if not use_cues:
        return embeddings
    return np.hstack([embeddings, cue_features(texts)])


def new_model():
    return LogisticRegression(max_iter=4000, class_weight="balanced", C=2.0, random_state=RANDOM_STATE)


def main():
    embedder = get_embedder()

    synthetic = load_synthetic()
    field = load_field()
    print(f"Synthetic training reports: {len(synthetic)}  |  field-style reports: {len(field)}")
    print(field["label"].value_counts().to_string(), "\n")

    ev = pd.read_csv(EVAL_PATH)
    ev = ev[ev["category"].isin(LABELS)].reset_index(drop=True)
    ev["expected_sif"] = ev["expected_sif"].astype(str).str.lower().isin(["true", "1", "yes"])
    vinayak_hazard = ev[(ev["source"] != "team_test_set") & ev["expected_sif"]].reset_index(drop=True)

    print("Embedding...")
    emb = {
        "synthetic": embedder.encode(synthetic["text"].tolist()),
        "field": embedder.encode(field["text"].tolist()),
        "eval": embedder.encode(ev["text"].tolist()),
        "hazard": embedder.encode(vinayak_hazard["text"].tolist()),
    }

    variants = {
        "V1 synthetic only": dict(use_field=False, use_cues=False),
        "V2 + field-style data": dict(use_field=True, use_cues=False),
        "V3 + field-style + cue words": dict(use_field=True, use_cues=True),
    }

    results, fitted = [], {}
    for name, cfg in variants.items():
        texts = synthetic["text"].tolist()
        X = emb["synthetic"]
        y = synthetic["label"].to_numpy()
        w = synthetic["weight"].to_numpy()
        if cfg["use_field"]:
            texts = texts + field["text"].tolist()
            X = np.vstack([X, emb["field"]])
            y = np.concatenate([y, field["label"].to_numpy()])
            w = np.concatenate([w, field["weight"].to_numpy()])

        model = new_model().fit(features(X, texts, cfg["use_cues"]), y, sample_weight=w)
        fitted[name] = (model, cfg)

        pred_h = model.predict(features(emb["hazard"], vinayak_hazard["text"], cfg["use_cues"]))
        pred_e = model.predict(features(emb["eval"], ev["text"], cfg["use_cues"]))

        cv_acc = float("nan")
        if cfg["use_field"]:
            correct, total = 0, 0
            skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
            fX = emb["field"]
            fy = field["label"].to_numpy()
            for tr, te in skf.split(fX, fy):
                Xtr = np.vstack([emb["synthetic"], fX[tr]])
                ttr = synthetic["text"].tolist() + field["text"].iloc[tr].tolist()
                ytr = np.concatenate([synthetic["label"].to_numpy(), fy[tr]])
                wtr = np.concatenate([synthetic["weight"].to_numpy(), field["weight"].to_numpy()[tr]])
                m = new_model().fit(features(Xtr, ttr, cfg["use_cues"]), ytr, sample_weight=wtr)
                p = m.predict(features(fX[te], field["text"].iloc[te], cfg["use_cues"]))
                correct += int((p == fy[te]).sum())
                total += len(te)
            cv_acc = correct / total

        results.append({
            "variant": name,
            "E1 hazardous (main)": accuracy_score(vinayak_hazard["category"], pred_h),
            "E2 all 72": accuracy_score(ev["category"], pred_e),
            "E3 field CV": cv_acc,
        })

    table = pd.DataFrame(results)
    pd.set_option("display.width", 160)
    print("\n" + "=" * 80)
    print("REPORT TYPE ACCURACY BY VARIANT")
    print("=" * 80)
    print(table.to_string(index=False, float_format=lambda v: f"{v:.1%}"))

    best = table.sort_values(["E1 hazardous (main)", "E2 all 72"], ascending=False).iloc[0]["variant"]
    model, cfg = fitted[best]
    print(f"\nChosen: {best}")

    pred_h = model.predict(features(emb["hazard"], vinayak_hazard["text"], cfg["use_cues"]))
    present = [l for l in LABELS if l in set(vinayak_hazard["category"]) | set(pred_h)]
    print("\nE1 detail (hazardous reports written by someone else):")
    print(classification_report(vinayak_hazard["category"], pred_h, labels=present, zero_division=0))
    print("Confusion matrix (rows = true, columns = predicted):")
    print(pd.DataFrame(confusion_matrix(vinayak_hazard["category"], pred_h, labels=present), index=present, columns=present).to_string())

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    metrics = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "chosen_variant": best,
        "use_cues": cfg["use_cues"],
        "sklearn_version": sklearn.__version__,
        "variants": [{k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items()} for r in results],
        "e1_size": int(len(vinayak_hazard)),
        "e2_size": int(len(ev)),
        "field_style_reports": int(len(field)),
    }
    joblib.dump({"model": model, "use_cues": cfg["use_cues"], "metrics": metrics}, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))
    print(f"\nSaved model: {MODEL_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
