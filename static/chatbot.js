const chatPanel = document.getElementById("chatPanel");
const chatToggle = document.getElementById("chatToggle");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMoney = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
let chatCsrfToken = "";
let productsRequest;

function setChatOpen(open) {
    chatPanel.classList.toggle("open", open);
    chatPanel.setAttribute("aria-hidden", String(!open));
    chatToggle.setAttribute("aria-expanded", String(open));
    if (open) chatInput.focus();
}

function addChatMessage(text, sender = "bot") {
    const message = document.createElement("div");
    message.className = `chat-message${sender === "user" ? " user" : ""}`;
    message.textContent = text;
    chatMessages.append(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return message;
}

function normalizeMessage(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

async function getProducts() {
    if (!productsRequest) {
        productsRequest = fetch("/api/catalog")
            .then(async (response) => {
                if (!response.ok) throw new Error("No pudimos consultar el catálogo.");
                return (await response.json()).products;
            })
            .catch((error) => {
                productsRequest = null;
                throw error;
            });
    }
    return productsRequest;
}

function findProduct(message, products) {
    return products.find((product) => {
        const title = normalizeMessage(product.title);
        const author = normalizeMessage(product.author);
        return message.includes(title) || message.includes(author);
    });
}

function findGenre(message, products) {
    const aliases = {
        aventura: ["aventura", "aventuras"],
        accion: ["accion", "accion"],
        drama: ["drama", "dramatico"],
        fantasia: ["fantasia", "magia"],
        deporte: ["deporte", "deportivo", "voleibol", "volleyball"],
        suspenso: ["suspenso", "intriga", "misterio"],
    };
    for (const product of products) {
        const genre = normalizeMessage(product.genre);
        if (message.includes(genre) || (aliases[genre] || []).some((word) => message.includes(word))) return product.genre;
    }
    return "";
}

function addProductCard(parent, product) {
    const card = document.createElement("div");
    card.className = "chat-product";
    const link = document.createElement("a");
    link.className = "chat-product-link";
    link.href = `/manga/${encodeURIComponent(product.id)}`;
    link.textContent = `Ver ficha de ${product.title}`;
    const addButton = document.createElement("button");
    addButton.className = "chat-add";
    addButton.type = "button";
    addButton.textContent = "Agregar a la bolsa";
    addButton.addEventListener("click", async () => {
        addButton.disabled = true;
        try {
            if (!chatCsrfToken) {
                const tokenResponse = await fetch("/api/csrf");
                if (!tokenResponse.ok) throw new Error("No pudimos preparar la solicitud. Intentá de nuevo.");
                chatCsrfToken = (await tokenResponse.json()).token;
            }
            const response = await fetch("/api/cart/add", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRFToken": chatCsrfToken },
                body: JSON.stringify({ product_id: product.id, quantity: 1 }),
            });
            const result = await response.json();
            if (!response.ok) {
                if (response.status === 400) chatCsrfToken = "";
                throw new Error(result.error || "No pudimos agregar el manga.");
            }
            const cartCount = document.getElementById("cartCount") || document.getElementById("detailCartCount");
            if (cartCount) cartCount.textContent = result.count;
            addChatMessage(`${product.title} se agregó a tu bolsa.`);
        } catch (error) {
            addChatMessage(error.message);
        } finally {
            addButton.disabled = false;
        }
    });
    card.append(link, addButton);
    parent.append(card);
}

async function respondToChat(rawMessage) {
    const message = normalizeMessage(rawMessage.trim());
    const products = await getProducts();
    const product = findProduct(message, products);

    if (/^(hola|buenas|buen dia|buenas tardes|buenas noches)\b/.test(message)) {
        addChatMessage("¡Hola! Puedo recomendarte una lectura, buscar un manga o contarte qué hay en tu bolsa. ¿Qué te gustaría?");
        return;
    }
    if (message.includes("carrito") || message.includes("bolsa")) {
        const response = await fetch("/api/cart");
        if (!response.ok) throw new Error("No pudimos consultar tu bolsa. Intentá de nuevo.");
        const cart = await response.json();
        if (!cart.items.length) {
            addChatMessage("Tu bolsa está vacía. Podés explorar el catálogo y agregar el volumen que te interese.");
        } else {
            const summary = cart.items.map((item) => `${item.title} × ${item.quantity}`).join(", ");
            addChatMessage(`Tenés ${cart.count} ${cart.count === 1 ? "volumen" : "volúmenes"}: ${summary}. Total: ${chatMoney.format(cart.total)}.`);
        }
        return;
    }
    if (product) {
        const reply = addChatMessage(`${product.title} es de ${product.author}. Género: ${product.genre}. Precio: ${chatMoney.format(product.price)}. ${product.description}`);
        addProductCard(reply, product);
        return;
    }
    if (message.includes("catalogo") || message.includes("que tienen") || message.includes("que mangas") || message.includes("titulos")) {
        addChatMessage(`En el catálogo tenemos: ${products.map((item) => item.title).join(", ")}. Decime un título para ver precio y detalles.`);
        return;
    }
    const genre = findGenre(message, products);
    if (genre) {
        const matches = products.filter((item) => item.genre === genre);
        const reply = addChatMessage(`En ${genre} te puedo mostrar: ${matches.map((item) => `${item.title} (${chatMoney.format(item.price)})`).join(", ")}.`);
        for (const item of matches) addProductCard(reply, item);
        return;
    }
    if (message.includes("recomend") || message.includes("que leo") || message.includes("suger")) {
        const picks = ["one-piece", "haikyuu", "death-note"]
            .map((id) => products.find((item) => item.id === id))
            .filter(Boolean);
        const reply = addChatMessage("¡Claro! Estas opciones son un buen punto de partida: aventura, deporte o intriga. Elegí una para ver más:");
        for (const item of picks) addProductCard(reply, item);
        return;
    }
    if (message.includes("pago") || message.includes("compr") || message.includes("pedido")) {
        addChatMessage("Para comprar, agregá un volumen a la bolsa y confirmá el pedido desde el catálogo. Es una demostración académica: no se realiza ningún cobro.");
        return;
    }
    addChatMessage("Puedo ayudarte a encontrar un manga por título, autor o género, recomendarte una lectura o revisar tu bolsa. Por ejemplo: «¿Cuánto cuesta Naruto?».");
}

chatToggle.addEventListener("click", () => setChatOpen(chatToggle.getAttribute("aria-expanded") !== "true"));
document.getElementById("chatClose").addEventListener("click", () => setChatOpen(false));
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && chatToggle.getAttribute("aria-expanded") === "true") setChatOpen(false);
});

chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;
    addChatMessage(message, "user");
    chatInput.value = "";
    chatForm.querySelector("button").disabled = true;
    try {
        await respondToChat(message);
    } catch (error) {
        addChatMessage(error.message || "No pudimos responder ahora. Intentá de nuevo.");
    } finally {
        chatForm.querySelector("button").disabled = false;
        chatInput.focus();
    }
});

document.getElementById("chatSuggestions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-prompt]");
    if (!button) return;
    chatInput.value = button.dataset.chatPrompt;
    chatForm.requestSubmit();
});

addChatMessage("¡Hola! Soy el asistente de Mundo Manga. Preguntame por títulos, precios, géneros o tu bolsa.");
