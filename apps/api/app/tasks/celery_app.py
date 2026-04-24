"""
Celery application configuration.
"""
from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "savia",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.tasks.invoice_tasks",
        "app.tasks.alert_tasks",
        "app.tasks.notification_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Beat schedule – run daily alert check every day at 7:00 UTC
celery_app.conf.beat_schedule = {
    "daily-alert-check": {
        "task": "app.tasks.alert_tasks.compute_daily_alerts_all_orgs",
        "schedule": crontab(hour=7, minute=0),
    },
    "daily-email-summary": {
        "task": "app.tasks.notification_tasks.send_daily_summaries",
        "schedule": crontab(hour=8, minute=0),
    },
}
