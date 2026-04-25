"""Six-signal merit scoring for devs only.

Weights:
  Tier 1 (Output + Quality)     55% (27.5% each)
  Tier 2 (Reliability)          25%
  Tier 3 (Handoff discipline)   12%
  Tier 4 (Initiative + Unblock) 8% (4% each)

Reliability auto-adjusts target for off-project hours.
"""
from dataclasses import dataclass


_STANDARD_WEEK_HOURS = 40.0


@dataclass
class MeritSignals:
    output_items_closed: int
    output_complexity_score: float
    quality_audit_score: float
    target_for_week: int
    consecutive_weeks_hit: int
    handoff_thoroughness: float
    initiative_items: int
    unblocked_others: int
    off_project_hours: float


@dataclass
class MeritScore:
    total: float
    output: float
    quality: float
    reliability: float
    handoff: float
    initiative: float
    unblock: float
    adjusted_target: float


def _output(s: MeritSignals) -> float:
    items = min(100.0, s.output_items_closed * 20.0)
    return 0.4 * items + 0.6 * s.output_complexity_score


def _reliability(s: MeritSignals):
    available = max(0.1, 1.0 - (s.off_project_hours / _STANDARD_WEEK_HOURS))
    target = max(1.0, s.target_for_week * available)
    hit = min(1.0, s.output_items_closed / target)
    return hit * 80.0 + min(20.0, s.consecutive_weeks_hit * 5.0), target


def compute_dev_merit(s: MeritSignals) -> MeritScore:
    output = _output(s)
    quality = s.quality_audit_score
    reliability, target = _reliability(s)
    handoff = s.handoff_thoroughness
    initiative = min(100.0, s.initiative_items * 25.0)
    unblock = min(100.0, s.unblocked_others * 25.0)
    total = (0.275*output + 0.275*quality + 0.25*reliability
             + 0.12*handoff + 0.04*initiative + 0.04*unblock)
    return MeritScore(
        total=round(total, 1),
        output=round(output, 1),
        quality=round(quality, 1),
        reliability=round(reliability, 1),
        handoff=round(handoff, 1),
        initiative=round(initiative, 1),
        unblock=round(unblock, 1),
        adjusted_target=round(target, 1),
    )
