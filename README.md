# EVERROCK COMMAND CENTER

Full-stack war room dashboard for Adams Resources / Float Holdings.

```
everrock-command/
├── src/                  # React frontend (dashboard)
│   ├── App.jsx           # Main command center app
│   └── index.js          # Entry point
├── public/
│   └── index.html
├── scanner/              # Python backend (scraper + API)
│   ├── scanner.py        # Main scraper service
│   ├── requirements.txt
│   ├── Dockerfile
│   └── docker-compose.yml
├── netlify.toml          # Frontend deploy config
├── package.json
└── .env.example          # Environment template
```

---

## DEPLOY IN 10 MINUTES

### Step 1: Push to GitHub

```bash
# On your laptop
cd everrock-command
git init
git add .
git commit -m "Everrock Command Center v1"

# Create repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/everrock-command.git
git push -u origin main
```

### Step 2: Deploy Frontend → Netlify

1. Go to [netlify.com](https://app.netlify.com) (you already have an account from universitylaundryservices.com)
2. Click **"Add new site" → "Import an existing project"**
3. Connect your GitHub → select `everrock-command`
4. Build settings (should auto-detect from netlify.toml):
   - Build command: `npm run build`
   - Publish directory: `build`
5. Click **Deploy**
6. Once live, go to **Site settings → Environment variables**
   - Add: `REACT_APP_SCANNER_API` = `http://YOUR_VPS_IP:8420`
7. Trigger redeploy

Your dashboard is now live at `https://everrock-command.netlify.app` (or whatever Netlify assigns).

Optional: Connect `everrockcapital.com` to this site once you transfer the domain out of Wix.

### Step 3: Deploy Scanner → VPS

Pick a VPS provider ($4-6/mo):
- **Hetzner CX22** ($4/mo) — best value
- **DigitalOcean Basic** ($6/mo) — LA datacenter
- **Vultr Cloud** ($6/mo) — LA datacenter

```bash
# 1. Create droplet/server (Ubuntu 24.04, cheapest tier)
# 2. SSH in
ssh root@YOUR_VPS_IP

# 3. Install Docker
curl -fsSL https://get.docker.com | sh

# 4. Clone your repo
git clone https://github.com/YOUR_USERNAME/everrock-command.git
cd everrock-command/scanner

# 5. Set your Anthropic API key
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env

# 6. Launch
docker-compose up -d

# 7. Verify
curl http://localhost:8420/api/health
# Should return: {"status": "ok", "timestamp": "..."}
```

The scanner now:
- Scrapes BizBuySell, BizBen, LoopNet, BizQuest every 6 hours
- Scores each listing 0-100 using your playbook
- Serves results to your Netlify dashboard via API
- Persists all data in SQLite

### Step 4: Open Firewall

On your VPS, allow port 8420:
```bash
ufw allow 8420
```

Or if using DigitalOcean, add it in the Networking → Firewalls panel.

---

## OPTIONAL: Run Both on Railway (No Server Management)

If you don't want to manage a VPS:

1. Go to [railway.app](https://railway.app)
2. Create new project → connect GitHub repo
3. Railway will detect the frontend. Add a second service for the scanner:
   - Point to `/scanner` directory
   - Set env var `ANTHROPIC_API_KEY`
4. Railway gives you URLs for both services
5. Set the scanner URL as `REACT_APP_SCANNER_API` on the frontend service

Total cost: ~$5/mo

---

## UPDATING

### Frontend changes:
Just push to GitHub → Netlify auto-deploys.

### Scanner changes:
```bash
ssh root@YOUR_VPS_IP
cd everrock-command/scanner
git pull
docker-compose up -d --build
```

---

## CONNECTING EVERROCKCAPITAL.COM

Once you transfer the domain out of Wix to Cloudflare/Namecheap:

1. In Netlify → Domain settings → Add custom domain → `everrockcapital.com`
2. At your registrar, set nameservers to Netlify's:
   - dns1.p06.nsone.net
   - dns2.p06.nsone.net
   - dns3.p06.nsone.net
   - dns4.p06.nsone.net
3. SSL auto-provisions

Dashboard lives at `everrockcapital.com`.

---

## WHAT EACH TAB DOES

| Tab | Description |
|---|---|
| **OVERVIEW** | Markets + deals + VIX + news — the main war room view |
| **DEALS** | Click-to-expand cards for Round-N-Round, Alligator, BotBuilt, Postal, Signal Trader |
| **SCANNER** | Live brokerage scraper with filters, scoring, broker contact (call/text/email) |
| **SDSU BID** | RFP 7074 tracker with timeline, docs, entity details |
| **MARKETS** | SPX, VIX, BTC, QQQ, DXY, TNX with charts + options book |
| **NEWS** | Filterable news feed + prediction markets |

All deal data is editable inline and persists in localStorage (frontend) + SQLite (scanner).
