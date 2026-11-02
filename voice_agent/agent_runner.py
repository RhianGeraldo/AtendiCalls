"""
agent_runner.py
---------------
Runner e Daemon do AtendiCalls Voice Agent.
Monitora chamadas do AtendiCalls via SSE, atende automaticamente chamadas inbound
com o perfil configurado e permite realizar chamadas ativas (outbound) de IA.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import AsyncIterator, Dict, Optional

import httpx
from dotenv import load_dotenv

from engine import VoiceAgentSession

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("atendicalls.runner")

ATENDICALLS_URL = os.getenv("ATENDICALLS_URL", "http://127.0.0.1:8080").rstrip("/")
ATENDICALLS_SESSION_ID = os.getenv("ATENDICALLS_SESSION_ID", "04c7d9f8b9c80ac053114ba48f80f736")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
PCM_CHANNEL = "pcm"


def carregar_perfil(nome_perfil: str) -> dict:
    caminho = BASE_DIR / "profiles" / f"{nome_perfil}.json"
    if not caminho.exists():
        raise FileNotFoundError(f"Perfil '{nome_perfil}' não encontrado em {caminho}")
    with open(caminho, "r", encoding="utf-8") as f:
        return json.load(f)


class WebRTCBridge:
    def __init__(self, pc, dc):
        self.pc = pc
        self.dc = dc
        self.incoming = asyncio.Queue()
        dc.on("message", lambda m: self.incoming.put_nowait(m) if isinstance(m, bytes) else None)

    async def send(self, pcm: bytes) -> None:
        try:
            self.dc.send(pcm)
        except Exception:
            pass

    async def receive(self) -> Optional[bytes]:
        try:
            return await self.incoming.get()
        except asyncio.CancelledError:
            return None

    async def close(self) -> None:
        try:
            await self.pc.close()
        except Exception:
            pass


async def negociar_webrtc(session_id: str, call_id: str) -> WebRTCBridge:
    from aiortc import RTCConfiguration, RTCPeerConnection, RTCSessionDescription

    pc = RTCPeerConnection(RTCConfiguration(iceServers=[]))
    dc = pc.createDataChannel(PCM_CHANNEL, ordered=True)
    opened = asyncio.Event()
    dc.on("open", opened.set)

    bridge = WebRTCBridge(pc, dc)
    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            f"{ATENDICALLS_URL}/api/sessions/{session_id}/calls/{call_id}/webrtc",
            json={"sdp_offer": pc.localDescription.sdp},
            headers={"X-Client-Id": "voice-agent-daemon"}
        )
        if r.status_code != 200:
            await pc.close()
            raise RuntimeError(f"Erro na negociação WebRTC: HTTP {r.status_code} - {r.text}")

        answer_sdp = r.json().get("sdp_answer")
        await pc.setRemoteDescription(RTCSessionDescription(sdp=answer_sdp, type="answer"))
        await asyncio.wait_for(opened.wait(), timeout=10.0)
        logger.info(f"Canal WebRTC de áudio PCM aberto para a chamada {call_id}.")

    return bridge


async def encerrar_chamada(session_id: str, call_id: str):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.delete(
                f"{ATENDICALLS_URL}/api/sessions/{session_id}/calls/{call_id}",
                headers={"X-Client-Id": "voice-agent-daemon"}
            )
        logger.info(f"Chamada {call_id} encerrada no AtendiCalls.")
    except Exception as e:
        logger.debug(f"Erro ao encerrar chamada {call_id}: {e}")


async def escutar_eventos_sse() -> AsyncIterator[dict]:
    while True:
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("GET", f"{ATENDICALLS_URL}/api/events") as r:
                    async for line in r.aiter_lines():
                        if line.startswith("data: "):
                            try:
                                yield json.loads(line[6:])
                            except Exception:
                                continue
        except Exception as e:
            logger.debug(f"Reconectando SSE de eventos do AtendiCalls: {e}")
            await asyncio.sleep(2.0)


async def gerenciar_chamada_inbound(session_id: str, call_id: str, peer: str, profile_name: str):
    profile = carregar_perfil(profile_name)
    logger.info(f"Atendendo chamada inbound {call_id} de {peer} com perfil '{profile['name']}'...")

    bridge: Optional[WebRTCBridge] = None
    try:
        # 1. Aceita a chamada no AtendiCalls
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                f"{ATENDICALLS_URL}/api/sessions/{session_id}/calls/{call_id}/accept",
                headers={"X-Client-Id": "voice-agent-daemon"}
            )
            if r.status_code != 200:
                logger.error(f"Falha ao aceitar chamada {call_id}: {r.status_code} {r.text}")
                return

        # 2. Conecta WebRTC de áudio
        bridge = await negociar_webrtc(session_id, call_id)

        # 3. Prepara a sessão de IA
        greeting = profile.get("inbound_greeting", "Olá! Em que posso ajudar?")
        delay = float(profile.get("inbound_delay_seconds", 1.5))

        async def hangup(motivo: str):
            await encerrar_chamada(session_id, call_id)

        session = VoiceAgentSession(
            api_key=GEMINI_API_KEY,
            profile=profile,
            send_pcm_cb=bridge.send,
            receive_pcm_cb=bridge.receive,
            hangup_cb=hangup,
            call_id=call_id,
            session_id=session_id,
            contexto_extra=f"Chamada recebida via WhatsApp de {peer}.",
            saudacao_inicial=greeting
        )

        # 4. Monitor remoto de encerramento via SSE
        async def monitor():
            async for ev in escutar_eventos_sse():
                if session.desligar_event.is_set():
                    break
                if ev.get("id") == call_id:
                    if ev.get("type") == "call-ended" or ev.get("status") in ("ended", "failed", "rejected"):
                        logger.info(f"Chamada {call_id} finalizada remotamente pelo peer.")
                        session.desligar_event.set()
                        break

        monitor_task = asyncio.create_task(monitor())
        try:
            await asyncio.sleep(delay)
            await session.run()
        finally:
            monitor_task.cancel()

    finally:
        if bridge:
            await bridge.close()
        await encerrar_chamada(session_id, call_id)
        logger.info(f"Ciclo da chamada {call_id} concluído.")


async def run_daemon(profile_name: str, session_id: str):
    logger.info(f"🎧 Daemon Voice Agent iniciado! Perfil ativo: {profile_name} | Sessão: {session_id}")
    active_calls = set()

    async for ev in escutar_eventos_sse():
        ev_type = ev.get("type")
        call_id = ev.get("id")

        if ev_type == "incoming-call" and call_id and call_id not in active_calls:
            active_calls.add(call_id)
            peer = ev.get("peer", "desconhecido")

            async def wrapper(cid=call_id, p=peer):
                try:
                    await gerenciar_chamada_inbound(session_id, cid, p, profile_name)
                except Exception as ex:
                    logger.error(f"Erro ao gerenciar inbound {cid}: {ex}")
                finally:
                    active_calls.discard(cid)

            asyncio.create_task(wrapper())


async def run_outbound(phone: str, profile_name: str, session_id: str, motivo: str):
    profile = carregar_perfil(profile_name)
    clean_phone = "".join(c for c in phone if c.isdigit())
    logger.info(f"Iniciando chamada de voz IA para {clean_phone} usando perfil '{profile['name']}'...")

    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            f"{ATENDICALLS_URL}/api/sessions/{session_id}/calls",
            json={"phone": clean_phone},
            headers={"X-Client-Id": "voice-agent-daemon"}
        )
        if r.status_code != 200:
            logger.error(f"Falha na discagem: {r.status_code} {r.text}")
            return
        call_id = r.json()["call"]["callId"]
        logger.info(f"Chamada discada no AtendiCalls. CallID: {call_id}. Aguardando atendimento...")

    # Aguarda atendimento via SSE
    connected = False
    bridge: Optional[WebRTCBridge] = None

    async for ev in escutar_eventos_sse():
        if ev.get("id") == call_id:
            status = ev.get("status")
            if status == "connected":
                connected = True
                break
            elif status in ("ended", "rejected", "failed"):
                logger.warning(f"Chamada não atendida: {status}")
                return

    if not connected:
        return

    try:
        bridge = await negociar_webrtc(session_id, call_id)
        greeting = profile.get("outbound_greeting", "Olá! Tudo bem?")

        async def hangup(m: str):
            await encerrar_chamada(session_id, call_id)

        session = VoiceAgentSession(
            api_key=GEMINI_API_KEY,
            profile=profile,
            send_pcm_cb=bridge.send,
            receive_pcm_cb=bridge.receive,
            hangup_cb=hangup,
            call_id=call_id,
            session_id=session_id,
            contexto_extra=f"Você ligou ativamente para {clean_phone}. Motivo: {motivo}.",
            saudacao_inicial=greeting
        )

        await asyncio.sleep(1.8)
        await session.run()

    finally:
        if bridge:
            await bridge.close()
        await encerrar_chamada(session_id, call_id)


def main():
    parser = argparse.ArgumentParser(description="AtendiCalls Voice Agent Runner")
    parser.add_argument("--listen", action="store_true", help="Executa como daemon de atendimento contínuo (Inbound)")
    parser.add_argument("--call", type=str, help="Telefone para realizar chamada ativa (Outbound)")
    parser.add_argument("--profile", type=str, default="donna_paulsen", help="Nome do perfil JSON em profiles/")
    parser.add_argument("--session", type=str, default=ATENDICALLS_SESSION_ID, help="ID da sessão do WhatsApp")
    parser.add_argument("--motivo", type=str, default="Alinhamento prioritário", help="Motivo da ligação ativa")
    args = parser.parse_args()

    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY não encontrada no ambiente!")
        sys.exit(1)

    if args.call:
        asyncio.run(run_outbound(args.call, args.profile, args.session, args.motivo))
    else:
        asyncio.run(run_daemon(args.profile, args.session))


if __name__ == "__main__":
    main()
