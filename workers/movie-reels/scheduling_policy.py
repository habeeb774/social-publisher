"""Validate human approval and licensing before scheduling a movie reel."""
from datetime import datetime

DAILY_LIMIT = 5

def may_schedule(*, rights_status: str, approved: bool, page_id: str | None,
                 scheduled_at: datetime, existing_slots: list[datetime]) -> tuple[bool, str]:
    if rights_status != "verified":
        return False, "rights_not_verified"
    if not approved:
        return False, "clip_not_approved"
    if not page_id:
        return False, "page_not_selected"
    if scheduled_at.tzinfo is None:
        return False, "timezone_required"
    from zoneinfo import ZoneInfo
    local_date = scheduled_at.astimezone(ZoneInfo("Asia/Riyadh")).date()
    if any(slot.tzinfo is None for slot in existing_slots):
        return False, "timezone_required"
    used = sum(slot.astimezone(ZoneInfo("Asia/Riyadh")).date() == local_date for slot in existing_slots)
    if used >= DAILY_LIMIT:
        return False, "daily_limit_reached"
    return True, "ready_for_reviewed_schedule"
