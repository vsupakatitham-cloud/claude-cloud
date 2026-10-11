#!/usr/bin/env python3
"""Read and edit the data built into the Thai Outbound Tracker page.

The page keeps all of its data in two lines of JavaScript:

    const RAW = {...};   months, and one entry per destination (series, notes, cadence...)
    const META = {...};  "through", "updated", "next" and the notes box

This tool rewrites only those two lines, so the rest of the page is never touched.

Usage (PAGE defaults to ../page.html):
    tracker.py [--page PAGE] strip SRC              copy a downloaded artifact page into PAGE,
                                                    removing the publish-time <html><body> shell
    tracker.py [--page PAGE] show [KEY]             latest figures per destination (or one in full)
    tracker.py [--page PAGE] set KEY YYYY-MM VALUE STATUS
                                                    VALUE is an integer or "null"; STATUS is one of
                                                    final, provisional, prelim, derived (or null)
    tracker.py [--page PAGE] field KEY FIELD JSON   set any destination field (notes, nextText,
                                                    cadence, annual, quarterly, body, url...)
    tracker.py [--page PAGE] meta FIELD JSON        set a META field (through, updated, next, notes)
    tracker.py [--page PAGE] add-month YYYY-MM      append a month column (null for every destination)
    tracker.py [--page PAGE] export OUTDIR          write thai_outbound.csv and thai_outbound.md
"""
import argparse
import csv
import json
import re
import sys
from pathlib import Path

DEFAULT_PAGE = Path(__file__).resolve().parent.parent / "page.html"
STATUSES = {"final", "provisional", "prelim", "derived", None}
LINE = {"RAW": re.compile(r"^const RAW = (\{.*\});$", re.M), "META": re.compile(r"^const META = (\{.*\});$", re.M)}


def load(page):
    html = page.read_text(encoding="utf-8")
    data = {}
    for name, rx in LINE.items():
        m = rx.search(html)
        if not m:
            sys.exit(f"could not find the 'const {name} = ...;' line in {page}")
        data[name] = json.loads(m.group(1))
    return html, data["RAW"], data["META"]


def save(page, html, raw, meta):
    for name, obj in (("RAW", raw), ("META", meta)):
        line = f"const {name} = " + json.dumps(obj, ensure_ascii=False) + ";"
        html = LINE[name].sub(lambda _m: line, html, count=1)
    page.write_text(html, encoding="utf-8")


def dest(raw, key):
    for d in raw["dest"]:
        if d["key"] == key:
            return d
    sys.exit(f"unknown destination key {key!r}; known: {', '.join(d['key'] for d in raw['dest'])}")


def latest(d):
    pub = [s for s in d["series"] if s["v"] is not None]
    return pub[-1] if pub else None


def cmd_strip(args):
    src = Path(args.src).read_text(encoding="utf-8")
    if "<body>" in src and src.rstrip().endswith("</body></html>"):
        start = src.index("<body>") + len("<body>")
        if src[start] == "\n":
            start += 1
        src = src[start:src.rindex("</body></html>")].rstrip("\n") + "\n"
    args.page.write_text(src, encoding="utf-8")
    load(args.page)  # validates that the data lines are present
    print(f"wrote {args.page} ({len(src)} bytes)")


def cmd_show(args):
    _, raw, meta = load(args.page)
    if args.key:
        print(json.dumps(dest(raw, args.key), ensure_ascii=False, indent=1))
        return
    print(f"META through={meta['through']!r} updated={meta['updated']!r} next={meta['next']!r}")
    print(f"months {raw['months'][0]} .. {raw['months'][-1]}")
    for d in raw["dest"]:
        f = d.get("freq", "monthly")
        if f == "monthly":
            last = latest(d)
            tail = [f"{s['m']}={s['v']}({s['s']})" for s in d["series"] if s["v"] is not None][-3:]
            print(f"{d['key']:15} monthly   latest {last['m'] if last else '-':8} {' '.join(tail)}")
        elif f in ("quarterly", "cumulative"):
            q = [x for x in (d.get("quarterly") or []) if x.get("v") is not None]
            print(f"{d['key']:15} {f:9} latest {q[-1]['q'] if q else '-'} = {q[-1]['v'] if q else '-'}")
        else:
            print(f"{d['key']:15} {f:9} (no official series)")
        print(f"{'':15} next: {d.get('nextText', '')}")


def cmd_set(args):
    html, raw, meta = load(args.page)
    d = dest(raw, args.key)
    value = None if args.value == "null" else int(args.value.replace(",", ""))
    status = None if args.status == "null" else args.status
    if status not in STATUSES:
        sys.exit(f"status must be one of {sorted(s for s in STATUSES if s)} or null")
    for s in d["series"]:
        if s["m"] == args.month:
            old = (s["v"], s["s"])
            s["v"], s["s"] = value, status
            save(args.page, html, raw, meta)
            print(f"{args.key} {args.month}: {old[0]} ({old[1]}) -> {value} ({status})")
            return
    sys.exit(f"{args.month} is not a month column; run add-month first")


def cmd_field(args):
    html, raw, meta = load(args.page)
    d = dest(raw, args.key)
    d[args.field] = json.loads(args.json)
    save(args.page, html, raw, meta)
    print(f"{args.key}.{args.field} updated")


def cmd_meta(args):
    html, raw, meta = load(args.page)
    meta[args.field] = json.loads(args.json)
    save(args.page, html, raw, meta)
    print(f"META.{args.field} updated")


def cmd_add_month(args):
    html, raw, meta = load(args.page)
    if not re.fullmatch(r"\d{4}-\d{2}", args.month):
        sys.exit("month must be YYYY-MM")
    if args.month in raw["months"]:
        print(f"{args.month} already present")
        return
    raw["months"].append(args.month)
    raw["months"].sort()
    for d in raw["dest"]:
        d["series"].append({"m": args.month, "v": None, "s": None})
        d["series"].sort(key=lambda s: s["m"])
    save(args.page, html, raw, meta)
    print(f"added {args.month}")


def cmd_export(args):
    _, raw, meta = load(args.page)
    out = Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)
    monthly = [d for d in raw["dest"] if d.get("freq", "monthly") == "monthly"]
    with open(out / "thai_outbound.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["destination", "key", "month", "arrivals", "status", "source"])
        for d in monthly:
            for s in d["series"]:
                if s["v"] is not None:
                    w.writerow([d["name"], d["key"], s["m"], s["v"], s["s"], d["url"]])
        for d in raw["dest"]:
            if d.get("freq") in ("quarterly", "cumulative"):
                for q in d.get("quarterly") or []:
                    w.writerow([d["name"], d["key"], q["q"], q["v"], q.get("s"), d["url"]])
    lines = [
        "# Thai Outbound Tracker",
        "",
        f"Data through {meta['through']}. Last refreshed {meta['updated']}; next refresh {meta['next']}.",
        "",
        "Monthly arrivals of Thai residents/nationals counted at each destination "
        "(p = preliminary or provisional, d = derived).",
        "",
        "| Month | " + " | ".join(d["name"] for d in monthly) + " |",
        "|---|" + "---:|" * len(monthly),
    ]
    for m in raw["months"]:
        cells = []
        for d in monthly:
            s = next((x for x in d["series"] if x["m"] == m), None)
            if not s or s["v"] is None:
                cells.append("—")
            else:
                flag = "" if s["s"] == "final" else ("d" if s["s"] == "derived" else "p")
                cells.append(f"{s['v']:,}{flag}")
        lines.append(f"| {m} | " + " | ".join(cells) + " |")
    lines += ["", "## Lower-frequency and untracked destinations", ""]
    for d in raw["dest"]:
        f = d.get("freq", "monthly")
        if f in ("quarterly", "cumulative"):
            q = ", ".join(f"{x['q']}: {x['v']:,}" for x in d.get("quarterly") or [] if x.get("v") is not None)
            lines.append(f"- **{d['name']}** ({f}): {q}. {d['notes']}")
        elif f == "none":
            lines.append(f"- **{d['name']}**: no official series. {d['notes']}")
    lines += ["", "## Sources and release calendar", ""]
    for d in raw["dest"]:
        lines.append(f"- **{d['name']}** — {d['body']} {d['cadence']} <{d['url']}>")
    (out / "thai_outbound.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {out / 'thai_outbound.csv'} and {out / 'thai_outbound.md'}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--page", type=Path, default=DEFAULT_PAGE)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("strip"); p.add_argument("src"); p.set_defaults(fn=cmd_strip)
    p = sub.add_parser("show"); p.add_argument("key", nargs="?"); p.set_defaults(fn=cmd_show)
    p = sub.add_parser("set"); p.add_argument("key"); p.add_argument("month"); p.add_argument("value"); p.add_argument("status"); p.set_defaults(fn=cmd_set)
    p = sub.add_parser("field"); p.add_argument("key"); p.add_argument("field"); p.add_argument("json"); p.set_defaults(fn=cmd_field)
    p = sub.add_parser("meta"); p.add_argument("field"); p.add_argument("json"); p.set_defaults(fn=cmd_meta)
    p = sub.add_parser("add-month"); p.add_argument("month"); p.set_defaults(fn=cmd_add_month)
    p = sub.add_parser("export"); p.add_argument("outdir"); p.set_defaults(fn=cmd_export)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
