"""
Evaluate SIF scoring on the fixed evaluation set (evaluation/sif_eval_set.csv).

Run from the repo root (venv active):
    python -m scripts.evaluate_sif

Evaluation set (72 reports, never used for training):
  - 30 dangerous/controlled PAIRS written by Vinayak: the same job done
    without controls (SIF) and with controls in place (not SIF)
  - the team's 12-report test set

Scorers compared:
  old_soft_vote    : the previous live method (equal-weight soft vote of 3 models)
  sif_v2           : the new live method (ensemble/sif_scoring.py)
  near_miss / unsafe_act / unsafe_condition : each model alone
  eei_experimental : EEI-style "high energy x control failure"
                     = (1 - P(IOGP rule = None)) x unsafe_act score

Metrics:
  AUC            : 1.0 = perfect ranking of SIF above non-SIF, 0.5 = coin flip
  pair accuracy  : share of pairs where the dangerous version scores higher
  recall / precision / accuracy at the 50% threshold
"""

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

from ensemble.sif_scoring import score_sif
from ensemble.soft_voting import soft_vote
from ml_modules.iogp_rule.inference import probabilities as rule_probabilities
from ml_modules.near_miss.inference import analyze as analyze_near_miss
from ml_modules.unsafe_act.inference import analyze as analyze_unsafe_act
from ml_modules.unsafe_condition.inference import analyze as analyze_unsafe_condition

ROOT = Path(__file__).resolve().parents[1]
EVAL_PATH = ROOT / "evaluation" / "sif_eval_set.csv"
RESULTS_PATH = ROOT / "evaluation" / "sif_eval_results.csv"
THRESHOLD = 0.5


def score_report(text):
    nm = analyze_near_miss(text)["confidence"] / 100
    ua = analyze_unsafe_act(text)["confidence"] / 100
    uc = analyze_unsafe_condition(text)["confidence"] / 100

    ensemble = soft_vote(nm, ua, uc)["sif_probability"]
    v2 = score_sif(text, ua * 100)

    high_energy = 1.0 - rule_probabilities(text).get("None", 0.0)
    eei = high_energy * ua

    return {
        "old_soft_vote": ensemble,
        "sif_v2": v2["sif_probability"],
        "near_miss": nm,
        "unsafe_act": ua,
        "unsafe_condition": uc,
        "eei_experimental": eei,
        "p_high_energy": high_energy,
    }


def pair_accuracy(df, column):
    wins, total = 0, 0
    for pair_id, group in df[df["pair_id"].fillna("") != ""].groupby("pair_id"):
        dangerous = group[group["expected_sif"]]
        controlled = group[~group["expected_sif"]]
        if len(dangerous) == 1 and len(controlled) == 1:
            total += 1
            wins += dangerous[column].iloc[0] > controlled[column].iloc[0]
    return wins / total if total else float("nan")


def summarise(df, column):
    y = df["expected_sif"].to_numpy()
    s = df[column].to_numpy()
    pred = s >= THRESHOLD
    tp = int((pred & y).sum())
    fp = int((pred & ~y).sum())
    fn = int((~pred & y).sum())
    return {
        "scorer": column,
        "AUC": roc_auc_score(y, s),
        "pair_acc": pair_accuracy(df, column),
        "recall": tp / (tp + fn) if tp + fn else float("nan"),
        "precision": tp / (tp + fp) if tp + fp else float("nan"),
        "accuracy": float((pred == y).mean()),
        "mean_SIF": float(s[y].mean()),
        "mean_nonSIF": float(s[~y].mean()),
    }


def main():
    df = pd.read_csv(EVAL_PATH)
    df["expected_sif"] = df["expected_sif"].astype(str).str.lower().isin(["true", "1", "yes"])
    print(f"Evaluation reports: {len(df)} (SIF {int(df.expected_sif.sum())}, non-SIF {int((~df.expected_sif).sum())})")

    scores = [score_report(text) for text in df["text"]]
    df = pd.concat([df, pd.DataFrame(scores)], axis=1)
    df.to_csv(RESULTS_PATH, index=False)

    scorers = ["old_soft_vote", "near_miss", "unsafe_act", "unsafe_condition", "eei_experimental", "sif_v2"]
    table = pd.DataFrame([summarise(df, c) for c in scorers])

    pd.set_option("display.width", 160)
    print("\n" + "=" * 90)
    print("SIF SCORING COMPARISON (threshold 50%)")
    print("=" * 90)
    print(table.to_string(index=False, float_format=lambda v: f"{v:.2f}"))

    print("\nNote: sif_v2 is rescaled so 50% = its validated threshold (0.34 raw).")
    print("\nTeam test set, per report (old soft vote -> sif_v2):")
    team = df[df["source"] == "team_test_set"]
    for _, r in team.iterrows():
        tag = "SIF    " if r.expected_sif else "non-SIF"
        print(f"  {tag}  {r.old_soft_vote*100:5.1f}% -> {r.sif_v2*100:5.1f}%  | {r.text[:70]}")

    print(f"\nPer-report results saved to {RESULTS_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
