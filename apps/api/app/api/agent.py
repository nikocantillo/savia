"""
Agent chat endpoint — conversational AI assistant.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.deps import get_current_user
from app.models import User
from app.services.agent import run_agent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
def agent_chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send a message to the SupplyPulse AI agent.
    The agent can query invoices, spending, prices, and alerts
    using the organization's real data.
    """
    if not req.messages:
        raise HTTPException(400, "Messages list cannot be empty")

    # Validate that the last message is from the user
    if req.messages[-1].role != "user":
        raise HTTPException(400, "Last message must be from the user")

    # Convert to dicts for the agent
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    try:
        reply = run_agent(
            messages=messages,
            db=db,
            org_id=current_user.organization_id,
        )
        return ChatResponse(reply=reply)
    except Exception as e:
        logger.exception("Agent chat error")
        raise HTTPException(500, f"Agent error: {str(e)[:200]}")
