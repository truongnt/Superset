# -*- coding: utf-8 -*-
"""
Extensible data-consistency check framework for the ECDS Superset dashboards.

Goal: catch "vênh" (number mismatches between tabs/charts that are supposed
to represent the same underlying total) automatically, instead of relying on
a user to spot them by eye and report each one individually.

How to add a new rule: append a dict to CHECKS below. Each rule is
self-contained - a `run(ctx)` callable that fetches whatever rendered chart
text it needs via `ctx.get_chart_text(dashboard_id, chart_id)` (cached per
run, dashboard navigated to once) and returns a result dict with at least
`passed: bool`. Prefer reusing the generic extractors (extract_after_label,
extract_alternating_row_sum, extract_table_total) over writing bespoke
regexes per chart - most of this project's ecds_html_widget KPI cards and
"Tổng cộng" summary tables share the same rendered shape.

Some mismatches are EXPECTED/documented (e.g. a widget that intentionally
shows all-time totals instead of YTD) - set `known_caveat` on those checks
so the report distinguishes "known, accepted difference" from "new/unexplained
mismatch that needs investigating".

Run directly: `python tools/data_checks.py` (writes tools-adjacent report,
see bottom). Or import `run_all()` / `CHECKS` for programmatic use.
"""
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import superset_selenium as ss  # noqa: E402

try:
    import psycopg2
except ImportError:
    psycopg2 = None


# ── Text/number parsing helpers ──────────────────────────────────────────

def parse_vn_number(s):
    """'68.596' -> 68596, '1.968.985' -> 1968985, '0.007%' -> 0.007 (float)."""
    if s is None:
        return None
    s = s.strip().rstrip('%').strip()
    if not s:
        return None
    s = s.replace('.', '')  # Vietnamese thousands separator
    try:
        return int(s)
    except ValueError:
        try:
            return float(s)
        except ValueError:
            return None


def extract_after_label(text, label, occurrence=0):
    """
    Find an exact-match line `label` in the rendered text block and return
    the first number-looking token on one of the next couple of lines.
    Matches the ecds_html_widget KPI-card shape: label on its own line,
    immediately followed by a line that's just the value.
    """
    if not text:
        return None
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    matches = [i for i, l in enumerate(lines) if l == label]
    if len(matches) <= occurrence:
        return None
    idx = matches[occurrence]
    for j in range(idx + 1, min(idx + 3, len(lines))):
        m = re.search(r'[\d][\d.,]*%?', lines[j])
        if m:
            return parse_vn_number(m.group())
    return None


def extract_table_total(text, row_label="Tổng cộng", col_index=0):
    """First number after `row_label` on its row (single-metric-per-column tables)."""
    if not text:
        return None
    for line in text.splitlines():
        if line.strip().startswith(row_label):
            nums = re.findall(r'[\d][\d.,]*', line)
            if len(nums) > col_index:
                return parse_vn_number(nums[col_index])
    return None


def extract_alternating_row_sum(text, row_label="Tổng cộng", stride=2, offset=0):
    """
    For a summary row where values alternate between two metrics per period
    (e.g. "Mắc Chết Mắc Chết ..." per month: 14.986 2 7.623 0 ..."), sum
    every `stride`-th number starting at `offset` (offset=0 -> first metric
    of each pair/group, e.g. "Mắc"; offset=1 -> second, e.g. "Chết").
    """
    if not text:
        return None
    for line in text.splitlines():
        if line.strip().startswith(row_label):
            nums = [parse_vn_number(n) for n in re.findall(r'[\d][\d.,]*', line)]
            selected = nums[offset::stride]
            if not selected:
                return None
            return sum(v for v in selected if v is not None)
    return None


# ── Shared browser/session context ───────────────────────────────────────

class CheckContext:
    """
    Shared state across all checks in a run: one logged-in Selenium session
    (lazy - only launched on first use, so pure-DB checks don't pay the
    browser startup cost) plus lazy psycopg2 connections to both databases.
    """

    def __init__(self, headless=True):
        self._headless = headless
        self._driver = None
        self._superset_conn = None
        self._ecds_conn = None
        self._dashboard_loaded = None
        self._chart_cache = {}

    @property
    def driver(self):
        if self._driver is None:
            self._driver = ss.get_driver(headless=self._headless)
            ss.login(self._driver)
        return self._driver

    def db(self, dbname="superset"):
        """Read-only psycopg2 connection, reused across checks in this run."""
        if dbname not in ("superset", "ecds"):
            raise ValueError(dbname)
        attr = f"_{dbname}_conn"
        if getattr(self, attr) is None:
            env = ss.load_env()
            for k in ("PGHOST", "PGPORT", "PGUSER", "PGPASSWORD"):
                if k in env:
                    os.environ[k] = env[k]
            conn = psycopg2.connect(dbname=dbname)
            conn.set_session(readonly=True, autocommit=True)
            setattr(self, attr, conn)
        return getattr(self, attr)

    def get_chart_text(self, dashboard_id, chart_id, tab_wait=4, load_wait=8):
        cache_key = (dashboard_id, chart_id)
        if cache_key in self._chart_cache:
            return self._chart_cache[cache_key]
        if self._dashboard_loaded != dashboard_id:
            ss.goto_dashboard(self.driver, dashboard_id, extra_wait=load_wait)
            self._dashboard_loaded = dashboard_id
            self._chart_cache = {}
        text = ss.get_chart_text_on_dashboard(self.driver, chart_id)
        if text is None:
            found = ss.click_tab_containing_chart(
                self.driver, chart_id, wait_each=tab_wait, wait_after_found=load_wait
            )
            text = ss.get_chart_text_on_dashboard(self.driver, chart_id) if found else None
        self._chart_cache[cache_key] = text
        return text

    def close(self):
        if self._driver is not None:
            self._driver.quit()
        if self._superset_conn is not None:
            self._superset_conn.close()
        if self._ecds_conn is not None:
            self._ecds_conn.close()


# ── Reusable check bodies (parameterized by disease/chart id) ───────────

def check_tong_ca_vs_danh_sach(ctx, dashboard_id, kpi_chart, list_chart, disease_label):
    kpi_text = ctx.get_chart_text(dashboard_id, kpi_chart)
    list_text = ctx.get_chart_text(dashboard_id, list_chart, load_wait=15)
    kpi_val = extract_after_label(kpi_text, f"Tổng ca {disease_label}")
    list_val = None
    if list_text:
        m = re.search(r'([\d][\d.,]*)\s*dòng', list_text)
        if m:
            list_val = parse_vn_number(m.group(1))
    return {
        "kpi_value": kpi_val,
        "list_value": list_val,
        "passed": kpi_val is not None and kpi_val == list_val,
    }


def check_tong_ca_vs_monthly_sum(ctx, dashboard_id, kpi_chart, monthly_chart, disease_label):
    kpi_text = ctx.get_chart_text(dashboard_id, kpi_chart)
    monthly_text = ctx.get_chart_text(dashboard_id, monthly_chart)
    kpi_val = extract_after_label(kpi_text, f"Tổng ca {disease_label}")
    monthly_total = extract_alternating_row_sum(monthly_text, "Tổng cộng", stride=2, offset=0)
    return {
        "kpi_value": kpi_val,
        "monthly_sum": monthly_total,
        "passed": kpi_val is not None and kpi_val == monthly_total,
    }


def check_tong_ca_vs_phan_do(ctx, dashboard_id, kpi_chart, phan_do_chart, disease_label):
    kpi_text = ctx.get_chart_text(dashboard_id, kpi_chart)
    pd_text = ctx.get_chart_text(dashboard_id, phan_do_chart)
    kpi_val = extract_after_label(kpi_text, f"Tổng ca {disease_label}")
    pd_val = extract_after_label(pd_text, "Tổng số ca")
    return {
        "kpi_value": kpi_val,
        "phan_do_total": pd_val,
        "passed": kpi_val is not None and kpi_val == pd_val,
    }


def check_granularity_sync(ctx, viz_types=("ecds_html_widget",)):
    """
    DB-only (no Selenium): every chart whose dataset declares a
    `main_dttm_col` should have a matching `granularity_sqla` in its own
    params - otherwise the dashboard's native "Thời gian" filter can never
    apply to it and it silently shows all-time data instead of the
    dashboard's selected scope. Found 2026-07-27 affecting 9 SXH/TCM/LAO
    charts (all missing the field entirely, from direct-SQL chart creation
    that never auto-populated it the way the Explore UI does).

    A MISMATCH (granularity_sqla set but different from main_dttm_col) is
    reported separately from MISSING (None) - a mismatch can be an
    intentional per-chart choice (filtering on a different date column than
    the dataset default), so don't auto-flag those as failures; only
    `granularity_sqla is None` while the dataset has a real main_dttm_col is
    treated as an unconditional fail here.
    """
    conn = ctx.db("superset")
    cur = conn.cursor()
    cur.execute("SELECT id, main_dttm_col FROM tables")
    dttm_by_table = {r[0]: r[1] for r in cur.fetchall()}

    placeholders = ",".join(["%s"] * len(viz_types))
    cur.execute(f"SELECT id, slice_name, datasource_id, params FROM slices WHERE viz_type IN ({placeholders})", viz_types)
    missing = []
    mismatched = []
    for sid, name, ds_id, params_raw in cur.fetchall():
        main_dttm = dttm_by_table.get(ds_id)
        if not main_dttm:
            continue
        gran = json.loads(params_raw).get("granularity_sqla")
        if gran is None:
            missing.append({"chart_id": sid, "name": name, "main_dttm_col": main_dttm})
        elif gran != main_dttm:
            mismatched.append({"chart_id": sid, "name": name, "granularity_sqla": gran, "main_dttm_col": main_dttm})
    return {
        "missing_granularity": missing,
        "mismatched_granularity_info_only": mismatched,
        "passed": len(missing) == 0,
    }


# ── Rule registry - add new rules here ───────────────────────────────────

CHECKS = [
    {
        "name": "sxh_tong_ca_vs_danh_sach",
        "description": "SXH: Tổng ca (chart 32) phải bằng số dòng Danh sách ca bệnh (chart 126)",
        "run": lambda ctx: check_tong_ca_vs_danh_sach(ctx, 4, 32, 126, "SXH"),
    },
    {
        "name": "sxh_tong_ca_vs_theo_thang",
        "description": "SXH: Tổng ca (32) phải bằng tổng cột Mắc trong Mắc/chết theo tháng (125)",
        "run": lambda ctx: check_tong_ca_vs_monthly_sum(ctx, 4, 32, 125, "SXH"),
    },
    {
        "name": "sxh_tong_ca_vs_phan_do",
        "description": "SXH: Tổng ca (32) so với Tổng số ca ở Phân độ lâm sàng & CFR (124)",
        "run": lambda ctx: check_tong_ca_vs_phan_do(ctx, 4, 32, 124, "SXH"),
        # Fixed 2026-07-27: vw_sxh_phan_do lacked a date dimension entirely
        # (main_dttm_col pointed to a non-existent column) AND chart 124 was
        # missing granularity_sqla - both required for the dashboard's
        # "Thời gian" filter to apply. Both fixed; should PASS now.
    },
    {
        "name": "granularity_sqla_sync",
        "description": (
            "Moi chart co main_dttm_col tren dataset phai co granularity_sqla "
            "khop trong params rieng - neu khong, filter 'Thoi gian' cua "
            "dashboard khong bao gio ap dung duoc cho chart do (DB-only, "
            "khong can Selenium - chay nhanh, nen la check dau tien khi "
            "them chart moi qua SQL truc tiep)."
        ),
        "run": lambda ctx: check_granularity_sync(ctx, viz_types=("ecds_html_widget",)),
    },
    {
        "name": "tcm_tong_ca_vs_danh_sach",
        "description": "TCM: Tổng ca (chart 133) phải bằng số dòng Danh sách ca bệnh (chart 138)",
        "run": lambda ctx: check_tong_ca_vs_danh_sach(ctx, 16, 133, 138, "TCM"),
    },
    {
        "name": "lao_tong_ca_vs_danh_sach",
        "description": "Lao: Tổng ca (chart 146) phải bằng số dòng Danh sách ca bệnh (chart 151)",
        "run": lambda ctx: check_tong_ca_vs_danh_sach(ctx, 17, 146, 151, "Lao"),
    },
    # Add more rules here over time, e.g.:
    #   - tcm/lao equivalents of tong_ca_vs_theo_thang / tong_ca_vs_phan_do
    #     once those charts' tab layout + rendered shape are confirmed
    #   - nhan_khau_hoc (demographic breakdown) sum vs Tong ca
    #   - province map/bar chart totals vs Tong ca
]


# ── Runner ────────────────────────────────────────────────────────────────

def run_all(headless=True, checks=None):
    checks = checks if checks is not None else CHECKS
    ctx = CheckContext(headless=headless)
    results = []
    try:
        for check in checks:
            try:
                result = check["run"](ctx)
            except Exception as e:  # noqa: BLE001 - want to record any failure, keep going
                result = {"error": str(e), "passed": False}
            results.append({
                "name": check["name"],
                "description": check["description"],
                "known_caveat": check.get("known_caveat"),
                **result,
            })
    finally:
        ctx.close()
    return results


def format_report(results):
    lines = []
    n_pass = sum(1 for r in results if r.get("passed"))
    n_known = sum(1 for r in results if not r.get("passed") and r.get("known_caveat"))
    n_unexpected = len(results) - n_pass - n_known
    lines.append(
        f"=== Data consistency report: {n_pass}/{len(results)} PASS, "
        f"{n_known} known/expected mismatch, {n_unexpected} UNEXPECTED FAIL ===\n"
    )
    for r in results:
        if r.get("passed"):
            status = "PASS"
        elif r.get("known_caveat"):
            status = "FAIL (known)"
        else:
            status = "FAIL (unexpected)"
        lines.append(f"[{status}] {r['name']}")
        lines.append(f"  {r['description']}")
        for k, v in r.items():
            if k in ("name", "description", "passed", "known_caveat"):
                continue
            lines.append(f"  {k}: {v}")
        if r.get("known_caveat"):
            lines.append(f"  known_caveat: {r['known_caveat']}")
        lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    results = run_all(headless=True)
    report = format_report(results)
    out_path = Path(__file__).resolve().parent / "data_checks_report.txt"
    out_path.write_text(report, encoding="utf-8")
    n_pass = sum(1 for r in results if r.get("passed"))
    print(f"{n_pass}/{len(results)} passed - see {out_path}")
