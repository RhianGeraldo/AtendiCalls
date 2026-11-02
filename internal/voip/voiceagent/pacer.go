package voiceagent

import (
	"sync"
	"time"
)

// FrameSize16kHz20ms is the standard 20ms frame size at 16,000 Hz (320 samples).
const FrameSize16kHz20ms = 320

// AudioPacer buffers synthesized PCM and feeds it to CallManager in steady 20ms chunks.
type AudioPacer struct {
	mu        sync.Mutex
	buf       []float32
	onFeed    func(pcm []float32)
	stopCh    chan struct{}
	stopped   bool
	isPlaying bool
}

// NewAudioPacer creates and starts a new AudioPacer.
func NewAudioPacer(onFeed func(pcm []float32)) *AudioPacer {
	p := &AudioPacer{
		buf:    make([]float32, 0, 16000), // preallocate 1s buffer
		onFeed: onFeed,
		stopCh: make(chan struct{}),
	}
	go p.run()
	return p
}

// Enqueue appends 16 kHz float32 samples to the playback queue.
func (p *AudioPacer) Enqueue(samples []float32) {
	if len(samples) == 0 {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.stopped {
		return
	}
	p.buf = append(p.buf, samples...)
	p.isPlaying = true
}

// Clear immediately empties the playback buffer (used for instantaneous barge-in interruption).
func (p *AudioPacer) Clear() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.buf = p.buf[:0]
	p.isPlaying = false
}

// IsPlaying returns true if there is still audio in the playback queue.
func (p *AudioPacer) IsPlaying() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.isPlaying && len(p.buf) > 0
}

// Close stops the pacing loop and releases resources.
func (p *AudioPacer) Close() {
	p.mu.Lock()
	if p.stopped {
		p.mu.Unlock()
		return
	}
	p.stopped = true
	p.buf = nil
	p.isPlaying = false
	close(p.stopCh)
	p.mu.Unlock()
}

func (p *AudioPacer) run() {
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()

	frame := make([]float32, FrameSize16kHz20ms)

	for {
		select {
		case <-p.stopCh:
			return
		case <-ticker.C:
			p.mu.Lock()
			if p.stopped {
				p.mu.Unlock()
				return
			}
			if len(p.buf) == 0 {
				p.isPlaying = false
				p.mu.Unlock()
				continue
			}

			n := min(len(p.buf), FrameSize16kHz20ms)
			copy(frame[:n], p.buf[:n])
			// If buffer has fewer samples than a full frame, zero-pad the remainder
			if n < FrameSize16kHz20ms {
				for i := n; i < FrameSize16kHz20ms; i++ {
					frame[i] = 0
				}
				p.buf = p.buf[:0]
				p.isPlaying = false
			} else {
				p.buf = p.buf[FrameSize16kHz20ms:]
			}
			p.mu.Unlock()

			if p.onFeed != nil {
				// Send a copy so caller can manipulate independently
				out := make([]float32, FrameSize16kHz20ms)
				copy(out, frame)
				p.onFeed(out)
			}
		}
	}
}
