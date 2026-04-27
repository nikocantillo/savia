"""
Celery tasks for running autonomous agents.
"""
import logging
from uuid import UUID

from app.tasks.celery_app import celery_app
from app.database import SessionLocal
from app.models import AgentConfig, Organization

logger = logging.getLogger(__name__)


@celery_app.task
def run_agent_task(agent_config_id: str, trigger: str = "manual"):
    """Execute a single agent by its config ID."""
    from app.services.agents import get_agent_class

    db = SessionLocal()
    try:
        config = db.get(AgentConfig, UUID(agent_config_id))
        if not config:
            logger.error("AgentConfig %s not found", agent_config_id)
            return

        if not config.is_enabled and trigger != "manual":
            logger.info("Agent %s is disabled, skipping", config.name)
            return

        agent_cls = get_agent_class(config.agent_type)
        if not agent_cls:
            logger.error("Unknown agent type: %s", config.agent_type)
            return

        agent = agent_cls(config)
        run = agent.run(db, config.organization_id, trigger=trigger)
        db.commit()

        logger.info(
            "Agent '%s' run completed: status=%s, findings=%d",
            config.name, run.status, run.findings_count,
        )
    except Exception:
        db.rollback()
        logger.exception("Failed to run agent %s", agent_config_id)
    finally:
        db.close()


@celery_app.task
def run_org_agents(org_id: str, trigger: str = "after_invoice"):
    """Run all enabled agents for an organization that match the trigger."""
    db = SessionLocal()
    try:
        configs = (
            db.query(AgentConfig)
            .filter(
                AgentConfig.organization_id == UUID(org_id),
                AgentConfig.is_enabled == True,
            )
            .all()
        )
        for config in configs:
            if trigger == "scheduled" or config.schedule == trigger or config.schedule == "all":
                run_agent_task.delay(str(config.id), trigger)

    finally:
        db.close()


@celery_app.task
def run_all_scheduled_agents():
    """Entry point for Celery Beat: run all agents with scheduled trigger."""
    db = SessionLocal()
    try:
        orgs = db.query(Organization).all()
        for org in orgs:
            run_org_agents.delay(str(org.id), "scheduled")
    finally:
        db.close()
