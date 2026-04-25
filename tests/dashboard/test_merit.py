from scripts.dashboard.merit import compute_dev_merit, MeritSignals


def test_high_everything_scores_high():
    s = MeritSignals(
        output_items_closed=5, output_complexity_score=75, quality_audit_score=90,
        target_for_week=3, consecutive_weeks_hit=4, handoff_thoroughness=85,
        initiative_items=2, unblocked_others=1, off_project_hours=0,
    )
    score = compute_dev_merit(s)
    assert score.total >= 80


def test_off_project_adjusts_reliability():
    no_off = MeritSignals(1, 30, 70, 3, 0, 70, 0, 0, 0)
    high_off = MeritSignals(1, 30, 70, 3, 0, 70, 0, 0, 20)
    s1 = compute_dev_merit(no_off)
    s2 = compute_dev_merit(high_off)
    assert s2.total > s1.total
    assert s2.reliability > s1.reliability


def test_zero_output_low():
    s = MeritSignals(0, 0, 0, 3, 0, 30, 0, 0, 0)
    assert compute_dev_merit(s).total < 40


def test_tier_ordering():
    high_output = MeritSignals(5, 80, 80, 3, 2, 50, 0, 0, 0)
    high_initiative = MeritSignals(0, 0, 0, 3, 0, 50, 10, 10, 0)
    assert compute_dev_merit(high_output).total > compute_dev_merit(high_initiative).total
