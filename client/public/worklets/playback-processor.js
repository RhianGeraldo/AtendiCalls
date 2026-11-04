const RING_SIZE = 16000 * 2; // 2 segundos de buffer circular
const JITTER_BUFFER_TARGET = 640; // ~40ms de pré-buffer inicial (reduz latência sem picotar)
const MAX_LATENCY_SAMPLES = 4800; // 300ms de latência máxima para manter tempo real estrito
const FADE_IN_FRAMES = 64; // Suavização de entrada para evitar estalos (clicks)

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(RING_SIZE);
    this.read = 0;
    this.write = 0;
    this.available = 0;
    this.buffering = true;
    this.lastSample = 0;
    this.underrunCount = 0;
    this.fadeInRemaining = 0;

    this.port.onmessage = (e) => {
      const data = e.data;
      if (!data || !data.length) return;

      // Se a fila ultrapassar o limite máximo (devido a congelamento de rede),
      // descarta excesso com suavização para manter sincronia em tempo real
      if (this.available > MAX_LATENCY_SAMPLES) {
        const drop = this.available - MAX_LATENCY_SAMPLES;
        this.read = (this.read + drop) % RING_SIZE;
        this.available = MAX_LATENCY_SAMPLES;
        this.fadeInRemaining = FADE_IN_FRAMES; // Suaviza a transição pós-corte
      }

      for (let i = 0; i < data.length; i += 1) {
        this.ring[this.write] = data[i];
        this.write = (this.write + 1) % RING_SIZE;
        if (this.available < RING_SIZE) {
          this.available += 1;
        } else {
          this.read = (this.read + 1) % RING_SIZE;
        }
      }

      // Reinicia reprodução assim que atingir a meta do jitter buffer
      if (this.buffering && this.available >= JITTER_BUFFER_TARGET) {
        this.buffering = false;
        this.underrunCount = 0;
        this.fadeInRemaining = FADE_IN_FRAMES;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const channelCount = output.length;
    const frameCount = output[0].length;

    // Se estiver em estado de buffer inicial (esperando os primeiros pacotes)
    if (this.buffering) {
      // Suaviza qualquer cauda remanescente para zero absoluto sem estalo
      for (let i = 0; i < frameCount; i += 1) {
        this.lastSample *= 0.9;
        if (Math.abs(this.lastSample) < 0.0001) this.lastSample = 0;
        for (let ch = 0; ch < channelCount; ch += 1) {
          output[ch][i] = this.lastSample;
        }
      }
      return true;
    }

    for (let i = 0; i < frameCount; i += 1) {
      let sample = 0;

      if (this.available > 0) {
        sample = this.ring[this.read];
        this.read = (this.read + 1) % RING_SIZE;
        this.available -= 1;
        this.underrunCount = 0;

        // Aplica rampa suave (anti-pop fade-in) ao retornar de silêncio ou buffering
        if (this.fadeInRemaining > 0) {
          const gain = 1 - this.fadeInRemaining / FADE_IN_FRAMES;
          sample = sample * gain + this.lastSample * (1 - gain);
          this.fadeInRemaining -= 1;
        }

        this.lastSample = sample;
      } else {
        // Starvation / underrun momentâneo (jitter de pacote):
        // Em vez de cortar seco para 0 (o que causa voz picotada/robótica e estalo estático), decai suavemente
        this.lastSample *= 0.92;
        if (Math.abs(this.lastSample) < 0.0001) this.lastSample = 0;
        sample = this.lastSample;

        this.underrunCount += 1;
        // Se ficar sem áudio por mais de 100ms (1600 amostras), entra em buffering para a próxima fala
        if (this.underrunCount > 1600) {
          this.buffering = true;
        }
      }

      for (let ch = 0; ch < channelCount; ch += 1) {
        output[ch][i] = sample;
      }
    }
    return true;
  }
}

registerProcessor("playback-processor", PlaybackProcessor);
