"""Publish the isolated Break log-domain baseline through the local API provider."""
import argparse
import base64
import importlib.util
import json
import ssl
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "js/model.js",
    "js/nav.js",
    "js/breaksim.js",
    "js/breakrender.js",
    "stage2-break.html",
    "break.css",
    "tests/model-postbreak.cjs",
    "tools/breakverify.cjs",
    "tools/publish-break.py",
]


def load_provider(provider_path):
    spec = importlib.util.spec_from_file_location("credential_provider", provider_path)
    provider = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(provider)
    provider.CTX = ssl.create_default_context()
    return provider


def publish(provider, expected_parent, message):
    prefix = "/repos/" + provider.REPO
    current = provider.call("GET", prefix + "/git/ref/heads/main")["object"]["sha"]
    if current != expected_parent:
        raise RuntimeError("Remote head changed; review before publishing")
    base_tree = provider.call("GET", prefix + "/git/commits/" + current)["tree"]["sha"]
    entries = []
    for relative_path in FILES:
        content = (ROOT / relative_path).read_bytes()
        blob = provider.call("POST", prefix + "/git/blobs", {
            "content": base64.b64encode(content).decode("ascii"),
            "encoding": "base64",
        })
        entries.append({"path": relative_path, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    tree = provider.call("POST", prefix + "/git/trees", {"base_tree": base_tree, "tree": entries})
    commit = provider.call("POST", prefix + "/git/commits", {
        "message": message,
        "tree": tree["sha"],
        "parents": [current],
    })
    provider.call("PATCH", prefix + "/git/refs/heads/main", {"sha": commit["sha"], "force": False})
    print(json.dumps({"commit": commit["sha"], "files": FILES}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", required=True, type=Path)
    parser.add_argument("--expected-parent", required=True)
    parser.add_argument("--message", required=True)
    args = parser.parse_args()
    publish(load_provider(args.provider), args.expected_parent, args.message)
