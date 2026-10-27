import tempfile
import unittest
from pathlib import Path

import app as server


class MundoMangaTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        server.DATABASE = Path(self.temp_dir.name) / "test.db"
        server.init_db()
        server.app.config.update(TESTING=True, SECRET_KEY="test-secret-key")
        self.client = server.app.test_client()
        self.csrf_token = self.client.get("/api/csrf").get_json()["token"]

    def tearDown(self):
        self.temp_dir.cleanup()

    def post_json(self, path, payload):
        return self.client.post(
            path,
            json=payload,
            headers={"X-CSRFToken": self.csrf_token},
        )

    def test_home_has_security_headers_and_unified_content(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertIn("frame-ancestors 'none'", response.headers["Content-Security-Policy"])
        self.assertIn(b'href="/manga/one-piece"', response.data)
        self.assertNotIn(b'id="detailTitle"', response.data)
        self.assertIn(b"Busc\xc3\xa1 tu pr\xc3\xb3xima", response.data)
        self.assertIn(b'id="chatForm"', response.data)
        self.assertIn(b"chatbot.js", response.data)

    def test_chatbot_is_available_on_manga_detail_pages(self):
        response = self.client.get("/manga/naruto")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'id="chatForm"', response.data)
        self.assertIn(b"chatbot.js", response.data)
        script_response = self.client.get("/static/chatbot.js")
        self.assertEqual(script_response.status_code, 200)
        script_response.close()

    def test_catalog_search_filters_results(self):
        response = self.client.get("/api/catalog?q=oda")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.get_json()["products"]], ["one-piece"])

    def test_each_catalog_item_has_its_own_detail(self):
        one_piece = self.client.get("/api/catalog/one-piece").get_json()
        naruto_response = self.client.get("/api/catalog/naruto")
        naruto = naruto_response.get_json()
        self.assertEqual(naruto_response.status_code, 200)
        self.assertEqual(naruto["title"], "Naruto")
        self.assertEqual(naruto["author"], "Masashi Kishimoto")
        self.assertNotEqual(naruto["description"], one_piece["description"])

    def test_each_manga_opens_its_own_anime_page(self):
        naruto_page = self.client.get("/manga/naruto")
        one_piece_page = self.client.get("/manga/one-piece")
        self.assertEqual(naruto_page.status_code, 200)
        self.assertIn(b"Naruto", naruto_page.data)
        self.assertIn(b"Studio Pierrot", naruto_page.data)
        self.assertIn(b"2002", naruto_page.data)
        self.assertNotIn(b"Toei Animation", naruto_page.data)
        self.assertIn(b"Toei Animation", one_piece_page.data)

    def test_csrf_is_required_for_cart_changes(self):
        response = self.client.post("/api/cart/add", json={"product_id": "one-piece"})
        self.assertEqual(response.status_code, 400)

    def test_cart_total_uses_server_price(self):
        response = self.post_json("/api/cart/add", {"product_id": "one-piece", "quantity": 2, "price": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["total"], 25000)
        self.assertEqual(response.get_json()["count"], 2)

    def test_login_is_rate_limited(self):
        responses = [self.post_json("/api/login", {"username": "missing", "password": "incorrect"}) for _ in range(6)]
        self.assertTrue(all(response.status_code == 401 for response in responses[:5]))
        self.assertEqual(responses[5].status_code, 429)


if __name__ == "__main__":
    unittest.main()