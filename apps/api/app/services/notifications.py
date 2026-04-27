"""
Notification service: send email notifications for alerts and summaries.
Uses SMTP when configured, otherwise logs (dev mode).
"""
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import get_settings
from app.database import SessionLocal
from app.models import (
    User, Organization, NotificationPreference, NotificationLog, Alert,
)

logger = logging.getLogger(__name__)


def _get_smtp_connection():
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_user:
        return None
    try:
        if settings.smtp_port == 465:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port)
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
            server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        return server
    except Exception as e:
        logger.warning("SMTP connection failed: %s", e)
        return None


def send_email(to_email: str, subject: str, html_body: str, org_id=None, user_id=None):
    settings = get_settings()

    smtp = _get_smtp_connection()
    if smtp:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = settings.smtp_from or settings.smtp_user
            msg["To"] = to_email
            msg.attach(MIMEText(html_body, "html"))
            smtp.sendmail(msg["From"], [to_email], msg.as_string())
            smtp.quit()
            logger.info("Email sent to %s: %s", to_email, subject)
        except Exception as e:
            logger.error("Failed to send email to %s: %s", to_email, e)
            _log_notification(org_id, user_id, "email", subject, "failed")
            return
    else:
        logger.info("[EMAIL DEV] To: %s | Subject: %s", to_email, subject)

    _log_notification(org_id, user_id, "email", subject, "sent")


def _log_notification(org_id, user_id, channel, subject, status):
    try:
        db = SessionLocal()
        log = NotificationLog(
            organization_id=org_id,
            user_id=user_id,
            channel=channel,
            subject=subject,
            status=status,
        )
        db.add(log)
        db.commit()
        db.close()
    except Exception:
        pass


def notify_alert(alert: Alert, db=None):
    """Send email notification for a new alert to users who opted in."""
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        users = (
            db.query(User)
            .filter(User.organization_id == alert.organization_id)
            .all()
        )
        for user in users:
            pref = db.query(NotificationPreference).filter(
                NotificationPreference.user_id == user.id
            ).first()
            if pref and not pref.email_alerts:
                continue

            to_email = (pref.notification_email if pref and pref.notification_email else user.email)

            ALERT_LABELS = {
                "price_increase": "Aumento de Precio",
                "negotiated_price_exceeded": "Precio Pactado Excedido",
                "new_supplier": "Nuevo Proveedor",
                "unusual_volume": "Volumen Inusual",
                "low_margin": "Margen Bajo",
            }
            alert_label = ALERT_LABELS.get(alert.alert_type, "Alerta")

            html = f"""
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:20px 24px;border-radius:12px 12px 0 0;">
                    <h2 style="color:#ffffff;margin:0;font-size:20px;">Sabia AI — {alert_label}</h2>
                </div>
                <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 12px 12px;">
                    <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;border-radius:8px;">
                        <p style="margin:0;font-size:15px;color:#374151;">{alert.message}</p>
                    </div>
                    <p style="margin-top:16px;color:#6b7280;font-size:13px;">
                        Inicia sesión en Sabia AI para ver más detalles y tomar acción.
                    </p>
                </div>
            </div>
            """
            send_email(
                to_email=to_email,
                subject=f"[Sabia AI] {alert_label}",
                html_body=html,
                org_id=str(alert.organization_id),
                user_id=str(user.id),
            )
    finally:
        if close_db:
            db.close()


def send_daily_summary(org_id: str):
    """Send daily summary email to subscribed users."""
    db = SessionLocal()
    try:
        org = db.query(Organization).get(org_id)
        if not org:
            return

        unread_alerts = (
            db.query(Alert)
            .filter(Alert.organization_id == org.id, Alert.is_read == False)
            .count()
        )

        users = db.query(User).filter(User.organization_id == org.id).all()
        for user in users:
            pref = db.query(NotificationPreference).filter(
                NotificationPreference.user_id == user.id
            ).first()
            if not pref or not pref.email_daily_summary:
                continue

            to_email = pref.notification_email if pref.notification_email else user.email

            html = f"""
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:20px 24px;border-radius:12px 12px 0 0;">
                    <h2 style="color:#ffffff;margin:0;font-size:20px;">Sabia AI — Resumen Diario</h2>
                </div>
                <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 12px 12px;">
                    <h3 style="color:#1a1a1a;margin:0 0 12px;">{org.name}</h3>
                    <div style="background:#f9fafb;padding:16px;border-radius:8px;">
                        <p style="margin:0;"><strong>Alertas sin leer:</strong> {unread_alerts}</p>
                    </div>
                    <p style="margin-top:16px;color:#6b7280;font-size:13px;">
                        Inicia sesión en Sabia AI para ver el detalle completo.
                    </p>
                </div>
            </div>
            """
            send_email(
                to_email=to_email,
                subject=f"[Sabia AI] Resumen diario - {org.name}",
                html_body=html,
                org_id=str(org.id),
                user_id=str(user.id),
            )
    finally:
        db.close()
