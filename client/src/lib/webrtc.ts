import { apiPost } from "./api";
import { float32ToInt16LE, int16LEToFloat32 } from "./pcm";
import {
  CAPTURE_PROCESSOR_NAME,
  CAPTURE_WORKLET_URL,
  PCM_CHANNEL_LABEL,
  PLAYBACK_PROCESSOR_NAME,
  PLAYBACK_WORKLET_URL,
  SAMPLE_RATE,
} from "../constants/audio";

export type OpenCall = {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  micStream: MediaStream;
  remoteStream: MediaStream | null;
  audioCtx: AudioContext;
  mute: () => void;
  unmute: () => void;
  isMuted: () => boolean;
  close: () => void;
};

export const openCall = async (
  sid: string,
  callId: string,
  micDeviceId: string | null,
): Promise<OpenCall> => {
  // 1. Captura com cancelamento de eco acústico, supressão de ruído e ganho automático
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: micDeviceId ? { exact: micDeviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
    },
  });

  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  });

  const dc = pc.createDataChannel(PCM_CHANNEL_LABEL, { ordered: true });
  dc.binaryType = "arraybuffer";

  dc.onopen = () => {
    console.log("[AtendiCalls WebRTC] ✅ DataChannel 'pcm' aberto com sucesso!");
  };

  dc.onclose = () => {
    console.log("[AtendiCalls WebRTC] ⏹️ DataChannel 'pcm' fechado.");
  };

  dc.onerror = (e) => {
    console.error("[AtendiCalls WebRTC] ⚠️ Erro no DataChannel 'pcm':", e);
  };

  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioContextClass({ sampleRate: SAMPLE_RATE });

  await ctx.audioWorklet.addModule(CAPTURE_WORKLET_URL);
  await ctx.audioWorklet.addModule(PLAYBACK_WORKLET_URL);
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  let isMuted = false;

  // Envio do microfone para o WhatsApp via DataChannel
  const micSource = ctx.createMediaStreamSource(micStream);
  const captureNode = new AudioWorkletNode(ctx, CAPTURE_PROCESSOR_NAME);
  captureNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (!isMuted && dc.readyState === "open") {
      // Evita acumular buffer na fila se houver pico de rede
      if (dc.bufferedAmount < 4096) {
        dc.send(float32ToInt16LE(e.data));
      }
    }
  };
  micSource.connect(captureNode);

  // Conecta com ganho zero ao destination para manter o audio graph e o worklet ativos sem eco local
  const zeroGain = ctx.createGain();
  zeroGain.gain.value = 0;
  captureNode.connect(zeroGain);
  zeroGain.connect(ctx.destination);

  // Recepção do áudio remoto vindo do WhatsApp via DataChannel
  const playbackNode = new AudioWorkletNode(ctx, PLAYBACK_PROCESSOR_NAME);

  // Filtros de áudio para clareza da voz
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(85, ctx.currentTime);
  highpass.Q.setValueAtTime(0.7, ctx.currentTime);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(7000, ctx.currentTime);
  lowpass.Q.setValueAtTime(0.7, ctx.currentTime);

  const voiceCompressor = ctx.createDynamicsCompressor();
  voiceCompressor.threshold.setValueAtTime(-24, ctx.currentTime);
  voiceCompressor.knee.setValueAtTime(10, ctx.currentTime);
  voiceCompressor.ratio.setValueAtTime(2.5, ctx.currentTime);
  voiceCompressor.attack.setValueAtTime(0.003, ctx.currentTime);
  voiceCompressor.release.setValueAtTime(0.2, ctx.currentTime);

  // Toca DIRETO no áudio do navegador (independe de tags <audio> que sofrem com autoplay policy)
  playbackNode.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(voiceCompressor);
  voiceCompressor.connect(ctx.destination);

  // Também expõe MediaStreamDestination para meter visual ou gravação
  const streamDest = ctx.createMediaStreamDestination();
  voiceCompressor.connect(streamDest);

  dc.onmessage = async (e: MessageEvent) => {
    try {
      let buf: ArrayBuffer;
      if (e.data instanceof ArrayBuffer) {
        buf = e.data;
      } else if (e.data instanceof Blob) {
        buf = await e.data.arrayBuffer();
      } else {
        return;
      }
      playbackNode.port.postMessage(int16LEToFloat32(buf));
    } catch (err) {
      console.warn("[AtendiCalls WebRTC] Erro ao decodificar áudio recebido:", err);
    }
  };

  // Negociação SDP Offer / Answer com timeout de segurança no ICE gathering
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
    } else {
      let timeoutId: NodeJS.Timeout | null = null;
      const checkIce = () => {
        if (pc.iceGatheringState === "complete") {
          if (timeoutId) clearTimeout(timeoutId);
          pc.removeEventListener("icegatheringstatechange", checkIce);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", checkIce);
      timeoutId = setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", checkIce);
        resolve();
      }, 3500);
    }
  });

  const { sdp_answer } = await apiPost<{ sdp_answer: string }>(
    `/api/sessions/${sid}/calls/${callId}/webrtc`,
    { sdp_offer: pc.localDescription!.sdp },
  );
  await pc.setRemoteDescription({ type: "answer", sdp: sdp_answer });

  return {
    pc,
    dc,
    micStream,
    remoteStream: streamDest.stream,
    audioCtx: ctx,
    mute: () => {
      isMuted = true;
      micStream.getAudioTracks().forEach((t) => (t.enabled = false));
    },
    unmute: () => {
      isMuted = false;
      micStream.getAudioTracks().forEach((t) => (t.enabled = true));
    },
    isMuted: () => isMuted,
    close: () => {
      try {
        micStream.getTracks().forEach((t) => t.stop());
      } catch {}
      try {
        if (dc.readyState === "open" || dc.readyState === "connecting") {
          dc.close();
        }
      } catch {}
      try {
        if (ctx.state !== "closed") {
          ctx.close();
        }
      } catch {}
      try {
        pc.close();
      } catch {}
    },
  };
};
