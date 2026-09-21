#!/usr/bin/env python3
"""Compile every study note in apuntes/src into its course notes/ folder.

Each note is a module in apuntes/src that exposes build(path) and writes its
own PDF when run directly. This runner just executes them all.

    python3 apuntes/build.py            # all notes
    python3 apuntes/build.py m7003k     # only notes whose filename matches
"""

import glob
import os
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")


def main(argv):
    needle = argv[1].lower() if len(argv) > 1 else ""
    notes = sorted(glob.glob(os.path.join(SRC, "*.py")))
    notes = [n for n in notes
             if not os.path.basename(n).startswith("_")
             and needle in os.path.basename(n).lower()]
    if not notes:
        print("no notes matched %r in %s" % (needle, SRC))
        return 1
    for note in notes:
        print("- %s" % os.path.basename(note))
        runpy.run_path(note, run_name="__main__")
    print("%d note(s) compiled" % len(notes))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
