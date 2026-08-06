package recorder

import (
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	SampleRate     = 16000
	BitsPerSample  = 16
	BytesPerSample = BitsPerSample / 8
)

// StereoRecorder captures independent mono float32 PCM streams for Client (Left)
// and Attendant (Right) and combines them on Close into a 100% sample-aligned
// 16-bit 16kHz Stereo RIFF WAV file, along with separate mono WAVs for AI transcription.
type StereoRecorder struct {
	mu            sync.Mutex
	outputDir     string
	callID        string
	filePath      string
	clientPath    string
	attendantPath string
	startTime     time.Time
	closed        bool

	clientSamples    []int16
	attendantSamples []int16
}

// NewStereoRecorder creates a new audio recorder for a call.
func NewStereoRecorder(outputDir, callID string) (*StereoRecorder, error) {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create recordings directory: %w", err)
	}

	basePath := filepath.Join(outputDir, callID)
	return &StereoRecorder{
		outputDir:        outputDir,
		callID:           callID,
		filePath:         basePath + ".wav",
		clientPath:       basePath + "_client.wav",
		attendantPath:    basePath + "_attendant.wav",
		startTime:        time.Now(),
		clientSamples:    make([]int16, 0, SampleRate*30),
		attendantSamples: make([]int16, 0, SampleRate*30),
	}, nil
}

// FilePath returns the destination path of the main stereo .wav file.
func (r *StereoRecorder) FilePath() string {
	return r.filePath
}

// WriteClientPCM stores channel 0 (Left / Client) PCM samples aligned to wall-clock time.
func (r *StereoRecorder) WriteClientPCM(pcm []float32) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed || len(pcm) == 0 {
		return
	}

	elapsed := time.Since(r.startTime).Seconds()
	targetPos := int(elapsed * float64(SampleRate))

	// Only insert silence padding for large gaps (>300ms = 4800 samples at 16kHz)
	// to prevent network jitter (10ms-100ms) from chopping spoken words.
	if targetPos-len(r.clientSamples) > 4800 {
		gap := targetPos - len(r.clientSamples)
		if gap < 9600000 {
			r.clientSamples = append(r.clientSamples, make([]int16, gap)...)
		}
	}

	for _, sample := range pcm {
		r.clientSamples = append(r.clientSamples, int16Clamp(sample))
	}
}

// WriteAttendantPCM stores channel 1 (Right / Attendant) PCM samples aligned to wall-clock time.
func (r *StereoRecorder) WriteAttendantPCM(pcm []float32) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed || len(pcm) == 0 {
		return
	}

	elapsed := time.Since(r.startTime).Seconds()
	targetPos := int(elapsed * float64(SampleRate))

	// Only insert silence padding for large gaps (>300ms = 4800 samples at 16kHz)
	// to prevent network jitter (10ms-100ms) from chopping spoken words.
	if targetPos-len(r.attendantSamples) > 4800 {
		gap := targetPos - len(r.attendantSamples)
		if gap < 9600000 {
			r.attendantSamples = append(r.attendantSamples, make([]int16, gap)...)
		}
	}

	for _, sample := range pcm {
		r.attendantSamples = append(r.attendantSamples, int16Clamp(sample))
	}
}

// Close finalizes and writes client mono WAV, attendant mono WAV, and combined stereo WAV.
func (r *StereoRecorder) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.closed {
		return nil
	}
	r.closed = true

	totalDuration := time.Since(r.startTime).Seconds()
	totalSamples := int(totalDuration * float64(SampleRate))

	if len(r.clientSamples) < totalSamples {
		gap := totalSamples - len(r.clientSamples)
		if gap > 0 && gap < 9600000 {
			r.clientSamples = append(r.clientSamples, make([]int16, gap)...)
		}
	}
	if len(r.attendantSamples) < totalSamples {
		gap := totalSamples - len(r.attendantSamples)
		if gap > 0 && gap < 9600000 {
			r.attendantSamples = append(r.attendantSamples, make([]int16, gap)...)
		}
	}

	// 1. Write Client Mono WAV (Channel 0 / Left / Client)
	if err := r.writeMonoWAV(r.clientPath, r.clientSamples); err != nil {
		return fmt.Errorf("failed to write client mono wav: %w", err)
	}

	// 2. Write Attendant Mono WAV (Channel 1 / Right / Attendant)
	if err := r.writeMonoWAV(r.attendantPath, r.attendantSamples); err != nil {
		return fmt.Errorf("failed to write attendant mono wav: %w", err)
	}

	// 3. Write Sample-Aligned Stereo WAV (Left = Client, Right = Attendant)
	if err := r.writeStereoWAV(r.filePath, r.clientSamples, r.attendantSamples); err != nil {
		return fmt.Errorf("failed to write stereo wav: %w", err)
	}

	return nil
}

func (r *StereoRecorder) writeMonoWAV(path string, samples []int16) error {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	dataSize := int64(len(samples) * BytesPerSample)
	header := makeWAVHeader(1, dataSize)
	if _, err := f.Write(header); err != nil {
		return err
	}

	buf := make([]byte, dataSize)
	for i, s := range samples {
		binary.LittleEndian.PutUint16(buf[i*2:], uint16(s))
	}

	_, err = f.Write(buf)
	return err
}

func (r *StereoRecorder) writeStereoWAV(path string, clientSamples, attendantSamples []int16) error {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	maxLen := len(clientSamples)
	if len(attendantSamples) > maxLen {
		maxLen = len(attendantSamples)
	}

	dataSize := int64(maxLen * 2 * BytesPerSample)
	header := makeWAVHeader(2, dataSize)
	if _, err := f.Write(header); err != nil {
		return err
	}

	buf := make([]byte, dataSize)
	for i := 0; i < maxLen; i++ {
		var cVal int16 = 0
		if i < len(clientSamples) {
			cVal = clientSamples[i]
		}
		var aVal int16 = 0
		if i < len(attendantSamples) {
			aVal = attendantSamples[i]
		}

		idx := i * 4
		// Left Channel (Client)
		binary.LittleEndian.PutUint16(buf[idx:], uint16(cVal))
		// Right Channel (Attendant)
		binary.LittleEndian.PutUint16(buf[idx+2:], uint16(aVal))
	}

	_, err = f.Write(buf)
	return err
}

func int16Clamp(sample float32) int16 {
	if math.IsNaN(float64(sample)) {
		return 0
	}
	if sample > 1.0 {
		return math.MaxInt16
	}
	if sample < -1.0 {
		return math.MinInt16
	}
	return int16(sample * 32767.0)
}

func makeWAVHeader(numChannels uint16, dataSize int64) []byte {
	h := make([]byte, 44)
	totalSize := uint32(dataSize + 36)

	copy(h[0:4], []byte("RIFF"))
	binary.LittleEndian.PutUint32(h[4:8], totalSize)
	copy(h[8:12], []byte("WAVE"))
	copy(h[12:16], []byte("fmt "))

	binary.LittleEndian.PutUint32(h[16:20], 16) // Subchunk1Size for PCM
	binary.LittleEndian.PutUint16(h[20:22], 1)  // AudioFormat 1 = PCM
	binary.LittleEndian.PutUint16(h[22:24], numChannels)
	binary.LittleEndian.PutUint32(h[24:28], SampleRate)

	byteRate := uint32(SampleRate * uint32(numChannels) * BytesPerSample)
	binary.LittleEndian.PutUint32(h[28:32], byteRate)

	blockAlign := uint16(numChannels * BytesPerSample)
	binary.LittleEndian.PutUint16(h[32:34], blockAlign)
	binary.LittleEndian.PutUint16(h[34:36], BitsPerSample)

	copy(h[36:40], []byte("data"))
	binary.LittleEndian.PutUint32(h[40:44], uint32(dataSize))

	return h
}

func GetMonoWAVPaths(stereoWAVPath string) (clientPath, attendantPath string) {
	base := strings.TrimSuffix(stereoWAVPath, ".wav")
	return base + "_client.wav", base + "_attendant.wav"
}
