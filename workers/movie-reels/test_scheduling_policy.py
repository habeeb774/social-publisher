import unittest
from datetime import datetime, timezone
from scheduling_policy import may_schedule

WHEN = datetime(2026, 10, 15, 9, tzinfo=timezone.utc)
BASE = dict(rights_status="verified", approved=True, page_id="selected-page",
            scheduled_at=WHEN, existing_slots=[])

class SchedulePolicyTests(unittest.TestCase):
    def test_approved_and_licensed(self):
        self.assertTrue(may_schedule(**BASE)[0])

    def test_unlicensed_rejected(self):
        self.assertEqual(may_schedule(**(BASE | {"rights_status": "pending"}))[1], "rights_not_verified")

    def test_missing_approval_rejected(self):
        self.assertFalse(may_schedule(**(BASE | {"approved": False}))[0])

    def test_missing_page_rejected(self):
        self.assertFalse(may_schedule(**(BASE | {"page_id": None}))[0])

    def test_daily_limit(self):
        self.assertEqual(may_schedule(**(BASE | {"existing_slots": [WHEN] * 5}))[1], "daily_limit_reached")

    def test_naive_time_rejected(self):
        self.assertEqual(may_schedule(**(BASE | {"scheduled_at": WHEN.replace(tzinfo=None)}))[1], "timezone_required")

if __name__ == "__main__":
    unittest.main()
