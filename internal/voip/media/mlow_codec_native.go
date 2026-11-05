package media

import (
	"sync/atomic"

	"atendicalls/internal/voip/media/mlow"
	"github.com/tphakala/go-opus/opus"
)

type mlowCodec struct {
	enc          *mlow.MlowEncoder
	dec          *mlow.MlowDecoder
	opusEnc      *opus.Encoder
	opusInPcm    []int16
	opusOutBuf   []byte
	peerUsesOpus atomic.Bool
}

func NewMLowCodec(opts CodecOptions) (Codec, error) {
	_ = opts
	return &mlowCodec{
		enc: mlow.NewMlowEncoder(),
		dec: mlow.NewMlowDecoder(),
	}, nil
}

func (c *mlowCodec) SetPeerUsesOpus(usesOpus bool) {
	c.peerUsesOpus.Store(usesOpus)
	if c.dec != nil {
		c.dec.SetPeerUsesOpus(usesOpus)
	}
}

func (c *mlowCodec) PeerUsesOpus() bool {
	return c.peerUsesOpus.Load()
}

func (c *mlowCodec) Encode(pcm []float32) ([]byte, error) {
	if len(pcm) == 0 {
		return nil, nil
	}
	if c.peerUsesOpus.Load() {
		return c.encodeOpus(pcm)
	}
	return c.enc.Encode(pcm)
}

func (c *mlowCodec) encodeOpus(pcm []float32) ([]byte, error) {
	if c.opusEnc == nil {
		enc, err := opus.NewEncoder(opus.EncoderConfig{
			SampleRate: 16000,
			Channels:   1,
			Bitrate:    24000,
			Complexity: 5,
		})
		if err != nil {
			return nil, err
		}
		c.opusEnc = enc
		c.opusInPcm = make([]int16, len(pcm))
		c.opusOutBuf = make([]byte, 1275)
	}
	if len(c.opusInPcm) < len(pcm) {
		c.opusInPcm = make([]int16, len(pcm))
	}
	for i, s := range pcm {
		v := int32(s * 32767.0)
		if v > 32767 {
			v = 32767
		} else if v < -32768 {
			v = -32768
		}
		c.opusInPcm[i] = int16(v)
	}
	n, err := c.opusEnc.Encode(c.opusInPcm[:len(pcm)], c.opusOutBuf)
	if err != nil {
		return nil, err
	}
	out := make([]byte, n)
	copy(out, c.opusOutBuf[:n])
	return out, nil
}

func (c *mlowCodec) Decode(frame []byte) ([]float32, error) {
	pcm := c.dec.Decode(frame)
	if c.dec.LastWasOpus() {
		c.peerUsesOpus.Store(true)
	}
	return pcm, nil
}

func (c *mlowCodec) FrameSize() int  { return mlowFrameSize }
func (c *mlowCodec) SampleRate() int { return mlowSampleRate }
func (c *mlowCodec) Close()          {}
