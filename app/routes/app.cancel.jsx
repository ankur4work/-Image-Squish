import { redirect } from "@remix-run/node";
import { authenticate, PLAN_NAME, billingEnabled } from "../shopify.server";
import { getBillingStatusOrFree } from "../lib/billing.server";

export const loader = async ({ request }) => {
  if (!billingEnabled) {
    return redirect("/app");
  }

  const { billing, session } = await authenticate.admin(request);

  const billingCheck = await getBillingStatusOrFree({
    request,
    billing,
    session,
    plans: [PLAN_NAME],
  });

  if (!billingCheck.hasActivePayment || billingCheck.appSubscriptions.length === 0) {
    return redirect("/app");
  }

  const subscription = billingCheck.appSubscriptions[0];
  await billing.cancel({
    subscriptionId: subscription.id,
    isTest: process.env.BILLING_TEST === "true",
    prorate: true,
  });

  return redirect("/app");
};
