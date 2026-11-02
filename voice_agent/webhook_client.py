"""
webhook_client.py
-----------------
Cliente HTTP para despacho de Tool Calling em tempo real para webhooks externos.
Permite que o AtendiCalls Voice Agent execute funções definidas em sistemas externos
(CRMs, ERPs, sistemas externos, etc).
"""

import httpx
import logging
from typing import Any, Dict

logger = logging.getLogger("atendicalls.webhook")


class ToolWebhookDispatcher:
    def __init__(self, webhook_url: str, timeout_seconds: float = 6.0):
        self.webhook_url = webhook_url
        self.timeout = timeout_seconds

    async def dispatch(self, tool_name: str, arguments: Dict[str, Any], call_id: str = "", session_id: str = "") -> str:
        """Envia a requisição do Tool Call para o Webhook externo e aguarda o resultado."""
        if not self.webhook_url:
            return f"Ferramenta {tool_name} executada localmente (sem webhook configurado)."

        payload = {
            "call_id": call_id,
            "session_id": session_id,
            "tool_name": tool_name,
            "arguments": arguments,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(self.webhook_url, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    return str(data.get("result", data))
                else:
                    logger.warning(f"Webhook {self.webhook_url} retornou HTTP {response.status_code}: {response.text}")
                    return f"Erro ao executar {tool_name}: HTTP {response.status_code}"
        except httpx.TimeoutException:
            logger.error(f"Timeout ao chamar webhook {self.webhook_url} para {tool_name}")
            return f"Tempo esgotado ao executar {tool_name}."
        except Exception as e:
            logger.error(f"Erro ao chamar webhook {self.webhook_url}: {e}")
            return f"Falha na execução de {tool_name}: {e}"
