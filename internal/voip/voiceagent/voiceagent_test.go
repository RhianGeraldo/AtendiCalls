package voiceagent

import (
	"math"
	"sync"
	"testing"
	"time"
)

func TestResampleLinear(t *testing.T) {
	// Generate a 1000 Hz sine wave at 24000 Hz
	inRate := 24000
	outRate := 16000
	durationSec := 0.1 // 100ms
	numSamples := int(float64(inRate) * durationSec)
	in := make([]float32, numSamples)
	for i := 0; i < numSamples; i++ {
		tVal := float64(i) / float64(inRate)
		in[i] = float32(math.Sin(2 * math.Pi * 1000 * tVal))
	}

	out := ResampleLinear(in, inRate, outRate)
	expectedLen := int(math.Round(float64(numSamples) * float64(outRate) / float64(inRate)))
	if len(out) != expectedLen {
		t.Fatalf("expected resampled length %d, got %d", expectedLen, len(out))
	}

	// Verify amplitude is preserved
	var maxAmp float32
	for _, s := range out {
		if float32(math.Abs(float64(s))) > maxAmp {
			maxAmp = float32(math.Abs(float64(s)))
		}
	}
	if maxAmp < 0.9 || maxAmp > 1.05 {
		t.Fatalf("resampled amplitude out of bounds: %f", maxAmp)
	}
}

func TestPCMConversionRoundTrip(t *testing.T) {
	original := []float32{-1.0, -0.5, 0.0, 0.5, 0.999}
	bytes := PCMFloat32ToInt16LE(original)
	restored := PCMInt16LEToFloat32(bytes)

	if len(restored) != len(original) {
		t.Fatalf("expected length %d, got %d", len(original), len(restored))
	}
	for i := range original {
		diff := math.Abs(float64(original[i] - restored[i]))
		if diff > 0.001 {
			t.Errorf("sample %d differs: orig=%f, restored=%f", i, original[i], restored[i])
		}
	}
}

func TestAudioPacerEnqueueAndClear(t *testing.T) {
	var fedCount int
	var mu sync.Mutex

	pacer := NewAudioPacer(func(pcm []float32) {
		mu.Lock()
		fedCount += len(pcm)
		mu.Unlock()
	})
	defer pacer.Close()

	// Enqueue 1 second of audio (16,000 samples)
	audio := make([]float32, 16000)
	pacer.Enqueue(audio)

	if !pacer.IsPlaying() {
		t.Fatal("expected pacer to be playing")
	}

	// Wait 50ms so at least 1-2 frames (320 samples each) are fed
	time.Sleep(50 * time.Millisecond)

	mu.Lock()
	countBefore := fedCount
	mu.Unlock()

	if countBefore == 0 {
		t.Fatal("expected pacer to have fed samples")
	}

	// Instant barge-in test
	pacer.Clear()
	if pacer.IsPlaying() {
		t.Fatal("expected pacer buffer to be cleared immediately")
	}
}

func TestVADSpeechStartAndEnd(t *testing.T) {
	cfg := DefaultVADConfig()
	cfg.SpeechStartFrames = 2
	cfg.SilenceEndFrames = 3
	cfg.MinEnergyThresh = 0.01

	vad := NewVAD(cfg)

	speechStartCalled := false
	speechEndCalled := false
	var utteranceSamples int

	vad.OnSpeechStart = func() {
		speechStartCalled = true
	}
	vad.OnSpeechEnd = func(utt []float32) {
		speechEndCalled = true
		utteranceSamples = len(utt)
	}

	silentFrame := make([]float32, 320)
	voiceFrame := make([]float32, 320)
	for i := range voiceFrame {
		voiceFrame[i] = 0.2 // strong voice energy
	}

	// Feed silence
	vad.ProcessFrame(silentFrame)
	vad.ProcessFrame(silentFrame)

	// Feed voice frames
	vad.ProcessFrame(voiceFrame)
	vad.ProcessFrame(voiceFrame)

	time.Sleep(20 * time.Millisecond)
	if !speechStartCalled {
		t.Fatal("expected VAD OnSpeechStart to trigger")
	}

	// Feed silence frames to end speech
	vad.ProcessFrame(silentFrame)
	vad.ProcessFrame(silentFrame)
	vad.ProcessFrame(silentFrame)
	vad.ProcessFrame(silentFrame)

	time.Sleep(20 * time.Millisecond)
	if !speechEndCalled {
		t.Fatal("expected VAD OnSpeechEnd to trigger")
	}
	if utteranceSamples == 0 {
		t.Fatal("expected utterance samples to be emitted")
	}
}

func TestEncodeWAV16kHzMono(t *testing.T) {
	samples := make([]float32, 1600) // 100ms
	wav := EncodeWAV16kHzMono(samples)

	if len(wav) != 44+len(samples)*2 {
		t.Fatalf("expected WAV size %d, got %d", 44+len(samples)*2, len(wav))
	}
	// Check RIFF header
	if string(wav[0:4]) != "RIFF" || string(wav[8:12]) != "WAVE" {
		t.Fatalf("invalid WAV headers")
	}
}
