"""
Celery tasks for scheduled email notifications (daily/weekly summaries).
"""
import logging
from app.tasks.celery_app import celery_app
from app.database import SessionLocal
from app.models import Organization

logger = logging.getLogger(__name__)


@celery_app.task
def send_daily_summaries():
    """Send daily summary emails to all orgs with subscribed users."""
    from app.services.notifications import send_daily_summary

    db = SessionLocal()
    try:
        orgs = db.query(Organization).all()
        for org in orgs:
            try:
                send_daily_summary(str(org.id))
            except Exception as e:
                logger.warning("Daily summary failed for org %s: %s", org.name, e)
    finally:
        db.close()
