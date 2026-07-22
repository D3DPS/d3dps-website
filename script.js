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
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function productCard(product) {
  const image = product.image
    ? `<div class="product-media has-photo">
         <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.image_alt || product.name)}">
         ${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ""}
         <button class="favorite-button" type="button" aria-label="Save ${escapeHtml(product.name)}">♡</button>
       </div>`
    : `<div class="product-media placeholder">
         <span class="placeholder-mark">＋</span>
         <small>Photo coming soon</small>
         ${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ""}
         <button class="favorite-button" type="button" aria-label="Save ${escapeHtml(product.name)}">♡</button>
       </div>`;

  return `<article class="product-card"
      data-id="${escapeHtml(product.id)}"
      data-name="${escapeHtml(product.name)}"
      data-category="${escapeHtml(product.category || "")}"
      data-price="${escapeHtml(product.price || "")}">
    ${image}
    <div class="product-body">
      <p class="product-type">${escapeHtml(product.type || "")}</p>
      <h3>${escapeHtml(product.name)}</h3>
      <p>${escapeHtml(product.description || "")}</p>
      <div class="product-bottom">
        <strong>${escapeHtml(product.price || "Custom quote")}</strong>
        <button class="add-button" type="button">Add to inquiry</button>
      </div>
    </div>
  </article>`;
}

function getCards() {
  return qsa(".product-card");
}

function renderCards() {
  const cards = getCards();
  cards.forEach(card => {
    const cats = (card.dataset.category || "").toLowerCase();
    const name = (card.dataset.name || "").toLowerCase();
    const matchFilter =
      state.filter === "all" ||
      (state.filter === "favorites"
        ? state.favorites.has(card.dataset.id)
        : cats.includes(state.filter));
    const matchQuery = name.includes(state.query) || cats.includes(state.query);

    card.hidden = !(matchFilter && matchQuery);

    const fav = qs(".favorite-button", card);
    fav.classList.toggle("active", state.favorites.has(card.dataset.id));
    fav.textContent = state.favorites.has(card.dataset.id) ? "♥" : "♡";

    const add = qs(".add-button", card);
    const inCart = state.cart.some(item => item.id === card.dataset.id);
    add.classList.toggle("added", inCart);
    add.textContent = inCart ? "Added" : "Add to inquiry";
  });

  const noResults = qs("#no-results");
  if (noResults) noResults.hidden = cards.some(card => !card.hidden);
}

function bindProductActions() {
  getCards().forEach(card => {
    qs(".favorite-button", card).addEventListener("click", () => {
      state.favorites.has(card.dataset.id)
        ? state.favorites.delete(card.dataset.id)
        : state.favorites.add(card.dataset.id);
      save();
      renderCards();
    });

    qs(".add-button", card).addEventListener("click", () => {
      const exists = state.cart.some(item => item.id === card.dataset.id);
      state.cart = exists
        ? state.cart.filter(item => item.id !== card.dataset.id)
        : [...state.cart, {
            id: card.dataset.id,
            name: card.dataset.name,
            price: card.dataset.price
          }];
      save();
      renderCart();
      renderCards();
    });
  });
}

function renderCart() {
  qs("#cart-count").textContent = state.cart.length;
  const wrap = qs("#cart-items");
  wrap.innerHTML = state.cart.length
    ? state.cart.map(item => `<div class="cart-item">
        <div><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.price)}</small></div>
        <button type="button" data-remove="${escapeHtml(item.id)}">Remove</button>
      </div>`).join("")
    : "<p>Your inquiry list is empty.</p>";

  qsa("[data-remove]", wrap).forEach(button =>
    button.addEventListener("click", () => {
      state.cart = state.cart.filter(item => item.id !== button.dataset.remove);
      save();
      renderCart();
      renderCards();
    })
  );
}

async function loadProducts() {
  const grid = qs("#product-grid");
  try {
    const response = await fetch("data/products.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Product request failed: ${response.status}`);
    state.products = await response.json();
    grid.innerHTML = state.products.map(productCard).join("");
    bindProductActions();
    renderCards();
  } catch (error) {
    console.error(error);
    grid.innerHTML = `<p class="products-loading">Products could not be loaded. Please refresh or contact D3DPS.</p>`;
  }
}

qsa(".filter").forEach(button => button.addEventListener("click", () => {
  qsa(".filter").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  state.filter = button.dataset.filter;
  renderCards();
}));

qsa("[data-jump-filter]").forEach(link => link.addEventListener("click", () => {
  const filter = link.dataset.jumpFilter;
  const button = qs(`[data-filter="${filter}"]`);
  if (button) {
    qsa(".filter").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = filter;
    renderCards();
  }
}));

function applySearch(value) {
  state.query = value.trim().toLowerCase();
  qs("#product-search").value = value;
  renderCards();
}

qs("#product-search").addEventListener("input", event => applySearch(event.target.value));
qs("#header-search").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    applySearch(event.target.value);
    location.hash = "products";
  }
});

const panel = qs("#cart-panel");
const scrim = qs("#cart-scrim");

function openCart(open) {
  panel.classList.toggle("open", open);
  panel.setAttribute("aria-hidden", String(!open));
  qs("#cart-toggle").setAttribute("aria-expanded", String(open));
  scrim.hidden = !open;
}

qs("#cart-toggle").addEventListener("click", () => openCart(true));
qs("#cart-close").addEventListener("click", () => openCart(false));
scrim.addEventListener("click", () => openCart(false));

qs("#cart-clear").addEventListener("click", () => {
  state.cart = [];
  save();
  renderCart();
  renderCards();
});

qs("#cart-email").addEventListener("click", () => {
  if (!state.cart.length) return;
  const lines = state.cart.map(item => `- ${item.name} (${item.price})`).join("\n");
  location.href = `mailto:D3DPSYYC@gmail.com?subject=${encodeURIComponent("D3DPS product inquiry")}&body=${encodeURIComponent(`Hi D3DPS,\n\nI would like a quote for:\n${lines}\n\nPreferred colour(s):\nQuantity:\nAdditional details:\n`)}`;
});

const storedTheme = localStorage.getItem("d3dps-theme");
if (storedTheme) document.documentElement.dataset.theme = storedTheme;

qs("#theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("d3dps-theme", next);
});

const menu = qs("#main-nav");
qs("#menu-toggle").addEventListener("click", event => {
  const open = menu.classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(open));
});
qsa(".main-nav a").forEach(link => link.addEventListener("click", () => menu.classList.remove("open")));

qs("#quote-form").addEventListener("submit", event => {
  event.preventDefault();
  const name = qs("#name").value.trim();
  const contact = qs("#contact-info").value.trim();
  const category = qs("#quote-category").value;
  const details = qs("#details").value.trim();
  const body = `Hi D3DPS,\n\nName: ${name}\nContact: ${contact}\nCategory: ${category}\n\nProject details:\n${details}\n\nI will attach any photos or files before sending.`;
  location.href = `mailto:D3DPSYYC@gmail.com?subject=${encodeURIComponent(`D3DPS quote request — ${category}`)}&body=${encodeURIComponent(body)}`;
});

qs("#year").textContent = new Date().getFullYear();
renderCart();
loadProducts();
