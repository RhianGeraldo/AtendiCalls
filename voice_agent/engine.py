"""
engine.py
---------
Motor de Voz em Tempo Real para o AtendiCalls (Gemini Multimodal Live API).
Conecta o stream bidirecional de áudio PCM 16kHz do AtendiCalls ao Gemini 2.5 Flash Native Audio.
"""

import asyncio
import audioop
import json
import logging
import os
import time
from typing import Any, Callable, Dict, Optional
from google import genai
from google.genai import types

from webhook_client import ToolWebhookDispatcher

logger = logging.getLogger("atendicalls.engine")
FRAME_BYTES = 640  # 20ms @ 16kHz mono 16-bit


class VoiceAgentSession:
    def __init__(
        self,
        api_key: str,
        profile: Dict[str, Any],
        send_pcm_cb: Callable[[bytes], Any],
        receive_pcm_cb: Callable[[], Any],
        hangup_cb: Callable[[str], Any],
        call_id: str = "",
        session_id: str = "",
        contexto_extra: str = "",
        saudacao_inicial: Optional[str] = None,
        max_duration_seconds: float = 600.0,
    ):
        self.api_key = api_key
        self.profile = profile
        self.send_pcm_cb = send_pcm_cb
        self.receive_pcm_cb = receive_pcm_cb
        self.hangup_cb = hangup_cb
        self.call_id = call_id
        self.session_id = session_id
        self.contexto_extra = contexto_extra
        self.saudacao_inicial = saudacao_inicial
        self.max_duration = max_duration_seconds

        self.dispatcher = ToolWebhookDispatcher(profile.get("tools_webhook_url", ""))
        self.desligar_event = asyncio.Event()
        self.out_audio_queue = asyncio.Queue()
        self.generation = 0
        self.ratecv_state = None

    async def run(self):
        """Executa a sessão contínua de áudio ao vivo."""
        client = genai.Client(api_key=self.api_key)

        instructions = self.profile.get("system_instruction", "")
        if self.contexto_extra:
            instructions += f"\n\nCONTEXTO DESTA CHAMADA:\n{self.contexto_extra}"

        voice_name = self.profile.get("voice_name", "Aoede")
        silence_ms = int(self.profile.get("silence_duration_ms", 450))
        tools = self.profile.get("tools_declarations", [])

        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name)
                )
            ),
            thinking_config=types.ThinkingConfig(thinking_budget=0),
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    silence_duration_ms=silence_ms,
                    prefix_padding_ms=100
                )
            ),
            system_instruction=types.Content(parts=[types.Part(text=instructions)]),
            tools=[{"function_declarations": tools}] if tools else None,
        )

        try:
            async with client.aio.live.connect(
                model="gemini-2.5-flash-native-audio-latest",
                config=config
            ) as session:
                logger.info(f"Sessão Gemini Live estabelecida para o agente: {self.profile.get('name')}")

                # Loop 1: Microfone do WhatsApp -> Gemini Live (16kHz PCM)
                async def pump_mic():
                    while not self.desligar_event.is_set():
                        try:
                            chunk = await self.receive_pcm_cb()
                            if not chunk:
                                await asyncio.sleep(0.01)
                                continue

                            await session.send_realtime_input(
                                audio=types.Blob(data=chunk, mime_type="audio/pcm;rate=16000")
                            )
                        except asyncio.CancelledError:
                            break
                        except Exception as e:
                            logger.error(f"Erro pump_mic: {e}")
                            break

                # Loop 2: Gemini Live -> Áudio & Tool Calls
                async def pump_gemini():
                    try:
                        async for response in session.receive():
                            if self.desligar_event.is_set():
                                break

                            sc = response.server_content
                            if sc is not None:
                                # Barge-in: se o usuário falar, limpa o buffer de áudio na hora
                                if getattr(sc, "interrupted", False):
                                    self.generation += 1
                                    logger.info(f"Barge-in: usuário interrompeu a fala (gen #{self.generation}).")
                                    while not self.out_audio_queue.empty():
                                        try:
                                            self.out_audio_queue.get_nowait()
                                        except asyncio.QueueEmpty:
                                            break
                                    continue

                                if sc.model_turn:
                                    for part in sc.model_turn.parts:
                                        if part.inline_data and part.inline_data.data:
                                            raw_24k = part.inline_data.data
                                            try:
                                                conv_16k, self.ratecv_state = audioop.ratecv(
                                                    raw_24k, 2, 1, 24000, 16000, self.ratecv_state
                                                )
                                                self.out_audio_queue.put_nowait((self.generation, conv_16k))
                                            except Exception as rx:
                                                logger.error(f"Erro resampling de áudio: {rx}")

                            # Tool Calls
                            if response.tool_call:
                                for fc in response.tool_call.function_calls:
                                    fname = fc.name
                                    fargs = dict(fc.args or {})
                                    logger.info(f"Tool Call disparado: {fname}({fargs})")

                                    if fname == "encerrar_chamada":
                                        motivo = fargs.get("motivo", "Conversa encerrada.")
                                        await session.send_tool_response(
                                            function_responses=[
                                                types.FunctionResponse(
                                                    name=fname,
                                                    id=fc.id,
                                                    response={"result": f"Desligando: {motivo}"}
                                                )
                                            ]
                                        )

                                        async def delay_hangup():
                                            await asyncio.sleep(4.0)
                                            await self.hangup_cb(motivo)
                                            self.desligar_event.set()

                                        asyncio.create_task(delay_hangup())
                                        continue

                                    # Executa webhook externo
                                    tool_result = await self.dispatcher.dispatch(
                                        tool_name=fname,
                                        arguments=fargs,
                                        call_id=self.call_id,
                                        session_id=self.session_id
                                    )

                                    await session.send_tool_response(
                                        function_responses=[
                                            types.FunctionResponse(
                                                name=fname,
                                                id=fc.id,
                                                response={"result": tool_result}
                                            )
                                        ]
                                    )

                    except asyncio.CancelledError:
                        pass
                    except Exception as e:
                        logger.error(f"Erro pump_gemini: {e}")

                # Loop 3: Transmissão de Áudio com Compensação de Drift
                async def pump_speaker():
                    next_time = time.monotonic()
                    while not self.desligar_event.is_set():
                        try:
                            gen_id, pcm_data = await self.out_audio_queue.get()
                            if gen_id != self.generation:
                                continue

                            for i in range(0, len(pcm_data), FRAME_BYTES):
                                if gen_id != self.generation or self.desligar_event.is_set():
                                    break
                                frame = pcm_data[i : i + FRAME_BYTES]
                                if len(frame) < FRAME_BYTES:
                                    frame = frame + b"\x00" * (FRAME_BYTES - len(frame))

                                await self.send_pcm_cb(frame)

                                next_time += 0.02
                                sleep_dur = next_time - time.monotonic()
                                if sleep_dur > 0:
                                    await asyncio.sleep(sleep_dur)
                                else:
                                    next_time = time.monotonic()
                        except asyncio.CancelledError:
                            break
                        except Exception as e:
                            logger.error(f"Erro pump_speaker: {e}")
                            break

                tasks = [
                    asyncio.create_task(pump_mic()),
                    asyncio.create_task(pump_gemini()),
                    asyncio.create_task(pump_speaker()),
                ]

                # Saudação inicial opcional
                if self.saudacao_inicial:
                    logger.info("Enviando saudação inicial.")
                    await session.send_realtime_input(text=self.saudacao_inicial)

                await asyncio.wait_for(self.desligar_event.wait(), timeout=self.max_duration)

        except asyncio.TimeoutError:
            logger.info("Tempo máximo de chamada atingido.")
        finally:
            self.desligar_event.set()
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            logger.info("Sessão VoiceAgentSession finalizada.")
