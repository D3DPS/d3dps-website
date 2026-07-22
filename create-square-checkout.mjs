import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SQUARE_API_VERSION = "2026-07-15";
const MAX_QUANTITY = 25;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function loadProducts() {
  const candidates = [
    path.join(process.cwd(), "data", "products.json"),
    path.join(import.meta.dirname, "..", "..", "data", "products.json")
  ];
  const file = candidates.find(candidate => fs.existsSync(candidate));
  if (!file) throw new Error("Product data is unavailable.");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!accessToken || !locationId) {
    return json(503, { error: "Online checkout is not configured yet." });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid checkout request." });
  }

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 30) {
    return json(400, { error: "Your cart is empty or contains too many items." });
  }

  try {
    const products = loadProducts();
    const productMap = new Map(products.map(product => [String(product.id), product]));
    const merged = new Map();

    for (const requested of body.items) {
      const id = String(requested?.id || "");
      const quantity = Number(requested?.quantity);
      if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
        return json(400, { error: "One of the cart quantities is invalid." });
      }
      merged.set(id, (merged.get(id) || 0) + quantity);
    }

    const lineItems = [];
    for (const [id, quantity] of merged) {
      const product = productMap.get(id);
      const priceCents = Math.round(Number(product?.price_cad) * 100);
      const stock = product?.stock;

      if (!product || product.published === false || product.online_purchase !== true || !Number.isInteger(priceCents) || priceCents < 1) {
        return json(400, { error: "One or more products are not available for online checkout." });
      }
      if (stock !== null && stock !== undefined && stock !== "" && quantity > Number(stock)) {
        return json(400, { error: `${product.name} does not have enough stock available.` });
      }

      lineItems.push({
        name: String(product.name).slice(0, 255),
        quantity: String(quantity),
        base_price_money: { amount: priceCents, currency: "CAD" },
        note: `D3DPS product: ${id}`
      });
    }

    const siteUrl = (process.env.URL || "https://d3dps.com").replace(/\/$/, "");
    const payload = {
      idempotency_key: crypto.randomUUID(),
      description: "D3DPS website order",
      order: {
        location_id: locationId,
        reference_id: `d3dps-${Date.now()}`.slice(0, 40),
        line_items: lineItems
      },
      checkout_options: {
        redirect_url: `${siteUrl}/?payment=success`,
        ask_for_shipping_address: false,
        enable_coupon: true,
        enable_tipping: false
      },
      payment_note: "D3DPS website checkout"
    };

    const response = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
      method: "POST",
      headers: {
        "Square-Version": SQUARE_API_VERSION,
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.payment_link?.url) {
      console.error("Square checkout error", response.status, result);
      const detail = result?.errors?.[0]?.detail;
      return json(502, { error: detail || "Square could not create the checkout page." });
    }

    return json(200, {
      checkoutUrl: result.payment_link.url,
      orderId: result.payment_link.order_id
    });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Checkout could not be started. Please try again." });
  }
};

export const config = { path: "/api/create-square-checkout" };
