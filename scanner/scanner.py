"""
EVERROCK LAUNDROMAT ACQUISITION SCANNER
========================================
Scrapes laundromat listings from major brokerages, scores them using the
Adams Resources 0-100 deal scoring playbook, and serves results via API
for the Everrock Command Center dashboard.

Brokerages scraped:
  - BizBuySell (bizbuysell.com)
  - BizBen (bizben.com)
  - LoopNet (loopnet.com)
  - BizQuest (bizquest.com)

Scoring criteria (0-100 playbook):
  - Cash-on-cash return estimate (25% threshold) — 30pts
  - Location proximity to Bell Gardens hub — 15pts
  - Ask price vs revenue multiple — 15pts
  - Equipment age/condition signals — 10pts
  - Revenue verification potential — 10pts
  - Lease terms / remaining lease — 10pts
  - Growth / value-add potential — 10pts

Deployment: Run on VPS with cron (every 6hrs) or as always-on service.
Requires: Python 3.10+, pip install requirements.txt

Usage:
  python scanner.py                  # Run once, scrape + score + save
  python scanner.py --serve          # Start API server on port 8420
  python scanner.py --serve --port 9000
"""

import os
import re
import json
import time
import hashlib
import logging
import argparse
import sqlite3
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict, field
from typing import Optional
from pathlib import Path

# Third-party
import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request as flask_request
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler

# Optional: Claude API for intelligent scoring
try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

# ─── CONFIG ───
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("scanner")

DB_PATH = os.environ.get("SCANNER_DB", "scanner.db")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SCAN_INTERVAL_HOURS = int(os.environ.get("SCAN_INTERVAL", "6"))

# Target geography — LA County focus, Bell Gardens hub
TARGET_ZIPS = [
    "90201", "90202",  # Bell Gardens
    "90240", "90241", "90242",  # Downey
    "90255",  # Huntington Park
    "90270",  # Maywood
    "90280",  # South Gate
    "90040",  # Commerce
    "90022", "90023",  # East LA
    "90001", "90002", "90003",  # South LA
    "90220", "90221", "90222",  # Compton
    "90262",  # Lynwood
    "90650",  # Norwalk
    "90660",  # Pico Rivera
    "90606", "90601",  # Whittier
    "90723",  # Paramount
    "90058", "90011",  # Central LA
]

# Bell Gardens hub coordinates for proximity scoring
HUB_LAT = 33.9653
HUB_LNG = -118.1514

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


@dataclass
class Listing:
    id: str = ""
    name: str = ""
    address: str = ""
    city: str = ""
    state: str = "CA"
    zip_code: str = ""
    ask_price: float = 0
    gross_revenue: float = 0  # monthly
    net_income: float = 0  # monthly
    cash_flow: float = 0  # annual seller discretionary
    lease_remaining: str = ""
    equipment_notes: str = ""
    sqft: int = 0
    year_established: int = 0
    brokerage: str = ""
    listing_url: str = ""
    description: str = ""
    broker_name: str = ""
    broker_phone: str = ""
    # Computed
    score: int = 0
    coc_estimate: float = 0
    status: str = "new"
    notes: str = ""
    starred: bool = False
    added_date: str = ""
    last_seen: str = ""
    # Score breakdown
    score_breakdown: dict = field(default_factory=dict)

    def compute_id(self):
        """Generate deterministic ID from listing details"""
        raw = f"{self.name}|{self.address}|{self.ask_price}|{self.brokerage}"
        self.id = hashlib.md5(raw.encode()).hexdigest()[:12]
        return self.id


# ═══════════════════════════════════════
# SCRAPERS
# ═══════════════════════════════════════

class BaseScraper:
    """Base class for brokerage scrapers"""
    name = "base"
    base_url = ""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

    def scrape(self) -> list[Listing]:
        raise NotImplementedError

    def _get(self, url, **kwargs):
        """Rate-limited GET request"""
        time.sleep(2 + (hash(url) % 3))  # 2-5s delay between requests
        try:
            resp = self.session.get(url, timeout=15, **kwargs)
            resp.raise_for_status()
            return resp
        except Exception as e:
            log.warning(f"[{self.name}] Failed to fetch {url}: {e}")
            return None

    def _parse_price(self, text: str) -> float:
        """Extract price from text like '$450,000' or '450K'"""
        if not text:
            return 0
        text = text.strip().replace(",", "").replace("$", "")
        if "k" in text.lower():
            text = text.lower().replace("k", "")
            try:
                return float(text) * 1000
            except ValueError:
                return 0
        if "m" in text.lower():
            text = text.lower().replace("m", "")
            try:
                return float(text) * 1_000_000
            except ValueError:
                return 0
        try:
            return float(re.sub(r"[^\d.]", "", text))
        except ValueError:
            return 0


class BizBuySellScraper(BaseScraper):
    """Scrape BizBuySell for LA County laundromat listings"""
    name = "BizBuySell"
    base_url = "https://www.bizbuysell.com"

    def scrape(self) -> list[Listing]:
        listings = []
        # BizBuySell search URL for laundromats in LA County
        search_urls = [
            f"{self.base_url}/california/los-angeles-county-laundry-and-dry-cleaning-businesses-for-sale/",
            f"{self.base_url}/california/los-angeles-laundromats-for-sale/",
        ]

        for search_url in search_urls:
            resp = self._get(search_url)
            if not resp:
                continue

            soup = BeautifulSoup(resp.text, "html.parser")

            # BizBuySell listing cards
            cards = soup.select(".listing-card, .bfsListing, [data-listing-id]")
            if not cards:
                # Fallback selectors
                cards = soup.select(".searchResult, .listing")

            log.info(f"[BizBuySell] Found {len(cards)} listing cards")

            for card in cards:
                try:
                    listing = Listing(brokerage=self.name)
                    listing.added_date = datetime.now().strftime("%Y-%m-%d")
                    listing.last_seen = datetime.now().isoformat()

                    # Title / name
                    title_el = card.select_one("h3, .listingTitle, .listing-title, a.diamond")
                    if title_el:
                        listing.name = title_el.get_text(strip=True)

                    # URL
                    link_el = card.select_one("a[href*='/Business-Opportunity/']") or card.select_one("a")
                    if link_el and link_el.get("href"):
                        href = link_el["href"]
                        listing.listing_url = href if href.startswith("http") else f"{self.base_url}{href}"

                    # Location
                    loc_el = card.select_one(".listingLocation, .listing-location, .location")
                    if loc_el:
                        loc_text = loc_el.get_text(strip=True)
                        listing.address = loc_text
                        # Extract city
                        parts = loc_text.split(",")
                        if parts:
                            listing.city = parts[0].strip()

                    # Price
                    price_el = card.select_one(".listingPrice, .listing-price, .price")
                    if price_el:
                        listing.ask_price = self._parse_price(price_el.get_text())

                    # Cash flow / revenue
                    cf_el = card.select_one(".listingCashFlow, .cash-flow")
                    if cf_el:
                        listing.cash_flow = self._parse_price(cf_el.get_text())

                    rev_el = card.select_one(".listingRevenue, .gross-revenue")
                    if rev_el:
                        annual_rev = self._parse_price(rev_el.get_text())
                        listing.gross_revenue = annual_rev / 12  # Convert to monthly

                    # Description
                    desc_el = card.select_one(".listingDescription, .listing-description, p")
                    if desc_el:
                        listing.description = desc_el.get_text(strip=True)[:500]

                    # Only add if we have minimum data
                    if listing.name and listing.ask_price > 0:
                        listing.compute_id()
                        listings.append(listing)

                except Exception as e:
                    log.warning(f"[BizBuySell] Error parsing card: {e}")
                    continue

        log.info(f"[BizBuySell] Scraped {len(listings)} valid listings")
        return listings


class BizBenScraper(BaseScraper):
    """Scrape BizBen for LA County laundromat listings"""
    name = "BizBen"
    base_url = "https://www.bizben.com"

    def scrape(self) -> list[Listing]:
        listings = []
        search_url = f"{self.base_url}/business-for-sale/laundromat/los-angeles/"

        resp = self._get(search_url)
        if not resp:
            return listings

        soup = BeautifulSoup(resp.text, "html.parser")
        cards = soup.select(".listing-item, .bizben-listing, .search-result-item, article")

        log.info(f"[BizBen] Found {len(cards)} listing cards")

        for card in cards:
            try:
                listing = Listing(brokerage=self.name)
                listing.added_date = datetime.now().strftime("%Y-%m-%d")
                listing.last_seen = datetime.now().isoformat()

                title_el = card.select_one("h2, h3, .listing-title, a")
                if title_el:
                    listing.name = title_el.get_text(strip=True)

                link_el = card.select_one("a[href]")
                if link_el and link_el.get("href"):
                    href = link_el["href"]
                    listing.listing_url = href if href.startswith("http") else f"{self.base_url}{href}"

                # BizBen typically shows price in listing title or dedicated element
                price_el = card.select_one(".price, .asking-price")
                if price_el:
                    listing.ask_price = self._parse_price(price_el.get_text())
                elif listing.name:
                    # Try extracting price from title
                    price_match = re.search(r'\$[\d,]+', listing.name)
                    if price_match:
                        listing.ask_price = self._parse_price(price_match.group())

                loc_el = card.select_one(".location, .city")
                if loc_el:
                    listing.address = loc_el.get_text(strip=True)
                    listing.city = listing.address.split(",")[0].strip() if "," in listing.address else listing.address

                desc_el = card.select_one(".description, p")
                if desc_el:
                    listing.description = desc_el.get_text(strip=True)[:500]

                if listing.name and (listing.ask_price > 0 or "laundro" in listing.name.lower()):
                    listing.compute_id()
                    listings.append(listing)

            except Exception as e:
                log.warning(f"[BizBen] Error parsing card: {e}")
                continue

        log.info(f"[BizBen] Scraped {len(listings)} valid listings")
        return listings


class LoopNetScraper(BaseScraper):
    """Scrape LoopNet for LA County laundromat/coin-op listings"""
    name = "LoopNet"
    base_url = "https://www.loopnet.com"

    def scrape(self) -> list[Listing]:
        listings = []
        # LoopNet business search
        search_url = f"{self.base_url}/search/businesses-for-sale/laundromat/california/los-angeles/"

        resp = self._get(search_url)
        if not resp:
            return listings

        soup = BeautifulSoup(resp.text, "html.parser")
        cards = soup.select(".placard, .listing-card, article[data-id]")

        log.info(f"[LoopNet] Found {len(cards)} listing cards")

        for card in cards:
            try:
                listing = Listing(brokerage=self.name)
                listing.added_date = datetime.now().strftime("%Y-%m-%d")
                listing.last_seen = datetime.now().isoformat()

                title_el = card.select_one(".placard-header, h3, .listing-title")
                if title_el:
                    listing.name = title_el.get_text(strip=True)

                link_el = card.select_one("a[href]")
                if link_el and link_el.get("href"):
                    href = link_el["href"]
                    listing.listing_url = href if href.startswith("http") else f"{self.base_url}{href}"

                price_el = card.select_one(".placard-price, .price")
                if price_el:
                    listing.ask_price = self._parse_price(price_el.get_text())

                loc_el = card.select_one(".placard-location, .location")
                if loc_el:
                    listing.address = loc_el.get_text(strip=True)

                if listing.name:
                    listing.compute_id()
                    listings.append(listing)

            except Exception as e:
                log.warning(f"[LoopNet] Error parsing: {e}")
                continue

        log.info(f"[LoopNet] Scraped {len(listings)} valid listings")
        return listings


class BizQuestScraper(BaseScraper):
    """Scrape BizQuest for LA County laundromat listings"""
    name = "BizQuest"
    base_url = "https://www.bizquest.com"

    def scrape(self) -> list[Listing]:
        listings = []
        search_url = f"{self.base_url}/search/?q=laundromat&loc=Los+Angeles,+CA"

        resp = self._get(search_url)
        if not resp:
            return listings

        soup = BeautifulSoup(resp.text, "html.parser")
        cards = soup.select(".listing, .search-result, article")

        log.info(f"[BizQuest] Found {len(cards)} listing cards")

        for card in cards:
            try:
                listing = Listing(brokerage=self.name)
                listing.added_date = datetime.now().strftime("%Y-%m-%d")
                listing.last_seen = datetime.now().isoformat()

                title_el = card.select_one("h2, h3, .title, a")
                if title_el:
                    listing.name = title_el.get_text(strip=True)

                link_el = card.select_one("a[href]")
                if link_el and link_el.get("href"):
                    href = link_el["href"]
                    listing.listing_url = href if href.startswith("http") else f"{self.base_url}{href}"

                price_el = card.select_one(".price, .asking-price")
                if price_el:
                    listing.ask_price = self._parse_price(price_el.get_text())

                loc_el = card.select_one(".location")
                if loc_el:
                    listing.address = loc_el.get_text(strip=True)

                if listing.name:
                    listing.compute_id()
                    listings.append(listing)

            except Exception as e:
                log.warning(f"[BizQuest] Error parsing: {e}")
                continue

        log.info(f"[BizQuest] Scraped {len(listings)} valid listings")
        return listings


# ═══════════════════════════════════════
# SCORING ENGINE
# ═══════════════════════════════════════

class DealScorer:
    """
    Score listings using the Adams Resources 0-100 deal scoring playbook.

    Scoring breakdown:
      - Cash-on-cash return estimate: 30pts
      - Location / proximity to hub: 15pts
      - Price / revenue multiple: 15pts
      - Equipment signals: 10pts
      - Revenue verification potential: 10pts
      - Lease terms: 10pts
      - Growth / value-add: 10pts
    """

    def __init__(self, use_ai=False):
        self.use_ai = use_ai and HAS_ANTHROPIC and ANTHROPIC_API_KEY
        if self.use_ai:
            self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
            log.info("AI scoring enabled via Claude API")

    def score(self, listing: Listing) -> Listing:
        """Score a listing and return with score + breakdown"""
        breakdown = {}

        # 1. Cash-on-Cash estimate (30pts)
        coc = self._estimate_coc(listing)
        listing.coc_estimate = round(coc, 1)
        if coc >= 35:
            breakdown["coc"] = 30
        elif coc >= 25:
            breakdown["coc"] = 25
        elif coc >= 20:
            breakdown["coc"] = 18
        elif coc >= 15:
            breakdown["coc"] = 10
        elif coc >= 10:
            breakdown["coc"] = 5
        else:
            breakdown["coc"] = 0

        # 2. Location proximity (15pts)
        prox_score = self._score_location(listing)
        breakdown["location"] = prox_score

        # 3. Price / revenue multiple (15pts)
        mult_score = self._score_multiple(listing)
        breakdown["multiple"] = mult_score

        # 4. Equipment signals (10pts)
        equip_score = self._score_equipment(listing)
        breakdown["equipment"] = equip_score

        # 5. Revenue verification potential (10pts)
        verif_score = self._score_verification(listing)
        breakdown["verification"] = verif_score

        # 6. Lease terms (10pts)
        lease_score = self._score_lease(listing)
        breakdown["lease"] = lease_score

        # 7. Growth / value-add potential (10pts)
        growth_score = self._score_growth(listing)
        breakdown["growth"] = growth_score

        listing.score = sum(breakdown.values())
        listing.score_breakdown = breakdown

        # AI re-scoring for high-potential deals
        if self.use_ai and listing.score >= 60:
            listing = self._ai_rescore(listing)

        return listing

    def _estimate_coc(self, listing: Listing) -> float:
        """Estimate cash-on-cash return"""
        if listing.ask_price <= 0:
            return 0

        # Use cash flow if available, otherwise estimate from gross revenue
        if listing.cash_flow > 0:
            annual_cf = listing.cash_flow
        elif listing.net_income > 0:
            annual_cf = listing.net_income * 12
        elif listing.gross_revenue > 0:
            # Assume ~45% operating margin for laundromats (conservative)
            annual_cf = listing.gross_revenue * 12 * 0.45
        else:
            return 0

        # Assume 25% down payment
        down_payment = listing.ask_price * 0.25
        if down_payment <= 0:
            return 0

        # Rough debt service estimate (7% rate, 10yr amortization on 75% LTV)
        loan_amount = listing.ask_price * 0.75
        annual_debt_service = loan_amount * 0.14  # ~14% annual constant

        net_cf_after_debt = annual_cf - annual_debt_service
        coc = (net_cf_after_debt / down_payment) * 100

        return max(0, coc)

    def _score_location(self, listing: Listing) -> int:
        """Score based on proximity to Bell Gardens hub"""
        # Check if in target zip codes
        if listing.zip_code in TARGET_ZIPS[:3]:  # Bell Gardens
            return 15
        elif listing.zip_code in TARGET_ZIPS[:10]:  # Adjacent cities
            return 12

        # Check city name
        city_lower = listing.city.lower() if listing.city else ""
        addr_lower = listing.address.lower() if listing.address else ""
        combined = f"{city_lower} {addr_lower}"

        if "bell gardens" in combined:
            return 15
        elif any(c in combined for c in ["huntington park", "maywood", "commerce", "south gate"]):
            return 12
        elif any(c in combined for c in ["downey", "east la", "pico rivera", "whittier", "lynwood"]):
            return 10
        elif any(c in combined for c in ["compton", "paramount", "norwalk"]):
            return 8
        elif "los angeles" in combined or "la" in combined:
            return 6
        elif "long beach" in combined:
            return 5
        else:
            return 3

    def _score_multiple(self, listing: Listing) -> int:
        """Score based on price-to-revenue multiple"""
        if listing.gross_revenue <= 0 or listing.ask_price <= 0:
            return 5  # Can't determine — neutral

        annual_rev = listing.gross_revenue * 12
        multiple = listing.ask_price / annual_rev

        if multiple <= 1.5:
            return 15  # Excellent value
        elif multiple <= 2.0:
            return 12
        elif multiple <= 2.5:
            return 9
        elif multiple <= 3.0:
            return 6
        elif multiple <= 4.0:
            return 3
        else:
            return 1

    def _score_equipment(self, listing: Listing) -> int:
        """Score equipment condition from description signals"""
        text = f"{listing.description} {listing.equipment_notes}".lower()

        if not text.strip():
            return 5  # Unknown — neutral

        # Positive signals
        pos = sum(1 for kw in ["new equipment", "new machines", "recently replaced",
                                "speed queen", "dexter", "2020", "2021", "2022", "2023", "2024", "2025",
                                "upgraded", "remodeled", "renovated"] if kw in text)
        # Negative signals
        neg = sum(1 for kw in ["old equipment", "needs repair", "aging", "dated",
                                "worn", "as-is", "fixer", "needs work", "1990", "1980"] if kw in text)

        if pos >= 2:
            return 10
        elif pos == 1:
            return 8
        elif neg >= 2:
            return 2
        elif neg == 1:
            return 4
        return 5

    def _score_verification(self, listing: Listing) -> int:
        """Score revenue verification potential"""
        text = f"{listing.description}".lower()

        # Good signs for verifiability
        if any(kw in text for kw in ["utility records", "water bills", "verified", "audited", "tax returns"]):
            return 10
        elif any(kw in text for kw in ["financial records", "p&l", "profit and loss", "books available"]):
            return 8
        elif listing.gross_revenue > 0 and listing.net_income > 0:
            return 6  # At least some financial data provided
        elif listing.gross_revenue > 0:
            return 5
        return 3  # No financial visibility

    def _score_lease(self, listing: Listing) -> int:
        """Score lease terms"""
        text = f"{listing.description} {listing.lease_remaining}".lower()

        if any(kw in text for kw in ["own building", "owned", "real estate included", "building included"]):
            return 10
        elif any(kw in text for kw in ["long lease", "10 year", "15 year", "20 year", "new lease"]):
            return 9
        elif any(kw in text for kw in ["5 year", "option to renew", "renewable"]):
            return 7
        elif any(kw in text for kw in ["3 year", "short lease", "expiring"]):
            return 3
        elif any(kw in text for kw in ["month to month", "no lease"]):
            return 1
        return 5  # Unknown

    def _score_growth(self, listing: Listing) -> int:
        """Score growth / value-add potential"""
        text = f"{listing.description}".lower()

        growth_signals = sum(1 for kw in [
            "value add", "upside", "below market", "underperforming",
            "room for growth", "potential", "expansion", "retool",
            "busy area", "high traffic", "dense population",
            "vending", "wash dry fold", "drop off", "pickup delivery",
            "add services", "untapped"
        ] if kw in text)

        if growth_signals >= 3:
            return 10
        elif growth_signals >= 2:
            return 8
        elif growth_signals >= 1:
            return 6
        return 4

    def _ai_rescore(self, listing: Listing) -> Listing:
        """Use Claude to analyze high-potential deals more deeply"""
        try:
            prompt = f"""Analyze this laundromat acquisition opportunity for an investor targeting 25%+ cash-on-cash returns in the LA market, with an existing hub in Bell Gardens.

Listing: {listing.name}
Address: {listing.address}
Ask Price: ${listing.ask_price:,.0f}
Gross Revenue/mo: ${listing.gross_revenue:,.0f}
Cash Flow: ${listing.cash_flow:,.0f}/yr
Description: {listing.description}
Equipment: {listing.equipment_notes}
Current Score: {listing.score}/100

Provide a brief JSON response with:
- "adjusted_score": integer 0-100 (your assessment)
- "red_flags": list of concerns
- "green_flags": list of positives
- "next_steps": list of recommended due diligence steps
- "notes": 1-2 sentence summary

Respond ONLY with JSON, no markdown."""

            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}]
            )

            text = response.content[0].text.strip()
            data = json.loads(text)

            if "adjusted_score" in data:
                listing.score = data["adjusted_score"]
            if "notes" in data:
                listing.notes = data["notes"]

            log.info(f"AI rescored '{listing.name}': {listing.score}/100")

        except Exception as e:
            log.warning(f"AI scoring failed for '{listing.name}': {e}")

        return listing


# ═══════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════

class ListingDB:
    """SQLite storage for scraped listings"""

    def __init__(self, db_path=DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS listings (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    address TEXT,
                    city TEXT,
                    state TEXT DEFAULT 'CA',
                    zip_code TEXT,
                    ask_price REAL DEFAULT 0,
                    gross_revenue REAL DEFAULT 0,
                    net_income REAL DEFAULT 0,
                    cash_flow REAL DEFAULT 0,
                    lease_remaining TEXT,
                    equipment_notes TEXT,
                    sqft INTEGER DEFAULT 0,
                    year_established INTEGER DEFAULT 0,
                    brokerage TEXT,
                    listing_url TEXT,
                    description TEXT,
                    broker_name TEXT,
                    broker_phone TEXT,
                    score INTEGER DEFAULT 0,
                    coc_estimate REAL DEFAULT 0,
                    status TEXT DEFAULT 'new',
                    notes TEXT DEFAULT '',
                    starred INTEGER DEFAULT 0,
                    added_date TEXT,
                    last_seen TEXT,
                    score_breakdown TEXT DEFAULT '{}'
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS scan_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT,
                    brokerage TEXT,
                    listings_found INTEGER,
                    new_listings INTEGER,
                    duration_seconds REAL
                )
            """)

    def upsert(self, listing: Listing):
        """Insert or update a listing, preserving user edits"""
        with sqlite3.connect(self.db_path) as conn:
            existing = conn.execute("SELECT status, notes, starred FROM listings WHERE id = ?", (listing.id,)).fetchone()

            if existing:
                # Preserve user-set fields
                listing.status = existing[0]
                listing.notes = existing[1] if existing[1] else listing.notes
                listing.starred = bool(existing[2])
                listing.last_seen = datetime.now().isoformat()

                conn.execute("""
                    UPDATE listings SET
                        name=?, address=?, city=?, ask_price=?, gross_revenue=?,
                        net_income=?, cash_flow=?, description=?, score=?,
                        coc_estimate=?, last_seen=?, score_breakdown=?,
                        listing_url=?, brokerage=?
                    WHERE id=?
                """, (listing.name, listing.address, listing.city, listing.ask_price,
                      listing.gross_revenue, listing.net_income, listing.cash_flow,
                      listing.description, listing.score, listing.coc_estimate,
                      listing.last_seen, json.dumps(listing.score_breakdown),
                      listing.listing_url, listing.brokerage, listing.id))
            else:
                conn.execute("""
                    INSERT INTO listings (
                        id, name, address, city, state, zip_code, ask_price,
                        gross_revenue, net_income, cash_flow, lease_remaining,
                        equipment_notes, sqft, year_established, brokerage,
                        listing_url, description, broker_name, broker_phone,
                        score, coc_estimate, status, notes, starred,
                        added_date, last_seen, score_breakdown
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (listing.id, listing.name, listing.address, listing.city,
                      listing.state, listing.zip_code, listing.ask_price,
                      listing.gross_revenue, listing.net_income, listing.cash_flow,
                      listing.lease_remaining, listing.equipment_notes, listing.sqft,
                      listing.year_established, listing.brokerage, listing.listing_url,
                      listing.description, listing.broker_name, listing.broker_phone,
                      listing.score, listing.coc_estimate, listing.status, listing.notes,
                      int(listing.starred), listing.added_date, listing.last_seen,
                      json.dumps(listing.score_breakdown)))

    def get_all(self, status=None, brokerage=None, min_score=0, sort="score") -> list[dict]:
        """Get listings with optional filters"""
        query = "SELECT * FROM listings WHERE score >= ?"
        params = [min_score]

        if status and status != "all":
            query += " AND status = ?"
            params.append(status)
        if brokerage and brokerage != "ALL":
            query += " AND brokerage = ?"
            params.append(brokerage)

        sort_map = {"score": "score DESC", "price": "ask_price ASC", "coc": "coc_estimate DESC", "date": "added_date DESC"}
        query += f" ORDER BY {sort_map.get(sort, 'score DESC')}"

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(query, params).fetchall()
            return [dict(r) for r in rows]

    def update_status(self, listing_id, status):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE listings SET status = ? WHERE id = ?", (status, listing_id))

    def update_starred(self, listing_id, starred):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE listings SET starred = ? WHERE id = ?", (int(starred), listing_id))

    def update_notes(self, listing_id, notes):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE listings SET notes = ? WHERE id = ?", (notes, listing_id))

    def delete(self, listing_id):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM listings WHERE id = ?", (listing_id,))

    def log_scan(self, brokerage, found, new, duration):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("INSERT INTO scan_log (timestamp, brokerage, listings_found, new_listings, duration_seconds) VALUES (?,?,?,?,?)",
                         (datetime.now().isoformat(), brokerage, found, new, duration))

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM listings").fetchone()[0]
            starred = conn.execute("SELECT COUNT(*) FROM listings WHERE starred = 1").fetchone()[0]
            above_threshold = conn.execute("SELECT COUNT(*) FROM listings WHERE coc_estimate >= 25").fetchone()[0]
            new = conn.execute("SELECT COUNT(*) FROM listings WHERE status = 'new'").fetchone()[0]
            last_scan = conn.execute("SELECT MAX(timestamp) FROM scan_log").fetchone()[0]
            return {"total": total, "starred": starred, "above_threshold": above_threshold, "new": new, "last_scan": last_scan}


# ═══════════════════════════════════════
# SCANNER ORCHESTRATOR
# ═══════════════════════════════════════

class Scanner:
    """Orchestrates scraping, scoring, and storage"""

    def __init__(self, use_ai=False):
        self.scrapers = [
            BizBuySellScraper(),
            BizBenScraper(),
            LoopNetScraper(),
            BizQuestScraper(),
        ]
        self.scorer = DealScorer(use_ai=use_ai)
        self.db = ListingDB()

    def run(self):
        """Run a full scan across all brokerages"""
        log.info("=" * 60)
        log.info("STARTING FULL SCAN")
        log.info("=" * 60)

        total_new = 0

        for scraper in self.scrapers:
            start = time.time()
            try:
                log.info(f"Scraping {scraper.name}...")
                listings = scraper.scrape()
                duration = time.time() - start

                new_count = 0
                for listing in listings:
                    # Score each listing
                    listing = self.scorer.score(listing)

                    # Check if new
                    existing = self.db.get_all()
                    is_new = not any(e["id"] == listing.id for e in existing)
                    if is_new:
                        new_count += 1

                    # Save
                    self.db.upsert(listing)

                self.db.log_scan(scraper.name, len(listings), new_count, duration)
                total_new += new_count

                log.info(f"[{scraper.name}] Done: {len(listings)} found, {new_count} new ({duration:.1f}s)")

            except Exception as e:
                log.error(f"[{scraper.name}] Scraper failed: {e}")
                self.db.log_scan(scraper.name, 0, 0, time.time() - start)

        log.info(f"SCAN COMPLETE: {total_new} new listings found")
        return total_new


# ═══════════════════════════════════════
# API SERVER
# ═══════════════════════════════════════

def create_app(scanner: Scanner):
    app = Flask(__name__)
    CORS(app)  # Allow dashboard to connect

    @app.route("/api/listings", methods=["GET"])
    def get_listings():
        status = flask_request.args.get("status", "all")
        brokerage = flask_request.args.get("brokerage", "ALL")
        min_score = int(flask_request.args.get("min_score", 0))
        sort = flask_request.args.get("sort", "score")
        listings = scanner.db.get_all(status=status, brokerage=brokerage, min_score=min_score, sort=sort)
        return jsonify({"listings": listings, "count": len(listings)})

    @app.route("/api/listings/<listing_id>/status", methods=["PUT"])
    def update_status(listing_id):
        data = flask_request.get_json()
        scanner.db.update_status(listing_id, data.get("status", "new"))
        return jsonify({"ok": True})

    @app.route("/api/listings/<listing_id>/star", methods=["PUT"])
    def toggle_star(listing_id):
        data = flask_request.get_json()
        scanner.db.update_starred(listing_id, data.get("starred", False))
        return jsonify({"ok": True})

    @app.route("/api/listings/<listing_id>/notes", methods=["PUT"])
    def update_notes(listing_id):
        data = flask_request.get_json()
        scanner.db.update_notes(listing_id, data.get("notes", ""))
        return jsonify({"ok": True})

    @app.route("/api/listings/<listing_id>", methods=["DELETE"])
    def delete_listing(listing_id):
        scanner.db.delete(listing_id)
        return jsonify({"ok": True})

    @app.route("/api/scan", methods=["POST"])
    def trigger_scan():
        """Manually trigger a scan"""
        new_count = scanner.run()
        return jsonify({"ok": True, "new_listings": new_count})

    @app.route("/api/stats", methods=["GET"])
    def get_stats():
        return jsonify(scanner.db.get_stats())

    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})

    return app


# ═══════════════════════════════════════
# MAIN
# ═══════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Everrock Laundromat Scanner")
    parser.add_argument("--serve", action="store_true", help="Start API server")
    parser.add_argument("--port", type=int, default=8420, help="API port (default: 8420)")
    parser.add_argument("--ai", action="store_true", help="Enable Claude AI scoring for high-potential deals")
    parser.add_argument("--scan-only", action="store_true", help="Run one scan and exit")
    args = parser.parse_args()

    scanner = Scanner(use_ai=args.ai)

    if args.scan_only:
        scanner.run()
        return

    if args.serve:
        # Run initial scan
        log.info("Running initial scan...")
        scanner.run()

        # Schedule recurring scans
        scheduler = BackgroundScheduler()
        scheduler.add_job(scanner.run, "interval", hours=SCAN_INTERVAL_HOURS, id="scan")
        scheduler.start()
        log.info(f"Scan scheduled every {SCAN_INTERVAL_HOURS} hours")

        # Start API
        app = create_app(scanner)
        log.info(f"API server starting on port {args.port}")
        app.run(host="0.0.0.0", port=args.port, debug=False)
    else:
        scanner.run()


if __name__ == "__main__":
    main()
