import os
import json
import time
import requests
import anthropic

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ROBULL_API_URL = os.environ.get("ROBULL_API_URL", "https://robull-trajectory-production.up.railway.app")

# Agent API keys — register each agent via POST /v1/agents/register and paste keys here
AGENT_KEYS = {
    # Cohort 1 - News
    "NEWS-1": "",
    "NEWS-2": "",
    "NEWS-3": "",
    "NEWS-4": "",
    "NEWS-5": "",
    # Cohort 2 - Fundamentals
    "FUND-1": "",
    "FUND-2": "",
    "FUND-3": "",
    "FUND-4": "",
    "FUND-5": "",
    # Cohort 3 - Options
    "OPT-1": "",
    "OPT-2": "",
    "OPT-3": "",
    "OPT-4": "",
    "OPT-5": "",
    # Cohort 4 - Macro
    "MACRO-1": "",
    "MACRO-2": "",
    "MACRO-3": "",
    "MACRO-4": "",
    "MACRO-5": "",
    # Cohort 5 - Technical
    "TECH-1": "",
    "TECH-2": "",
    "TECH-3": "",
    "TECH-4": "",
    "TECH-5": "",
}

COHORTS = {
    "NEWS": {
        "agents": ["NEWS-1", "NEWS-2", "NEWS-3", "NEWS-4", "NEWS-5"],
        "focus": (
            "Search for the latest news, earnings reports, analyst commentary, "
            "and market sentiment for this instrument today. Look for breaking news, "
            "pre-market movers, earnings surprises, CEO statements, and any events "
            "that could move the price during today's trading session."
        ),
    },
    "FUND": {
        "agents": ["FUND-1", "FUND-2", "FUND-3", "FUND-4", "FUND-5"],
        "focus": (
            "Search for analyst price targets, ratings changes, valuation metrics, "
            "and fundamental outlook for this instrument. Look for recent upgrades/downgrades, "
            "consensus estimates, P/E ratios, revenue growth, and any fundamental catalysts "
            "that could influence today's price trajectory."
        ),
    },
    "OPT": {
        "agents": ["OPT-1", "OPT-2", "OPT-3", "OPT-4", "OPT-5"],
        "focus": (
            "Search for options flow, unusual options activity, put/call ratios, "
            "and implied volatility for this instrument. Look for large block trades, "
            "options sweeps, changes in open interest, volatility skew, and any "
            "derivatives positioning that signals expected price movement today."
        ),
    },
    "MACRO": {
        "agents": ["MACRO-1", "MACRO-2", "MACRO-3", "MACRO-4", "MACRO-5"],
        "focus": (
            "Search for Fed policy signals, interest rate expectations, sector rotation trends, "
            "and economic data releases today. Look for CPI/PPI data, jobs reports, Fed speeches, "
            "treasury yields, dollar index movement, and macro factors that could drive "
            "this instrument's price trajectory during today's session."
        ),
    },
    "TECH": {
        "agents": ["TECH-1", "TECH-2", "TECH-3", "TECH-4", "TECH-5"],
        "focus": (
            "Search for technical analysis on this instrument: key support and resistance levels, "
            "moving average positions (50-day, 200-day), RSI, MACD signals, volume patterns, "
            "and chart patterns (head and shoulders, flags, wedges). Identify the likely "
            "intraday price trajectory based on technical indicators."
        ),
    },
}


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


def build_prompt(market, cohort_focus):
    instrument = market["instrument"]
    previous_close = market.get("previous_close", "unknown")
    live_price = market.get("live_price", "unknown")
    trading_date = market.get("trading_date", "today")

    return f"""You are a financial forecasting agent. Your task is to predict the intraday price trajectory for {instrument} on {trading_date}.

CURRENT DATA:
- Instrument: {instrument}
- Previous Close: ${previous_close}
- Live Price: ${live_price}
- Trading Date: {trading_date}

YOUR RESEARCH FOCUS:
{cohort_focus}

INSTRUCTIONS:
1. Use the web_search tool to research {instrument} based on your research focus above.
2. Based on your research, predict 7 price points for the trading day at these times:
   - Point 1: 10:00 AM ET (30 min after open)
   - Point 2: 11:00 AM ET
   - Point 3: 12:00 PM ET
   - Point 4: 1:00 PM ET
   - Point 5: 2:00 PM ET
   - Point 6: 3:00 PM ET
   - Point 7: 4:00 PM ET (close)
3. Each price point should be a realistic price in dollars (e.g., 185.50, not a percentage).
4. Consider the previous close of ${previous_close} as your anchor point.

After your research, respond with ONLY a JSON object in this exact format:
{{
  "price_points": [p1, p2, p3, p4, p5, p6, p7],
  "catalyst": "The primary catalyst driving your prediction",
  "direction": "bullish" or "bearish" or "neutral",
  "risk": "The biggest risk to your prediction",
  "confidence": 1-100,
  "reasoning": "2-3 sentences explaining your forecast"
}}

Respond with ONLY the JSON object, no other text."""


def parse_forecast_json(text):
    # Try to find JSON in the response
    # Look for the last { ... } block
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


def call_claude(prompt):
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4000,
        tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}],
        messages=[{"role": "user", "content": prompt}],
    )

    # Extract text from response
    text_parts = []
    for block in response.content:
        if block.type == "text":
            text_parts.append(block.text)

    return "\n".join(text_parts)


def run_agent(agent_name, api_key, market, cohort_focus):
    instrument = market["instrument"]
    market_id = market["id"]

    print(f"  [{agent_name}] Forecasting {instrument}...")

    try:
        prompt = build_prompt(market, cohort_focus)
        response_text = call_claude(prompt)
        forecast = parse_forecast_json(response_text)

        # Validate price_points
        price_points = forecast.get("price_points", [])
        if len(price_points) != 7:
            print(f"  [{agent_name}] ERROR: Got {len(price_points)} price points, expected 7")
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
        return

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
        print("No markets currently accepting forecasts.")
        return

    print(f"{len(accepting)} markets accepting forecasts")
    print()

    # Run each cohort
    for cohort_name, cohort in COHORTS.items():
        agents = cohort["agents"]
        focus = cohort["focus"]

        # Filter to agents with keys configured
        active_agents = [(a, AGENT_KEYS[a]) for a in agents if AGENT_KEYS.get(a)]
        if not active_agents:
            print(f"[{cohort_name}] No API keys configured, skipping cohort")
            continue

        print(f"[{cohort_name}] Running {len(active_agents)} agents...")

        for agent_name, api_key in active_agents:
            for market in accepting:
                run_agent(agent_name, api_key, market, focus)
                time.sleep(3)

        print()

    print("Done!")


if __name__ == "__main__":
    main()
