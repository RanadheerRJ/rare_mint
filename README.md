# Rare Mint — Chit Fund Finance & Digital Passbook PWA

Rare Mint supports chit organizers and subscribers with fixed-table and auction chit schedules, member tickets, collections, receipts, reminders and lift analysis.

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, choose **Create Account**, and register as a **Chit Organizer**. New installations start with an empty ledger: no demo accounts, groups, members or payments are created.

Create a chit, open it, and select **Add Member**. Choose an open ticket and either enter a new subscriber's name, mobile number and four-digit sign-in PIN, or select an existing member. Share the PIN privately. A member may hold multiple tickets. The chit owner can see enrolled members under **Members & Collections**. Members can sign in using their mobile number and PIN.

The create-chit screen includes optional schedule templates; these are editable starting points, not saved chits.

## Storage and existing installations

Locally, the app uses SQLite in `data/rare_mint.sqlite`. GitHub Pages uses a browser-local ledger instead; its data is not shared between devices or browsers. Use the JSON backup/restore controls in static mode to transfer it. Existing databases and browser ledgers are **not automatically erased**, since they may contain real entries alongside old demo data. Back up any data you need before manually clearing a legacy ledger or replacing the SQLite database. A fresh database/browser starts empty.

## Security limitations

This is a prototype, not a secure multi-user financial service. PINs are stored in plaintext, static-mode data is accessible to the browser, and the server currently trusts client-supplied user IDs instead of authenticated sessions. The owner check for enrollment is therefore not a security boundary against a modified client. Do not use with sensitive or real financial data without implementing authentication, authorization, secure PIN storage, transport security, and appropriate backups.
