import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "assets", "audio");
mkdirSync(output, { recursive: true });

const sampleRate = 44_100;

function synth(name, duration, notes, volume = 0.28) {
  const count = Math.floor(sampleRate * duration);
  const pcm = new Int16Array(count);
  for (let i = 0; i < count; i += 1) {
    const time = i / sampleRate;
    const attack = Math.min(1, time / 0.012);
    const release = Math.max(0, Math.min(1, (duration - time) / Math.min(0.12, duration / 2)));
    let value = 0;
    for (const note of notes) {
      if (time < note.start || time >= note.end) continue;
      const local = time - note.start;
      const noteRelease = Math.max(0, Math.min(1, (note.end - time) / 0.06));
      value += Math.sin(2 * Math.PI * note.hz * local) * noteRelease / notes.length;
      value += Math.sin(2 * Math.PI * note.hz * 2 * local) * noteRelease * 0.12 / notes.length;
    }
    pcm[i] = Math.round(Math.max(-1, Math.min(1, value * attack * release * volume)) * 32_767);
  }

  const dataBytes = pcm.byteLength;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);
  Buffer.from(pcm.buffer).copy(wav, 44);
  writeFileSync(join(output, `${name}.wav`), wav);
}

synth("tap", 0.1, [{ hz: 660, start: 0, end: 0.08 }], 0.16);
synth("place", 0.16, [{ hz: 330, start: 0, end: 0.13 }, { hz: 495, start: 0.04, end: 0.14 }]);
synth("scan", 0.42, [{ hz: 250, start: 0, end: 0.16 }, { hz: 500, start: 0.15, end: 0.3 }, { hz: 750, start: 0.29, end: 0.4 }], 0.22);
synth("hit", 0.42, [{ hz: 160, start: 0, end: 0.2 }, { hz: 96, start: 0.08, end: 0.38 }], 0.34);
synth("success", 0.72, [{ hz: 392, start: 0, end: 0.2 }, { hz: 523.25, start: 0.19, end: 0.42 }, { hz: 659.25, start: 0.4, end: 0.7 }], 0.3);
synth("failure", 0.64, [{ hz: 392, start: 0, end: 0.22 }, { hz: 293.66, start: 0.2, end: 0.42 }, { hz: 220, start: 0.4, end: 0.62 }], 0.24);
synth("echo-ember", 0.42, [{ hz: 196, start: 0, end: 0.4 }], 0.24);
synth("echo-tide", 0.46, [{ hz: 293.66, start: 0, end: 0.2 }, { hz: 392, start: 0.2, end: 0.44 }], 0.22);
synth("echo-nova", 0.34, [{ hz: 659.25, start: 0, end: 0.3 }, { hz: 987.77, start: 0.07, end: 0.25 }], 0.2);
synth("echo-bloom", 0.52, [{ hz: 261.63, start: 0, end: 0.22 }, { hz: 329.63, start: 0.14, end: 0.36 }, { hz: 523.25, start: 0.3, end: 0.5 }], 0.24);
synth("echo-comet", 0.38, [{ hz: 783.99, start: 0, end: 0.14 }, { hz: 523.25, start: 0.12, end: 0.26 }, { hz: 392, start: 0.24, end: 0.36 }], 0.22);
synth("lounge-loop", 4, [
  { hz: 196, start: 0, end: 1 }, { hz: 246.94, start: 0.5, end: 1.5 },
  { hz: 293.66, start: 1, end: 2 }, { hz: 246.94, start: 1.5, end: 2.5 },
  { hz: 220, start: 2, end: 3 }, { hz: 261.63, start: 2.5, end: 3.5 },
  { hz: 196, start: 3, end: 4 },
], 0.09);

console.log(`Generated 12 original WAV cues in ${output}`);
