"""
SupplyPulse AI Agent — conversational assistant with tool-calling.
Uses OpenAI function calling to query the organization's real data.
"""
import json
import logging
from datetime import date, timedelta
from uuid import UUID

from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from app.config import get_settings
from app.models import Invoice, LineItem, MasterItem, Alert

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Tool definitions for OpenAI function calling ────────────────────

AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_invoices",
            "description": "Search invoices by supplier name, date range, or status. Returns a list of invoices.",
            "parameters": {
                "type": "object",
                "properties": {
                    "supplier_name": {
                        "type": "string",
                        "description": "Filter by supplier name (partial match)",
                    },
                    "status": {
                        "type": "string",
                        "enum": ["pending", "processing", "completed", "failed"],
                        "description": "Filter by invoice status",
                    },
                    "from_date": {
                        "type": "string",
                        "format": "date",
                        "description": "Start date filter (YYYY-MM-DD)",
                    },
                    "to_date": {
                        "type": "string",
                        "format": "date",
                        "description": "End date filter (YYYY-MM-DD)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results to return (default 10)",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_spend_summary",
            "description": "Get total spend grouped by supplier for a given time period.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "description": "Number of days to look back (default 30)",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_price_history",
            "description": "Get the unit price history for a specific product/item over time.",
            "parameters": {
                "type": "object",
                "properties": {
                    "item_name": {
                        "type": "string",
                        "description": "Product name to search for (partial match supported)",
                    },
                },
                "required": ["item_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_price_alerts",
            "description": "Get recent price increase alerts for the organization.",
            "parameters": {
                "type": "object",
                "properties": {
                    "unread_only": {
                        "type": "boolean",
                        "description": "Only return unread alerts (default false)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of alerts to return (default 10)",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_suppliers",
            "description": "Compare prices for a specific product across different suppliers. Shows average, min, and max price per supplier.",
            "parameters": {
                "type": "object",
                "properties": {
                    "item_name": {
                        "type": "string",
                        "description": "Product name to compare across suppliers",
                    },
                },
                "required": ["item_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_top_products",
            "description": "Get the top products by total spend or by quantity purchased in a given period.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sort_by": {
                        "type": "string",
                        "enum": ["spend", "quantity"],
                        "description": "Sort by total spend or total quantity (default spend)",
                    },
                    "days": {
                        "type": "integer",
                        "description": "Number of days to look back (default 30)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum results (default 10)",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_monthly_supplier_report",
            "description": "Get a monthly breakdown of net purchases per supplier for a given year. Returns each supplier's spend per month (Jan-Dec) and yearly totals.",
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {
                        "type": "integer",
                        "description": "The year to report on (e.g. 2026). Defaults to current year.",
                    },
                    "supplier_name": {
                        "type": "string",
                        "description": "Optional: filter to a specific supplier (partial match)",
                    },
                },
            },
        },
    },
]


# ── Tool executor ───────────────────────────────────────────────────


class AgentToolExecutor:
    """Executes agent tools against the database for a specific organization."""

    def __init__(self, db: Session, org_id: UUID):
        self.db = db
        self.org_id = org_id

    def execute(self, tool_name: str, args: dict) -> str:
        """Execute a tool by name and return a JSON string result."""
        handler = getattr(self, f"_tool_{tool_name}", None)
        if not handler:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
        try:
            result = handler(**args)
            return json.dumps(result, default=str, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Tool {tool_name} error: {e}", exc_info=True)
            return json.dumps({"error": str(e)})

    # ── search_invoices ─────────────────────────────────────────────

    def _tool_search_invoices(
        self,
        supplier_name: str | None = None,
        status: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
        limit: int = 10,
    ):
        q = self.db.query(Invoice).filter(Invoice.organization_id == self.org_id)
        if supplier_name:
            q = q.filter(Invoice.supplier_name.ilike(f"%{supplier_name}%"))
        if status:
            q = q.filter(Invoice.status == status)
        if from_date:
            q = q.filter(Invoice.invoice_date >= from_date)
        if to_date:
            q = q.filter(Invoice.invoice_date <= to_date)

        invoices = q.order_by(Invoice.created_at.desc()).limit(limit).all()
        return {
            "count": len(invoices),
            "invoices": [
                {
                    "id": str(inv.id),
                    "supplier": inv.supplier_name,
                    "date": str(inv.invoice_date) if inv.invoice_date else None,
                    "number": inv.invoice_number,
                    "total": str(inv.total) if inv.total else None,
                    "currency": inv.currency,
                    "status": inv.status,
                    "line_items_count": len(inv.line_items),
                }
                for inv in invoices
            ],
        }

    # ── get_spend_summary ───────────────────────────────────────────

    def _tool_get_spend_summary(self, days: int = 30):
        cutoff = date.today() - timedelta(days=days)
        rows = (
            self.db.query(
                Invoice.supplier_name,
                func.sum(Invoice.total).label("total"),
                func.count(Invoice.id).label("count"),
            )
            .filter(
                Invoice.organization_id == self.org_id,
                Invoice.status == "completed",
                Invoice.invoice_date >= cutoff,
            )
            .group_by(Invoice.supplier_name)
            .order_by(func.sum(Invoice.total).desc())
            .all()
        )

        grand_total = sum(float(r.total or 0) for r in rows)
        return {
            "period_days": days,
            "from_date": str(cutoff),
            "to_date": str(date.today()),
            "grand_total": f"{grand_total:.2f}",
            "supplier_count": len(rows),
            "by_supplier": [
                {
                    "supplier": r.supplier_name or "Unknown",
                    "total_spend": f"{float(r.total):.2f}",
                    "invoice_count": r.count,
                    "pct_of_total": round(float(r.total) / grand_total * 100, 1) if grand_total else 0,
                }
                for r in rows
            ],
        }

    # ── get_price_history ───────────────────────────────────────────

    def _tool_get_price_history(self, item_name: str):
        mi = (
            self.db.query(MasterItem)
            .filter(
                MasterItem.organization_id == self.org_id,
                MasterItem.name.ilike(f"%{item_name}%"),
            )
            .first()
        )
        if not mi:
            return {"error": f"No product found matching '{item_name}'"}

        items = (
            self.db.query(LineItem)
            .join(Invoice)
            .filter(
                LineItem.master_item_id == mi.id,
                LineItem.unit_price.isnot(None),
            )
            .order_by(Invoice.invoice_date.desc())
            .limit(20)
            .all()
        )
        return {
            "item_name": mi.name,
            "data_points": len(items),
            "prices": [
                {
                    "date": str(li.invoice.invoice_date) if li.invoice.invoice_date else None,
                    "unit_price": f"{float(li.unit_price):.2f}",
                    "quantity": str(li.quantity) if li.quantity else None,
                    "supplier": li.invoice.supplier_name,
                }
                for li in items
            ],
        }

    # ── get_price_alerts ────────────────────────────────────────────

    def _tool_get_price_alerts(self, unread_only: bool = False, limit: int = 10):
        q = self.db.query(Alert).filter(Alert.organization_id == self.org_id)
        if unread_only:
            q = q.filter(Alert.is_read == False)  # noqa: E712
        alerts = q.order_by(Alert.created_at.desc()).limit(limit).all()
        return {
            "count": len(alerts),
            "alerts": [
                {
                    "item": a.master_item.name if a.master_item else "Unknown",
                    "message": a.message,
                    "old_price": f"{float(a.old_avg_price):.2f}" if a.old_avg_price else None,
                    "new_price": f"{float(a.new_price):.2f}" if a.new_price else None,
                    "pct_change": round(a.pct_change, 1) if a.pct_change else None,
                    "date": str(a.created_at.date()) if a.created_at else None,
                    "is_read": a.is_read,
                }
                for a in alerts
            ],
        }

    # ── compare_suppliers ───────────────────────────────────────────

    def _tool_compare_suppliers(self, item_name: str):
        mi = (
            self.db.query(MasterItem)
            .filter(
                MasterItem.organization_id == self.org_id,
                MasterItem.name.ilike(f"%{item_name}%"),
            )
            .first()
        )
        if not mi:
            return {"error": f"No product found matching '{item_name}'"}

        rows = (
            self.db.query(
                Invoice.supplier_name,
                func.avg(LineItem.unit_price).label("avg_price"),
                func.min(LineItem.unit_price).label("min_price"),
                func.max(LineItem.unit_price).label("max_price"),
                func.count(LineItem.id).label("purchase_count"),
            )
            .join(Invoice)
            .filter(
                LineItem.master_item_id == mi.id,
                LineItem.unit_price.isnot(None),
            )
            .group_by(Invoice.supplier_name)
            .order_by(func.avg(LineItem.unit_price))
            .all()
        )

        return {
            "item_name": mi.name,
            "supplier_count": len(rows),
            "suppliers": [
                {
                    "supplier": r.supplier_name or "Unknown",
                    "avg_price": round(float(r.avg_price), 2),
                    "min_price": round(float(r.min_price), 2),
                    "max_price": round(float(r.max_price), 2),
                    "purchases": r.purchase_count,
                }
                for r in rows
            ],
        }

    # ── get_top_products ────────────────────────────────────────────

    def _tool_get_top_products(
        self, sort_by: str = "spend", days: int = 30, limit: int = 10
    ):
        cutoff = date.today() - timedelta(days=days)
        q = (
            self.db.query(
                MasterItem.name,
                func.sum(LineItem.total_price).label("total_spend"),
                func.sum(LineItem.quantity).label("total_qty"),
                func.avg(LineItem.unit_price).label("avg_price"),
                func.count(LineItem.id).label("line_count"),
            )
            .join(LineItem, LineItem.master_item_id == MasterItem.id)
            .join(Invoice)
            .filter(
                MasterItem.organization_id == self.org_id,
                Invoice.invoice_date >= cutoff,
                Invoice.status == "completed",
            )
            .group_by(MasterItem.name)
        )

        if sort_by == "quantity":
            q = q.order_by(func.sum(LineItem.quantity).desc())
        else:
            q = q.order_by(func.sum(LineItem.total_price).desc())

        rows = q.limit(limit).all()
        return {
            "period_days": days,
            "sort_by": sort_by,
            "products": [
                {
                    "product": r.name,
                    "total_spend": f"{float(r.total_spend):.2f}" if r.total_spend else "0",
                    "total_quantity": f"{float(r.total_qty):.2f}" if r.total_qty else "0",
                    "avg_unit_price": round(float(r.avg_price), 2) if r.avg_price else None,
                    "purchase_count": r.line_count,
                }
                for r in rows
            ],
        }

    # ── get_monthly_supplier_report ─────────────────────────────────

    def _tool_get_monthly_supplier_report(
        self, year: int | None = None, supplier_name: str | None = None
    ):
        MONTH_NAMES = [
            "", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
            "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
        ]
        if year is None:
            year = date.today().year

        q = (
            self.db.query(
                Invoice.supplier_name,
                extract("month", Invoice.invoice_date).label("month"),
                func.sum(Invoice.total).label("total"),
                func.count(Invoice.id).label("count"),
            )
            .filter(
                Invoice.organization_id == self.org_id,
                Invoice.status == "completed",
                Invoice.invoice_date.isnot(None),
                extract("year", Invoice.invoice_date) == year,
            )
        )
        if supplier_name:
            q = q.filter(Invoice.supplier_name.ilike(f"%{supplier_name}%"))

        rows = (
            q.group_by(Invoice.supplier_name, extract("month", Invoice.invoice_date))
            .order_by(Invoice.supplier_name, extract("month", Invoice.invoice_date))
            .all()
        )

        # Pivot into supplier → {month: total}
        supplier_data: dict[str, dict[int, float]] = {}
        for row in rows:
            name = row.supplier_name or "Unknown"
            month = int(row.month)
            if name not in supplier_data:
                supplier_data[name] = {}
            supplier_data[name][month] = float(row.total or 0)

        # Build result
        suppliers = []
        for name in sorted(supplier_data.keys()):
            months = supplier_data[name]
            year_total = sum(months.values())
            month_breakdown = {
                MONTH_NAMES[m]: f"${months.get(m, 0):,.2f}"
                for m in range(1, 13)
                if months.get(m, 0) > 0
            }
            suppliers.append({
                "supplier": name,
                "year_total": f"${year_total:,.2f}",
                "months": month_breakdown,
            })

        # Sort by total desc
        suppliers.sort(key=lambda s: float(s["year_total"].replace("$", "").replace(",", "")), reverse=True)

        grand_total = sum(
            float(s["year_total"].replace("$", "").replace(",", ""))
            for s in suppliers
        )

        return {
            "year": year,
            "grand_total": f"${grand_total:,.2f}",
            "supplier_count": len(suppliers),
            "suppliers": suppliers,
        }


# ── Agent system prompt ─────────────────────────────────────────────

SYSTEM_PROMPT = """You are SupplyPulse AI, an intelligent procurement assistant for restaurants.
You help users understand their supplier invoices, track spending, monitor price changes, and optimize purchasing decisions.

You have access to the organization's real invoice data through tools. Always use tools to get real data — NEVER make up numbers.

Guidelines:
- Be concise and actionable
- Format currency amounts clearly with $ symbol
- When comparing prices, highlight the best deal
- Proactively suggest cost-saving opportunities when relevant
- If the user asks in Spanish, respond in Spanish
- If the user asks in English, respond in English
- Use bullet points or numbered lists for structured data
- Keep responses under 300 words unless the user asks for detailed analysis
- When showing multiple items, format them as a clear list
"""


# ── Main agent runner ───────────────────────────────────────────────


def run_agent(
    messages: list[dict],
    db: Session,
    org_id: UUID,
    max_tool_rounds: int = 5,
) -> str:
    """
    Run the conversational agent with multi-turn tool calling.

    Args:
        messages: Conversation history [{role, content}, ...]
        db: SQLAlchemy session
        org_id: Organization UUID for data scoping
        max_tool_rounds: Max consecutive tool-calling rounds

    Returns:
        The final assistant message text.
    """
    if not settings.openai_api_key:
        return "El agente AI no está configurado. Configura OPENAI_API_KEY para habilitarlo."

    client = OpenAI(api_key=settings.openai_api_key)
    executor = AgentToolExecutor(db, org_id)

    # Build full conversation with system prompt
    full_messages: list[ChatCompletionMessageParam] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *messages,  # type: ignore
    ]

    for round_num in range(max_tool_rounds):
        logger.info(f"Agent round {round_num + 1}, messages: {len(full_messages)}")

        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=full_messages,
            tools=AGENT_TOOLS,
            tool_choice="auto",
        )

        choice = response.choices[0]

        # If no tool calls, we have the final text response
        if not choice.message.tool_calls:
            return choice.message.content or ""

        # Process each tool call
        full_messages.append(choice.message)  # type: ignore

        for tool_call in choice.message.tool_calls:
            fn_name = tool_call.function.name
            fn_args = json.loads(tool_call.function.arguments)
            logger.info(f"Agent tool call: {fn_name}({json.dumps(fn_args, ensure_ascii=False)})")

            result = executor.execute(fn_name, fn_args)
            logger.info(f"Tool result length: {len(result)} chars")

            full_messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result,
            })

    # If we exhausted tool rounds, force a final text answer
    logger.warning("Agent exhausted max tool rounds, forcing final response")
    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=full_messages,
    )
    return response.choices[0].message.content or ""
