package voiceagent

import (
	"bytes"
	"encoding/binary"
)

// EncodeWAV16kHzMono encodes float32 samples into a valid 16 kHz 16-bit mono WAV byte buffer.
func EncodeWAV16kHzMono(samples []float32) []byte {
	pcmBytes := PCMFloat32ToInt16LE(samples)
	dataLen := uint32(len(pcmBytes))
	fileLen := 36 + dataLen

	buf := new(bytes.Buffer)
	buf.Grow(int(fileLen + 8))

	// RIFF header
	buf.WriteString("RIFF")
	_ = binary.Write(buf, binary.LittleEndian, fileLen)
	buf.WriteString("WAVE")

	// fmt subchunk
	buf.WriteString("fmt ")
	_ = binary.Write(buf, binary.LittleEndian, uint32(16))    // Subchunk1Size (16 for PCM)
	_ = binary.Write(buf, binary.LittleEndian, uint16(1))     // AudioFormat (1 = PCM)
	_ = binary.Write(buf, binary.LittleEndian, uint16(1))     // NumChannels (1 = Mono)
	_ = binary.Write(buf, binary.LittleEndian, uint32(16000)) // SampleRate (16000 Hz)
	_ = binary.Write(buf, binary.LittleEndian, uint32(32000)) // ByteRate (16000 * 1 * 16/8)
	_ = binary.Write(buf, binary.LittleEndian, uint16(2))     // BlockAlign (1 * 16/8)
	_ = binary.Write(buf, binary.LittleEndian, uint16(16))    // BitsPerSample (16 bits)

	// data subchunk
	buf.WriteString("data")
	_ = binary.Write(buf, binary.LittleEndian, dataLen)
	buf.Write(pcmBytes)

	return buf.Bytes()
}
