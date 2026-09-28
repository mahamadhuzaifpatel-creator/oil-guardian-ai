"""
SIF scoring v2 – EEI-style "control failure x high energy".

Why this replaced the equal-weight soft vote (see scripts/evaluate_sif.py):
  * On the 72-report paired evaluation set the Unsafe-Condition model scored
    ~92% for SIF and non-SIF reports alike (AUC 0.47), so it only added noise.
  * The Unsafe-Act model (trained to detect skipped/failed controls) was the
    strongest signal: AUC 0.79, pair accuracy 0.90.

How the score works:
  1. Control failure  = Unsafe-Act model probability, judged against the
     threshold chosen on that model's own validation set during training (0.34).
  2. High energy      = does the report mention a high-energy hazard from the
     EEI energy categories (height, electrical, pressure, lifting/suspended
     loads, moving machinery, vehicles, fire/hot work, toxic or confined
     atmosphere, excavation, bypassed safety devices)?
     If none is mentioned, the score is halved: a skipped control with no
     high-energy source (e.g. "ID card not worn") is not a fatality precursor.
  3. The score is rescaled so that 50% = the decision threshold.
     Tiers: High >= 70%, Moderate 50-70% (SIF-flagged), Low < 50% (not SIF).
     It is a ranking score, not a calibrated probability.

The other models' scores are still returned for transparency, but don't vote.
"""

import re

from ml_modules.unsafe_act.inference import SIF_THRESHOLD

NO_ENERGY_FACTOR = 0.5

HIGH_ENERGY_TERMS = {
    "Gravity / height": r"height|elevat\w*|scaffold\w*|ladder|roof|edge|fall\w*|harness|lanyard|monkey board|derrick\w*|mast|platform",
    "Electrical": r"live|energi[sz]ed|volt\w*|kv|electric\w*|panel|cable|lockout|loto|isolat\w*",
    "Pressure": r"pressur\w*|psv|relief valve|valve|flange|hose|pipeline|pipe|vessel|tank|separator|wellhead|well|kick|blowout|bop",
    "Lifting / suspended load": r"crane|lift\w*|sling|rigging|suspended|load|hoist|forklift",
    "Motion / machinery": r"drill\w*|collar|rotating|machine\w*|moving|conveyor|pump|compressor|guard|pinch",
    "Vehicles": r"vehicle|pickup|truck|driv\w*|speed\w*|seatbelt|reversing",
    "Fire / hot work": r"hot work|weld\w*|cutting|grind\w*|spark\w*|fire|flam\w*|ignit\w*|explos\w*",
    "Toxic / confined atmosphere": r"gas|h2s|toxic|oxygen|atmospher\w*|confined|vapou?r|chemical|acid|steam",
    "Excavation": r"excavat\w*|trench",
    "Safety systems / permits": r"permit|interlock|bypass\w*|gagged|trip",
}

_PATTERNS = {
    category: re.compile(rf"\b(?:{pattern})\b", re.IGNORECASE)
    for category, pattern in HIGH_ENERGY_TERMS.items()
}


def find_high_energy(text: str) -> dict:
    """Return {energy category: [matched words]} for the report text."""
    found = {}
    for category, pattern in _PATTERNS.items():
        matches = sorted({m.group(0).lower() for m in pattern.finditer(text or "")})
        if matches:
            found[category] = matches
    return found


def _to_display(raw: float) -> float:
    """Rescale so the decision threshold sits at 0.5 (monotonic, keeps ranking)."""
    t = SIF_THRESHOLD
    if raw < t:
        return 0.5 * raw / t
    return 0.5 + 0.5 * (raw - t) / (1 - t)


def score_sif(text: str, unsafe_act_confidence: float) -> dict:
    """unsafe_act_confidence is the Unsafe-Act model output in percent (0-100)."""
    control_failure = max(0.0, min(1.0, unsafe_act_confidence / 100))
    energy = find_high_energy(text)

    raw = control_failure if energy else control_failure * NO_ENERGY_FACTOR
    display = max(0.0, min(1.0, _to_display(raw)))

    # Tiers line up with the decision threshold (50% after rescaling):
    # every SIF-flagged report is Moderate or High, every non-SIF report is Low.
    if display >= 0.70:
        risk_tier = "High"
    elif display >= 0.50:
        risk_tier = "Moderate"
    else:
        risk_tier = "Low"

    return {
        "sif_probability": round(display, 4),
        "sif_percentage": round(display * 100, 1),
        "is_sif": raw >= SIF_THRESHOLD,
        "risk_tier": risk_tier,
        "method": "EEI v2: control failure (Unsafe-Act model) x high-energy check",
        "control_failure_probability": round(control_failure, 4),
        "high_energy_present": bool(energy),
        "high_energy_evidence": energy,
        "threshold": SIF_THRESHOLD,
    }
