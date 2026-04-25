import pytest
from datetime import date
from scripts.dashboard.forecast import (
    forecast_project, ProjectMetrics, TrafficLight,
)


def test_on_pace_green():
    m = forecast_project(items_closed=10, items_total=30, items_closed_this_week=5,
                         deadline=date(2026, 7, 30), kickoff=date(2026, 4, 1), today=date(2026, 4, 23))
    assert m.traffic_light == TrafficLight.GREEN
    assert m.percent_complete == pytest.approx(33.3, abs=1.0)


def test_behind_red():
    m = forecast_project(items_closed=5, items_total=50, items_closed_this_week=1,
                         deadline=date(2026, 7, 30), kickoff=date(2026, 4, 1), today=date(2026, 4, 23))
    assert m.traffic_light == TrafficLight.RED


def test_percent_complete():
    m = forecast_project(items_closed=10, items_total=40, items_closed_this_week=5,
                         deadline=date(2026, 7, 30), kickoff=date(2026, 4, 1), today=date(2026, 4, 23))
    assert m.percent_complete == 25.0


def test_days_remaining():
    m = forecast_project(items_closed=10, items_total=40, items_closed_this_week=5,
                         deadline=date(2026, 7, 30), kickoff=date(2026, 4, 1), today=date(2026, 4, 23))
    assert m.days_remaining == 98
    assert m.total_project_duration == 120


def test_days_of_work_required_at_pace():
    m = forecast_project(items_closed=10, items_total=40, items_closed_this_week=5,
                         deadline=date(2026, 7, 30), kickoff=date(2026, 4, 1), today=date(2026, 4, 23))
    # 30 items left at 5/week = 6 weeks = 42 work-days
    assert m.days_of_work_required == 42


def test_zero_pace_red():
    m = forecast_project(items_closed=10, items_total=40, items_closed_this_week=0,
                         deadline=date(2026, 7, 30), kickoff=date(2026, 4, 1), today=date(2026, 4, 23))
    assert m.traffic_light == TrafficLight.RED
    assert m.forecast_launch is None
