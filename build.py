#!/usr/bin/env python3
"""Assemble index.html from its parts. Run after editing any of them."""
import json, pathlib
d = pathlib.Path(__file__).parent
eng = (d/"k4.js").read_text().replace("export function","function").replace("export const","const")
js = ("<script>\n(function(){\n" + eng
      + "\nconst EXAMPLE = " + json.dumps((d/"example_trace.txt").read_text()) + ";\n"
      + "const SELFTEST = " + (d/"selftest_cases.json").read_text() + ";\n"
      + (d/"app.js").read_text() + "\n" + (d/"ctrl.js").read_text() + "\n})();\n</script>")
out = (d/"head.html").read_text() + (d/"body.html").read_text() + js
(d/"index.html").write_text(out)
print(f"index.html written, {len(out)} bytes")
