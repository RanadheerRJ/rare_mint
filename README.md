# Rare Mint — Chit Fund Finance & Digital Passbook PWA

**Rare Mint** is an installable full-stack Progressive Web App (PWA) built for **Chit Fund Organizers (Foremen)** and **Chit Subscribers (Members)**.

## Key Features

- **Two-Sided Role Portals (Organizer & Member)**:
  - **Organizer / Foreman Desk**: Create chit groups, enroll subscriber tickets, record monthly collections with digital passbook signatures, assign monthly winners / record auction bids, and send 1-tap WhatsApp due reminders.
  - **Subscriber Portal**: View personal digital passbooks, track Non-Prized vs Prized status, pay monthly installments, and access signed printable/shareable receipts.
- **Supports Both Chit Fund Models**:
  - **Fixed-Table / Slab Passbook Chits**: Month-by-month Non-Prized vs Prized installment rates (`₹37,000/-` down to `₹11,300/-`) and bonus end-month payouts (`₹5,15,000/-`, `₹5,30,000/-`), pre-seeded with the classic **₹5,00,000 · 16-Month Passbook Card**.
  - **Monthly Dividend Auction Chits**: Monthly bidding discount, foreman commission deduction, automatic per-member dividend sharing, and net installment calculation.
- **"Best Month to Lift" ROI & IRR Analyzer**:
  - Interactive calculator computing total outflow, passbook profit/cost, annualized IRR (`% p.a.`), and reinvested opportunity value against bank FDs or personal/gold loans.
- **Official Receipts & Offline-Ready PWA**:
  - Web App Manifest, custom minted icons, Service Worker + local API snapshot cache for offline passbook reading, printable PDF receipts, and WhatsApp receipt sharing.

## GitHub Pages Deployment (Zero-Server Static Mode)

Rare Mint is engineered to run **100% client-side on GitHub Pages** (using an embedded persistent browser ledger with JSON backup/restore & Service Worker offline caching) as well as full-stack with Node/SQLite locally:

1. Vite builds with relative paths (`base: './'`) + `.nojekyll` + `404.html` SPA fallback so subpath hosting (`https://ranadheerrj.github.io/rare_mint/`) works out of the box.
2. `.github/workflows/deploy-pages.yml` automatically builds and deploys `./dist` to **GitHub Pages** via GitHub Actions.
   - In GitHub repository **Settings → Pages**, set **Source** to **GitHub Actions** (if not already enabled).

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Demo accounts (PIN `1234`):
- **Organizer**: `9848011111` (Rajeshwar Rao)
- **Member (Non-Prized Saver)**: `9848022222` (Arjun Varma)
- **Member (Prized in Month 4)**: `9848033333` (Ananya Sharma)
