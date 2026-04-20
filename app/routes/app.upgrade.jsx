import { redirect } from "@remix-run/node";
import { authenticate, PLAN_NAME, billingEnabled } from "../shopify.server";

export const loader = async ({ request }) => {
  if (!billingEnabled) {
    return redirect("/app");
  }

  const { billing, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const returnUrl = `${appUrl}/app?shop=${session.shop}&host=${host}`;

  await billing.request({
    plan: PLAN_NAME,
    isTest: process.env.BILLING_TEST === "true",
    returnUrl,
  });
};
