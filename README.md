# NovaTech Cameroun — Storefront & Operations Console

Premium electronics commerce for Douala & Yaoundé. The storefront closes sales on
WhatsApp; a Firebase-backed operations console runs the order pipeline, catalog,
inventory and staff.

Built with **HTML, CSS, vanilla JavaScript ES modules, Firebase and Cloudinary**.
No React, no bundler, no build step — the folder is the deployable site.

---

## 1. Quick start (Demo Mode)

Demo Mode runs the entire product — storefront, cart, checkout, admin, RBAC,
inventory, staff, audit trail — from seeded browser data. No Firebase project is
required until you paste keys.

```bash
npm run serve          # python -m http.server 5500 — the site itself has no runtime dependencies
# open http://localhost:5500
```

Any static server works (VS Code Live Server, `npx serve`, Firebase Hosting).
Opening `index.html` from the filesystem will **not** work: ES modules need HTTP.

### Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | `admin@novatech.cm` | `NovaTech2026!` |
| Any other demo staff | see `js/data/demo.js` → `STAFF` | `NovaTech2026!` |

Demo orders, stock, staff edits and audit entries persist in `localStorage`
under `novatech.demo.*`. Reset by clearing site data or running
`localStorage.clear()` in the console.

---

## 2. Live Mode setup

### 2.1 Firebase project

1. Create a Firebase project and add a **Web app**.
2. Enable **Authentication → Email/Password** (required for staff) and
   **Google** (optional, customer sign-in).
3. Add your hosting domains under **Authentication → Settings → Authorized domains**.
4. The web config in `js/config.js` (`firebaseConfig`) is already wired to the
   `electronic-store-cfd97` project. To point the site at a different project,
   replace those values; `isFirebaseConfigured` flips automatically once the
   API key no longer starts with `PASTE_`.

### 2.2 Cloudinary

1. The site is wired to cloud `f9rwcdyz` with the unsigned preset
   `store_front`, uploading into the `novatech/products` folder.
2. To use another account, change `cloudinaryConfig` in `js/config.js`. No
   Cloudinary API secret is ever placed in the client.

### 2.3 Firestore + Hosting

```bash
npm i -g firebase-tools
firebase login
firebase use --add          # choose your project, alias it "default"
firebase deploy --only firestore:rules,firestore:indexes
```

Deploy **rules and indexes together** — the admin order queries rely on the
composite indexes in `firestore.indexes.json`. Deploying rules alone can leave
queries failing with "index required" links.

```bash
firebase deploy --only hosting
```

### 2.4 Cloud Functions (staff provisioning + Cloudinary cleanup)

```bash
cd functions
npm install
firebase functions:secrets:set CLOUDINARY_CLOUD_NAME
firebase functions:secrets:set CLOUDINARY_API_KEY
firebase functions:secrets:set CLOUDINARY_API_SECRET
cd ..
firebase deploy --only functions
```

The Cloudinary **API secret** lives only in Secret Manager; the browser calls
`deleteCloudinaryImage`, never Cloudinary's Admin API.

### 2.5 Seed the database

The seed is idempotent: deterministic document ids are upserted, so re-running
refreshes the catalog without duplicating anything.

1. **Project settings → Service accounts → Generate new private key.** Save the
   JSON outside the repo (or anywhere matched by `.gitignore`).
2. Run:

```bash
npm install
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run seed
```

Windows PowerShell:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\service-account.json"
npm run seed
```

Optional flags:

```bash
npm run seed -- --dry-run        # print counts, write nothing
npm run seed:orders              # also import the demo order pipeline
```

What it writes:

| Collection | Contents |
| --- | --- |
| `categories`, `brands` | 7 categories, 10 brands |
| `products` | 32 products, 3 conditions each, per-hub stock split |
| `promoCodes` | `NOVATECH10` (−30 000 FCFA), `LIVRAISON24` (−10 000 FCFA, min 200 000) |
| `staff` | 8 directory profiles + the Super Admin profile keyed by Auth uid |
| `auditLogs` | Demo audit history + a bootstrap entry |
| `counters/orders` | `9000` (or the highest demo code when `--with-demo-orders`) |
| `orders` | Only with `--with-demo-orders` |

The Super Admin gets the `super_admin` claim:

- **This project:** existing Auth user `367OzhDnd2RcR4zYGrVFUg791AE3`
  (`cheec701@gmail.com`) is promoted in place — sign in with that account's own
  password.
- Override the target with `SEED_ADMIN_UID`, or let the seed create a new account
  from `SEED_ADMIN_EMAIL` (default `admin@novatech.cm`) with
  `SEED_ADMIN_PASSWORD` (default `NovaTech2026!`).
- **Change the password after the first sign-in.**

> Only the Super Admin is seeded with an Auth account. Other staff are directory
> records; provision real accounts from **Admin → Staff**, which creates the
> Auth user, sets the role claim and returns a password-reset (activation) link.
> There is no public staff registration.

### 2.6 Emulator workflow

```bash
firebase emulators:start --project demo-novatech
```

Seed the emulators in a second terminal (the emulators expose the service hosts
automatically when started with `emulators:exec`):

```bash
firebase emulators:exec --only firestore,auth --project demo-novatech "node seed/seed.js --with-demo-orders"
```

---

## 3. Project structure

```
index.html              Home — hero, categories, flash deals, featured, trust
catalog.html            Search, URL-synced filters/sort, load more
product.html            PDP — gallery, condition/variant pricing, specs, bundle
cart.html                Cart, promo code, delivery address, WhatsApp checkout
wishlist.html           Saved products
account.html            Customer sign-in/sign-up, order history
admin/login.html        Staff sign-in (zero registration)
admin/orders.html       Realtime board, KPIs, drawer timeline, quick replies
admin/products.html     Catalog CRUD, Cloudinary upload, bulk status
admin/inventory.html    Stock per condition & hub, adjustments, movement log
admin/staff.html        Provisioning, roles, reset links, audit export

css/tokens.css          Nordic Precision Tech tokens (colour, type, spacing…)
css/base.css            Reset, typography, layout primitives
css/components.css      Buttons, cards, badges, sheets, forms, nav, footer
css/pages/*.css         Page-specific compositions

js/config.js            ALL keys + business constants (WhatsApp number, hubs…)
js/firebase.js          Lazy Firebase loader (SDK only fetched when configured)
js/store.js             Single data-access layer (Firestore ⇄ Demo Mode)
js/auth.js              Staff + customer authentication
js/rbac.js              Role → permission matrix used by UI and guards
js/i18n.js              FR default / EN toggle, persisted, `data-i18n`
js/cart.js, wishlist.js Cart/wishlist state, localStorage-backed
js/whatsapp.js          Order message builder + wa.me helpers
js/cloudinary.js        Unsigned upload + delivery URL helpers
js/pages/*.js           One controller per page
js/admin/ui.js          Shared admin pills, KPIs, empty/denied states
js/data/demo.js         1:1 demo dataset used in Demo Mode and by the seed

functions/index.js      provisionStaff, deleteCloudinaryImage (Node 20)
firestore.rules         Server-side RBAC + strict order validation
firestore.indexes.json  Composite indexes for orders/audit queries
seed/seed.js            Idempotent database seeding
firebase.json           Hosting, Firestore, Functions, emulators
```

### Architecture notes

- **One data layer.** Every page imports from `js/store.js`. In Live Mode it
  talks to Firestore; in Demo Mode it serves `js/data/demo.js` and persists
  mutations in `localStorage`. Page code never branches on the mode.
- **Lazy SDK.** `js/firebase.js` dynamically imports the v10 modular SDK only
  after keys are configured, so Demo Mode ships no Firebase network requests.
- **Realtime admin.** Live Mode uses `onSnapshot`; Demo Mode dispatches
  `demo-orders` events and a 15s refresh, so both feel live.
- **Embedded timelines.** `events` and `messages` are append-only arrays on the
  order document; the drawer renders them directly. Rules only accept +1
  appends, never rewrites.
- **Design system.** Tokens only — no hard-coded palette in page CSS. Mobile
  grid → desktop sidebar/PDP/sticky buy box via media queries; glass sticky bars;
  8px cards, 16px sheets; pill badges/chips; 150–250ms motion with
  `prefers-reduced-motion`.
- **i18n.** French is the default; the FR/EN toggle is persisted in
  `novatech.lang` and translated everywhere via `data-i18n` and `t()`.

---

## 4. Business rules encoded in the product

- **Currency:** FCFA only, integers everywhere in storage, rendered by
  `formatFCFA()` as `780 000 FCFA`.
- **Delivery:** Douala (Akwa hub) and Yaoundé (Bastos showroom) only, free, 24h
  promise. Other cities are refused at checkout.
- **Payments:** MTN MoMo, Orange Money, cash on delivery, bank wire.
- **Conditions:** Brand New, Open Box Certified, Refurbished A+ — each with its
  own price and stock, per hub.
- **Promo codes:** read from `promoCodes` (no hard-coded discounts). Invalid,
  expired, inactive or below-minimum codes are rejected at checkout.
- **Order codes:** `WA-####`, allocated inside a Firestore transaction against
  `counters/orders`, so simultaneous checkouts never collide.
- **Statuses:** `new_inquiry → awaiting_payment → confirmed → ready_dispatch →
  out_for_delivery → completed` (plus `cancelled`). Payment is tracked separately
  (`pending` / `paid`).
- **WhatsApp:** the business number lives only in `js/config.js`. Checkout saves
  the order, then opens WhatsApp with the itemised French message and the order
  reference; staff reply on the same thread from the order drawer.

---

## 5. Roles & permissions

| Capability | Super | Store | Inventory | Order | Support | Delivery |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Read orders | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Update orders / statuses | ✓ | ✓ | | ✓ | | transitions |
| Confirm stock | ✓ | | ✓ | ✓ | | |
| Verify payment | ✓ | | | ✓ | | |
| Dispatch | ✓ | ✓ | | ✓ | | ✓ |
| Complete delivery | ✓ | ✓ | | ✓ | | ✓ |
| Write notes/chat | ✓ | | | ✓ | ✓ | |
| Catalog write | ✓ | ✓ | ✓ | | | |
| Inventory write | ✓ | ✓ | ✓ | | | |
| Staff provisioning | ✓ | | | | | |
| Audit log | ✓ | ✓ | ✓ | | | |

The matrix lives in `js/rbac.js` (UI, guards, nav filtering) and is mirrored by
`firestore.rules` through the `role` custom claim. Admin navigation only renders
links the signed-in role can use; direct URL access renders a denied state.

---

## 6. Security model

- Public Firebase web config and the Cloudinary **unsigned** upload preset are
  the only keys in `js/config.js` — both are designed to be public.
- **No Cloudinary API secret in the client.** Deletions go through a callable
  with Secret Manager credentials and a folder allow-list (`novatech/…`).
- **No catch-all rule.** Anything not explicitly allowed is denied:
  - guests may create one strict order shape (`new_inquiry`, `pending`) with
    exactly one `created` event and zero messages;
  - customers read only their own orders and can never change `status` or
    `paymentStatus`;
  - staff writes are narrow (`changedKeys().hasOnly(...)`) and timelines are
    append-only;
  - staff accounts are written only by a Super Admin (the callable uses Admin SDK);
  - audit logs are immutable.
- Zero staff self-registration. Provisioning is Super-Admin-only.
- The WhatsApp number is defined once in `js/config.js` and imported everywhere.

---

## 7. Acceptance checklist

Use this to sign off the build.

**Visual**
- [ ] Layouts hold at 390, 768 and 1280 px; desktop uses top nav, catalog
      sidebar, two-column PDP with sticky buy box.
- [ ] Tokens match Nordic Precision Tech: `#0062FF` electric blue, `#00D2D3`
      ice cyan, `#0F172A` ink, `#F8FAFC` canvas; Plus Jakarta Sans + Inter +
      Material Symbols; pill chips, 8/16 px radii, glass sticky bars.
- [ ] Focus rings, hover states and reduced-motion behaviour are present.

**Money & data**
- [ ] Every price reads `… FCFA` (no `$`, no decimals); values are integers in
      Firestore.
- [ ] Conditions show independent prices and stock on PDP and inventory.
- [ ] `NOVATECH10` removes 30 000 FCFA; below-minimum/expired codes are rejected.
- [ ] Cloudinary uploads render in catalog/PDP in Live Mode (demo uses vector art).

**Storefront**
- [ ] Filters and sort survive refresh and back navigation (URL-synced).
- [ ] Live result count, skeletons and load-more behave.
- [ ] Cart persists across reloads; quantities and totals update live.
- [ ] Checkout validates Douala/Yaoundé + quarter + phone, saves the order,
      then opens WhatsApp pre-filled with items, total, address, payment line
      and `WA-####`.
- [ ] Wishlist persists; account shows the customer's orders.

**Operations**
- [ ] New orders appear in the admin board in realtime (second tab test).
- [ ] KPIs, tabs, cards and drawer timeline/messages render from real data.
- [ ] Status, stock confirmation, payment verification, dispatch/tracking and
      completion all work per role and append exactly one timeline event.
- [ ] Quick replies copy + open the customer chat with placeholders filled.
- [ ] Product create/edit/bulk status/delete (with Cloudinary cleanup) work.
- [ ] Inventory adjustments update condition stock, hub split and the movement log.
- [ ] Staff provisioning creates the Auth user/claims/profile; role changes,
      reset links, suspend/reinstate and CSV audit export work.
- [ ] An unauthorized role sees a denied state and only permitted nav links.

**Platform**
- [ ] No secrets in the repo or client bundle (`grep -r "PASTE_" js/` only
      returns the placeholders in `config.js`; no API secret anywhere).
- [ ] FR/EN toggle works on every page and persists across navigation.
- [ ] Rules + indexes deploy together; no Firestore "index required" errors.
- [ ] Hosting serves clean URLs (`/catalog`, `/admin/orders`) and the site runs
      with caching enabled.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Blank page, console `Failed to resolve module specifier` | Serve over HTTP from the project root (`npm run serve`), not `file://`. |
| Site still in Demo Mode after pasting keys | `firebaseConfig.apiKey` still starts with `PASTE_`, or the browser cached `config.js`. Hard-reload. |
| `auth/unauthorized-domain` on Google sign-in | Add the host to Authentication → Settings → Authorized domains. |
| Admin sign-in says the account has no role | The Auth user has no `role` custom claim. Provision via the callable/seed and sign in again. |
| `The query requires an index` | Deploy `firestore.indexes.json` (`firebase deploy --only firestore:indexes`) and wait for the index to build. |
| Cloudinary upload fails | Preset must be **unsigned** and allow the `novatech/products` folder; cloud name must match `config.js`. |
| Cloudinary delete fails | Set the three `CLOUDINARY_*` function secrets and redeploy functions. |
| Seed exits with "Missing credentials" | Set `GOOGLE_APPLICATION_CREDENTIALS`, or use the emulators with `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST`. |

---

## 9. Deployment checklist

```bash
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
firebase deploy --only hosting
```

After the first production seed:

- [ ] Sign in as Super Admin and change the seeded password.
- [ ] Provision real staff accounts; suspend/remove the demo directory entries.
- [ ] Replace demo orders (if seeded) with live data.
- [ ] Confirm the WhatsApp number and hub contact details in `js/config.js`.
- [ ] Verify the Cloudinary preset and Secret Manager values.
