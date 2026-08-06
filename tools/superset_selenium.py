# -*- coding: utf-8 -*-
"""
Selenium helper for logging into this project's Superset instance and
reading rendered dashboard/chart values directly from the browser DOM.

Why this exists: some of this project's custom viz plugins (ecds_html_widget
in particular) compute their displayed numbers client-side in JS from
multiple query rows (YoY comparisons, YTD sums, endemic-channel thresholds),
so the number a user actually sees is NOT always reproducible by re-running
a single SQL query against the underlying view. Reading the live rendered
DOM is the only fully faithful way to check "what does this widget actually
show right now" without asking the user to copy/paste it by hand every time.

Credentials are read from the repo's .env (SUPERSET_URL / SUPERSET_USER /
SUPERSET_PASSWORD) - see load_env(). Do not hardcode credentials in scripts
that import this module; always go through load_env().

Requires: selenium (already installed in this environment) + a Chromium-
based browser. This machine has Microsoft Edge but not Chrome, so this
module drives Edge via webdriver.Edge() / EdgeOptions (Selenium Manager
resolves the matching msedgedriver automatically - no manual driver install
needed).
"""
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / ".env"


def load_env():
    env = {}
    with open(ENV_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k] = v
    return env


def get_driver(headless=True, window_size=(1600, 1200)):
    opts = EdgeOptions()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument(f"--window-size={window_size[0]},{window_size[1]}")
    opts.add_argument("--disable-gpu")
    return webdriver.Edge(options=opts)


def login(driver, env=None, timeout=20):
    """Log into Superset via the standard Flask-AppBuilder login form."""
    env = env or load_env()
    base_url = env["SUPERSET_URL"].rstrip("/")
    driver.get(f"{base_url}/login/")

    wait = WebDriverWait(driver, timeout)
    user_input = wait.until(EC.presence_of_element_located((By.NAME, "username")))
    pass_input = driver.find_element(By.NAME, "password")
    user_input.clear()
    user_input.send_keys(env["SUPERSET_USER"])
    pass_input.clear()
    pass_input.send_keys(env["SUPERSET_PASSWORD"])
    pass_input.submit()

    # Login redirects to /superset/welcome/ (or similar) on success; if it
    # stays on /login/, the credentials/form were rejected.
    wait.until(lambda d: "/login/" not in d.current_url)
    return base_url


def goto_chart_standalone(driver, chart_id, env=None, timeout=25, extra_wait=3):
    """
    Load a single chart's standalone Explore view (no dashboard chrome) and
    give client-side JS time to finish rendering. Returns the base_url used.
    """
    env = env or load_env()
    base_url = env["SUPERSET_URL"].rstrip("/")
    driver.get(f"{base_url}/explore/?slice_id={chart_id}&standalone=1")
    WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.TAG_NAME, "body"))
    )
    time.sleep(extra_wait)
    return base_url


def get_rendered_text(driver, use_iframe=True):
    """
    Return the visible text of the chart's rendered content. ecds_html_widget
    renders inside an <iframe> (srcdoc); other viz types render directly in
    the page. Tries the first iframe first, falls back to the page body.
    """
    if use_iframe:
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        if iframes:
            driver.switch_to.frame(iframes[0])
            text = driver.find_element(By.TAG_NAME, "body").text
            driver.switch_to.default_content()
            return text
    return driver.find_element(By.TAG_NAME, "body").text


def goto_dashboard(driver, dashboard_id_or_slug, env=None, timeout=25, extra_wait=4):
    env = env or load_env()
    base_url = env["SUPERSET_URL"].rstrip("/")
    driver.get(f"{base_url}/superset/dashboard/{dashboard_id_or_slug}/")
    WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.TAG_NAME, "body"))
    )
    time.sleep(extra_wait)
    return base_url


def get_chart_text_on_dashboard(driver, chart_id):
    """
    Return the visible text of a chart currently rendered on the dashboard
    page (identified by Superset's own `data-test-chart-id` attribute).
    Switches into the chart's iframe first if it has one (ecds_html_widget
    renders via srcdoc iframe; ecds_data_table/native table viz render
    directly in the page). Returns None if the chart isn't in the DOM at
    all, OR if it's present but not visible (e.g. it's on a tab that hasn't
    been clicked yet - use click_tab_containing_chart() first).

    IMPORTANT gotcha: AntD Tabs (used by this project's dashboards) keeps
    EVERY tab pane mounted in the DOM at all times, just hidden via CSS on
    inactive tabs - `find_elements` on `[data-test-chart-id="X"]` returns a
    match even when chart X's tab isn't the active one, and `.text` on a
    hidden element silently returns "". Always check `is_displayed()`
    before trusting the presence of the element, or every chart will
    spuriously appear to be "on tab 0" the first time you search for it.

    IMPORTANT: viewing a chart via /explore/?slice_id=X does NOT apply the
    dashboard's native filters (time range, dedup filter, etc.) - only
    navigating to the actual dashboard page (goto_dashboard) and reading
    the chart from there reflects what a real dashboard viewer sees.
    """
    els = driver.find_elements(By.CSS_SELECTOR, f'[data-test-chart-id="{chart_id}"]')
    if not els or not els[0].is_displayed():
        return None
    el = els[0]
    iframes = el.find_elements(By.TAG_NAME, "iframe")
    if iframes:
        driver.switch_to.frame(iframes[0])
        text = driver.find_element(By.TAG_NAME, "body").text
        driver.switch_to.default_content()
        return text
    return el.text


def save_chart_overwrite(driver, chart_id, dashboard_title, env=None, timeout=25):
    """
    Open a chart's real (non-standalone) Explore page and click through
    "Lưu" (Save) -> "Save (Overwrite)" -> "SAVE & GO TO DASHBOARD" to force
    a genuine save. This is the ONLY confirmed-reliable fix for
    "Guest user cannot modify chart payload" on `echarts_timeseries_bar`
    charts (2026-07-27) - merely loading the chart (goto_chart_standalone)
    is NOT sufficient on its own; an actual save is required. (An earlier
    version of this note wrongly claimed viewing alone was enough - that
    was wrong, corrected after the user reported needing to click Save in
    the real UI.)

    CRITICAL gotcha that WILL create a stray junk dashboard if not handled
    carefully: the "ADD TO DASHBOARD" field in the save modal does NOT
    pre-fill with the chart's existing dashboard (even though the chart is
    already on one) - the confirm button stays disabled until you select
    something. It's an async type-to-search combobox: clicking it alone
    shows zero options; you must type first. Worse, once you type, the
    FIRST option in the results is often Superset's own "create a new
    dashboard named '<what you typed>'" quick-create entry, sitting
    *before* the real matching dashboard - blindly clicking options[0]
    creates a brand new near-empty dashboard and attaches the chart to
    THAT instead of (in addition to) the intended one. This function only
    ever clicks an option whose text is an EXACT match for
    `dashboard_title` (fetch the exact string from `dashboards.dashboard_title`
    in the DB first) and raises if none is found - it deliberately does
    NOT fall back to "click the first option" to avoid ever creating one.
    If this happens anyway, clean up: `DELETE FROM dashboard_slices WHERE
    dashboard_id=<stray_id> AND slice_id=<chart_id>`, delete the stray
    `dashboards` row (only if `dashboard_slices` count for it is now 0),
    and fix the chart's own `params.dashboards` list back to just the
    correct id(s) (plus refresh `query_context.form_data.dashboards` to
    match - a single-field patch, no need to touch `queries[0]`).
    """
    env = env or load_env()
    base_url = env["SUPERSET_URL"].rstrip("/")
    driver.get(f"{base_url}/explore/?slice_id={chart_id}")
    WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.TAG_NAME, "body"))
    )
    time.sleep(8)

    save_btn = next(el for el in driver.find_elements(By.CSS_SELECTOR, "button")
                     if el.text.strip().upper() == "LƯU")
    driver.execute_script("arguments[0].click();", save_btn)
    time.sleep(2)

    search_input = driver.find_element(By.CSS_SELECTOR, ".ant-modal .ant-select input")
    search_input.click()
    time.sleep(0.5)
    search_input.send_keys(dashboard_title[:20])  # enough to narrow the search
    time.sleep(2)

    options = driver.find_elements(By.CSS_SELECTOR, ".ant-select-item-option")
    exact_match = next((o for o in options if o.text.strip() == dashboard_title), None)
    if exact_match is None:
        raise RuntimeError(
            f"No exact dashboard match for {dashboard_title!r} in save modal "
            f"(saw: {[o.text for o in options]!r}) - aborting rather than risk "
            f"creating a stray dashboard."
        )
    driver.execute_script("arguments[0].click();", exact_match)
    time.sleep(1)

    confirm_btn = next(
        el for el in driver.find_elements(By.CSS_SELECTOR, '.ant-modal button, [role="dialog"] button')
        if "SAVE" in el.text.strip().upper() and "DASHBOARD" in el.text.strip().upper()
    )
    if not confirm_btn.is_enabled():
        raise RuntimeError("Save confirm button still disabled after selecting dashboard")
    driver.execute_script("arguments[0].click();", confirm_btn)
    time.sleep(6)


def click_tab_containing_chart(driver, chart_id, wait_each=4, wait_after_found=10):
    """
    Click through each top-level dashboard tab (role="tab") until the given
    chart_id appears in the DOM, then wait `wait_after_found` extra seconds
    for its data to finish loading (raw-mode tables with 50k-100k rows can
    take a while). Returns True if found, False if no tab contained it.
    Assumes goto_dashboard() was already called.
    """
    tabs = driver.find_elements(By.CSS_SELECTOR, '[role="tab"]')
    for tab in tabs:
        driver.execute_script("arguments[0].click();", tab)
        time.sleep(wait_each)
        els = driver.find_elements(By.CSS_SELECTOR, f'[data-test-chart-id="{chart_id}"]')
        if els and els[0].is_displayed():
            time.sleep(wait_after_found)
            return True
    return False
