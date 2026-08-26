#!/usr/bin/env python3
"""Concatenate self-owned sources for software-copyright identification pages."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent / "generated"
ORDER = [
    "shared/ulid.ts",
    "shared/catalog.ts",
    "shared/mixSchema.ts",
    "server/index.ts",
    "server/catalog.ts",
    "server/mixes.ts",
    "server/static.ts",
    "src/brand.ts",
    "src/main.tsx",
    "src/App.tsx",
    "src/api/client.ts",
    "src/mix/store.ts",
    "src/audio/volume.ts",
    "src/audio/shuffle.ts",
    "src/audio/MixEngine.ts",
    "src/backgrounds/match.ts",
    "src/play/nav.ts",
    "src/play/session.ts",
    "src/moment/tags.ts",
    "src/moment/weather.ts",
    "src/moment/compose.ts",
    "src/moment/useMoment.ts",
    "src/poetry/types.ts",
    "src/poetry/verse.ts",
    "src/poetry/match.ts",
    "src/poetry/useVerseCycle.ts",
    "src/poetry/VerseCard.tsx",
    "src/effects/compositor.ts",
    "src/effects/RainGlass.ts",
    "src/effects/WaterRipple.ts",
    "src/components/LegalGate.tsx",
    "src/components/AboutModal.tsx",
    "src/components/MomentPanel.tsx",
    "src/pages/LibraryPage.tsx",
    "src/pages/PlayPage.tsx",
]
LINES_PER_PAGE = 50
PAGES = 30
CHUNK = LINES_PER_PAGE * PAGES


def collect() -> list[str]:
    lines: list[str] = []
    for rel in ORDER:
        path = ROOT / rel
        if not path.is_file():
            continue
        body = path.read_text(encoding="utf-8").splitlines()
        lines.append(f"// ===== FILE: {rel} =====")
        lines.extend(body if body else [""])
        if not lines[-1].endswith("\n") and lines[-1] != "":
            pass
        lines.append("")
    return lines


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    lines = collect()
    all_text = "\n".join(lines) + "\n"
    (OUT / "source-all.txt").write_text(all_text, encoding="utf-8")
    n = len(lines)
    first = lines[:CHUNK]
    last = lines[-CHUNK:] if n > CHUNK else lines
    (OUT / "source-first-30p.txt").write_text("\n".join(first) + "\n", encoding="utf-8")
    (OUT / "source-last-30p.txt").write_text("\n".join(last) + "\n", encoding="utf-8")
    print(f"files={len(ORDER)} lines={n} wrote {OUT}")


if __name__ == "__main__":
    main()
