# Professional Textile Shop Billing & Management Software
### Enterprise-grade Indian Textile POS, GST Invoicing, Inventory & Analytics Engine

Built specifically for Indian textile retail and wholesale operations (Sarees, Silks, Readymade Garments, Shirting & Suiting, Handlooms, Dress Materials, and Running Fabrics).

---

## 🌟 Key Highlights & Core Capabilities

- **1. Dedicated Shop Configuration & GST Settings:**
  - Complete shop profile: Name, Logo, Address, City, District, State, PIN, Phone, Alt Phone, Email, GSTIN, State GST Code.
  - Configurable Invoice Prefix (e.g. `SLT`) and starting sequential sequence number (e.g. `1001`).
  - Automatic injection into every printed invoice.

- **2. Fixed Uploaded QR Code Integration (Strict Section 6 Compliance):**
  - Uses the **exact UPI QR code image** uploaded by the user (`uploads/default_upi_qr.jpg`).
  - Preserves original proportions, image quality, and clear white margin for instant camera and app scanning (Google Pay, PhonePe, Paytm, BHIM).
  - Displays the final payable amount prominently alongside the QR code (`Scan & Pay ₹XX,XXX via UPI`).
  - Never generates unique QR codes per bill or distorted replacement images.
  - Configurable in Shop Settings with upload replacement capability.

- **3. High-Speed Textile Billing Terminal (POS):**
  - Keyboard shortcuts (`F2` to focus search, `F4` to generate & print, `Enter` to add line items).
  - Multi-item billing with textile-specific measurement units: **Pieces, Meters, Yards, Kilograms, Sets, Rolls, Dozens**.
  - Product-level line discounts (flat ₹ or %) and overall bill-level discounts.
  - Automatic intra-state (CGST 50% + SGST 50%) vs inter-state (IGST 100%) determination based on customer Place of Supply.
  - Supports both GST-exclusive and GST-inclusive (MRP) pricing.
  - Split multi-mode payments (e.g. Cash ₹2,000 + UPI ₹3,000) with live balance-due tracker.

- **4. Professional Printable Bill (Exact 3:4 Portrait Aspect Ratio):**
  - Pixel-perfect portrait 3:4 aspect ratio canvas (designed specifically for Indian textile billing and receipts).
  - Clean typography, high-contrast borders, barcode, HSN breakdown, and amount in words formatted in the Indian numbering system (*Rupees and Paise Only*).
  - Prominent mandatory footer: `"THANK YOU FOR SHOPPING WITH US! VISIT AGAIN!"`.
  - One-click direct printing (`window.print()`) and high-resolution PDF download (`Tax_Invoice_XXX.pdf`).

- **5. Complete Billing History & Audit Control:**
  - Period filtering: Daily, Weekly, Monthly, Yearly, and Custom date ranges.
  - Fast search by Invoice Number, Customer Name, and Mobile Number.
  - View 3:4 bill, reprint, cancel bill (with optional automatic inventory restoration), process full/partial refunds, and collect pending customer dues.

- **6. GST Tax Reports & GSTR-1 Compliance:**
  - Rate-wise GST slab breakdown (0%, 5%, 12%, 18%, 28%).
  - HSN-wise textile summary table (GSTR-1 Table 12).
  - Export full GST registers directly to Excel (`.xlsx` with multiple sheets) and `.csv`.
  - Financial Year selector (FY 2026-27, FY 2025-26, FY 2024-25).

- **7. Textile Inventory Management:**
  - Product catalog with SKU, Barcode, HSN, Cost, Selling Price, Unit, GST %, Stock, and Min Stock Alert.
  - Stock In, Stock Out, and Physical Count Adjustments with full audit ledger.
  - Low stock and out-of-stock warning badges.

- **8. Customer Ledgers & Outstanding Dues:**
  - Tracks total purchases, visits, and credit balances.
  - Collect pending customer dues with auto-distribution to outstanding bills.
  - Supports quick walk-in billing without registration.

- **9. Expense Management & Net Operating Profit (P&L):**
  - Overheads tracking: Electricity, Rent, Staff Salaries, Transport, Packaging, Refreshments.
  - Real Net Operating Profit calculation: `Revenue (Excl Tax) - COGS - Expenses = Net Profit & Margin %`.

- **10. Security & Database Backups:**
  - Role-Based Access Control (Admin vs Staff).
  - Comprehensive Audit Trail logging sensitive financial operations.
  - Instant SQLite database snapshot creation, download, and file-based restore.

---

## 🚀 Quick Start Guide

### 1. Default Access Credentials
| Role | Username | Password | Access Scope |
|---|---|---|---|
| **Administrator** | `admin` | `admin123` | Full access to POS, Invoices, GST, Expenses, Backups, Users, Settings |
| **Terminal Staff** | `staff` | `staff123` | POS Billing, Product search, Customer search, Invoicing |

### 2. Starting the Application
From the workspace root directory:

```bash
# Production Run (Starts backend server on port 5000 serving both API and frontend UI):
npm start

# Development Run (Concurrently starts Vite dev server on port 3000 and backend on port 5000):
npm run dev
```

Open your browser at:
👉 **`http://localhost:5000`** (or `http://localhost:3000` in dev mode)

---

## 🛠️ Technology Stack
- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide React, Recharts, jsPDF, html2canvas.
- **Backend:** Node.js, Express, Better-SQLite3 (WAL mode enabled with atomic transactions).
- **Database:** SQLite (`textile_billing.db`) with 13 relational entities and decimal-safe calculations.

