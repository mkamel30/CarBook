<div align="center">

# 🚗 CarBook

### Modern Local-First Vehicle Maintenance & Fuel Efficiency Companion

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.1-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-LibSQL-003B57?logo=sqlite)](https://libsql.org/)
[![Tests](https://img.shields.io/badge/Tests-14%20Passing-brightgreen?logo=vitest)](https://vitest.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**[English](README.md)** • **[العربية](README.ar.md)**

</div>

---

## 🌟 Overview

**CarBook** is a high-precision, offline-first personal vehicle tracking application. Built with **Next.js 15**, **React 19**, and **SQLite (LibSQL)**, it empowers car owners to track fuel consumption metrics ($L/100\text{km}$ and cost per km), log detailed maintenance invoices with spare parts breakdown, receive smart preventive service alerts, and consult an **AI Car Doctor** grounded in their car's actual service records and factory OEM manuals.

CarBook features native **bilingual support (Arabic / English)** with dynamic **RTL / LTR** switching powered by a human-friendly **`.cfg` localization engine**.

---

## 🚀 Key Features

### ⛽ 1. Precision Fuel Logging & Efficiency Analytics
- **Bidirectional Auto-Calculation:** Entering fuel quantity automatically computes total cost from the chosen fuel price, and vice-versa. Supports exact decimal fractions (e.g. `40.584 L`).
- **Consecutive Fill Analytics:** Automatically calculates distance traveled, fuel consumption ($L/100\text{km}$, $\text{km}/L$), and operational cost per kilometer between full tank fills.
- **Dynamic History Editing:** Edit or delete past fills with automatic cascading metric re-evaluations.
- **Custom Fuel Pricing in Settings:** Store fuel grades and prices (e.g., Gasoline 92, Gasoline 95, Diesel, CNG) to automatically populate new logs.

### 🔧 2. Comprehensive Maintenance & Parts Invoice Log
- **Itemized Spare Parts:** Log multiple parts per invoice with condition classification (**New / OEM** vs. **Import / Good Used**).
- **Automated Cost Summaries:** Automatic sum of spare parts + labor cost = grand total.
- **Service Center Tracking:** Document workshop names and future target odometers.

### ⚠️ 3. Smart Odometer & Schedule Alerts
- **Real-Time Evaluation:** Color-coded badges evaluate whether scheduled services (Engine Oil, Transmission Fluid, Spark Plugs, Brakes) are **Good Condition**, **Due Soon**, or **Overdue**.
- **Distance & Time-Based:** Triggers alerts based on both mileage intervals and elapsed months.

### 📖 4. Factory OEM Digital Manual (AI-Assisted)
- **Offline-First Technical Specs:** Fetch official manufacturer specifications with one click and store them locally in SQLite:
  - Engine oil viscosity (e.g. `0W-20`, `5W-30`) & capacity with filter.
  - Transmission fluid specifications (ATF, CVT Fluid FE).
  - Coolant & brake fluid standards (Super Long Life Coolant, DOT 4).
  - Cold tire pressures for front and rear wheels (PSI / Bar).
  - Fuel tank capacity and minimum recommended octane rating.
  - Spark plug types and battery ratings.

### 👨‍🔧 5. AI Car Doctor Consultation
- **Context-Grounded Diagnostics:** Consult an AI automotive technician about strange noises, performance dips, or OBD-II trouble codes (e.g. `P0420`, `P0300`).
- Unlike generic chatbots, the AI Doctor analyzes your car's **make**, **model**, **year**, **current odometer reading**, and **recent maintenance invoices** to deliver a tailored technical diagnosis.

### 📄 6. Certified Inspection & Resale Report
- **Printable Buyer Report:** Generate a clean, verifiable PDF or printed certificate summarizing confirmed mileage, lifetime maintenance history, and parts replacements for prospective buyers.

### 🌐 7. Extensible `.cfg` Multilingual Engine (i18n)
- **Zero-Coding Translation:** All languages are stored in simple `.cfg` (key-value) files under [`src/locales/`](src/locales/):
  - [`ar.cfg`](src/locales/ar.cfg): Full Arabic translation (`dir = rtl`, Cairo font).
  - [`en.cfg`](src/locales/en.cfg): Full English translation (`dir = ltr`).
- **Effortless Community Translations:** To add Spanish, French, or German, simply copy `en.cfg` to `fr.cfg` or `de.cfg` and edit the lines in any text editor!

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Framework** | [Next.js 15 (App Router)](https://nextjs.org/) & [React 19](https://react.dev/) |
| **Styling & UI** | [Tailwind CSS 3.4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/), Google Cairo font |
| **Database** | [SQLite](https://www.sqlite.org/) via [@libsql/client](https://libsql.org/) & [Drizzle ORM](https://orm.drizzle.team/) |
| **Validation** | [Zod 3.24](https://zod.dev/) |
| **Testing** | [Vitest 3.0](https://vitest.dev/) |
| **AI Integration** | Google Gemini API & OpenRouter API (Server-Side Isolated) |

For comprehensive technical specifications, review [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🛠️ Getting Started

### Prerequisites
- **Node.js** $\ge 18.18$ (Tested on Node.js v20 & v24)
- **pnpm** (recommended), **npm**, or **yarn**

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/mkamel30/CarBook.git
   cd CarBook
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Start the local development server:**
   ```bash
   pnpm dev
   ```

4. **Open in your browser:**
   Navigate to [http://localhost:3070](http://localhost:3070).

---

## 🧪 Testing & Verification

Run the automated test suite with Vitest:

```bash
# Run all unit and integration tests
pnpm test

# Run TypeScript type safety check
pnpm typecheck
```

CarBook maintains **100% passing test coverage** across calculations, database persistence, SSRF security guards, and the `.cfg` localization engine.

---

## 🌍 Adding New Languages (`.cfg`)

Adding a new language takes less than 2 minutes:

1. Copy [`src/locales/en.cfg`](src/locales/en.cfg) to `src/locales/<lang_code>.cfg` (e.g. `fr.cfg`).
2. Set metadata:
   ```ini
   lang_code = fr
   lang_name = Français
   dir = ltr
   ```
3. Translate the strings in any text editor.
4. The system automatically handles fallback to English or Arabic if any key is missing.

---

## 🔒 Security & Privacy

- **100% Local Data:** Your vehicle logs and records are saved locally in `local.db` (SQLite) on your machine.
- **No Telemetry Tracking:** CarBook collects zero user analytics or tracking telemetry.
- **Protected Secrets:** AI API keys are stored in encrypted local application settings and are never shipped in client bundles or public repositories.
- **SSRF Protection:** AI endpoints strictly enforce HTTPS and reject loopback and private intranet addresses.

---

## 📚 Documentation

- [System Architecture](docs/ARCHITECTURE.md)
- [REST API Reference](docs/API.md)
- [Arabic Documentation (العربية)](README.ar.md)

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
