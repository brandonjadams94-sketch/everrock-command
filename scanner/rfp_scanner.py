"""
EVERROCK UNIVERSITY RFP SCANNER
=================================
Scans public university procurement portals for laundry, vending,
and facilities services RFPs. Integrates with Everrock Command Center.

Sources:
  - PlanetBids (authenticated — login via .env)
  - CSU (Cal State) procurement portal — all 23 campuses
  - UC system procurement
  - CaleProcure (State of CA)
  - BidSync / PublicPurchase

Keyword filters:
  Laundry, laundromat, coin-op, wash, vending, linen,
  student housing services, facilities management,
  custodial, janitorial + laundry combos

Deployment: Runs alongside laundromat scanner on same VPS.
  python rfp_scanner.py --serve --port 8421

Cron: Checks every 4 hours for new postings.
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
from urllib.parse import urljoin, urlencode

import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request as flask_request
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("rfp-scanner")

DB_PATH = os.environ.get("RFP_DB", "rfp_scanner.db")
SCAN_INTERVAL_HOURS = int(os.environ.get("RFP_SCAN_INTERVAL", "4"))

# PlanetBids credentials — set in .env file on VPS, NEVER hardcode
PLANETBIDS_EMAIL = os.environ.get("PLANETBIDS_EMAIL", "")
PLANETBIDS_PASSWORD = os.environ.get("PLANETBIDS_PASSWORD", "")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# ─── KEYWORDS ───
# Primary: direct laundry matches
# Secondary: adjacent services that sometimes bundle laundry
PRIMARY_KEYWORDS = [
    "laundry", "laundromat", "coin-op", "coin op", "coin operated",
    "washer", "dryer", "wash and fold", "wash & fold", "linen service",
    "laundry service", "laundry equipment", "laundry facilities",
    "student laundry", "residential laundry", "housing laundry",
]

SECONDARY_KEYWORDS = [
    "vending", "vending machine", "vending services",
    "student housing services", "residence hall services",
    "facilities management", "custodial and laundry",
    "janitorial", "building services", "amenity services",
    "housing amenities", "dormitory services",
]

EXCLUDE_KEYWORDS = [
    "dry cleaning only", "medical laundry", "hospital linen",
    "industrial laundry", "vehicle wash", "car wash",
    "pressure washing", "window washing",
]


@dataclass
class RFP:
    id: str = ""
    title: str = ""
    agency: str = ""
    campus: str = ""
    system: str = ""  # CSU, UC, State, Community College, Other
    rfp_number: str = ""
    description: str = ""
    category: str = ""  # laundry, vending, facilities, mixed
    due_date: str = ""
    posted_date: str = ""
    status: str = "open"  # open, closing_soon, closed, awarded
    platform: str = ""  # PlanetBids, CSU Portal, UC Portal, CaleProcure, BidSync
    listing_url: str = ""
    contact_name: str = ""
    contact_email: str = ""
    contact_phone: str = ""
    estimated_value: str = ""
    pre_bid_date: str = ""
    pre_bid_mandatory: bool = False
    documents_url: str = ""
    # Scoring
    relevance_score: int = 0  # 0-100 how relevant to our business
    keyword_matches: str = ""
    # User fields
    user_status: str = "new"  # new, reviewing, bidding, submitted, won, lost, passed
    notes: str = ""
    starred: bool = False
    added_date: str = ""

    def compute_id(self):
        raw = f"{self.rfp_number}|{self.agency}|{self.title}"
        self.id = hashlib.md5(raw.encode()).hexdigest()[:12]
        return self.id


# ═══════════════════════════════════════
# SCRAPERS
# ═══════════════════════════════════════

class BaseScraper:
    name = "base"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

    def scrape(self) -> list[RFP]:
        raise NotImplementedError

    def _get(self, url, **kwargs):
        time.sleep(2 + (hash(url) % 3))
        try:
            resp = self.session.get(url, timeout=20, **kwargs)
            resp.raise_for_status()
            return resp
        except Exception as e:
            log.warning(f"[{self.name}] Failed: {url} — {e}")
            return None

    def _post(self, url, **kwargs):
        time.sleep(2)
        try:
            resp = self.session.post(url, timeout=20, **kwargs)
            resp.raise_for_status()
            return resp
        except Exception as e:
            log.warning(f"[{self.name}] POST failed: {url} — {e}")
            return None

    def _score_relevance(self, title: str, description: str) -> tuple[int, list[str]]:
        """Score how relevant an RFP is to laundry services"""
        text = f"{title} {description}".lower()
        matches = []

        # Check exclusions first
        for kw in EXCLUDE_KEYWORDS:
            if kw in text:
                return 0, []

        # Primary keywords (high value)
        primary_hits = [kw for kw in PRIMARY_KEYWORDS if kw in text]
        # Secondary keywords (moderate value)
        secondary_hits = [kw for kw in SECONDARY_KEYWORDS if kw in text]

        matches = primary_hits + secondary_hits

        if not matches:
            return 0, []

        score = min(100, len(primary_hits) * 25 + len(secondary_hits) * 10)

        # Boost for specific high-value terms
        if "student housing" in text and "laundry" in text:
            score = min(100, score + 20)
        if "coin" in text:
            score = min(100, score + 15)
        if "rfp" in title.lower() or "rfq" in title.lower():
            score = min(100, score + 5)

        return score, matches

    def _determine_category(self, matches: list[str]) -> str:
        has_laundry = any("laundry" in m or "wash" in m or "coin" in m or "linen" in m for m in matches)
        has_vending = any("vending" in m for m in matches)

        if has_laundry and has_vending:
            return "mixed"
        elif has_laundry:
            return "laundry"
        elif has_vending:
            return "vending"
        return "facilities"


class PlanetBidsScraper(BaseScraper):
    """
    Authenticated scraper for PlanetBids.
    Requires PLANETBIDS_EMAIL and PLANETBIDS_PASSWORD in .env
    """
    name = "PlanetBids"

    def scrape(self) -> list[RFP]:
        rfps = []

        if not PLANETBIDS_EMAIL or not PLANETBIDS_PASSWORD:
            log.warning("[PlanetBids] No credentials set — skipping authenticated scrape, using public search")
            return self._scrape_public()

        # Login
        login_url = "https://www.planetbids.com/portal/portal.cfm"
        login_data = {
            "email": PLANETBIDS_EMAIL,
            "password": PLANETBIDS_PASSWORD,
            "action": "login",
        }

        resp = self._post(login_url, data=login_data)
        if not resp or "logout" not in resp.text.lower():
            log.warning("[PlanetBids] Login failed — falling back to public search")
            return self._scrape_public()

        log.info("[PlanetBids] Logged in successfully")

        # Search for laundry-related bids
        for keyword in ["laundry", "vending", "coin operated"]:
            search_url = f"https://www.planetbids.com/portal/portal.cfm?CompanyID=0&BidSearch={keyword}"
            resp = self._get(search_url)
            if not resp:
                continue

            soup = BeautifulSoup(resp.text, "html.parser")
            rows = soup.select("table.bidlist tr, .bid-row, tr[data-bid-id]")

            for row in rows:
                try:
                    rfp = self._parse_planetbids_row(row)
                    if rfp and rfp.relevance_score > 0:
                        rfps.append(rfp)
                except Exception as e:
                    log.warning(f"[PlanetBids] Parse error: {e}")

        log.info(f"[PlanetBids] Found {len(rfps)} relevant RFPs")
        return rfps

    def _scrape_public(self) -> list[RFP]:
        """Public PlanetBids search without login"""
        rfps = []
        for keyword in ["laundry services", "vending services", "coin operated laundry"]:
            search_url = f"https://www.planetbids.com/portal/portal.cfm?BidSearch={keyword}"
            resp = self._get(search_url)
            if not resp:
                continue

            soup = BeautifulSoup(resp.text, "html.parser")
            rows = soup.select("table tr, .bid-item, .search-result")

            for row in rows:
                rfp = self._parse_planetbids_row(row)
                if rfp and rfp.relevance_score > 0:
                    rfps.append(rfp)

        return rfps

    def _parse_planetbids_row(self, row) -> Optional[RFP]:
        rfp = RFP(platform=self.name)
        rfp.added_date = datetime.now().strftime("%Y-%m-%d")

        title_el = row.select_one("a, .bid-title, td:first-child a")
        if title_el:
            rfp.title = title_el.get_text(strip=True)
            href = title_el.get("href", "")
            rfp.listing_url = href if href.startswith("http") else f"https://www.planetbids.com{href}"

        agency_el = row.select_one(".agency, td:nth-child(2)")
        if agency_el:
            rfp.agency = agency_el.get_text(strip=True)

        date_el = row.select_one(".due-date, td:nth-child(3)")
        if date_el:
            rfp.due_date = date_el.get_text(strip=True)

        bid_el = row.select_one(".bid-number, td:nth-child(4)")
        if bid_el:
            rfp.rfp_number = bid_el.get_text(strip=True)

        if not rfp.title:
            return None

        rfp.relevance_score, matches = self._score_relevance(rfp.title, rfp.description)
        rfp.keyword_matches = ", ".join(matches)
        rfp.category = self._determine_category(matches)
        rfp.compute_id()
        return rfp


class CSUScraper(BaseScraper):
    """Scrape Cal State University system procurement pages"""
    name = "CSU"

    # All 23 CSU campuses with their procurement URLs
    CAMPUSES = {
        "San Diego State": "https://bfa.sdsu.edu/financial/procurement",
        "Cal State LA": "https://www.calstatela.edu/procurement",
        "Cal State Long Beach": "https://www.csulb.edu/procurement",
        "Cal State Fullerton": "https://www.fullerton.edu/procurement",
        "Cal Poly Pomona": "https://www.cpp.edu/procurement",
        "Cal State Northridge": "https://www.csun.edu/procurement",
        "Cal State Dominguez Hills": "https://www.csudh.edu/procurement",
        "San Jose State": "https://www.sjsu.edu/procurement",
        "Sacramento State": "https://www.csus.edu/administration-business-affairs/procurement",
        "Fresno State": "https://www.fresnostate.edu/adminserv/procurement",
        "San Francisco State": "https://procurement.sfsu.edu",
        "Cal Poly SLO": "https://afd.calpoly.edu/procurement",
        "Chico State": "https://www.csuchico.edu/purch",
        "Sonoma State": "https://procurement.sonoma.edu",
        "Stanislaus State": "https://www.csustan.edu/procurement",
        "Cal State Bakersfield": "https://www.csub.edu/bas/procurement",
        "Humboldt State": "https://procurement.humboldt.edu",
        "Cal Maritime": "https://www.csum.edu/procurement",
        "Cal State San Marcos": "https://www.csusm.edu/procurement",
        "Cal State Monterey Bay": "https://csumb.edu/procurement",
        "Cal State Channel Islands": "https://www.csuci.edu/procurement",
        "Cal State San Bernardino": "https://www.csusb.edu/procurement",
        "Cal State East Bay": "https://www.csueastbay.edu/procurement",
    }

    def scrape(self) -> list[RFP]:
        rfps = []

        # CSU systemwide procurement
        systemwide_url = "https://www2.calstate.edu/csu-system/doing-business-with-the-csu/procurement"
        resp = self._get(systemwide_url)
        if resp:
            rfps.extend(self._parse_procurement_page(resp.text, "CSU System", "CSU"))

        # Scan individual campus pages
        for campus, url in self.CAMPUSES.items():
            resp = self._get(url)
            if resp:
                found = self._parse_procurement_page(resp.text, campus, "CSU")
                rfps.extend(found)
                if found:
                    log.info(f"[CSU] {campus}: {len(found)} relevant RFPs")

        log.info(f"[CSU] Total: {len(rfps)} relevant RFPs across all campuses")
        return rfps

    def _parse_procurement_page(self, html: str, campus: str, system: str) -> list[RFP]:
        rfps = []
        soup = BeautifulSoup(html, "html.parser")

        # Look for links/items mentioning bids, RFPs, solicitations
        links = soup.find_all("a", href=True)
        for link in links:
            text = link.get_text(strip=True)
            href = link["href"]

            # Filter for potential bid/RFP links
            combined = f"{text} {href}".lower()
            if not any(kw in combined for kw in ["bid", "rfp", "rfq", "solicitation", "procurement", "opportunity"]):
                continue

            score, matches = self._score_relevance(text, "")
            if score > 0:
                rfp = RFP(
                    platform=self.name,
                    title=text,
                    agency=campus,
                    campus=campus,
                    system=system,
                    listing_url=href if href.startswith("http") else urljoin(f"https://{campus.lower().replace(' ', '')}.edu", href),
                    relevance_score=score,
                    keyword_matches=", ".join(matches),
                    category=self._determine_category(matches),
                    added_date=datetime.now().strftime("%Y-%m-%d"),
                    status="open",
                )
                rfp.compute_id()
                rfps.append(rfp)

        # Also look for tables with bid listings
        tables = soup.find_all("table")
        for table in tables:
            rows = table.find_all("tr")[1:]  # Skip header
            for row in rows:
                cells = row.find_all(["td", "th"])
                if len(cells) < 2:
                    continue

                row_text = " ".join(c.get_text(strip=True) for c in cells)
                score, matches = self._score_relevance(row_text, "")

                if score > 0:
                    link_el = row.find("a", href=True)
                    rfp = RFP(
                        platform=self.name,
                        title=cells[0].get_text(strip=True) if cells else row_text[:100],
                        agency=campus,
                        campus=campus,
                        system=system,
                        listing_url=link_el["href"] if link_el else "",
                        relevance_score=score,
                        keyword_matches=", ".join(matches),
                        category=self._determine_category(matches),
                        added_date=datetime.now().strftime("%Y-%m-%d"),
                        status="open",
                    )
                    if len(cells) > 1:
                        rfp.rfp_number = cells[1].get_text(strip=True) if len(cells) > 1 else ""
                    if len(cells) > 2:
                        rfp.due_date = cells[2].get_text(strip=True) if len(cells) > 2 else ""

                    rfp.compute_id()
                    rfps.append(rfp)

        return rfps


class UCScraper(BaseScraper):
    """Scrape University of California procurement"""
    name = "UC"

    UC_CAMPUSES = {
        "UCLA": "https://www.procurement.ucla.edu/bids",
        "UC Berkeley": "https://supplychain.berkeley.edu/bids-contracts",
        "UC San Diego": "https://blink.ucsd.edu/sponsor/procurement/bids.html",
        "UC Irvine": "https://www.procurement.uci.edu/bids",
        "UC Davis": "https://supplychain.ucdavis.edu/bids",
        "UC Santa Barbara": "https://www.bfs.ucsb.edu/procurement/bids",
        "UC Santa Cruz": "https://financial.ucsc.edu/Pages/Procurement_CurrentBids.aspx",
        "UC Riverside": "https://procurement.ucr.edu/bids",
        "UC Merced": "https://procurement.ucmerced.edu/bids",
    }

    def scrape(self) -> list[RFP]:
        rfps = []

        # UC systemwide
        resp = self._get("https://www.ucop.edu/procurement-services/for-suppliers/open-bids.html")
        if resp:
            rfps.extend(self._parse_procurement_page(resp.text, "UC System", "UC"))

        for campus, url in self.UC_CAMPUSES.items():
            resp = self._get(url)
            if resp:
                found = self._parse_procurement_page(resp.text, campus, "UC")
                rfps.extend(found)

        log.info(f"[UC] Total: {len(rfps)} relevant RFPs")
        return rfps

    def _parse_procurement_page(self, html, campus, system):
        rfps = []
        soup = BeautifulSoup(html, "html.parser")

        # Similar pattern to CSU scraper
        for link in soup.find_all("a", href=True):
            text = link.get_text(strip=True)
            score, matches = self._score_relevance(text, "")
            if score > 0:
                rfp = RFP(
                    platform=self.name, title=text, agency=campus,
                    campus=campus, system=system,
                    listing_url=link["href"] if link["href"].startswith("http") else urljoin(f"https://{campus.lower().replace(' ', '')}.edu", link["href"]),
                    relevance_score=score, keyword_matches=", ".join(matches),
                    category=self._determine_category(matches),
                    added_date=datetime.now().strftime("%Y-%m-%d"), status="open",
                )
                rfp.compute_id()
                rfps.append(rfp)

        for table in soup.find_all("table"):
            for row in table.find_all("tr")[1:]:
                cells = row.find_all(["td", "th"])
                if len(cells) < 2:
                    continue
                row_text = " ".join(c.get_text(strip=True) for c in cells)
                score, matches = self._score_relevance(row_text, "")
                if score > 0:
                    link_el = row.find("a", href=True)
                    rfp = RFP(
                        platform=self.name, title=cells[0].get_text(strip=True),
                        agency=campus, campus=campus, system=system,
                        listing_url=link_el["href"] if link_el else "",
                        rfp_number=cells[1].get_text(strip=True) if len(cells) > 1 else "",
                        due_date=cells[2].get_text(strip=True) if len(cells) > 2 else "",
                        relevance_score=score, keyword_matches=", ".join(matches),
                        category=self._determine_category(matches),
                        added_date=datetime.now().strftime("%Y-%m-%d"), status="open",
                    )
                    rfp.compute_id()
                    rfps.append(rfp)

        return rfps


class CaleProcureScraper(BaseScraper):
    """Scrape California state procurement (CaleProcure / Cal eProcure)"""
    name = "CaleProcure"

    def scrape(self) -> list[RFP]:
        rfps = []
        # CaleProcure search
        for keyword in ["laundry", "vending services", "coin operated"]:
            search_url = f"https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx"
            params = {"q": keyword}
            resp = self._get(search_url, params=params)
            if not resp:
                continue

            soup = BeautifulSoup(resp.text, "html.parser")
            rows = soup.select(".event-row, table tr, .search-result")

            for row in rows:
                try:
                    title_el = row.select_one("a, .event-title, td:first-child")
                    if not title_el:
                        continue

                    title = title_el.get_text(strip=True)
                    score, matches = self._score_relevance(title, "")

                    if score > 0:
                        rfp = RFP(
                            platform=self.name, title=title,
                            agency="State of California", system="State",
                            listing_url=title_el.get("href", "") if title_el.name == "a" else "",
                            relevance_score=score, keyword_matches=", ".join(matches),
                            category=self._determine_category(matches),
                            added_date=datetime.now().strftime("%Y-%m-%d"), status="open",
                        )
                        rfp.compute_id()
                        rfps.append(rfp)
                except Exception as e:
                    continue

        log.info(f"[CaleProcure] Found {len(rfps)} relevant RFPs")
        return rfps


class BidSyncScraper(BaseScraper):
    """Scrape BidSync / Periscope for university bids"""
    name = "BidSync"

    def scrape(self) -> list[RFP]:
        rfps = []
        for keyword in ["university laundry", "campus laundry", "student housing laundry", "vending university"]:
            search_url = f"https://www.bidsync.com/DPXSearch"
            params = {"query": keyword, "state": "CA"}
            resp = self._get(search_url, params=params)
            if not resp:
                continue

            soup = BeautifulSoup(resp.text, "html.parser")
            items = soup.select(".bid-item, .search-result, tr")

            for item in items:
                title_el = item.select_one("a, .title")
                if not title_el:
                    continue
                title = title_el.get_text(strip=True)
                score, matches = self._score_relevance(title, "")
                if score > 0:
                    rfp = RFP(
                        platform=self.name, title=title,
                        listing_url=title_el.get("href", ""),
                        relevance_score=score, keyword_matches=", ".join(matches),
                        category=self._determine_category(matches),
                        added_date=datetime.now().strftime("%Y-%m-%d"), status="open",
                    )
                    rfp.compute_id()
                    rfps.append(rfp)

        log.info(f"[BidSync] Found {len(rfps)} relevant RFPs")
        return rfps


# ═══════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════

class RFPDB:
    def __init__(self, db_path=DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS rfps (
                    id TEXT PRIMARY KEY,
                    title TEXT, agency TEXT, campus TEXT, system TEXT,
                    rfp_number TEXT, description TEXT, category TEXT,
                    due_date TEXT, posted_date TEXT, status TEXT DEFAULT 'open',
                    platform TEXT, listing_url TEXT,
                    contact_name TEXT, contact_email TEXT, contact_phone TEXT,
                    estimated_value TEXT, pre_bid_date TEXT,
                    pre_bid_mandatory INTEGER DEFAULT 0, documents_url TEXT,
                    relevance_score INTEGER DEFAULT 0, keyword_matches TEXT,
                    user_status TEXT DEFAULT 'new', notes TEXT DEFAULT '',
                    starred INTEGER DEFAULT 0, added_date TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS rfp_scan_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT, source TEXT,
                    rfps_found INTEGER, new_rfps INTEGER, duration REAL
                )
            """)

    def upsert(self, rfp: RFP):
        with sqlite3.connect(self.db_path) as conn:
            existing = conn.execute("SELECT user_status, notes, starred FROM rfps WHERE id = ?", (rfp.id,)).fetchone()
            if existing:
                rfp.user_status = existing[0]
                rfp.notes = existing[1] or rfp.notes
                rfp.starred = bool(existing[2])
                conn.execute("""
                    UPDATE rfps SET title=?, agency=?, campus=?, system=?,
                    rfp_number=?, description=?, category=?, due_date=?,
                    status=?, platform=?, listing_url=?, relevance_score=?,
                    keyword_matches=?, contact_name=?, contact_email=?, contact_phone=?
                    WHERE id=?
                """, (rfp.title, rfp.agency, rfp.campus, rfp.system,
                      rfp.rfp_number, rfp.description, rfp.category, rfp.due_date,
                      rfp.status, rfp.platform, rfp.listing_url, rfp.relevance_score,
                      rfp.keyword_matches, rfp.contact_name, rfp.contact_email,
                      rfp.contact_phone, rfp.id))
            else:
                conn.execute("""
                    INSERT INTO rfps (
                        id, title, agency, campus, system, rfp_number, description,
                        category, due_date, posted_date, status, platform, listing_url,
                        contact_name, contact_email, contact_phone, estimated_value,
                        pre_bid_date, pre_bid_mandatory, documents_url,
                        relevance_score, keyword_matches, user_status, notes,
                        starred, added_date
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (rfp.id, rfp.title, rfp.agency, rfp.campus, rfp.system,
                      rfp.rfp_number, rfp.description, rfp.category, rfp.due_date,
                      rfp.posted_date, rfp.status, rfp.platform, rfp.listing_url,
                      rfp.contact_name, rfp.contact_email, rfp.contact_phone,
                      rfp.estimated_value, rfp.pre_bid_date, int(rfp.pre_bid_mandatory),
                      rfp.documents_url, rfp.relevance_score, rfp.keyword_matches,
                      rfp.user_status, rfp.notes, int(rfp.starred), rfp.added_date))

    def get_all(self, system=None, category=None, user_status=None, min_score=0, sort="relevance_score") -> list[dict]:
        query = "SELECT * FROM rfps WHERE relevance_score >= ?"
        params = [min_score]
        if system and system != "ALL":
            query += " AND system = ?"
            params.append(system)
        if category and category != "all":
            query += " AND category = ?"
            params.append(category)
        if user_status and user_status != "all":
            query += " AND user_status = ?"
            params.append(user_status)

        sort_map = {"relevance_score": "relevance_score DESC", "due_date": "due_date ASC", "date": "added_date DESC"}
        query += f" ORDER BY {sort_map.get(sort, 'relevance_score DESC')}"

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            return [dict(r) for r in conn.execute(query, params).fetchall()]

    def update_user_status(self, rfp_id, status):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE rfps SET user_status = ? WHERE id = ?", (status, rfp_id))

    def update_starred(self, rfp_id, starred):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE rfps SET starred = ? WHERE id = ?", (int(starred), rfp_id))

    def update_notes(self, rfp_id, notes):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE rfps SET notes = ? WHERE id = ?", (notes, rfp_id))

    def delete(self, rfp_id):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM rfps WHERE id = ?", (rfp_id,))

    def get_stats(self):
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM rfps").fetchone()[0]
            open_count = conn.execute("SELECT COUNT(*) FROM rfps WHERE status = 'open'").fetchone()[0]
            starred = conn.execute("SELECT COUNT(*) FROM rfps WHERE starred = 1").fetchone()[0]
            bidding = conn.execute("SELECT COUNT(*) FROM rfps WHERE user_status IN ('reviewing','bidding','submitted')").fetchone()[0]
            last_scan = conn.execute("SELECT MAX(timestamp) FROM rfp_scan_log").fetchone()[0]
            return {"total": total, "open": open_count, "starred": starred, "bidding": bidding, "last_scan": last_scan}

    def log_scan(self, source, found, new, duration):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("INSERT INTO rfp_scan_log (timestamp, source, rfps_found, new_rfps, duration) VALUES (?,?,?,?,?)",
                         (datetime.now().isoformat(), source, found, new, duration))


# ═══════════════════════════════════════
# SCANNER ORCHESTRATOR
# ═══════════════════════════════════════

class RFPScanner:
    def __init__(self):
        self.scrapers = [
            PlanetBidsScraper(),
            CSUScraper(),
            UCScraper(),
            CaleProcureScraper(),
            BidSyncScraper(),
        ]
        self.db = RFPDB()

    def run(self):
        log.info("=" * 60)
        log.info("STARTING RFP SCAN")
        log.info("=" * 60)
        total_new = 0

        for scraper in self.scrapers:
            start = time.time()
            try:
                log.info(f"Scanning {scraper.name}...")
                rfps = scraper.scrape()
                duration = time.time() - start

                new_count = 0
                existing = self.db.get_all()
                existing_ids = {e["id"] for e in existing}

                for rfp in rfps:
                    if rfp.id not in existing_ids:
                        new_count += 1
                    self.db.upsert(rfp)

                self.db.log_scan(scraper.name, len(rfps), new_count, duration)
                total_new += new_count
                log.info(f"[{scraper.name}] {len(rfps)} found, {new_count} new ({duration:.1f}s)")

            except Exception as e:
                log.error(f"[{scraper.name}] Failed: {e}")
                self.db.log_scan(scraper.name, 0, 0, time.time() - start)

        log.info(f"RFP SCAN COMPLETE: {total_new} new RFPs")
        return total_new


# ═══════════════════════════════════════
# API
# ═══════════════════════════════════════

def create_app(scanner: RFPScanner):
    app = Flask(__name__)
    CORS(app)

    @app.route("/api/rfps", methods=["GET"])
    def get_rfps():
        system = flask_request.args.get("system", "ALL")
        category = flask_request.args.get("category", "all")
        user_status = flask_request.args.get("user_status", "all")
        min_score = int(flask_request.args.get("min_score", 0))
        sort = flask_request.args.get("sort", "relevance_score")
        rfps = scanner.db.get_all(system=system, category=category, user_status=user_status, min_score=min_score, sort=sort)
        return jsonify({"rfps": rfps, "count": len(rfps)})

    @app.route("/api/rfps/<rfp_id>/status", methods=["PUT"])
    def update_status(rfp_id):
        data = flask_request.get_json()
        scanner.db.update_user_status(rfp_id, data.get("status", "new"))
        return jsonify({"ok": True})

    @app.route("/api/rfps/<rfp_id>/star", methods=["PUT"])
    def toggle_star(rfp_id):
        data = flask_request.get_json()
        scanner.db.update_starred(rfp_id, data.get("starred", False))
        return jsonify({"ok": True})

    @app.route("/api/rfps/<rfp_id>/notes", methods=["PUT"])
    def update_notes(rfp_id):
        data = flask_request.get_json()
        scanner.db.update_notes(rfp_id, data.get("notes", ""))
        return jsonify({"ok": True})

    @app.route("/api/rfps/<rfp_id>", methods=["DELETE"])
    def delete_rfp(rfp_id):
        scanner.db.delete(rfp_id)
        return jsonify({"ok": True})

    @app.route("/api/rfps/scan", methods=["POST"])
    def trigger_scan():
        new_count = scanner.run()
        return jsonify({"ok": True, "new_rfps": new_count})

    @app.route("/api/rfps/stats", methods=["GET"])
    def get_stats():
        return jsonify(scanner.db.get_stats())

    @app.route("/api/rfps/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})

    return app


def main():
    parser = argparse.ArgumentParser(description="Everrock RFP Scanner")
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--port", type=int, default=8421)
    parser.add_argument("--scan-only", action="store_true")
    args = parser.parse_args()

    scanner = RFPScanner()

    if args.scan_only:
        scanner.run()
        return

    if args.serve:
        log.info("Running initial RFP scan...")
        scanner.run()

        scheduler = BackgroundScheduler()
        scheduler.add_job(scanner.run, "interval", hours=SCAN_INTERVAL_HOURS, id="rfp-scan")
        scheduler.start()
        log.info(f"RFP scan scheduled every {SCAN_INTERVAL_HOURS} hours")

        app = create_app(scanner)
        log.info(f"RFP API starting on port {args.port}")
        app.run(host="0.0.0.0", port=args.port, debug=False)
    else:
        scanner.run()


if __name__ == "__main__":
    main()
