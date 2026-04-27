from app.services.agents.base import BaseAgent
from app.services.agents.price_monitor import PriceMonitorAgent

AGENT_REGISTRY: dict[str, type[BaseAgent]] = {
    "price_monitor": PriceMonitorAgent,
}


def get_agent_class(agent_type: str) -> type[BaseAgent] | None:
    return AGENT_REGISTRY.get(agent_type)


DEFAULT_AGENTS = [
    {
        "agent_type": "price_monitor",
        "name": "Monitor de Precios",
        "config": {
            "threshold_pct": 5.0,
            "lookback_days": 30,
            "auto_email": True,
        },
        "schedule": "after_invoice",
    },
]
