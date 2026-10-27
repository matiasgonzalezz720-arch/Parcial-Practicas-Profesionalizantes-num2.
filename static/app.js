const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
let csrfToken = "";
let authMode = "login";
let currentProductId = "one-piece";

async function getCsrfToken() {
    const response = await fetch("/api/csrf");
    const data = await response.json();
    csrfToken = data.token;
}

async function api(url, options = {}) {
    if (!csrfToken && options.method && options.method !== "GET") await getCsrfToken();
    const headers = { ...(options.headers || {}) };
    if (options.method && options.method !== "GET") headers["X-CSRFToken"] = csrfToken;
    if (options.body) headers["Content-Type"] = "application/json";
    const response = await fetch(url, { ...options, headers });
    const data = await response.json();
    if (data.csrf_token) csrfToken = data.csrf_token;
    if (response.status === 400 && data.description?.toLowerCase().includes("csrf")) {
        csrfToken = "";
        throw new Error("La sesión venció. Recargá la página e intentá nuevamente.");
    }
    if (!response.ok) throw new Error(data.error || data.description || "No se pudo completar la solicitud.");
    return data;
}

const productGrid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const genreFilter = document.getElementById("genreFilter");
let searchTimer;

function makeProductCard(product) {
    const article = document.createElement("article");
    article.className = "product-card";
    article.dataset.productId = product.id;
    const cover = document.createElement("a");
    cover.className = `book-cover ${product.color}`;
    cover.href = `/manga/${encodeURIComponent(product.id)}`;
    cover.setAttribute("aria-label", `Ver ficha de ${product.title}`);
    const tag = document.createElement("span");
    tag.className = "cover-label";
    tag.textContent = product.genre;
    const symbol = document.createElement("span");
    symbol.className = "cover-symbol";
    symbol.textContent = product.icon;
    const title = document.createElement("span");
    title.className = "cover-name";
    title.textContent = product.title;
    const authorOnCover = document.createElement("span");
    authorOnCover.className = "cover-author";
    authorOnCover.textContent = product.author;
    cover.append(tag, symbol, title, authorOnCover);

    const meta = document.createElement("div");
    meta.className = "product-meta";
    const description = document.createElement("div");
    const author = document.createElement("p");
    author.className = "product-author";
    author.textContent = product.author;
    const heading = document.createElement("h3");
    heading.textContent = product.title;
    description.append(author, heading);
    const volume = document.createElement("span");
    volume.className = "volume-label";
    volume.textContent = product.volume;
    meta.append(description, volume);

    const buy = document.createElement("div");
    buy.className = "product-buy";
    const price = document.createElement("strong");
    price.textContent = money.format(product.price);
    const add = document.createElement("button");
    add.className = "add-button";
    add.type = "button";
    add.dataset.add = product.id;
    add.setAttribute("aria-label", `Agregar ${product.title} al carrito`);
    add.textContent = "+";
    buy.append(price, add);
    article.append(cover, meta, buy);
    return article;
}

async function searchCatalog() {
    const params = new URLSearchParams({ q: searchInput.value, genre: genreFilter.value });
    const data = await api(`/api/catalog?${params}`);
    productGrid.replaceChildren(...data.products.map(makeProductCard));
    document.getElementById("resultCount").textContent = `${data.products.length} ${data.products.length === 1 ? "título" : "títulos"}`;
    document.getElementById("emptyState").hidden = data.products.length > 0;
}

searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => searchCatalog().catch(showCatalogError), 180);
});
genreFilter.addEventListener("change", () => searchCatalog().catch(showCatalogError));
function showCatalogError(error) { document.getElementById("emptyState").hidden = false; document.getElementById("emptyState").textContent = error.message; }

const cartPanel = document.getElementById("cartPanel");
const scrim = document.getElementById("scrim");
function toggleCart(open) {
    cartPanel.classList.toggle("open", open);
    scrim.classList.toggle("visible", open);
    cartPanel.setAttribute("aria-hidden", String(!open));
}
document.getElementById("cartToggle").addEventListener("click", () => { refreshCart(); toggleCart(true); });
document.getElementById("cartClose").addEventListener("click", () => toggleCart(false));
scrim.addEventListener("click", () => toggleCart(false));

async function refreshCart() {
    const cart = await api("/api/cart");
    document.getElementById("cartCount").textContent = cart.count;
    document.getElementById("cartTotal").textContent = money.format(cart.total);
    const items = document.getElementById("cartItems");
    items.replaceChildren();
    document.getElementById("cartEmpty").hidden = cart.items.length > 0;
    for (const product of cart.items) {
        const row = document.createElement("div");
        row.className = "cart-row";
        const details = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = product.title;
        const subtitle = document.createElement("small");
        subtitle.textContent = `${product.quantity} × ${money.format(product.price)} · ${money.format(product.line_total)}`;
        details.append(title, subtitle);
        const remove = document.createElement("button");
        remove.className = "remove-item";
        remove.type = "button";
        remove.textContent = "Quitar";
        remove.setAttribute("aria-label", `Quitar ${product.title}`);
        remove.addEventListener("click", async () => {
            try { await api("/api/cart/remove", { method: "POST", body: JSON.stringify({ product_id: product.id }) }); await refreshCart(); }
            catch (error) { showCartMessage(error.message); }
        });
        row.append(details, remove);
        items.append(row);
    }
}

function showCartMessage(message) { document.getElementById("cartMessage").textContent = message; }
document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-add]");
    if (!button) return;
    button.disabled = true;
    try {
        await api("/api/cart/add", { method: "POST", body: JSON.stringify({ product_id: button.dataset.add, quantity: 1 }) });
        await refreshCart();
        showCartMessage("Volumen agregado a tu bolsa.");
    } catch (error) { showCartMessage(error.message); toggleCart(true); }
    finally { button.disabled = false; }
});

document.getElementById("checkoutButton").addEventListener("click", async () => {
    try {
        const result = await api("/api/checkout", { method: "POST", body: JSON.stringify({}) });
        showCartMessage(`${result.message} Pedido #${result.order_id}.`);
        await refreshCart();
    } catch (error) { showCartMessage(error.message); }
});

const recommendationMap = {
    aventura: ["one-piece", "Una tripulación, mares desconocidos y una aventura que crece volumen a volumen."],
    emocion: ["haikyuu", "Un equipo que se supera punto a punto: pasión y personajes que se quedan con vos."],
    mente: ["death-note", "Un duelo de estrategias y decisiones difíciles para quienes disfrutan la intriga."]
};
document.querySelectorAll("[data-mood]").forEach((button) => button.addEventListener("click", async () => {
    const [id, description] = recommendationMap[button.dataset.mood];
    const product = (await api("/api/catalog")).products.find((item) => item.id === id);
    document.getElementById("recommendTitle").textContent = `Te recomendamos ${product.title}.`;
    document.getElementById("recommendText").textContent = description;
    document.getElementById("recommendLink").href = `/manga/${encodeURIComponent(product.id)}`;
}));

async function loadReviews() {
    const { reviews } = await api(`/api/reviews?product_id=${encodeURIComponent(currentProductId)}`);
    const list = document.getElementById("reviewList");
    list.replaceChildren();
    if (!reviews.length) {
        const empty = document.createElement("p");
        empty.className = "review-empty";
        empty.textContent = "Todavía no hay reseñas. La primera puede ser la tuya.";
        list.append(empty);
        return;
    }
    for (const review of reviews) {
        const item = document.createElement("article");
        item.className = "review-item";
        const header = document.createElement("header");
        const name = document.createElement("strong");
        name.textContent = review.username;
        const rating = document.createElement("span");
        rating.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`;
        header.append(name, rating);
        const body = document.createElement("p");
        body.textContent = review.body;
        item.append(header, body);
        list.append(item);
    }
}

document.getElementById("reviewForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const message = document.getElementById("reviewMessage");
    try {
        const result = await api("/api/reviews", { method: "POST", body: JSON.stringify({ username: values.get("username"), rating: Number(values.get("rating")), body: values.get("body"), product_id: currentProductId }) });
        message.textContent = result.message;
        form.reset();
        await loadReviews();
    } catch (error) { message.textContent = error.message; }
});

const authDialog = document.getElementById("authDialog");
document.getElementById("accountButton").addEventListener("click", async () => {
    const response = await api("/api/session");
    if (response.username) {
        try { await api("/api/logout", { method: "POST", body: JSON.stringify({}) }); }
        catch (error) { document.getElementById("accountName").textContent = error.message; return; }
        document.getElementById("accountName").textContent = "Invitado/a";
        document.getElementById("accountButton").setAttribute("aria-label", "Iniciar sesión");
    } else authDialog.showModal();
});
document.querySelectorAll("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));
function setAuthMode(mode) {
    authMode = mode;
    document.querySelectorAll("[data-auth-mode]").forEach((button) => button.classList.toggle("selected", button.dataset.authMode === mode));
    const submit = document.getElementById("authSubmit");
    submit.firstChild.textContent = mode === "login" ? "Ingresar " : "Crear cuenta ";
    document.querySelector(".auth-form input[type=password]").autocomplete = mode === "login" ? "current-password" : "new-password";
    document.getElementById("authMessage").textContent = "";
}
document.getElementById("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    try {
        const result = await api(`/api/${authMode === "login" ? "login" : "register"}`, { method: "POST", body: JSON.stringify({ username: values.get("username"), password: values.get("password") }) });
        document.getElementById("accountName").textContent = result.username;
        document.getElementById("accountButton").setAttribute("aria-label", "Cerrar sesión");
        authDialog.close();
        form.reset();
    } catch (error) { document.getElementById("authMessage").textContent = error.message; }
});

async function loadSession() {
    const { username } = await api("/api/session");
    if (username) {
        document.getElementById("accountName").textContent = username;
        document.getElementById("accountButton").setAttribute("aria-label", "Cerrar sesión");
    }
}

document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
        event.preventDefault();
        searchInput.focus();
    }
    if (event.key === "Escape") toggleCart(false);
});

Promise.all([getCsrfToken(), refreshCart(), loadReviews(), loadSession()]).catch((error) => {
    document.getElementById("reviewMessage").textContent = error.message;
});