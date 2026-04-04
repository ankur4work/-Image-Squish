import fs from "fs";
import path from "path";
import { authenticate, sessionStorage } from "../shopify.server";

const WATERMARK_UPLOAD_DIR = path.resolve("public/uploads/watermarks");

function removeShopWatermarkFiles(shopDomain) {
  const safeShopName = shopDomain.replace(/[^a-z0-9.-]/gi, "_");
  const filesToDelete = [
    path.join(WATERMARK_UPLOAD_DIR, `${safeShopName}.png`),
    path.join(WATERMARK_UPLOAD_DIR, `${safeShopName}.json`),
  ];

  filesToDelete.forEach((filePath) => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
}

export const action = async ({ request }) => {
  try {
    const { topic, shop, session, payload } = await authenticate.webhook(request);

    switch (topic) {
      case "APP_UNINSTALLED":
        if (session) {
          await sessionStorage.deleteSessions(shop);
        }
        removeShopWatermarkFiles(shop);
        break;

      case "CUSTOMERS_DATA_REQUEST":
        console.log("Received customers/data_request compliance webhook", {
          shop,
          shopId: payload?.shop_id,
          customerId: payload?.customer?.id,
        });
        break;

      case "CUSTOMERS_REDACT":
        console.log("Received customers/redact compliance webhook", {
          shop,
          shopId: payload?.shop_id,
          customerId: payload?.customer?.id,
        });
        break;

      case "SHOP_REDACT":
        console.log("Received shop/redact compliance webhook", {
          shop,
          shopId: payload?.shop_id,
        });
        await sessionStorage.deleteSessions(shop);
        removeShopWatermarkFiles(shop);
        break;

      default:
        return new Response("Unhandled webhook topic", { status: 404 });
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    console.error("Webhook processing failed", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
};
