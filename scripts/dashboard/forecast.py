"""Per-project forecast, traffic light, and metrics shown on every view.

Traffic light rules:
  delta <= 0   → GREEN (forecast on or before deadline)
  0 < delta ≤ 14 → YELLOW (slipping up to 2 weeks)
  delta > 14 or zero-pace with work-remaining → RED
"""
from dataclasses import dataclass
from datetime import date, timedelta
from enum import Enum
from typing import Optional


class TrafficLight(str, Enum):
    GREEN = "green"
    YELLOW = "yellow"
    RED = "red"


@dataclass
class ProjectMetrics:
    items_closed: int
    items_total: int
    percent_complete: float
    pace_per_week: float
    forecast_launch: Optional[date]
    deadline: date
    kickoff: date
    days_remaining: int
    total_project_duration: int
    days_of_work_required: Optional[int]
    days_delta: Optional[int]
    traffic_light: TrafficLight


def forecast_project(items_closed: int, items_total: int, items_closed_this_week: int,
                     deadline: date, kickoff: date, today: date) -> ProjectMetrics:
    items_left = max(0, items_total - items_closed)
    pct = (items_closed / items_total * 100.0) if items_total > 0 else 0.0
    days_remaining = (deadline - today).days
    total_duration = (deadline - kickoff).days
    pace = float(items_closed_this_week)

    # Zero pace with work remaining = RED, no forecast possible
    if pace <= 0 and items_left > 0:
        return ProjectMetrics(
            items_closed=items_closed, items_total=items_total,
            percent_complete=round(pct, 1),
            pace_per_week=pace, forecast_launch=None,
            deadline=deadline, kickoff=kickoff,
            days_remaining=days_remaining, total_project_duration=total_duration,
            days_of_work_required=None, days_delta=None,
            traffic_light=TrafficLight.RED,
        )

    # All items closed = done, GREEN
    if items_left == 0:
        return ProjectMetrics(
            items_closed=items_closed, items_total=items_total,
            percent_complete=100.0,
            pace_per_week=pace, forecast_launch=today,
            deadline=deadline, kickoff=kickoff,
            days_remaining=days_remaining, total_project_duration=total_duration,
            days_of_work_required=0, days_delta=(today - deadline).days,
            traffic_light=TrafficLight.GREEN,
        )

    weeks_needed = items_left / pace
    days_needed = int(weeks_needed * 7)
    forecast = today + timedelta(days=days_needed)
    delta = (forecast - deadline).days
    if delta <= 0:
        light = TrafficLight.GREEN
    elif delta <= 14:
        light = TrafficLight.YELLOW
    else:
        light = TrafficLight.RED

    return ProjectMetrics(
        items_closed=items_closed, items_total=items_total,
        percent_complete=round(pct, 1),
        pace_per_week=pace, forecast_launch=forecast,
        deadline=deadline, kickoff=kickoff,
        days_remaining=days_remaining, total_project_duration=total_duration,
        days_of_work_required=days_needed, days_delta=delta,
        traffic_light=light,
    )
