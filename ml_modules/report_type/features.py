"""
Explainable cue-word features for report type classification.

Each group is a yes/no signal the model can weigh alongside the MiniLM
embedding. Negated forms ("no injury", "nobody hurt") are excluded from the
Incident cues, because they point to a Near Miss instead.
"""

import re

import numpy as np

CUE_GROUPS = {
    "near_miss": r"almost|nearly|narrowly|just missed|missed (him|her|the|by)|close call|could have|luckily|"
                 r"no one (was )?(hurt|injured)|nobody (was )?(hurt|injured)|no injur\w*|not (hurt|injured)|"
                 r"in time|safely|stepped back|moved (back|away)|bach gay\w*|koi nahi",
    "incident": r"(?<!no )(?<!not )injur\w*|fractur\w*|burn(ed|t|s)\b|hospital\w*|stitch\w*|tanke|died|death|"
                r"fatal\w*|bruis\w*|sprain\w*|concussion|fainted|unconscious|admitted|first aid given|"
                r"lost (a|one|his) finger|crushed|dislocat\w*|scald\w*|kat gaya",
    "condition": r"\b(is|are|was found|found|seen|observed)\b.{0,40}\b(broken|damaged|missing|leaking|corroded|expired|"
                 r"not working|faulty|cracked|worn|choked|loose|jammed|bent|rusty|empty)\b|"
                 r"\bnot working\b|\bno (guard|handrail|barricade|signage|label|inspection)\b|"
                 r"\bcorrosion\b|\bleak(age|ing)\b|\bexpired\b|\bmissing\b|\bdefective\b",
    "act": r"\bwithout\b|not wearing|did not|didn't|bypass\w*|skipp\w*|ignor\w*|override|overrode|defeated|"
           r"using (his |a |the )?(mobile|phone)|nahi kiya|standing (under|in front|inside|in the)|"
           r"climbed|removed the|was seen|i saw|observed (a|the|contractor|worker|helper|operator|driver)|"
           r"\ballowed\b|instructed|started (the )?(job|work|pump)",
}

_PATTERNS = {name: re.compile(p, re.IGNORECASE) for name, p in CUE_GROUPS.items()}
CUE_SCALE = 0.5


def cue_features(texts) -> np.ndarray:
    rows = []
    for text in texts:
        text = str(text or "")
        rows.append([1.0 if _PATTERNS[name].search(text) else 0.0 for name in CUE_GROUPS])
    return np.asarray(rows, dtype=np.float32) * CUE_SCALE


def matched_cues(text: str) -> list:
    return [name for name, pattern in _PATTERNS.items() if pattern.search(text or "")]
