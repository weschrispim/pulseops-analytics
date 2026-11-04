"""Run the copilot dataset. Offline by default. Live calls require --confirm-live."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps" / "ai-service" / "src"))
sys.path.insert(0, str(ROOT / "apps" / "ai-service" / "tests"))

from fixture_client import FixtureClient
from pulseops_ai.eval_runner import run_live, run_offline, write_results


def main() -> int:
    live = "--live" in sys.argv
    confirmed = "--confirm-live" in sys.argv
    if live and not confirmed:
        print("Recusado. A avaliação paga exige --confirm-live.", file=sys.stderr)
        return 2
    report = run_live(confirm="yes") if live else run_offline(client=FixtureClient())
    json_path, md_path = write_results(report)
    print(json_path)
    print(md_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
