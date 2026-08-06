package recorder

import (
	"encoding/binary"
	"io"
	"os"
	"testing"
)

func TestStereoRecorderWAVHeader(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "rec_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	rec, err := NewStereoRecorder(tempDir, "call_test_123")
	if err != nil {
		t.Fatalf("Failed to create recorder: %v", err)
	}

	// Write 160 samples to attendant (0.01s at 16kHz)
	attendantPCM := make([]float32, 160)
	for i := range attendantPCM {
		attendantPCM[i] = 0.5
	}
	rec.WriteAttendantPCM(attendantPCM)

	// Write 160 samples to client
	clientPCM := make([]float32, 160)
	for i := range clientPCM {
		clientPCM[i] = -0.5
	}
	rec.WriteClientPCM(clientPCM)

	filePath := rec.FilePath()
	if err := rec.Close(); err != nil {
		t.Fatalf("Failed to close recorder: %v", err)
	}

	f, err := os.Open(filePath)
	if err != nil {
		t.Fatalf("Failed to open generated WAV: %v", err)
	}
	defer f.Close()

	header := make([]byte, 44)
	if _, err := io.ReadFull(f, header); err != nil {
		t.Fatalf("Failed to read header: %v", err)
	}

	if string(header[0:4]) != "RIFF" {
		t.Errorf("Expected RIFF header, got %s", string(header[0:4]))
	}
	if string(header[8:12]) != "WAVE" {
		t.Errorf("Expected WAVE format, got %s", string(header[8:12]))
	}

	numChannels := binary.LittleEndian.Uint16(header[22:24])
	if numChannels != 2 {
		t.Errorf("Expected 2 channels, got %d", numChannels)
	}

	sampleRate := binary.LittleEndian.Uint32(header[24:28])
	if sampleRate != 16000 {
		t.Errorf("Expected 16000 sample rate, got %d", sampleRate)
	}
}
