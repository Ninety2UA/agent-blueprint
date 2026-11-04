"""The hosted film's score, synthesised from the beat sheet's music cues (BEATS.md) with the standard
library only, so it is the project's own work under no third-party licence and renders the same every
time. Writes a 44.1 kHz stereo 16-bit WAV.

    python3 score.py [out.wav]        default: assets/score.wav beside this file

Cues (seconds; BEATS.md, "Music" under each beat):
  0.0   a low sustained pad fades in over the first second, no percussion
  1.25  one soft pluck as the first fragment lands
  4.0   a muted pulse joins the pad (it holds under the typing, no keyboard sounds)
  7.2   one soft tick as the accent dot fills
  16.3  one clean hit on Send
  19.5  a bass note enters as the request lands in the sandbox
  26.2 to 31.0  one light note as each stage row finishes, rising row by row
  33.0  the chord resolves on the pull request button
  END_HIT  a soft final hit with the mark's last cell, then the music fades over the last 1.5 s
"""
import math
import pathlib
import random
import struct
import sys
import wave

SR = 44100
LENGTH = 43.0
N = int(SR * LENGTH)
END_HIT = 38.3          # the mark's last cell (composition.html, beat 7)
FADE_OUT = (41.5, 43.0)

rng = random.Random(7)  # seeded: the pluck noise is the same on every run
L = [0.0] * N
R = [0.0] * N


def hz(note):
    """MIDI note number to frequency."""
    return 440.0 * 2 ** ((note - 69) / 12)


def add(buf_l, buf_r, start, samples, pan=0.0, gain=1.0):
    """Mix mono samples in at `start` seconds, panned -1 (left) to 1 (right) at equal power."""
    a = (pan + 1) * math.pi / 4
    gl, gr = math.cos(a) * gain, math.sin(a) * gain
    i0 = int(start * SR)
    for k, s in enumerate(samples):
        i = i0 + k
        if i >= N:
            break
        buf_l[i] += s * gl
        buf_r[i] += s * gr


def env(t, attack, release, total):
    if t < attack:
        return 0.5 - 0.5 * math.cos(math.pi * t / attack)
    if t > total - release:
        return max(0.0, 0.5 + 0.5 * math.cos(math.pi * (t - (total - release)) / release))
    return 1.0


def pad_voice(note, start, end, attack, release, detune=0.18):
    """Two slightly detuned sines and a quiet octave, slow attack and release: a soft sustained pad."""
    f = hz(note)
    total = end - start
    out = []
    p1 = p2 = p3 = 0.0
    for k in range(int(total * SR)):
        t = k / SR
        p1 += 2 * math.pi * (f - detune) / SR
        p2 += 2 * math.pi * (f + detune) / SR
        p3 += 2 * math.pi * 2 * f / SR
        s = 0.5 * math.sin(p1) + 0.5 * math.sin(p2) + 0.12 * math.sin(p3)
        out.append(s * env(t, attack, release, total))
    return out


def pluck(note, dur=1.6, bright=0.5):
    """Karplus-Strong string: a seeded noise burst through a damped delay line."""
    period = max(2, int(SR / hz(note)))
    line = [rng.uniform(-1, 1) for _ in range(period)]
    # soften the burst so the attack is a pluck, not a click
    for _ in range(2):
        line = [(line[i] + line[i - 1]) * 0.5 for i in range(period)]
    out = []
    damp = 0.996 - 0.004 * (1 - bright)
    for k in range(int(dur * SR)):
        i = k % period
        s = line[i]
        line[i] = damp * 0.5 * (line[i] + line[(i + 1) % period])
        out.append(s * env(k / SR, 0.004, 0.4, dur))
    return out


def thump(freq=58.0, dur=0.32, drop=2.2):
    """A muted low pulse: a sine whose pitch and level fall quickly."""
    out, ph = [], 0.0
    for k in range(int(dur * SR)):
        t = k / SR
        ph += 2 * math.pi * freq * (1 + drop * math.exp(-t * 38)) / SR
        out.append(math.sin(ph) * math.exp(-t * 11) * env(t, 0.006, 0.05, dur))
    return out


def tick(freq=2600.0, dur=0.09):
    """A soft high tick: a short sine blip."""
    return [math.sin(2 * math.pi * freq * k / SR) * math.exp(-k / SR * 60) for k in range(int(dur * SR))]


def mallet(note, dur=1.8):
    """A clean struck tone: fundamental and a quiet inharmonic partial, fast attack, long decay."""
    f = hz(note)
    out = []
    for k in range(int(dur * SR)):
        t = k / SR
        s = math.sin(2 * math.pi * f * t) + 0.25 * math.sin(2 * math.pi * f * 2.76 * t) * math.exp(-t * 9)
        out.append(s * math.exp(-t * 2.6) * env(t, 0.003, 0.3, dur))
    return out


# the pad: D suspended (D3 A3 D4 E4 G4) to 33.0, resolving to D major (G4 to F#4) from 33.0 to the end
for note, pan in ((50, -0.3), (57, 0.25), (62, -0.1), (64, 0.35)):
    add(L, R, 0.0, pad_voice(note, 0.0, LENGTH, 1.0, 0.05), pan, 0.075)
add(L, R, 0.0, pad_voice(67, 0.0, 33.25, 1.0, 0.45), 0.1, 0.06)       # G4, the suspension
add(L, R, 32.85, pad_voice(66, 32.85, LENGTH, 0.4, 0.05), 0.1, 0.07)  # F#4, the resolution

# 1.25 s: one soft pluck as the fragment lands
add(L, R, 1.25, pluck(74, 2.4, 0.4), 0.15, 0.22)

# 4.0 s: the muted pulse, on the beat at 100 BPM, under the typing; it stops as the chord resolves
beat = 0.6
t = 4.0
while t < 32.4:
    add(L, R, t, thump(), 0.0, 0.32 if round((t - 4.0) / beat) % 2 == 0 else 0.2)
    t += beat

# 7.2 s: a soft tick as the accent dot fills
add(L, R, 7.2, tick(), 0.2, 0.08)

# 16.3 s: one clean hit on Send
add(L, R, 16.3, mallet(74, 2.2), 0.0, 0.24)
add(L, R, 16.3, thump(52, 0.5, 1.5), 0.0, 0.35)

# 19.5 s: the bass note, held to the resolution
add(L, R, 19.5, pad_voice(38, 19.5, 33.4, 0.8, 0.5, 0.05), 0.0, 0.16)

# one light note per finished stage row, rising (D pentatonic)
for i, note in enumerate((74, 76, 78, 81, 83)):
    add(L, R, 26.2 + 1.2 * i, pluck(note, 1.4, 0.7), -0.2 + 0.1 * i, 0.16)

# 33.0 s: the resolution, struck
add(L, R, 33.0, mallet(66, 3.0), -0.1, 0.2)
add(L, R, 33.0, mallet(62, 3.0), 0.1, 0.16)

# the final hit with the mark's last cell
add(L, R, END_HIT, mallet(62, 3.5), 0.0, 0.22)
add(L, R, END_HIT, pluck(74, 3.0, 0.5), 0.1, 0.12)

# fade out over the last 1.5 s, ending at 43.0 s; normalise the peak to -3 dBFS
f0, f1 = (int(x * SR) for x in FADE_OUT)
for i in range(f0, N):
    g = 0.5 + 0.5 * math.cos(math.pi * (i - f0) / (f1 - f0))
    L[i] *= g
    R[i] *= g
peak = max(max(abs(x) for x in L), max(abs(x) for x in R)) or 1.0
scale = 10 ** (-3 / 20) / peak

out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent / "assets" / "score.wav"
out.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    frames = bytearray()
    for a, b in zip(L, R):
        frames += struct.pack("<hh", int(max(-1, min(1, a * scale)) * 32767), int(max(-1, min(1, b * scale)) * 32767))
    w.writeframes(bytes(frames))
print("wrote", out, f"{LENGTH} s")
