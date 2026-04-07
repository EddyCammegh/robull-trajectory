import os
import sys
import json
import time
from datetime import datetime, timezone, timedelta
import requests
import anthropic
import openai

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ROBULL_API_URL = os.environ.get("ROBULL_API_URL", "https://robull-trajectory-production.up.railway.app")
POLYGON_API_KEY = os.environ.get("POLYGON_API_KEY", "")

AGENT_KEYS = {
    # NEWS cohort
    "KRONOS": "aim_a107bbe70a9cfc8847b37796827b01d012a4d8fd6a6f0df1fa69b8967f303a33",
    "ATLAS": "aim_91faa412c03eb2cd5f48c05e5acf39182db6c743d96e9a5ed47cfda48411b97d",
    "CIPHER": "aim_146a48db7dfe90bc5d261fa04f22434ece7eb093a88b76591a6958a17fca7c3b",
    "MERIDIAN": "aim_6227a079e23acd3ab2c9ce1c5fa69837ef0f5c0c6c07658beb6931071e4bdaf8",
    "HELIX": "aim_d24f4963b6139febfc99d32a1eff56fc0288e5e3f5b75660276061562b23c6f0",
    # FUNDAMENTALS cohort
    "NEXUS": "aim_b2854d740f8e4bd168138ed70af061dab55f1b8b1b0a501133b5e1e03879f515",
    "VEGA": "aim_8e49895acc5f5117146e3148da924132b944a9b95f33051c0e77b9c05a2ce9ec",
    "ARBITRON": "aim_7a80d2f873763f62148c070d8c4054bf048240a96da047f3568e2722e44fa852",
    "PRISM": "aim_4284e6ed68e3b656af4e69a2e0e9e7b4d616a8c5dd4b8756c17b5568e9a84064",
    "SOLACE": "aim_76f8ba3052e352e0d735830620d27214983f89840c9f727d3c593ebfc8012be1",
    # OPTIONS cohort
    "AXIOM": "aim_d33cd00b683692905f98433763c25d5da628eafae00ca2978a9ea02e22d96ab8",
    "DELTA": "aim_5dea3356651ab94b53ffe2029347c74a401cc5adf73f170e102e91bb10579a07",
    "QUASAR": "aim_aee74c6fe7af98fac465a325b4f8bbe34ee3a88f59dba64fc8408b5adedbfa08",
    "FORGE": "aim_3f2d162ac466b655fad0d8abb185c219ae34a7259db9dc7363af88bf036d9ed0",
    "ONYX": "aim_50dd55398b5b93b7bfda3492c939e5e97b63d412cb900d5e4428b1b076bd12d0",
    # MACRO cohort
    "SPECTER": "aim_6129b1803716d60db12cfcb405be9b7baf9169d44d3c98356aaaca9e3653eb9e",
    "LYNX": "aim_1852c7b7b327debb197ca4a8b66b8f7ac85305719445bacffdcf9b440b5705dd",
    "TITAN": "aim_461015137bd02cfae3896eb09a69ca471f068dbcdd1b97bf26715077d9361593",
    "ZENITH": "aim_0d3d13e323e0b12e9aaf2c8168cea214d8a30b9a5cc7648ef1b77c2b8d150c5d",
    "ECHO": "aim_18f3d1ca324bc1ef65ea9de0080ebd4ef04c0ebe40a94af07ccfbbb48dbff7af",
    # TECHNICAL cohort
    "NOVA": "aim_10a18bbccf42f76f5211f9de2889f63cded8984c22ec938228ee3cfb493f45e8",
    "RAZOR": "aim_d2930af0e39106aa0aa45862ba4747ccedbe8919791d375098bee1d3a6b7c724",
    "ORBIT": "aim_fa6e3bc49cad2ab2c2bc36399623f01cae94b872e5a01f8671b5c457f980191a",
    "FLUX": "aim_939d44a5d411bab1a96a7c8ce701e0485e16f8a2ab54319410356e6dff91f4f0",
    "APEX": "aim_bb2d078220345bb1435df49cc2007b7c784ab368723bc6f3c39a66d544672e47",
}

COHORTS = {
    "NEWS": {
        "agents": ["KRONOS", "ATLAS", "CIPHER", "MERIDIAN", "HELIX"],
        "provider": "sonnet",
        "focus": (
            "Search for the latest news, earnings reports, analyst commentary, "
            "and market sentiment for this instrument today. Look for breaking news, "
            "pre-market movers, earnings surprises, CEO statements, and any events "
            "that could move the price during today's trading session."
        ),
    },
    "FUND": {
        "agents": ["NEXUS", "VEGA", "ARBITRON", "PRISM", "SOLACE"],
        "provider": "sonnet",
        "focus": (
            "Search for analyst price targets, ratings changes, valuation metrics, "
            "and fundamental outlook for this instrument. Look for recent upgrades/downgrades, "
            "consensus estimates, P/E ratios, revenue growth, and any fundamental catalysts "
            "that could influence today's price trajectory."
        ),
    },
    "OPT": {
        "agents": ["AXIOM", "DELTA", "QUASAR", "FORGE", "ONYX"],
        "provider": "haiku",
        "focus": (
            "Search for options flow, unusual options activity, put/call ratios, "
            "and implied volatility for this instrument. Look for large block trades, "
            "options sweeps, changes in open interest, volatility skew, and any "
            "derivatives positioning that signals expected price movement today."
        ),
    },
    "MACRO": {
        "agents": ["SPECTER", "LYNX", "TITAN", "ZENITH", "ECHO"],
        "provider": "openai",
        "focus": (
            "Search for Fed policy signals, interest rate expectations, sector rotation trends, "
            "and economic data releases today. Look for CPI/PPI data, jobs reports, Fed speeches, "
            "treasury yields, dollar index movement, and macro factors that could drive "
            "this instrument's price trajectory during today's session."
        ),
    },
    "TECH": {
        "agents": ["NOVA", "RAZOR", "ORBIT", "FLUX", "APEX"],
        "provider": "openai",
        "focus": (
            "Search for technical analysis on this instrument: key support and resistance levels, "
            "moving average positions (50-day, 200-day), RSI, MACD signals, volume patterns, "
            "and chart patterns (head and shoulders, flags, wedges). Identify the likely "
            "intraday price trajectory based on technical indicators."
        ),
    },
}

PROVIDER_MODELS = {
    "sonnet": "claude-sonnet-4-6",
    "haiku": "claude-haiku-4-5-20251001",
    "openai": "gpt-4o",
}


# ── Instrument → ticker mapping for Polygon price history ──────────────────
INSTRUMENT_TICKER_MAP = {
    "AAPL": "AAPL",
    "NVDA": "NVDA",
    "TSLA": "TSLA",
    "QQQ": "QQQ",
    "GOLD": "GLD",
}


def fetch_price_history(instrument, days=30):
    """Fetch last N days of daily closing prices from Polygon API."""
    if not POLYGON_API_KEY:
        print(f"  [TimesFM] No POLYGON_API_KEY, skipping price history for {instrument}")
        return []
    ticker = INSTRUMENT_TICKER_MAP.get(instrument, instrument)
    to_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    from_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    url = f"https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/day/{from_date}/{to_date}"
    try:
        resp = requests.get(url, params={"apiKey": POLYGON_API_KEY}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        if not results:
            print(f"  [TimesFM] No price data for {instrument} ({ticker})")
            return []
        closes = [r["c"] for r in results]
        print(f"  [TimesFM] Fetched {len(closes)} daily closes for {instrument}")
        return closes
    except Exception as e:
        print(f"  [TimesFM] Polygon API error for {instrument}: {e}")
        return []


def run_timesfm_forecast(price_history, horizon=8):
    """Run TimesFM 1.3.0 forecast or fall back to linear extrapolation."""
    if not price_history or len(price_history) < 5:
        return []

    # Try TimesFM first
    try:
        import timesfm
        import pandas as pd

        tfm = timesfm.TimesFM(
            hparams=timesfm.TimesFMHparams(
                backend="torch",
                per_core_batch_size=32,
                horizon_len=horizon,
            ),
            checkpoint=timesfm.TimesFMCheckpoint(
                huggingface_repo_id="google/timesfm-1.0-200m",
            ),
        )

        # Build input DataFrame with columns: unique_id, ds, y
        df = pd.DataFrame({
            "unique_id": ["instrument"] * len(price_history),
            "ds": pd.date_range(end=pd.Timestamp.now().normalize(), periods=len(price_history), freq="D"),
            "y": price_history,
        })

        point_forecast, _ = tfm.forecast_on_df(
            inputs=df,
            freq="D",
            value_name="y",
            num_jobs=1,
        )
        raw = point_forecast["timesfm"].values[:horizon].tolist()

        # Sanity check: forecasts should be in a reasonable range of recent prices
        last_price = price_history[-1]
        scaled = []
        for p in raw:
            if abs(p - last_price) / last_price > 0.5:  # >50% deviation is suspect
                scaled.append(last_price)
            else:
                scaled.append(round(p, 2))
        print(f"  [TimesFM] Model forecast: {scaled}")
        return scaled

    except ImportError:
        print("  [TimesFM] timesfm not installed, falling back to linear extrapolation")
    except Exception as e:
        print(f"  [TimesFM] Model error: {e}, falling back to linear extrapolation")

    # Fallback: simple linear extrapolation from last 5 days
    recent = price_history[-5:]
    n = len(recent)
    avg_delta = (recent[-1] - recent[0]) / (n - 1) if n > 1 else 0
    last = price_history[-1]
    forecast = [round(last + avg_delta * (i + 1), 2) for i in range(horizon)]
    print(f"  [TimesFM] Linear fallback forecast: {forecast}")
    return forecast


def get_markets():
    url = f"{ROBULL_API_URL}/v1/trajectory/markets"
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    return resp.json()["markets"]


def submit_forecast(api_key, payload):
    url = f"{ROBULL_API_URL}/v1/trajectory/forecast"
    resp = requests.post(
        url,
        json=payload,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=15,
    )
    return resp.status_code, resp.json()


# ── Phase 1: Research ──

def research_prompt(instrument, cohort_focus, market):
    previous_close = market.get("previous_close", "unknown")
    live_price = market.get("live_price", "unknown")
    trading_date = market.get("trading_date", "today")

    return f"""You are a financial research assistant. Research {instrument} for {trading_date} through the following lens:

{cohort_focus}

CONTEXT:
- Instrument: {instrument}
- Previous Close: ${previous_close}
- Live Price: ${live_price}
- Trading Date: {trading_date}

Use web_search to find current information. Then provide a structured research briefing covering:

1. KEY FINDINGS: The most important facts you discovered (with sources where possible)
2. PRICE-RELEVANT EVENTS: Any events today that could move the price (earnings, data releases, announcements)
3. SENTIMENT: Overall market sentiment toward this instrument based on your research angle
4. DATA POINTS: Specific numbers, levels, or metrics relevant to your research focus

Be factual and concise. Include specific numbers and data points wherever possible."""


def call_haiku_researcher(prompt):
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}],
        messages=[{"role": "user", "content": prompt}],
    )

    text_parts = []
    for block in response.content:
        if block.type == "text":
            text_parts.append(block.text)

    return "\n".join(text_parts)


def call_haiku_researcher_with_retry(prompt):
    try:
        return call_haiku_researcher(prompt)
    except anthropic.RateLimitError:
        print("    Rate limited (429), waiting 60s and retrying...")
        time.sleep(60)
        return call_haiku_researcher(prompt)


# ── Phase 2: Reasoning ──

def build_prompt(market, cohort_focus, briefing, timesfm_baseline=None):
    instrument = market["instrument"]
    previous_close = market.get("previous_close", "unknown")
    live_price = market.get("live_price", "unknown")
    trading_date = market.get("trading_date", "today")

    timesfm_block = ""
    if timesfm_baseline and len(timesfm_baseline) >= 8:
        hours = ["9:30", "10:30", "11:30", "12:30", "1:30", "2:30", "3:30", "4:00"]
        price_points_str = ", ".join(f"{h}=${p:.2f}" for h, p in zip(hours, timesfm_baseline[:8]))
        timesfm_block = (
            f"\nTIMESFM BASELINE (statistical pattern forecast): {price_points_str}. "
            f"Consider whether today's news and your analysis supports or contradicts this statistical baseline. "
            f"Explain any significant deviations in your reasoning.\n"
        )

    return f"""You are a financial forecasting agent. Your task is to predict the intraday price trajectory for {instrument} on {trading_date}.

CURRENT DATA:
- Instrument: {instrument}
- Previous Close: ${previous_close}
- Live Price: ${live_price}
- Trading Date: {trading_date}

YOUR ANALYSIS FOCUS:
{cohort_focus}

RESEARCH BRIEFING:
{briefing}
{timesfm_block}
INSTRUCTIONS:
1. Using the research briefing above and your analysis focus, predict 8 price points for the trading day at these times:
   - Point 1: 9:30 AM ET (market open)
   - Point 2: 10:30 AM ET
   - Point 3: 11:30 AM ET
   - Point 4: 12:30 PM ET
   - Point 5: 1:30 PM ET
   - Point 6: 2:30 PM ET
   - Point 7: 3:30 PM ET
   - Point 8: 4:00 PM ET (market close)
2. Each price point should be a realistic price in dollars (e.g., 185.50, not a percentage).
3. Consider the previous close of ${previous_close} as your anchor point.

Respond with ONLY a JSON object in this exact format:
{{
  "price_points": [p1, p2, p3, p4, p5, p6, p7, p8],
  "catalyst": "The primary catalyst driving your prediction",
  "direction": "bullish" or "bearish" or "neutral",
  "risk": "The biggest risk to your prediction",
  "confidence": 1-100,
  "reasoning": "2-3 sentences explaining your forecast"
}}

Respond with ONLY the JSON object, no other text."""


def parse_forecast_json(text):
    depth = 0
    start = None
    last_json = None

    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                last_json = text[start : i + 1]

    if last_json is None:
        raise ValueError(f"No JSON found in response: {text[:200]}")

    return json.loads(last_json)


def call_claude_reasoner(prompt, model="claude-sonnet-4-6"):
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    response = client.messages.create(
        model=model,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    text_parts = []
    for block in response.content:
        if block.type == "text":
            text_parts.append(block.text)

    return "\n".join(text_parts)


def call_claude_reasoner_with_retry(prompt, model="claude-sonnet-4-6"):
    try:
        return call_claude_reasoner(prompt, model)
    except anthropic.RateLimitError:
        print("    Rate limited (429), waiting 60s and retrying...")
        time.sleep(60)
        return call_claude_reasoner(prompt, model)


def call_openai_reasoner(prompt):
    client = openai.OpenAI(api_key=OPENAI_API_KEY)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
    )

    return response.choices[0].message.content or ""


def call_openai_reasoner_with_retry(prompt):
    try:
        return call_openai_reasoner(prompt)
    except openai.RateLimitError:
        print("    Rate limited (429), waiting 60s and retrying...")
        time.sleep(60)
        return call_openai_reasoner(prompt)


def run_agent(agent_name, api_key, market, cohort_focus, briefing, provider="sonnet", timesfm_baseline=None):
    instrument = market["instrument"]
    market_id = market["id"]

    print(f"  [{agent_name}] Forecasting {instrument} ({provider})...")

    try:
        prompt = build_prompt(market, cohort_focus, briefing, timesfm_baseline=timesfm_baseline)
        if provider == "openai":
            response_text = call_openai_reasoner_with_retry(prompt)
        elif provider == "haiku":
            response_text = call_claude_reasoner_with_retry(prompt, model="claude-haiku-4-5-20251001")
        else:
            response_text = call_claude_reasoner_with_retry(prompt)
        forecast = parse_forecast_json(response_text)

        # Validate price_points
        price_points = forecast.get("price_points", [])
        if len(price_points) != 8:
            print(f"  [{agent_name}] ERROR: Got {len(price_points)} price points, expected 8")
            return

        if not all(isinstance(p, (int, float)) and p > 0 for p in price_points):
            print(f"  [{agent_name}] ERROR: Invalid price points: {price_points}")
            return

        payload = {
            "market_id": market_id,
            "price_points": price_points,
            "reasoning": forecast.get("reasoning", ""),
            "catalyst": forecast.get("catalyst", ""),
            "direction": forecast.get("direction", ""),
            "risk": forecast.get("risk", ""),
            "confidence": forecast.get("confidence"),
            "model": PROVIDER_MODELS.get(provider, provider),
        }

        status, resp = submit_forecast(api_key, payload)

        if status == 201:
            direction = forecast.get("direction", "?")
            confidence = forecast.get("confidence", "?")
            print(f"  [{agent_name}] ✓ {instrument} → {direction} ({confidence}% conf) "
                  f"[{price_points[0]:.2f} → {price_points[-1]:.2f}]")
        elif status == 409:
            print(f"  [{agent_name}] Already submitted for {instrument}, skipping")
        else:
            print(f"  [{agent_name}] ERROR ({status}): {resp}")

    except Exception as e:
        print(f"  [{agent_name}] ERROR: {e}")


def main():
    if not ANTHROPIC_API_KEY:
        print("ERROR: ANTHROPIC_API_KEY not set")
        sys.exit(1)

    if not OPENAI_API_KEY:
        print("WARNING: OPENAI_API_KEY not set — MACRO and TECH cohorts will fail")

    print(f"Robull Trajectory Agent Runner")
    print(f"API: {ROBULL_API_URL}")
    print()

    # Fetch today's markets
    try:
        markets = get_markets()
    except Exception as e:
        print(f"ERROR fetching markets: {e}")
        return

    if not markets:
        print("No markets open today.")
        return

    print(f"Found {len(markets)} markets:")
    for m in markets:
        status = m["status"]
        prev = m.get("previous_close", "?")
        live = m.get("live_price", "?")
        print(f"  {m['instrument']} — status={status}, prev_close=${prev}, live=${live}")
    print()

    # Filter to accepting markets only
    accepting = [m for m in markets if m["status"] == "accepting"]
    if not accepting:
        print("No accepting markets found, exiting")
        return

    print(f"{len(accepting)} markets accepting forecasts")
    print()

    # ── PHASE 0: TimesFM baseline forecasts ──
    print("=" * 60)
    print("PHASE 0: TimesFM Baseline Forecasts")
    print("=" * 60)
    print()

    timesfm_forecasts = {}  # instrument → [p1..p8]
    for market in accepting:
        instrument = market["instrument"]
        ticker = INSTRUMENT_TICKER_MAP.get(instrument)
        if not ticker:
            print(f"  [{instrument}] No ticker mapping, skipping TimesFM")
            continue
        prices = fetch_price_history(instrument)
        if prices:
            forecast = run_timesfm_forecast(prices)
            if forecast:
                timesfm_forecasts[instrument] = forecast
                hours = ["9:30", "10:30", "11:30", "12:30", "1:30", "2:30", "3:30", "4:00"]
                baseline_str = ", ".join(f"{h}=${p:.2f}" for h, p in zip(hours, forecast[:8]))
                print(f"  [Phase 0] {instrument} TimesFM baseline: {baseline_str}")

    if timesfm_forecasts:
        print(f"\n  Generated forecasts for {len(timesfm_forecasts)} instruments")
    else:
        print("  No TimesFM forecasts generated (missing POLYGON_API_KEY or no data)")
    print()

    # ── PHASE 1: Research (Haiku + web search) ──
    print("=" * 60)
    print("PHASE 1: Research (Haiku + web search)")
    print("=" * 60)
    print()

    research = {}  # research[cohort_name][instrument] = briefing_text
    for cohort_name, cohort in COHORTS.items():
        research[cohort_name] = {}
        focus = cohort["focus"]

        print(f"[{cohort_name}] Researching {len(accepting)} instruments...")

        for market in accepting:
            instrument = market["instrument"]
            print(f"  [{cohort_name}] Researching {instrument}...")
            try:
                prompt = research_prompt(instrument, focus, market)
                briefing = call_haiku_researcher_with_retry(prompt)
                research[cohort_name][instrument] = briefing
                print(f"  [{cohort_name}] ✓ {instrument} ({len(briefing)} chars)")
            except Exception as e:
                print(f"  [{cohort_name}] ERROR researching {instrument}: {e}")
                research[cohort_name][instrument] = "Research unavailable."
            time.sleep(5)

        print()

    # ── PHASE 2: Reasoning (no web search) ──
    print("=" * 60)
    print("PHASE 2: Reasoning (no web search)")
    print("=" * 60)
    print()

    for cohort_name, cohort in COHORTS.items():
        agents = cohort["agents"]
        focus = cohort["focus"]
        provider = cohort["provider"]

        active_agents = [(a, AGENT_KEYS[a]) for a in agents if AGENT_KEYS.get(a)]
        if not active_agents:
            print(f"[{cohort_name}] No API keys configured, skipping cohort")
            continue

        print(f"[{cohort_name}] Running {len(active_agents)} agents ({provider})...")

        for agent_name, api_key in active_agents:
            for market in accepting:
                instrument = market["instrument"]
                briefing = research.get(cohort_name, {}).get(instrument, "Research unavailable.")
                baseline = timesfm_forecasts.get(instrument)
                run_agent(agent_name, api_key, market, focus, briefing, provider, timesfm_baseline=baseline)
                time.sleep(15)

        print()

    print("Done!")


if __name__ == "__main__":
    main()
