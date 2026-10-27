const productId = document.body.dataset.productId;
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
let csrfToken = "";

async function getCsrfToken() {
    const response = await fetch("/api/csrf");
    const data = await response.json();
    csrfToken = data.token;
}

async function postJson(url, payload) {
    if (!csrfToken) await getCsrfToken();
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
        body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (data.csrf_token) csrfToken = data.csrf_token;
    if (!response.ok) throw new Error(data.error || "No se pudo completar la solicitud.");
    return data;
}

const tabButtons = document.querySelectorAll("[data-tab]");
for (const button of tabButtons) {
    button.addEventListener("click", () => {
        const showAnime = button.dataset.tab === "anime";
        document.getElementById("animeTab").setAttribute("aria-selected", String(showAnime));
        document.getElementById("mangaTab").setAttribute("aria-selected", String(!showAnime));
        document.getElementById("animePanel").hidden = !showAnime;
        document.getElementById("mangaPanel").hidden = showAnime;
    });
}

function readSavedList(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

const favoriteKey = "mundo-manga-favorites";
const readKey = "mundo-manga-read";
const favoriteButton = document.getElementById("favoriteButton");
const readButton = document.getElementById("readButton");

function updateSavedButton(button, isSaved, savedText, defaultText, glyph) {
    button.setAttribute("aria-pressed", String(isSaved));
    button.firstChild.textContent = `${glyph} `;
    button.querySelector("span").textContent = isSaved ? savedText : defaultText;
}

function refreshSavedState() {
    updateSavedButton(favoriteButton, readSavedList(favoriteKey).includes(productId), "Guardado", "Guardar", "♡");
    updateSavedButton(readButton, readSavedList(readKey).includes(productId), "Leído", "Marcar como leído", "✓");
}

favoriteButton.addEventListener("click", () => {
    const favorites = readSavedList(favoriteKey);
    const isFavorite = favorites.includes(productId);
    const updated = isFavorite ? favorites.filter((id) => id !== productId) : [...favorites, productId];
    localStorage.setItem(favoriteKey, JSON.stringify(updated));
    refreshSavedState();
});

readButton.addEventListener("click", () => {
    const readTitles = readSavedList(readKey);
    const hasRead = readTitles.includes(productId);
    const updated = hasRead ? readTitles.filter((id) => id !== productId) : [...readTitles, productId];
    localStorage.setItem(readKey, JSON.stringify(updated));
    refreshSavedState();
});

async function refreshCartCount() {
    const response = await fetch("/api/cart");
    const cart = await response.json();
    document.getElementById("detailCartCount").textContent = cart.count;
}

const detailStatus = document.getElementById("detailStatus");
document.querySelectorAll("[data-add], #detailAddButton").forEach((button) => {
    button.addEventListener("click", async () => {
        button.disabled = true;
        try {
            await postJson("/api/cart/add", { product_id: productId, quantity: 1 });
            await refreshCartCount();
            detailStatus.textContent = `${document.body.dataset.productTitle} se agregó a la bolsa.`;
        } catch (error) {
            detailStatus.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    });
});

async function loadReviews() {
    const response = await fetch(`/api/reviews?product_id=${encodeURIComponent(productId)}`);
    const data = await response.json();
    const list = document.getElementById("detailReviewList");
    list.replaceChildren();
    if (!data.reviews.length) {
        const empty = document.createElement("p");
        empty.className = "review-empty";
        empty.textContent = "Todavía no hay reseñas. Podés ser la primera persona en dejar una.";
        list.append(empty);
        return;
    }
    for (const review of data.reviews) {
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

document.getElementById("detailReviewForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const message = document.getElementById("detailReviewMessage");
    try {
        const result = await postJson("/api/reviews", {
            username: values.get("username"),
            rating: Number(values.get("rating")),
            body: values.get("body"),
            product_id: productId,
        });
        message.textContent = result.message;
        form.reset();
        await loadReviews();
    } catch (error) {
        message.textContent = error.message;
    }
});

refreshSavedState();
Promise.all([refreshCartCount(), loadReviews()]).catch((error) => {
    detailStatus.textContent = error.message;
});