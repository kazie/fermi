"""FerMEANie's voice: renders sentences to Opus and MP3 clips. Spawned by the game server (src/voice/worker.ts).

Reads JSON lines on stdin: {"id": "...", "text": "One sentence.", "out": "/data/voice/<key>"}
Writes <out>.webm and <out>.mp3 (atomically), then answers on stdout:
  {"id": "...", "ok": true}   or   {"id": "...", "ok": false, "error": "..."}
Prints {"ready": true, "versions": {...}} once the model is loaded (the installed versions of the packages that
shape the sound, for the server to compare with uv.lock). Settings come from content/voice/voice.json, dependencies
from pyproject.toml and uv.lock next to this file (see content/VOICE.md).

  uv run --project apps/server/voice --frozen python apps/server/voice/worker.py \
    --config content/voice/voice.json --models DIR [--warm]
"""

import argparse
import hashlib
import importlib.metadata
import json
import os
import socket
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np

SR = 24000
OUT_SR = 48000


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def fetch(file: dict, models: Path) -> Path:
    """A model file ({url, sha256} in voice.json), downloaded once and checked: the exact file the voice was chosen with."""
    socket.setdefaulttimeout(60)  # a stalled download fails instead of hanging the server's worker
    dest = models / file["url"].rsplit("/", 1)[-1]
    if not dest.exists() or sha256(dest) != file["sha256"]:
        models.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(dest.suffix + ".part")
        urllib.request.urlretrieve(file["url"], tmp)
        if sha256(tmp) != file["sha256"]:
            tmp.unlink()
            raise RuntimeError(f"{dest.name}: checksum mismatch (not the file voice.json names)")
        tmp.rename(dest)
    return dest


class Kokoro:
    """Kokoro-82M through kokoro-onnx. Another engine would be another class like this one (see ENGINES)."""

    def __init__(self, config: dict, models: Path):
        import onnxruntime
        from kokoro_onnx import Kokoro as Model

        # errors only: the fp16 model makes onnxruntime warn, harmlessly, about every node it can't pre-compute on a CPU
        onnxruntime.set_default_logger_severity(3)

        onnx = fetch(config["model"]["onnx"], models)
        voices = fetch(config["model"]["voices"], models)
        self.k = Model(str(onnx), str(voices))
        self.config = config
        self.style = sum(self.k.get_voice_style(v) * w for v, w in config["blend"])
        self.lang = config["lang"]
        # Words Kokoro gets wrong: phonemize a stand-in word, then swap its phonemes for the right ones.
        self.pronounce = [
            (p["word"], p["placeholder"], self.k.tokenizer.phonemize(p["placeholder"], self.lang).strip(), p["ipa"])
            for p in config.get("pronounce", [])
        ]

    def speak(self, text: str) -> np.ndarray:
        swaps = [p for p in self.pronounce if p[0] in text]
        for word, placeholder, _, _ in swaps:
            text = text.replace(word, placeholder)
        if swaps:
            text = self.k.tokenizer.phonemize(text, self.lang)
            for _, _, said, ipa in swaps:
                text = text.replace(said, ipa)
        samples, sr = self.k.create(text, voice=self.style, speed=self.config["speed"], lang=self.lang, is_phonemes=bool(swaps))
        assert sr == SR, sr
        return samples.astype(np.float32)


ENGINES = {"kokoro": Kokoro}


def installed(names: list[str]) -> dict[str, str | None]:
    """The installed version of each package (None if it isn't: a newer engine may have dropped one)."""
    versions: dict[str, str | None] = {}
    for name in names:
        try:
            versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            versions[name] = None
    return versions


def ffmpeg(args: list[str], audio: np.ndarray | None = None) -> bytes:
    run = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
        input=None if audio is None else audio.astype(np.float32).tobytes(),
        capture_output=True,
        check=False,
    )
    if run.returncode:
        raise RuntimeError(run.stderr.decode(errors="replace").strip() or "ffmpeg failed")
    return run.stdout


def effects(audio: np.ndarray, chain: str, loudness_db: float) -> np.ndarray:
    raw = ffmpeg(["-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:", "-af", f"{chain},aresample={OUT_SR}",
                  "-f", "f32le", "-ac", "1", "pipe:"], audio)
    out = np.frombuffer(raw, dtype=np.float32).copy()
    # Every clip at the same loudness (RMS), so sentences joined into a line match; peaks kept below clipping.
    rms = float(np.sqrt(np.mean(out**2))) if len(out) else 0
    if rms > 0:
        out *= min(10 ** (loudness_db / 20) / rms, 0.95 / float(np.max(np.abs(out))))
    return out


def encode(audio: np.ndarray, out: str, opus_kbps: int) -> None:
    """Both formats from one ffmpeg run, each written under a temporary name and then moved into place."""
    ffmpeg(["-f", "f32le", "-ar", str(OUT_SR), "-ac", "1", "-i", "pipe:",
            "-c:a", "libopus", "-b:a", f"{opus_kbps}k", f"{out}.tmp.webm",
            "-c:a", "libmp3lame", "-q:a", "5", f"{out}.tmp.mp3"], audio)
    for ext in (".webm", ".mp3"):
        os.replace(f"{out}.tmp{ext}", out + ext)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True, type=Path)
    ap.add_argument("--models", required=True, type=Path)
    ap.add_argument("--warm", action="store_true", help="download the model, render one sentence, exit")
    args = ap.parse_args()

    config = json.loads(args.config.read_text())
    voice = ENGINES[config["engine"]](config, args.models)
    if args.warm:
        effects(voice.speak("Warm up."), config["effects"], config["loudnessDb"])
        print("warm", flush=True)
        return

    print(json.dumps({"ready": True, "versions": installed(config.get("engineDeps", []))}), flush=True)
    for line in sys.stdin:
        if not line.strip():
            continue
        job = json.loads(line)
        try:
            audio = effects(voice.speak(job["text"]), config["effects"], config["loudnessDb"])
            encode(audio, job["out"], config["opusKbps"])
            reply = {"id": job["id"], "ok": True}
        except Exception as e:  # one bad sentence must not take the worker down
            reply = {"id": job.get("id"), "ok": False, "error": str(e)[:500]}
        print(json.dumps(reply), flush=True)


if __name__ == "__main__":
    main()
