"""
Autonomous agent management endpoints.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.api.deps import get_current_user
from app.models import User, AgentConfig, AgentRun, AgentFinding
from app.schemas import (
    AgentConfigOut, AgentConfigUpdate,
    AgentRunOut, AgentRunDetailOut,
)

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentConfigOut])
def list_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all agent configs for the org, with last run info."""
    configs = (
        db.query(AgentConfig)
        .filter(AgentConfig.organization_id == current_user.organization_id)
        .order_by(AgentConfig.created_at)
        .all()
    )

    results = []
    for c in configs:
        out = AgentConfigOut.model_validate(c)
        last_run = (
            db.query(AgentRun)
            .filter(AgentRun.agent_config_id == c.id)
            .order_by(AgentRun.started_at.desc())
            .first()
        )
        if last_run:
            out.last_run_status = last_run.status
            out.last_run_findings = last_run.findings_count
        results.append(out)

    return results


@router.post("/setup")
def setup_default_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create default agents for the org if they don't exist."""
    from app.services.agents import DEFAULT_AGENTS

    org_id = current_user.organization_id
    created = 0

    for agent_def in DEFAULT_AGENTS:
        existing = (
            db.query(AgentConfig)
            .filter(
                AgentConfig.organization_id == org_id,
                AgentConfig.agent_type == agent_def["agent_type"],
            )
            .first()
        )
        if existing:
            continue

        config = AgentConfig(
            organization_id=org_id,
            agent_type=agent_def["agent_type"],
            name=agent_def["name"],
            config=agent_def.get("config", {}),
            schedule=agent_def.get("schedule", "after_invoice"),
        )
        db.add(config)
        created += 1

    db.commit()
    return {"created": created}


@router.put("/{agent_id}", response_model=AgentConfigOut)
def update_agent(
    agent_id: uuid.UUID,
    body: AgentConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = (
        db.query(AgentConfig)
        .filter(
            AgentConfig.id == agent_id,
            AgentConfig.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not config:
        raise HTTPException(404, "Agent not found")

    if body.is_enabled is not None:
        config.is_enabled = body.is_enabled
    if body.config is not None:
        config.config = body.config
    if body.schedule is not None:
        config.schedule = body.schedule

    db.commit()
    db.refresh(config)
    return AgentConfigOut.model_validate(config)


@router.post("/{agent_id}/trigger", response_model=AgentRunOut)
def trigger_agent(
    agent_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger an immediate agent run."""
    config = (
        db.query(AgentConfig)
        .filter(
            AgentConfig.id == agent_id,
            AgentConfig.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not config:
        raise HTTPException(404, "Agent not found")

    from app.services.agents import get_agent_class

    agent_cls = get_agent_class(config.agent_type)
    if not agent_cls:
        raise HTTPException(400, f"Unknown agent type: {config.agent_type}")

    agent = agent_cls(config)
    result = agent.run(db, config.organization_id, trigger="manual")
    db.commit()

    last_run = (
        db.query(AgentRun)
        .filter(AgentRun.agent_config_id == config.id)
        .order_by(AgentRun.started_at.desc())
        .first()
    )
    if not last_run:
        raise HTTPException(500, "Agent run failed to persist")

    return AgentRunOut.model_validate(last_run)


@router.get("/{agent_id}/runs", response_model=list[AgentRunOut])
def list_agent_runs(
    agent_id: uuid.UUID,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = (
        db.query(AgentConfig)
        .filter(
            AgentConfig.id == agent_id,
            AgentConfig.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not config:
        raise HTTPException(404, "Agent not found")

    runs = (
        db.query(AgentRun)
        .filter(AgentRun.agent_config_id == agent_id)
        .order_by(AgentRun.started_at.desc())
        .limit(limit)
        .all()
    )
    return [AgentRunOut.model_validate(r) for r in runs]


@router.get("/{agent_id}/runs/{run_id}", response_model=AgentRunDetailOut)
def get_agent_run_detail(
    agent_id: uuid.UUID,
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = (
        db.query(AgentConfig)
        .filter(
            AgentConfig.id == agent_id,
            AgentConfig.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not config:
        raise HTTPException(404, "Agent not found")

    run = (
        db.query(AgentRun)
        .options(joinedload(AgentRun.findings))
        .filter(
            AgentRun.id == run_id,
            AgentRun.agent_config_id == agent_id,
        )
        .first()
    )
    if not run:
        raise HTTPException(404, "Run not found")

    return AgentRunDetailOut.model_validate(run)
