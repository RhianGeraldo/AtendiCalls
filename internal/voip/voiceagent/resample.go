package voiceagent

import (
	"encoding/binary"
	"math"
)

// ResampleLinear resamples mono float32 PCM from fromRate to toRate using linear interpolation.
func ResampleLinear(in []float32, fromRate, toRate int) []float32 {
	if fromRate == toRate || len(in) == 0 {
		return in
	}
	ratio := float64(fromRate) / float64(toRate)
	outLen := int(math.Round(float64(len(in)) / ratio))
	if outLen <= 0 {
		return nil
	}
	out := make([]float32, outLen)

	for i := 0; i < outLen; i++ {
		srcIdx := float64(i) * ratio
		idx0 := int(srcIdx)
		idx1 := idx0 + 1
		frac := float32(srcIdx - float64(idx0))

		if idx1 < len(in) {
			out[i] = in[idx0]*(1.0-frac) + in[idx1]*frac
		} else if idx0 < len(in) {
			out[i] = in[idx0]
		}
	}
	return out
}

// PCMInt16LEToFloat32 converts Little-Endian 16-bit PCM bytes to normalized float32 slice [-1.0, 1.0].
func PCMInt16LEToFloat32(b []byte) []float32 {
	n := len(b) / 2
	out := make([]float32, n)
	for i := 0; i < n; i++ {
		v := int16(binary.LittleEndian.Uint16(b[i*2:]))
		out[i] = float32(v) / 32768.0
	}
	return out
}

// PCMFloat32ToInt16LE converts normalized float32 slice [-1.0, 1.0] to Little-Endian 16-bit PCM bytes.
func PCMFloat32ToInt16LE(pcm []float32) []byte {
	out := make([]byte, len(pcm)*2)
	for i, s := range pcm {
		var v int16
		switch {
		case math.IsNaN(float64(s)):
			v = 0
		case s >= 1.0:
			v = math.MaxInt16
		case s <= -1.0:
			v = math.MinInt16
		default:
			v = int16(s * 32767.0)
		}
		binary.LittleEndian.PutUint16(out[i*2:], uint16(v))
	}
	return out
}
