import { redirect } from "@remix-run/node";
import {
  authenticate,
  ANNUAL_PLAN_NAME,
  PLAN_NAME,
  billingEnabled,
} from "../shopify.server";

export const loader = async ({ request }) => {
  if (!billingEnabled) {
    return redirect("/app");
  }

  const { billing, session } = await authenticate.admin(request);

  // ?plan=annual picks the yearly tier; anything else stays on monthly.
  const requestedPlan = new URL(request.url).searchParams.get("plan");
  const plan = requestedPlan === "annual" ? ANNUAL_PLAN_NAME : PLAN_NAME;

  // Return to Shopify admin (a Shopify-owned surface) so the user is never
  // asked to manually enter a myshopify URL — required by App Store rule 2.3.1.
  const shopSubdomain = session.shop.replace(".myshopify.com", "");
  const returnUrl = `https://admin.shopify.com/store/${shopSubdomain}/apps/imagesquish/app/plans`;

  await billing.request({
    plan,
    isTest: process.env.BILLING_TEST === "true",
    returnUrl,
  });
};
