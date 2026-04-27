"""
Base class for all autonomous agents.

Each agent follows the Observe -> Analyze -> Act -> Report pattern:
  1. observe(): Gather relevant data from the database
  2. analyze(): Use rules + LLM to detect anomalies and generate findings
  3. act():     Create alerts, send notifications based on findings
  4. run():     Orchestrate the full pipeline and persist results
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import AgentConfig, AgentRun, AgentFinding

logger = logging.getLogger(__name__)


@dataclass
class Finding:
    severity: str          # "info" | "warning" | "critical"
    title: str
    description: str = ""
    data: dict = field(default_factory=dict)


@dataclass
class AgentRunResult:
    findings: list[Finding] = field(default_factory=list)
    actions_count: int = 0
    summary: str = ""


class BaseAgent(ABC):
    agent_type: str = ""

    def __init__(self, config: AgentConfig):
        self.config = config
        self.agent_config = config.config or {}

    @abstractmethod
    def observe(self, db: Session, org_id: UUID) -> dict:
        """Gather relevant data from the database."""

    @abstractmethod
    def analyze(self, observations: dict) -> list[Finding]:
        """Analyze observations and produce findings."""

    @abstractmethod
    def act(self, db: Session, org_id: UUID, findings: list[Finding]) -> int:
        """Take actions based on findings. Returns count of actions taken."""

    def run(self, db: Session, org_id: UUID, trigger: str = "manual") -> AgentRun:
        """Full execution pipeline: observe -> analyze -> act -> persist."""
        run = AgentRun(
            agent_config_id=self.config.id,
            status="running",
            trigger=trigger,
        )
        db.add(run)
        db.flush()

        try:
            observations = self.observe(db, org_id)
            findings = self.analyze(observations)
            actions_count = self.act(db, org_id, findings)

            for f in findings:
                db.add(AgentFinding(
                    agent_run_id=run.id,
                    severity=f.severity,
                    title=f.title,
                    description=f.description,
                    data=f.data,
                ))

            summary = self._build_summary(findings)

            run.status = "completed"
            run.finished_at = datetime.now(timezone.utc)
            run.findings_count = len(findings)
            run.actions_count = actions_count
            run.findings_summary = summary

            self.config.last_run_at = datetime.now(timezone.utc)

            db.flush()
            logger.info(
                "Agent %s completed: %d findings, %d actions",
                self.agent_type, len(findings), actions_count,
            )

        except Exception as exc:
            run.status = "failed"
            run.finished_at = datetime.now(timezone.utc)
            run.error_message = str(exc)[:1000]
            db.flush()
            logger.exception("Agent %s failed", self.agent_type)

        return run

    def _build_summary(self, findings: list[Finding]) -> str:
        if not findings:
            return "Sin hallazgos nuevos."
        critical = sum(1 for f in findings if f.severity == "critical")
        warning = sum(1 for f in findings if f.severity == "warning")
        info = sum(1 for f in findings if f.severity == "info")
        parts = []
        if critical:
            parts.append(f"{critical} critico(s)")
        if warning:
            parts.append(f"{warning} advertencia(s)")
        if info:
            parts.append(f"{info} informativo(s)")
        return f"{len(findings)} hallazgos: {', '.join(parts)}."
