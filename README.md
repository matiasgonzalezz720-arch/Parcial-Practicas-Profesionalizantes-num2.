# Mundo Manga

Prototipo académico: catálogo con búsqueda y filtros, páginas individuales Anime + Manga para cada título, pestañas interactivas, favoritos y seguimiento de lectura en el navegador, carrito de sesión, pedidos de demostración, cuentas y reseñas por manga en SQLite, un recomendador por preferencias y un asistente de chat local para consultar el catálogo, precios y carrito.

## Ejecutar en Windows

Si abriste en VS Code la carpeta contenedora `VERSION DEFINITIVA`, primero entrá al proyecto. En PowerShell:

```powershell
Set-Location ".\PARCIAL SEGUNDO SEMESTRE"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\requirements.txt
.\.venv\Scripts\python.exe .\app.py
```

Si ya abriste `PARCIAL SEGUNDO SEMESTRE` como carpeta en VS Code, omití el primer comando. Se usa `python` para que funcione también en Windows sin el lanzador opcional `py`; no hace falta activar el entorno virtual.

Abrí `http://127.0.0.1:5000`. La base `mundo_manga.db` se crea automáticamente. Los pedidos son demostrativos: no se procesan pagos.

## Seguridad incluida

- `Flask-WTF` valida tokens CSRF en solicitudes que modifican datos.
- Cookies de sesión `HttpOnly` y `SameSite=Lax`; se puede activar `COOKIE_SECURE=1` al servir sobre HTTPS.
- CSP restringe scripts, estilos, formularios y recursos al mismo origen; `X-Frame-Options: DENY` y `frame-ancestors 'none'` bloquean el clickjacking.
- `Flask-Limiter` limita login y registro a 5 intentos por minuto por IP, además del límite general.
- Las contraseñas se guardan con hash; SQL usa parámetros y el contenido de reseñas se renderiza como texto.

Para un despliegue real, definí una `SECRET_KEY` persistente y aleatoria, ejecutá detrás de HTTPS, usá un almacenamiento persistente para Flask-Limiter (por ejemplo Redis) y un servidor WSGI de producción. El cobro requiere integrar un proveedor de pagos; el botón actual solo registra un pedido académico.