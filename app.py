import os
import secrets
import sqlite3
import json
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path

from flask import Flask, abort, jsonify, render_template, request, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFError, CSRFProtect, generate_csrf
from werkzeug.security import check_password_hash, generate_password_hash


BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "mundo_manga.db"

PRODUCTS = [
    {"id": "one-piece", "title": "One Piece", "author": "Eiichiro Oda", "genre": "Aventura", "price": 12500, "volume": "Vol. 1", "publisher": "Shueisha", "start_date": "1997", "demographic": "Shōnen", "anime_year": "1999", "anime_studio": "Toei Animation", "icon": "☠", "color": "ocean", "description": "La travesía de Luffy y su tripulación hacia el tesoro más legendario.", "anime_description": "Monkey D. Luffy y los Sombrero de Paja recorren los mares en busca del One Piece y del sueño de convertirse en el Rey de los Piratas."},
    {"id": "naruto", "title": "Naruto", "author": "Masashi Kishimoto", "genre": "Acción", "price": 10800, "volume": "Vol. 1", "publisher": "Shueisha", "start_date": "1999", "demographic": "Shōnen", "anime_year": "2002", "anime_studio": "Studio Pierrot", "icon": "忍", "color": "sun", "description": "Un joven ninja persigue su sueño de convertirse en Hokage.", "anime_description": "Naruto Uzumaki crece como ninja mientras busca el reconocimiento de su aldea y trabaja para alcanzar su sueño de ser Hokage."},
    {"id": "attack-on-titan", "title": "Attack on Titan", "author": "Hajime Isayama", "genre": "Drama", "price": 13900, "volume": "Vol. 1", "publisher": "Kodansha", "start_date": "2009", "demographic": "Shōnen", "anime_year": "2013", "anime_studio": "Wit Studio / MAPPA", "icon": "進", "color": "stone", "description": "La humanidad lucha por sobrevivir tras enormes murallas.", "anime_description": "Eren Yeager y sus amigos se enfrentan a los titanes y a los secretos que rodean las murallas que protegen a la humanidad."},
    {"id": "demon-slayer", "title": "Demon Slayer", "author": "Koyoharu Gotouge", "genre": "Fantasía", "price": 11900, "volume": "Vol. 1", "publisher": "Shueisha", "start_date": "2016", "demographic": "Shōnen", "anime_year": "2019", "anime_studio": "ufotable", "icon": "滅", "color": "ember", "description": "Tanjiro emprende un viaje para salvar a su hermana.", "anime_description": "Tanjiro Kamado se convierte en cazador de demonios para proteger a su hermana Nezuko y encontrar una forma de devolverle su humanidad."},
    {"id": "haikyuu", "title": "Haikyuu!!", "author": "Haruichi Furudate", "genre": "Deporte", "price": 9900, "volume": "Vol. 1", "publisher": "Shueisha", "start_date": "2012", "demographic": "Shōnen", "anime_year": "2014", "anime_studio": "Production I.G", "icon": "飛", "color": "court", "description": "Pasión, amistad y voleibol en una historia de superación.", "anime_description": "Shoyo Hinata se une al equipo de voleibol de Karasuno y, junto con sus compañeros, busca llevar al equipo nuevamente a la cima."},
    {"id": "death-note", "title": "Death Note", "author": "Tsugumi Ohba", "genre": "Suspenso", "price": 11200, "volume": "Vol. 1", "publisher": "Shueisha", "start_date": "2003", "demographic": "Shōnen", "anime_year": "2006", "anime_studio": "Madhouse", "icon": "夜", "color": "ink", "description": "Un cuaderno sobrenatural inicia un duelo de inteligencia.", "anime_description": "Light Yagami encuentra un cuaderno con poderes sobrenaturales y se enfrenta en un duelo de estrategia con el detective conocido como L."},
]
PRODUCT_BY_ID = {product["id"]: product for product in PRODUCTS}

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("SECRET_KEY") or secrets.token_hex(32),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "0") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    WTF_CSRF_TIME_LIMIT=7200,
)
csrf = CSRFProtect(app)
limiter = Limiter(get_remote_address, app=app, default_limits=["120 per hour"], storage_uri="memory://")


@contextmanager
def connect_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()


def init_db():
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL,
                product_id TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                body TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY,
                username TEXT,
                items_json TEXT NOT NULL,
                total INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )


init_db()


def establish_session(username):
    cart = session.get("cart", {})
    session.clear()
    session["cart"] = cart
    session.permanent = True
    session["username"] = username
    return generate_csrf()


@app.errorhandler(CSRFError)
def handle_csrf_error(error):
    return jsonify(error="La sesión venció o el token CSRF no es válido. Recargá la página."), 400


@app.after_request
def add_security_headers(response):
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
        "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    )
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cache-Control"] = "no-store" if request.path.startswith("/api/") else "no-cache"
    return response


@app.get("/")
def index():
    return render_template("index.html", products=PRODUCTS)


@app.get("/manga/<product_id>")
def manga_detail(product_id):
    product = PRODUCT_BY_ID.get(product_id)
    if not product:
        abort(404)
    return render_template("manga_detail.html", product=product)


@app.get("/api/csrf")
def csrf_token():
    return jsonify(token=generate_csrf())


@app.get("/api/session")
def session_status():
    return jsonify(username=session.get("username"))


@app.get("/api/catalog")
def catalog():
    query = request.args.get("q", "").strip().casefold()
    genre = request.args.get("genre", "").strip().casefold()
    found = [product for product in PRODUCTS if
             (not query or query in " ".join((product["title"], product["author"], product["genre"], product["description"])).casefold()) and
             (not genre or product["genre"].casefold() == genre)]
    return jsonify(products=found)


@app.get("/api/catalog/<product_id>")
def catalog_product(product_id):
    product = PRODUCT_BY_ID.get(product_id)
    if not product:
        return jsonify(error="No encontramos ese manga."), 404
    return jsonify(product)


@app.get("/api/cart")
def get_cart():
    return jsonify(cart_details())


def cart_details():
    cart = session.get("cart", {})
    items = []
    total = 0
    for product_id, quantity in cart.items():
        product = PRODUCT_BY_ID.get(product_id)
        if product and isinstance(quantity, int) and quantity > 0:
            line_total = product["price"] * quantity
            items.append({**product, "quantity": quantity, "line_total": line_total})
            total += line_total
    return {"items": items, "total": total, "count": sum(item["quantity"] for item in items)}


@app.post("/api/cart/add")
def add_to_cart():
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    quantity = data.get("quantity", 1)
    if not isinstance(product_id, str) or product_id not in PRODUCT_BY_ID or not isinstance(quantity, int) or not 1 <= quantity <= 10:
        return jsonify(error="Producto o cantidad inválidos."), 400
    cart = session.get("cart", {})
    cart[product_id] = min(cart.get(product_id, 0) + quantity, 10)
    session["cart"] = cart
    return jsonify(cart_details())


@app.post("/api/cart/remove")
def remove_from_cart():
    data = request.get_json(silent=True) or {}
    cart = session.get("cart", {})
    product_id = data.get("product_id")
    if isinstance(product_id, str):
        cart.pop(product_id, None)
    session["cart"] = cart
    return jsonify(cart_details())


@app.post("/api/checkout")
def checkout():
    details = cart_details()
    if not details["items"]:
        return jsonify(error="Tu carrito está vacío."), 400
    username = session.get("username")
    with connect_db() as db:
        cursor = db.execute(
            "INSERT INTO orders (username, items_json, total) VALUES (?, ?, ?)",
            (username, json.dumps(details["items"], ensure_ascii=False), details["total"]),
        )
        order_id = cursor.lastrowid
    session["cart"] = {}
    return jsonify(message="Pedido registrado. El pago es de demostración.", order_id=order_id, cart=cart_details())


@app.post("/api/register")
@limiter.limit("5 per minute")
def register():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    if not 3 <= len(username) <= 30 or not 10 <= len(password) <= 128:
        return jsonify(error="Usá un nombre de 3 a 30 caracteres y una contraseña de 10 a 128."), 400
    try:
        with connect_db() as db:
            db.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)",
                       (username, generate_password_hash(password)))
    except sqlite3.IntegrityError:
        return jsonify(error="Ese nombre de usuario ya existe."), 409
    token = establish_session(username)
    return jsonify(username=username, csrf_token=token)


@app.post("/api/login")
@limiter.limit("5 per minute")
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    with connect_db() as db:
        user = db.execute("SELECT username, password_hash FROM users WHERE username = ?", (username,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify(error="Usuario o contraseña incorrectos."), 401
    token = establish_session(user["username"])
    return jsonify(username=user["username"], csrf_token=token)


@app.post("/api/logout")
def logout():
    cart = session.get("cart", {})
    session.clear()
    session["cart"] = cart
    token = generate_csrf()
    return jsonify(message="Sesión cerrada.", csrf_token=token)


@app.post("/api/reviews")
def add_review():
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    body = str(data.get("body", "")).strip()
    try:
        rating = int(data.get("rating", 0))
    except (TypeError, ValueError):
        rating = 0
    username = session.get("username") or str(data.get("username", "Lector/a")).strip()
    if not isinstance(product_id, str) or product_id not in PRODUCT_BY_ID or not 1 <= rating <= 5 or not 10 <= len(body) <= 400 or not 1 <= len(username) <= 30:
        return jsonify(error="Revisá el nombre, puntaje y reseña (10 a 400 caracteres)."), 400
    with connect_db() as db:
        db.execute("INSERT INTO reviews (username, product_id, rating, body) VALUES (?, ?, ?, ?)",
                   (username, product_id, rating, body))
    return jsonify(message="Reseña publicada. ¡Gracias por compartir!"), 201


@app.get("/api/reviews")
def reviews():
    product_id = request.args.get("product_id", "one-piece")
    with connect_db() as db:
        rows = db.execute(
            "SELECT username, rating, body, created_at FROM reviews WHERE product_id = ? ORDER BY id DESC LIMIT 12",
            (product_id,),
        ).fetchall()
    return jsonify(reviews=[dict(row) for row in rows])


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG", "0") == "1")