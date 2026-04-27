from app.services.agents.base import BaseAgent
from app.services.agents.price_monitor import PriceMonitorAgent
from app.services.agents.supplier_eval import SupplierEvalAgent

AGENT_REGISTRY: dict[str, type[BaseAgent]] = {
    "price_monitor": PriceMonitorAgent,
    "supplier_eval": SupplierEvalAgent,
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
    {
        "agent_type": "supplier_eval",
        "name": "Evaluador de Proveedores",
        "config": {
            "lookback_days": 60,
            "min_invoices": 2,
        },
        "schedule": "after_invoice",
    },
]
