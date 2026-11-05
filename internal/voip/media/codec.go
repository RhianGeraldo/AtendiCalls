package media

type Codec interface {
	Encode(pcm []float32) ([]byte, error)

	Decode(frame []byte) ([]float32, error)

	FrameSize() int

	SampleRate() int

	Close()
}

// OpusAwareCodec is an optional extension for codecs that support adapting between
// MLow and standard Opus depending on the peer platform / packet negotiation.
type OpusAwareCodec interface {
	Codec
	SetPeerUsesOpus(usesOpus bool)
	PeerUsesOpus() bool
}

type CodecOptions struct {
	Bitrate    int
	Complexity int
	FEC        bool
}

var DefaultCodecOptions = CodecOptions{Bitrate: 6000, Complexity: 5, FEC: false}

const (
	mlowSampleRate = 16000
	mlowFrameSize  = 960
)
