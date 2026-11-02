package voiceagent

import (
	"math"
	"sync"
	"time"
)

type VADConfig struct {
	SampleRate        int           // default 16000
	FrameSize         int           // default 320 (20ms at 16kHz)
	MinEnergyThresh   float32       // minimum RMS threshold (e.g., 0.015)
	SpeechStartFrames int           // consecutive speech frames to trigger speech start (e.g. 3 = 60ms)
	SilenceEndFrames  int           // consecutive silence frames to trigger speech end (e.g. 30 = 600ms)
	MaxSpeechDuration time.Duration // maximum utterance duration (e.g. 20s)
}

func DefaultVADConfig() VADConfig {
	return VADConfig{
		SampleRate:        16000,
		FrameSize:         320,
		MinEnergyThresh:   0.015,
		SpeechStartFrames: 3,
		SilenceEndFrames:  28, // ~560ms
		MaxSpeechDuration: 20 * time.Second,
	}
}

type VAD struct {
	cfg        VADConfig
	mu         sync.Mutex
	isSpeaking bool

	consecutiveSpeech  int
	consecutiveSilence int
	utteranceBuf       []float32
	preSpeechRing      [][]float32
	preSpeechIdx       int
	speechStartTime    time.Time

	OnSpeechStart func()
	OnSpeechEnd   func(utterance []float32)
}

func NewVAD(cfg VADConfig) *VAD {
	if cfg.FrameSize <= 0 {
		cfg.FrameSize = 320
	}
	if cfg.MinEnergyThresh <= 0 {
		cfg.MinEnergyThresh = 0.015
	}
	if cfg.SpeechStartFrames <= 0 {
		cfg.SpeechStartFrames = 3
	}
	if cfg.SilenceEndFrames <= 0 {
		cfg.SilenceEndFrames = 28
	}

	preCount := 10 // preserve ~200ms of audio before speech onset
	ring := make([][]float32, preCount)

	return &VAD{
		cfg:           cfg,
		preSpeechRing: ring,
	}
}

// ProcessFrame processes a single 16 kHz PCM frame (e.g., 320 samples / 20ms).
func (v *VAD) ProcessFrame(frame []float32) {
	v.mu.Lock()
	defer v.mu.Unlock()

	rms := calculateRMS(frame)
	isVoice := rms >= v.cfg.MinEnergyThresh

	// Store frame in pre-speech ring buffer
	frameCopy := make([]float32, len(frame))
	copy(frameCopy, frame)
	v.preSpeechRing[v.preSpeechIdx] = frameCopy
	v.preSpeechIdx = (v.preSpeechIdx + 1) % len(v.preSpeechRing)

	if isVoice {
		v.consecutiveSpeech++
		v.consecutiveSilence = 0

		if !v.isSpeaking && v.consecutiveSpeech >= v.cfg.SpeechStartFrames {
			v.isSpeaking = true
			v.speechStartTime = time.Now()

			// Prepend pre-speech ring buffer to avoid clipping speech start
			v.utteranceBuf = make([]float32, 0, v.cfg.SampleRate*3)
			for i := 0; i < len(v.preSpeechRing); i++ {
				idx := (v.preSpeechIdx + i) % len(v.preSpeechRing)
				if v.preSpeechRing[idx] != nil {
					v.utteranceBuf = append(v.utteranceBuf, v.preSpeechRing[idx]...)
				}
			}

			if v.OnSpeechStart != nil {
				go v.OnSpeechStart()
			}
		}

		if v.isSpeaking {
			v.utteranceBuf = append(v.utteranceBuf, frameCopy...)
			// Check if maximum speech duration exceeded
			if time.Since(v.speechStartTime) > v.cfg.MaxSpeechDuration {
				v.emitSpeechEndLocked()
			}
		}
	} else {
		// Silence frame
		v.consecutiveSpeech = 0
		if v.isSpeaking {
			v.consecutiveSilence++
			v.utteranceBuf = append(v.utteranceBuf, frameCopy...)

			if v.consecutiveSilence >= v.cfg.SilenceEndFrames {
				v.emitSpeechEndLocked()
			}
		}
	}
}

func (v *VAD) emitSpeechEndLocked() {
	v.isSpeaking = false
	v.consecutiveSpeech = 0
	v.consecutiveSilence = 0

	if len(v.utteranceBuf) > 0 && v.OnSpeechEnd != nil {
		complete := make([]float32, len(v.utteranceBuf))
		copy(complete, v.utteranceBuf)
		v.utteranceBuf = nil
		go v.OnSpeechEnd(complete)
	} else {
		v.utteranceBuf = nil
	}
}

// Reset clears the VAD state.
func (v *VAD) Reset() {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.isSpeaking = false
	v.consecutiveSpeech = 0
	v.consecutiveSilence = 0
	v.utteranceBuf = nil
}

func calculateRMS(samples []float32) float32 {
	if len(samples) == 0 {
		return 0
	}
	var sum float64
	for _, s := range samples {
		sum += float64(s * s)
	}
	return float32(math.Sqrt(sum / float64(len(samples))))
}
