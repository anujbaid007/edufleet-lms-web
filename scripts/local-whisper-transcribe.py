#!/usr/bin/env python3
import argparse
import json
import sys

import mlx_whisper


def parse_args():
    parser = argparse.ArgumentParser(description="Transcribe one local audio file with MLX Whisper.")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--language", default="en")
    parser.add_argument("--model", default="mlx-community/whisper-tiny")
    parser.add_argument("--title", default="")
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    prompt = "School lesson transcription."
    if args.title:
        prompt += f" Lesson title: {args.title}."

    result = mlx_whisper.transcribe(
        args.audio,
        path_or_hf_repo=args.model,
        language=args.language,
        task="transcribe",
        verbose=False,
        initial_prompt=prompt,
        condition_on_previous_text=True,
    )

    text = (result.get("text") or "").strip()
    if not text:
        segments = result.get("segments") or []
        text = " ".join((segment.get("text") or "").strip() for segment in segments).strip()

    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump({"text": text}, handle, ensure_ascii=False)

    if not text:
        print("No transcript text produced.", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
