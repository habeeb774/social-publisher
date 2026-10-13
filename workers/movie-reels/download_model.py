"""Pre-provision a faster-whisper model for offline Arabic transcription.

Run once on a machine with internet, then copy/mount the folder read-only into the worker:
  pip install huggingface_hub
  python download_model.py small  models/whisper-small    # ~0.5 GB, 4 GB RAM OK
  python download_model.py medium models/whisper-medium   # ~1.5 GB, better Arabic, slower
Worker env: MOVIE_WHISPER_MODEL_DIR=/models/whisper-small (loaded with local_files_only=True).
"""
import sys

REPOS = {"small": "Systran/faster-whisper-small", "medium": "Systran/faster-whisper-medium", "large-v3": "Systran/faster-whisper-large-v3"}

def main(argv):
    if len(argv) != 3 or argv[1] not in REPOS:
        sys.exit(f"usage: python download_model.py {{{'|'.join(REPOS)}}} <target_dir>")
    from huggingface_hub import snapshot_download
    path = snapshot_download(REPOS[argv[1]], local_dir=argv[2])
    print(f"model ready: {path}")

if __name__ == "__main__":
    main(sys.argv)
