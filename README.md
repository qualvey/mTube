# StreamVIP · Generic Video Streaming Platform Skeleton

[![Vue 3](https://img.shields.io/badge/Vue-3.x-4fc08d.svg?style=flat-square&logo=vuedotjs)](https://vuejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000.svg?style=flat-square&logo=express)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3.x-003b57.svg?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.x-38bdf8.svg?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed.svg?style=flat-square&logo=docker)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

**A production-ready, white-label streaming platform skeleton.** Monorepo with a mobile-first Vue 3 client, a full-featured admin dashboard, and a zero-dependency-leaning Express + SQLite backend. Built to be the starting point for any video site — OTT, short-form feeds, adult/VOD, education, or internal media portals.

Streams MP4 and HLS (`.m3u8`) through an authenticated proxy (custom `Referer`/`User-Agent` headers), ships with VIP subscription paywall, feed ads, comments, search autocomplete, i18n, dark/light theme, and deploy-time white-label customization — without touching code.

---

## ✨ Features

### Client (`packages/client`) — mobile-first, PC-aware
| Area | Highlights |
|---|---|
| **Feed** | Responsive grid (1–3 columns, full-width), hover-to-play preview with single-instance playback mutex, 16:9 adaptive aspect, infinite scroll |
| **Player** | HLS.js / MP4 via backend proxy (custom headers), dynamic aspect ratio, seek hover sprite preview, vertical volume control, trial-then-paywall for VIP content |
| **Search** | Debounced autocomplete with keyboard navigation & match highlighting |
| **Community** | Comments (login required, rate-limited), email-verified accounts |
| **Theme** | Dark/light mode following system preference, manual override toggle |
| **i18n** | zh / en language packs, runtime white-label overrides (no rebuild) |

### Admin (`packages/admin`) — Element Plus dashboard
- Video resource management (multi-storage-node aware)
- Storage node management (independent VPS nodes, HTTP Range streaming)
- Ad management (in-feed native placements), Menu/navigation management
- Orders & revenue, Analytics (PV/UV, VIP conversions, watch metrics)
- **Site copy customization** (i18n overrides), site settings, **runtime log-level control**

### Server (`packages/server`) — Express + SQLite
- Zero-dependency pattern: `node:sqlite`, built-in `crypto` (scrypt password hashing, HMAC)
- Auth: email + password with **optional email verification** (Resend), token sessions (revocable, DB-backed)
- Rate limiting (register/login/comment), anti-enumeration login errors
- Payments: Ruyizf (channel-based) + USDT/TRC-20 crypto checkout (extensible adapter pattern)
- REST API with enforced documentation sync (pre-commit hook)

---

## 🏗 Architecture

```
┌─────────────┐      ┌──────────────────────────────────────────────┐
│  Browser    │─────►│  Main VPS (Docker Compose)                    │
│  (Vue 3 SPA)│      │  ┌──────────┐   ┌──────────┐   ┌──────────┐  │
└─────────────┘      │  │  client  │   │  admin   │   │  server  │  │
                     │  │ (Nginx)  │   │ (Nginx)  │   │ (Express)│  │
                     │  └──────────┘   └──────────┘   └──────────┘  │
                     │        │             │             │  SQLite │
                     │        └──────┬──────┘             │  + data │
                     └───────────────┼────────────────────┘         │
                                     ▼                              │
                     ┌──────────────────────────────┐               │
                     │  Storage Node (optional VPS) │◄──HTTP Range──┘
                     │  /data/videos, chunk uploads │  (proxy/blobs)
                     └──────────────────────────────┘
```

- **Client → Server**: JSON REST API (`/api/v1/*`), video streams proxied with custom headers (ArrayBuffer/Blob fetch → HLS.js/Plyr)
- **Storage nodes**: independent servers holding media, streamed via HTTP Range; cluster HMAC auth

---

## 🧱 Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vue 3 (Composition API), Vite 8, Tailwind CSS 4, vue-i18n, Element Plus (admin) |
| Backend | Node.js 24 (ESM), Express 4, `node:sqlite`, HLS.js, Plyr |
| Data | SQLite (WAL), file-based uploads, optional distributed storage nodes |
| Infra | Docker Compose, GitHub Actions (release/rollback), Nginx |
| Payments | Ruyizf channel API, USDT (TRC-20) — adapter-ready for more |

---

## 🚀 Quick Start (Docker Compose)

```bash
git clone https://github.com/qualvey/mTube.git
cd mTube
cp .env.example .env            # fill in required values (see below)
docker compose up -d --build
```

| Service | URL |
|---|---|
| Client | `http://localhost` |
| Admin | `http://localhost/admin` (default `admin` / `admin123` — **change it**) |
| API | `http://localhost/api/v1` |

### Required configuration
- `ADMIN_PASSWORD` — change from default
- `CLUSTER_SECRET` — shared HMAC secret for storage nodes
- `RUIZIF_MCH` / `RUIZIF_SECRET` — payment merchant credentials (empty = payments disabled)
- `RESEND_API_KEY` — email verification (empty = dev mode, codes returned in API response)

Full reference: [`.env.example`](.env.example) · [GitHub Actions Secrets guide](docs/GITHUB-SECRETS.md)

---

## 📦 Monorepo Layout

```
├── packages/
│   ├── client/          # C-end SPA (Vue 3 + Tailwind + vue-i18n)
│   ├── admin/           # Admin dashboard (Vue 3 + Element Plus)
│   └── server/          # API server (Express + SQLite)
├── docs/                # Deployment & secrets guides
├── doc/                 # API specifications (client & admin)
├── test/                # Integration scripts
└── docker-compose.yml   # Single-VPS deployment
```

---

## 🎨 White-Label Customization (no code changes)

Built for resellers & multi-tenant deployments:

- **Site copy** — override any i18n key from the admin dashboard (`/site-i18n`): brand name, buttons, notices, legal text. Stored in DB, applied at runtime via `mergeLocaleMessage`
- **Branding** — site title/logo/hero via settings; swap `public/branding` assets per deployment
- **Theme** — dark/light follows system, manual toggle; palette is CSS-variable driven
- **Multi-tenant env** — every deployment-specific value (domains, merchants, mail) flows through environment variables / GitHub Secrets, never code

---

## 📚 Documentation

| Doc | Content |
|---|---|
| [API Specification](doc/api_specification.md) | All public endpoints (videos, auth, comments, payments, analytics…) |
| [Admin API](doc/api/admin.md) | Admin dashboard endpoints |
| [GitHub Secrets](docs/GITHUB-SECRETS.md) | CI/CD secret reference |
| [Analytics System](docs/analytics-system-v1.md) | Event tracking & aggregation design |

API docs are **enforced** by a pre-commit hook — every route change must update docs or the commit is rejected.

---

## 🗺 Roadmap

The skeleton is intentionally generic — plug in your own business layer:

- **Short-term**
  - Admin comment moderation & sensitive-word filtering
  - Comment likes, reply threads
  - Search history & hot-search rankings
- **Mid-term**
  - User profile & avatar upload
  - **UGC creator pipeline** (upload → transcode → review) — creator info UI is already behind a feature flag
  - Third-party OAuth login (Google / WeChat)
- **Long-term**
  - Personalized recommendations (beyond tag/hotness ranking)
  - Video transcoding & adaptive-bitrate ladder
  - CDN integration, multi-region storage
  - Community features (dashboards, follow, notifications)

The account system, comment layer, and white-label engine are designed so these can be added as modules **without re-architecting**.

---

## 🤝 Contributing

1. Fork & create a feature branch (`feat/`, `fix/` — Conventional Commits enforced)
2. API changes must update `doc/api_specification.md` (pre-commit check)
3. UI changes: **prototype first** (static HTML), then implement (see project `AGENTS.md`)
4. Open a PR — CI runs build + docs sync checks

## 📄 License

MIT — see [LICENSE](LICENSE) (file pending). Branding and merchant credentials are intentionally not included; configure via environment.
