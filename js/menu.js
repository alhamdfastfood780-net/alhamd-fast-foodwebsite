/* ============================================================
   ALHAMD FAST-FOOD — LIVE MENU + CART + WHATSAPP CHECKOUT
   Reads the SAME Firestore document your POS writes to
   (settings/main) — read-only from this site, live via onSnapshot.
   ============================================================ */

/* ---------------- CONFIG ---------------- */
// Same Firebase project as the POS. This config is safe to be public —
// it is not a secret key, access is controlled by Firestore security rules.
const firebaseConfig = {
  apiKey: "AIzaSyAfUCS3W26AifYgIbvY2J61CSgkDkn649M",
  authDomain: "alhamd-fast-food.firebaseapp.com",
  projectId: "alhamd-fast-food",
  storageBucket: "alhamd-fast-food.firebasestorage.app",
  messagingSenderId: "435660072478",
  appId: "1:435660072478:web:1827e1e6054a21341bf00f"
};

const WHATSAPP_NUMBER = "923266797564"; // 0326 6797564 in international format

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const settingsDocRef = db.collection("settings").doc("main");

/* ---------------- STATE ---------------- */
let PRODUCTS = [];
let EXTRA_CATEGORIES = [];
let DELIVERY_CHARGE = 0;      // synced live from settings/main.deliveryCharge (set from the POS)
let activeCategory = "All";
let searchTerm = "";
let selectedVariantIdx = {};   // productId -> index of chosen variant
let cart = {};                 // lineKey -> {id, name, variantLabel, price, qty, image}

const mgrid = document.getElementById("mgrid");
const catChips = document.getElementById("catChips");
const menuSearchInput = document.getElementById("menuSearch");

/* ---------------- LIVE FIRESTORE LISTENER ---------------- */
settingsDocRef.onSnapshot(
  (doc) => {
    if (!doc.exists) {
      showMenuState("error", "Menu isn't set up yet. Please check back shortly, or message us on WhatsApp.");
      return;
    }
    const d = doc.data();
    PRODUCTS = Array.isArray(d.products) ? d.products : [];
    EXTRA_CATEGORIES = Array.isArray(d.extraCategories) ? d.extraCategories : [];
    // Delivery charge is set from the POS (settings/main document) and
    // updates here live, same as the menu.
    DELIVERY_CHARGE = readDeliveryCharge(d);
    onMenuUpdated();
    renderCart(); // keep delivery charge / total in sync if it changes from the POS

    // Time-Limited Deals — also set from the POS (settings/main.deals),
    // same live-sync pattern as products. Handled in js/campaigns.js.
    if (typeof window.renderDeals === "function") {
      window.renderDeals(Array.isArray(d.deals) ? d.deals : []);
    }
  },
  (err) => {
    console.error("Menu sync failed:", err);
    showMenuState("error", "Couldn't load the live menu right now. Please check your connection, or message us directly on WhatsApp.");
  }
);

/* ---------------- DELIVERY CHARGE (rebuilt, robust) ----------------
   Looks for the delivery charge under every field name we've ever
   seen used, handles both number and string values ("150", " 150 "),
   and logs to the browser console (F12 -> Console) exactly what it
   found — so if the POS is saving under a different name, it will
   be visible there instead of silently showing "Free".
--------------------------------------------------------------------- */
function readDeliveryCharge(d) {
  const candidates = [
    d.deliveryChargeAmount,
    d.deliveryCharge,
    d.delivery_charge,
    d.deliveryFee,
    d.delivery_fee,
    d.deliveryCost,
    d.delivery,
    d.charges,
    d.settings && d.settings.deliveryCharge
  ];

  let found = 0;
  let rawMatch = undefined;
  for (const val of candidates) {
    if (val === undefined || val === null || val === "") continue;
    const n = Number(val);
    if (!isNaN(n) && n > 0) {
      found = n;
      rawMatch = val;
      break;
    }
  }

  console.log(
    "[Delivery Charge Debug] Raw settings/main document:", d,
    "| Value used:", found,
    "| Matched from:", rawMatch !== undefined ? rawMatch : "(none found — will show 'Free')"
  );

  return found;
}

function getCategoriesWithCounts() {
  const counts = {};
  PRODUCTS.forEach((p) => {
    if (!p.cat) return;
    counts[p.cat] = (counts[p.cat] || 0) + 1;
  });
  // Preserve first-seen order (matches POS ordering), only categories with items
  const seen = [];
  PRODUCTS.forEach((p) => {
    if (p.cat && !seen.includes(p.cat)) seen.push(p.cat);
  });
  return seen.map((c) => ({ name: c, count: counts[c] }));
}

function onMenuUpdated() {
  const cats = getCategoriesWithCounts();
  if (activeCategory !== "All" && !cats.find((c) => c.name === activeCategory)) {
    activeCategory = "All";
  }
  renderCategoryChips(cats);
  renderMarquee(cats);
  renderGrid();
}

/* ---------------- CATEGORY CHIPS ---------------- */
function renderCategoryChips(cats) {
  let html = `<button class="filtbtn ${activeCategory === "All" ? "active" : ""}" data-cat="All">All</button>`;
  cats.forEach((c) => {
    html += `<button class="filtbtn ${activeCategory === c.name ? "active" : ""}" data-cat="${escapeAttr(c.name)}">${escapeHtml(c.name)}</button>`;
  });
  catChips.innerHTML = html;
  catChips.querySelectorAll(".filtbtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.getAttribute("data-cat");
      catChips.querySelectorAll(".filtbtn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderGrid();
    });
  });
}

/* ---------------- MARQUEE ---------------- */
function renderMarquee(cats) {
  const track = document.getElementById("mqtrack");
  if (!track || cats.length === 0) return;
  const names = cats.map((c) => c.name);
  const doubled = names.concat(names);
  track.innerHTML = doubled
    .map((n) => `<div class="mqitem"><i class="fas fa-circle"></i>${escapeHtml(n)}</div>`)
    .join("");
}

/* ---------------- MENU GRID ---------------- */
function showMenuState(type, message) {
  mgrid.innerHTML = `
    <div class="menu-state ${type === "error" ? "error" : ""}">
      <i class="fas ${type === "error" ? "fa-triangle-exclamation" : "fa-utensils"}"></i>
      <p>${escapeHtml(message)}</p>
    </div>`;
}

function renderGrid() {
  let list = PRODUCTS.filter((p) => {
    const inCat = activeCategory === "All" || p.cat === activeCategory;
    const inSearch = !searchTerm || (p.name || "").toLowerCase().includes(searchTerm);
    return inCat && inSearch;
  });

  if (list.length === 0) {
    showMenuState("empty", "No items match — try a different search or category.");
    return;
  }

  mgrid.innerHTML = list.map((p) => productCardHtml(p)).join("");

  // Wire up variant pills
  mgrid.querySelectorAll("[data-variant-btn]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const idx = parseInt(btn.getAttribute("data-idx"), 10);
      selectedVariantIdx[id] = idx;
      renderGrid();
    });
  });

  // Wire up add-to-cart buttons
  mgrid.querySelectorAll("[data-add-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const product = PRODUCTS.find((p) => p.id === id || p.name === id);
      if (!product) return;
      let price, variantLabel = null;
      if (product.variants && product.variants.length) {
        const idx = selectedVariantIdx[product.id] || 0;
        const v = product.variants[idx];
        price = v.price;
        variantLabel = v.label;
      } else {
        price = product.price || 0;
      }
      addToCart(product, variantLabel, price);
      btn.classList.add("added");
      setTimeout(() => btn.classList.remove("added"), 500);
    });
  });
}

function productCardHtml(p) {
  const id = p.id || p.name;
  const imgHtml = p.image
    ? `<img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.name)}" loading="lazy">`
    : `<div class="pc-noimg"><i class="fas fa-utensils"></i></div>`;

  let priceHtml, variantsHtml = "";
  if (p.variants && p.variants.length) {
    const idx = selectedVariantIdx[id] || 0;
    const current = p.variants[Math.min(idx, p.variants.length - 1)];
    priceHtml = `Rs ${current.price}`;
    variantsHtml = `<div class="pc-variants">` + p.variants.map((v, i) => `
      <button type="button" class="pc-size-pill ${i === idx ? "active" : ""}" data-variant-btn data-id="${escapeAttr(id)}" data-idx="${i}">${escapeHtml(v.label)}</button>
    `).join("") + `</div>`;
  } else {
    priceHtml = `Rs ${p.price || 0}`;
  }

  return `
    <div class="col-sm-6 col-lg-4" data-aos="fade-up" data-pname="${escapeAttr(p.name || "")}" data-pid="${escapeAttr(id)}">
      <div class="prod-card">
        <div class="pc-img">
          ${imgHtml}
          <div class="pc-cat">${escapeHtml(p.cat || "")}</div>
        </div>
        <div class="pc-body">
          <div class="pc-name">${escapeHtml(p.name || "")}</div>
          ${variantsHtml}
          <div class="pc-foot">
            <div class="pc-price">${priceHtml}</div>
            <button type="button" class="pc-add" data-add-btn data-id="${escapeAttr(id)}" title="Add to cart">
              <i class="fas fa-plus"></i>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

/* ---------------- SEARCH ---------------- */
menuSearchInput.addEventListener("input", () => {
  searchTerm = menuSearchInput.value.trim().toLowerCase();
  renderGrid();
});

/* ---------------- CART ---------------- */
function cartKey(productId, variantLabel) {
  return variantLabel ? `${productId}::${variantLabel}` : productId;
}

function addToCart(product, variantLabel, price) {
  const id = product.id || product.name;
  const key = cartKey(id, variantLabel);
  if (cart[key]) {
    cart[key].qty += 1;
  } else {
    cart[key] = {
      id,
      name: product.name,
      variantLabel,
      price,
      qty: 1,
      image: product.image || ""
    };
  }
  renderCart();
  showToast(`Added ${product.name}${variantLabel ? " (" + variantLabel + ")" : ""}`);
}

function changeQty(key, delta) {
  if (!cart[key]) return;
  cart[key].qty += delta;
  if (cart[key].qty <= 0) delete cart[key];
  renderCart();
}

function removeLine(key) {
  delete cart[key];
  renderCart();
}

function computeSubtotal() {
  return Object.values(cart).reduce((sum, l) => sum + l.price * l.qty, 0);
}

function cartLineCount() {
  return Object.values(cart).reduce((sum, l) => sum + l.qty, 0);
}

function renderCart() {
  const lines = Object.entries(cart);
  const emptyEl = document.getElementById("cartEmptyState");
  const linesEl = document.getElementById("cartLines");
  const summaryEl = document.getElementById("cartSummary");
  const fab = document.getElementById("cartFab");
  const fabCount = document.getElementById("fabCount");
  const fabSubtotal = document.getElementById("fabSubtotal");
  const subtotalEl = document.getElementById("cartSubtotal");
  const deliveryRow = document.getElementById("cartDeliveryRow");
  const deliveryEl = document.getElementById("cartDelivery");
  const grandRow = document.getElementById("cartGrandRow");
  const grandEl = document.getElementById("cartGrandTotal");

  if (lines.length === 0) {
    emptyEl.style.display = "block";
    linesEl.innerHTML = "";
    summaryEl.style.display = "none";
    fab.classList.add("empty");
    return;
  }

  emptyEl.style.display = "none";
  summaryEl.style.display = "block";
  fab.classList.remove("empty");

  linesEl.innerHTML = lines.map(([key, l]) => `
    <div class="cart-line">
      ${l.image
        ? `<img class="cart-line-img" src="${escapeAttr(l.image)}" alt="">`
        : `<div class="cart-line-img d-flex align-items-center justify-content-center"><i class="fas fa-utensils" style="color:#d8c6b0;"></i></div>`
      }
      <div class="cart-line-info">
        <div class="cart-line-name">${escapeHtml(l.name)}</div>
        ${l.variantLabel ? `<div class="cart-line-variant">${escapeHtml(l.variantLabel)}</div>` : ""}
        <div class="cart-line-qty">
          <button type="button" class="qty-btn" data-qty-minus="${escapeAttr(key)}">−</button>
          <span>${l.qty}</span>
          <button type="button" class="qty-btn" data-qty-plus="${escapeAttr(key)}">+</button>
          <span class="cart-line-remove" data-remove="${escapeAttr(key)}"><i class="fas fa-trash-alt"></i></span>
        </div>
      </div>
      <div class="cart-line-price">Rs ${l.price * l.qty}</div>
    </div>
  `).join("");

  linesEl.querySelectorAll("[data-qty-plus]").forEach((b) =>
    b.addEventListener("click", () => changeQty(b.getAttribute("data-qty-plus"), 1))
  );
  linesEl.querySelectorAll("[data-qty-minus]").forEach((b) =>
    b.addEventListener("click", () => changeQty(b.getAttribute("data-qty-minus"), -1))
  );
  linesEl.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => removeLine(b.getAttribute("data-remove")))
  );

  const subtotal = computeSubtotal();
  subtotalEl.textContent = `Rs ${subtotal}`;

  // Delivery charge is always shown (set live from the POS) so the customer
  // always sees the real total, not just item cost.
  deliveryRow.style.display = "flex";
  deliveryEl.textContent = DELIVERY_CHARGE > 0 ? `Rs ${DELIVERY_CHARGE}` : "Free";
  grandRow.style.display = "flex";
  const grandTotal = subtotal + DELIVERY_CHARGE;
  grandEl.textContent = `Rs ${grandTotal}`;
  fabSubtotal.textContent = `Rs ${grandTotal}`;
  fabCount.textContent = String(cartLineCount());

  const waBtn = document.getElementById("whatsappCheckoutBtn");
  waBtn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppText())}`;
}

function buildWhatsAppText() {
  // Items only — no prices, no subtotal/total. Pricing & delivery charges
  // are confirmed directly over WhatsApp.
  const lines = [];
  lines.push("Hi! I'd like to order:");
  lines.push("");
  Object.values(cart).forEach((l) => {
    const variantPart = l.variantLabel ? ` (${l.variantLabel})` : "";
    lines.push(`• ${l.qty}x ${l.name}${variantPart}`);
  });
  lines.push("");
  lines.push("Name: ");
  return lines.join("\n");
}

/* ---------------- TOAST ---------------- */
let toastTimer = null;
function showToast(text) {
  const toast = document.getElementById("addedToast");
  document.getElementById("addedToastText").textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

/* ---------------- UTIL ---------------- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}

/* ---------------- DEALS LINK-THROUGH ---------------- */
// Called from js/campaigns.js when someone clicks a deal. Clears any
// active search/category filter so the item is guaranteed to be visible,
// then scrolls to it and gives it a brief highlight pulse.
// Accepts either a product's exact name OR its id (POS can send either).
window.scrollToMenuItem = function (idOrName) {
  if (!idOrName) return;

  searchTerm = "";
  if (menuSearchInput) menuSearchInput.value = "";
  activeCategory = "All";
  catChips.querySelectorAll(".filtbtn").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-cat") === "All");
  });
  renderGrid();

  requestAnimationFrame(() => {
    setTimeout(() => {
      const needle = idOrName.trim().toLowerCase();
      const target = Array.from(mgrid.querySelectorAll("[data-pname]")).find((el) => {
        const pname = (el.getAttribute("data-pname") || "").trim().toLowerCase();
        const pid = (el.getAttribute("data-pid") || "").trim().toLowerCase();
        return pname === needle || pid === needle;
      });
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("deal-highlight");
      setTimeout(() => target.classList.remove("deal-highlight"), 2200);
    }, 60);
  });
};

/* Initial render before first Firestore response */
showMenuState("loading", "Loading today's menu…");

(function () {
  const navLinks = document.querySelectorAll(".navbar-nav .nav-link[href^='#']");
  const sections = Array.from(navLinks).map(link => {
    const id = link.getAttribute("href").slice(1);
    return document.getElementById(id);
  }).filter(Boolean);

  function setActive(sectionId) {
    navLinks.forEach(link => {
      link.classList.toggle("active", link.getAttribute("href") === "#" + sectionId);
    });
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        setActive(entry.target.id);
      }
    });
  }, {
    rootMargin: "-40% 0px -55% 0px",
    threshold: 0
  });

  sections.forEach(sec => observer.observe(sec));
})();

