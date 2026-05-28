import { redirect } from "@remix-run/node";
import { authenticate, PLAN_NAME, billingEnabled } from "../shopify.server";

export const loader = async ({ request }) => {
  if (!billingEnabled) {
    return redirect("/app");
  }

  const { billing, session } = await authenticate.admin(request);

  // Return to Shopify admin (a Shopify-owned surface) so the user is never
  // asked to manually enter a myshopify URL — required by App Store rule 2.3.1.
  const shopSubdomain = session.shop.replace(".myshopify.com", "");
  const returnUrl = `https://admin.shopify.com/store/${shopSubdomain}/apps/imagesquish/app/plans`;

  await billing.request({
    plan: PLAN_NAME,
    isTest: process.env.BILLING_TEST === "true",
    returnUrl,
  });
};
