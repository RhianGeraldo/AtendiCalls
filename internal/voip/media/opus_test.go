package media

import (
	"math"
	"testing"
)

func TestOpusRoundtrip(t *testing.T) {
	codec, err := NewMLowCodec(DefaultCodecOptions)
	if err != nil {
		t.Fatalf("failed to create codec: %v", err)
	}
	defer codec.Close()

	aware, ok := codec.(OpusAwareCodec)
	if !ok {
		t.Fatalf("expected codec to implement OpusAwareCodec")
	}

	// 1. Initially peerUsesOpus is false
	if aware.PeerUsesOpus() {
		t.Fatalf("expected initial PeerUsesOpus to be false")
	}

	// Create 960 samples of 440Hz test sine wave PCM
	samples := make([]float32, codec.FrameSize())
	for i := range samples {
		samples[i] = float32(math.Sin(2 * math.Pi * 440 * float64(i) / float64(codec.SampleRate())))
	}

	// 2. Set peer uses opus explicitly (as signaling does for iOS)
	aware.SetPeerUsesOpus(true)
	if !aware.PeerUsesOpus() {
		t.Fatalf("expected PeerUsesOpus to be true")
	}

	// 3. Encode to Opus
	opusPkt, err := codec.Encode(samples)
	if err != nil {
		t.Fatalf("failed to encode Opus: %v", err)
	}
	if len(opusPkt) == 0 {
		t.Fatalf("encoded empty Opus packet")
	}
	t.Logf("encoded %d bytes Opus packet from %d samples (TOC byte: 0x%02x)", len(opusPkt), len(samples), opusPkt[0])

	// 4. Decode the Opus packet back
	decoded, err := codec.Decode(opusPkt)
	if err != nil {
		t.Fatalf("failed to decode Opus packet: %v", err)
	}
	if len(decoded) != len(samples) {
		t.Fatalf("expected %d decoded samples, got %d", len(samples), len(decoded))
	}

	// Check signal amplitude
	var maxAmp float32
	for _, s := range decoded {
		if abs := float32(math.Abs(float64(s))); abs > maxAmp {
			maxAmp = abs
		}
	}
	if maxAmp < 0.1 {
		t.Fatalf("decoded Opus audio has too low amplitude: %f", maxAmp)
	}
	t.Logf("decoded Opus audio max amplitude: %f", maxAmp)

	// 5. Test auto-detection: fresh codec receiving an Opus frame with std_opus TOC (b >= 0xC0)
	codec2, err := NewMLowCodec(DefaultCodecOptions)
	if err != nil {
		t.Fatalf("failed to create codec2: %v", err)
	}
	defer codec2.Close()
	aware2 := codec2.(OpusAwareCodec)
	if aware2.PeerUsesOpus() {
		t.Fatalf("expected initial PeerUsesOpus on codec2 to be false")
	}

	// WhatsApp iOS sends standard-Opus packets with b >= 0xC0 (e.g. 0xC0, 0xD8, etc.)
	stdOpusPkt := make([]byte, len(opusPkt))
	copy(stdOpusPkt, opusPkt)
	stdOpusPkt[0] = 0xC0 | (opusPkt[0] & 0x3F)

	// Feed the Opus packet into codec2.Decode
	decoded2, err := codec2.Decode(stdOpusPkt)
	if err != nil {
		t.Fatalf("failed to decode on codec2: %v", err)
	}
	if len(decoded2) == 0 {
		t.Fatalf("decoded2 is empty")
	}
	if !aware2.PeerUsesOpus() {
		t.Fatalf("expected codec2 to automatically detect Opus and set PeerUsesOpus=true")
	}
	t.Logf("auto-detected Opus on inbound packet successfully!")
}
