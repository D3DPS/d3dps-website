const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  filter: "all",
  query: "",
  favorites: new Set(JSON.parse(localStorage.getItem("d3dps-favorites") || "[]")),
  cart: JSON.parse(localStorage.getItem("d3dps-cart") || "[]"),
  products: []
};

function save() {
  localStorage.setItem("d3dps-favorites", JSON.stringify([...state.favorites]));
  localStorage.setItem("d3dps-cart", JSON.stringify(state.cart));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
function money(value) { return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(value || 0)); }
function productById(id) { return state.products.find(product => String(product.id) === String(id)); }
function packageById(product, packageId) { return (product?.price_packages || []).find(pkg => String(pkg.id) === String(packageId)); }
function pricingType(product) { return product?.pricing_type || (product?.online_purchase ? "fixed" : "quote"); }
function isPurchasable(product) {
  const type = pricingType(product);
  return product && product.stock !== 0 && ((type === "fixed" && Number(product.price_cad) > 0) || (type === "packages" && (product.price_packages || []).some(pkg => Number(pkg.price_cad) > 0)));
}
function cartKey(item) { return `${item.id}::${item.packageId || "fixed"}::${item.selection || ""}`; }
function itemDetails(item, product) {
  const pkg = packageById(product, item.packageId);
  return {
    label: pkg ? `${product.name} — ${pkg.name}` : product.name,
    unitPrice: pkg ? Number(pkg.price_cad) : Number(product.price_cad || 0),
    selection: item.selection || ""
  };
}

function productCard(product) {
  const purchasable = isPurchasable(product);
  const type = pricingType(product);
  const image = product.image
    ? `<div class="product-media has-photo"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.image_alt || product.name)}">${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ""}<button class="favorite-button" type="button" aria-label="Save ${escapeHtml(product.name)}">♡</button></div>`
    : `<div class="product-media placeholder"><span class="placeholder-mark">＋</span><small>Photo coming soon</small>${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ""}<button class="favorite-button" type="button" aria-label="Save ${escapeHtml(product.name)}">♡</button></div>`;
  const buttonLabel = type === "packages" ? "Choose package" : (purchasable ? "Add to cart" : "Add to inquiry");
  let priceLabel = product.price || "Custom quote";
  if (type === "fixed" && Number(product.price_cad) > 0) priceLabel = money(product.price_cad);
  if (type === "packages" && (product.price_packages || []).length) {
    const min = Math.min(...product.price_packages.map(pkg => Number(pkg.price_cad)).filter(price => price > 0));
    if (Number.isFinite(min)) priceLabel = `Starting at ${money(min)}`;
  }
  return `<article class="product-card" data-id="${escapeHtml(product.id)}" data-name="${escapeHtml(product.name)}" data-category="${escapeHtml(product.category || "")}">
    ${image}<div class="product-body"><p class="product-type">${escapeHtml(product.type || "")}</p><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description || "")}</p>
    <div class="product-bottom"><strong>${escapeHtml(priceLabel)}</strong><button class="add-button" type="button">${buttonLabel}</button></div>
    ${purchasable ? '<small class="online-badge">Secure online checkout available</small>' : ""}</div></article>`;
}

function getCards() { return qsa(".product-card"); }
function renderCards() {
  const cards = getCards();
  cards.forEach(card => {
    const cats = (card.dataset.category || "").toLowerCase();
    const name = (card.dataset.name || "").toLowerCase();
    const matchFilter = state.filter === "all" || (state.filter === "favorites" ? state.favorites.has(card.dataset.id) : cats.includes(state.filter));
    const matchQuery = name.includes(state.query) || cats.includes(state.query);
    card.hidden = !(matchFilter && matchQuery);
    const fav = qs(".favorite-button", card);
    fav.classList.toggle("active", state.favorites.has(card.dataset.id));
    fav.textContent = state.favorites.has(card.dataset.id) ? "♥" : "♡";
  });
  const noResults = qs("#no-results");
  if (noResults) noResults.hidden = cards.some(card => !card.hidden);
}

function addFixedOrInquiry(product) {
  const existing = state.cart.find(item => item.id === product.id && !item.packageId);
  if (existing) existing.quantity += 1;
  else state.cart.push({ id: product.id, packageId: null, selection: "", quantity: 1 });
  save(); renderCart(); openCart(true);
}

function openConfigurator(product) {
  const dialog = qs("#product-configurator");
  qs("#configurator-title").textContent = product.name;
  const packages = product.price_packages || [];
  qs("#configurator-options").innerHTML = packages.map((pkg, index) => `
    <label class="package-option">
      <input type="radio" name="package-choice" value="${escapeHtml(pkg.id)}" ${index === 0 ? "checked" : ""}>
      <span><strong>${escapeHtml(pkg.name)}</strong><small>${money(pkg.price_cad)}</small></span>
    </label>`).join("");
  dialog.dataset.productId = product.id;
  updateSelectionQuestion(product);
  qsa('input[name="package-choice"]', dialog).forEach(input => input.addEventListener("change", () => updateSelectionQuestion(product)));
  dialog.showModal();
}

function updateSelectionQuestion(product) {
  const selectedId = qs('input[name="package-choice"]:checked', qs("#product-configurator"))?.value;
  const pkg = packageById(product, selectedId);
  const wrap = qs("#configurator-selection-wrap");
  const options = pkg?.selection_options || [];
  wrap.hidden = !options.length;
  qs("#configurator-selection-label").textContent = pkg?.selection_prompt || "Choose an option";
  qs("#configurator-selection").innerHTML = options.map(option => `<option value="${escapeHtml(typeof option === "string" ? option : option.choice)}">${escapeHtml(typeof option === "string" ? option : option.choice)}</option>`).join("");
  qs("#configurator-total").textContent = money(pkg?.price_cad || 0);
}

function addConfiguredProduct() {
  const dialog = qs("#product-configurator");
  const product = productById(dialog.dataset.productId);
  const packageId = qs('input[name="package-choice"]:checked', dialog)?.value;
  const pkg = packageById(product, packageId);
  if (!product || !pkg) return;
  const options = pkg.selection_options || [];
  const selection = options.length ? qs("#configurator-selection").value : "";
  const candidate = { id: product.id, packageId, selection, quantity: 1 };
  const existing = state.cart.find(item => cartKey(item) === cartKey(candidate));
  if (existing) existing.quantity += 1; else state.cart.push(candidate);
  save(); renderCart(); dialog.close(); openCart(true);
}

function bindProductActions() {
  getCards().forEach(card => {
    qs(".favorite-button", card).addEventListener("click", () => { state.favorites.has(card.dataset.id) ? state.favorites.delete(card.dataset.id) : state.favorites.add(card.dataset.id); save(); renderCards(); });
    qs(".add-button", card).addEventListener("click", () => {
      const product = productById(card.dataset.id);
      pricingType(product) === "packages" ? openConfigurator(product) : addFixedOrInquiry(product);
    });
  });
}

function normalizeCart() {
  state.cart = state.cart.map(item => ({ ...item, quantity: Math.max(1, Number(item.quantity) || 1) }));
  save();
}

function renderCart() {
  normalizeCart();
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  qs("#cart-count").textContent = count;
  const wrap = qs("#cart-items");
  const validItems = state.cart.map(item => ({ item, product: productById(item.id) })).filter(entry => entry.product);
  wrap.innerHTML = validItems.length ? validItems.map(({ item, product }) => {
    const purchasable = isPurchasable(product);
    const details = itemDetails(item, product);
    const key = cartKey(item);
    return `<div class="cart-item"><div class="cart-item-copy"><strong>${escapeHtml(details.label)}</strong><small>${escapeHtml(purchasable ? money(details.unitPrice) : (product.price || "Custom quote"))}</small>${details.selection ? `<small>Choice: ${escapeHtml(details.selection)}</small>` : ""}${purchasable ? '<span class="checkout-status">Online checkout</span>' : '<span class="quote-status">Quote required</span>'}</div>
      <div class="cart-item-actions">${purchasable ? `<label class="quantity-control"><span class="sr-only">Quantity</span><button type="button" data-qty="-1" data-key="${escapeHtml(key)}">−</button><strong>${item.quantity}</strong><button type="button" data-qty="1" data-key="${escapeHtml(key)}">+</button></label>` : ""}<button class="remove-item" type="button" data-remove="${escapeHtml(key)}">Remove</button></div></div>`;
  }).join("") : "<p>Your cart is empty.</p>";
  qsa("[data-remove]", wrap).forEach(button => button.addEventListener("click", () => { state.cart = state.cart.filter(item => cartKey(item) !== button.dataset.remove); save(); renderCart(); }));
  qsa("[data-qty]", wrap).forEach(button => button.addEventListener("click", () => {
    const item = state.cart.find(entry => cartKey(entry) === button.dataset.key); if (!item) return;
    const product = productById(item.id); const max = product?.stock == null || product?.stock === "" ? 25 : Math.min(25, Number(product.stock));
    item.quantity = Math.max(1, Math.min(max, item.quantity + Number(button.dataset.qty))); save(); renderCart();
  }));
  const purchasableItems = validItems.filter(({ product }) => isPurchasable(product));
  const checkout = qs("#cart-checkout"); checkout.hidden = purchasableItems.length === 0; checkout.disabled = purchasableItems.length === 0;
  qs("#cart-checkout-note").textContent = purchasableItems.length ? (purchasableItems.length === validItems.length ? "You’ll finish payment securely on Square." : "Square checkout includes purchasable items. Quote items can be emailed separately.") : "Products requiring a quote can still be sent by email.";
}

async function loadProducts() {
  const grid = qs("#product-grid");
  try {
    const response = await fetch("data/products.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Product request failed: ${response.status}`);
    state.products = await response.json(); state.cart = state.cart.filter(item => productById(item.id));
    grid.innerHTML = state.products.map(productCard).join(""); bindProductActions(); renderCards(); renderCart();
  } catch (error) { console.error(error); grid.innerHTML = '<p class="products-loading">Products could not be loaded. Please refresh or contact D3DPS.</p>'; }
}

qsa(".filter").forEach(button => button.addEventListener("click", () => { qsa(".filter").forEach(item => item.classList.remove("active")); button.classList.add("active"); state.filter = button.dataset.filter; renderCards(); }));
qsa("[data-jump-filter]").forEach(link => link.addEventListener("click", () => { const button = qs(`[data-filter="${link.dataset.jumpFilter}"]`); if (button) { qsa(".filter").forEach(item => item.classList.remove("active")); button.classList.add("active"); state.filter = link.dataset.jumpFilter; renderCards(); } }));
function applySearch(value) { state.query = value.trim().toLowerCase(); qs("#product-search").value = value; renderCards(); }
qs("#product-search").addEventListener("input", event => applySearch(event.target.value));
qs("#header-search").addEventListener("keydown", event => { if (event.key === "Enter") { applySearch(event.target.value); location.hash = "products"; } });

const panel = qs("#cart-panel"); const scrim = qs("#cart-scrim");
function openCart(open) { panel.classList.toggle("open", open); panel.setAttribute("aria-hidden", String(!open)); qs("#cart-toggle").setAttribute("aria-expanded", String(open)); scrim.hidden = !open; }
qs("#cart-toggle").addEventListener("click", () => openCart(true)); qs("#cart-close").addEventListener("click", () => openCart(false)); scrim.addEventListener("click", () => openCart(false));
qs("#cart-clear").addEventListener("click", () => { state.cart = []; save(); renderCart(); });
qs("#configurator-cancel").addEventListener("click", () => qs("#product-configurator").close());
qs("#configurator-add").addEventListener("click", addConfiguredProduct);

qs("#cart-email").addEventListener("click", () => {
  if (!state.cart.length) return;
  const lines = state.cart.map(item => { const product = productById(item.id); if (!product) return ""; const details = itemDetails(item, product); return `- ${item.quantity} × ${details.label}${details.selection ? ` (${details.selection})` : ""} — ${isPurchasable(product) ? money(details.unitPrice) : (product.price || "Quote")}`; }).filter(Boolean).join("\n");
  location.href = `mailto:D3DPSYYC@gmail.com?subject=${encodeURIComponent("D3DPS product inquiry")}&body=${encodeURIComponent(`Hi D3DPS,\n\nI would like to order or get a quote for:\n${lines}\n\nPreferred colour(s):\nPickup/delivery preference:\nAdditional details:\n`)}`;
});

qs("#cart-checkout").addEventListener("click", async event => {
  const button = event.currentTarget;
  const items = state.cart.filter(item => isPurchasable(productById(item.id))).map(item => ({ id: item.id, packageId: item.packageId || null, selection: item.selection || "", quantity: item.quantity }));
  if (!items.length) return; button.disabled = true; button.textContent = "Opening secure checkout…";
  try {
    const response = await fetch("/api/create-square-checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
    const text = await response.text(); let result = {}; try { result = text ? JSON.parse(text) : {}; } catch { throw new Error(`Checkout returned an invalid response (${response.status}).`); }
    if (!response.ok || !result.checkoutUrl) throw new Error(result.error || "Checkout could not be started.");
    window.location.href = result.checkoutUrl;
  } catch (error) { alert(error.message || "Checkout could not be started. Please try again."); button.disabled = false; button.textContent = "Checkout securely with Square"; }
});

const storedTheme = localStorage.getItem("d3dps-theme"); if (storedTheme) document.documentElement.dataset.theme = storedTheme;
qs("#theme-toggle").addEventListener("click", () => { const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = next; localStorage.setItem("d3dps-theme", next); });
const menu = qs("#main-nav"); qs("#menu-toggle").addEventListener("click", event => { const open = menu.classList.toggle("open"); event.currentTarget.setAttribute("aria-expanded", String(open)); });
qsa(".main-nav a").forEach(link => link.addEventListener("click", () => menu.classList.remove("open")));
qs("#quote-form").addEventListener("submit", event => { event.preventDefault(); const name = qs("#name").value.trim(); const contact = qs("#contact-info").value.trim(); const category = qs("#quote-category").value; const details = qs("#details").value.trim(); const body = `Hi D3DPS,\n\nName: ${name}\nContact: ${contact}\nCategory: ${category}\n\nProject details:\n${details}\n\nI will attach any photos or files before sending.`; location.href = `mailto:D3DPSYYC@gmail.com?subject=${encodeURIComponent(`D3DPS quote request — ${category}`)}&body=${encodeURIComponent(body)}`; });
qs("#year").textContent = new Date().getFullYear();
if (new URLSearchParams(location.search).get("payment") === "success") { setTimeout(() => alert("Thanks! Your Square checkout is complete. D3DPS will follow up with your order details."), 250); state.cart = []; save(); }
renderCart(); loadProducts();
