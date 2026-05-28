import { redirect } from "@remix-run/node";
import { authenticate, PLAN_NAME, billingEnabled } from "../shopify.server";
import { getBillingStatusOrFree, hasActiveSubscription } from "../lib/billing.server";

export const loader = async () => redirect("/app/plans");

export const action = async ({ request }) => {
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

  if (!hasActiveSubscription(billingCheck) || billingCheck.appSubscriptions.length === 0) {
    return redirect("/app/plans?billing_updated=1");
  }

  const subscription = billingCheck.appSubscriptions[0];
  await billing.cancel({
    subscriptionId: subscription.id,
    isTest: process.env.BILLING_TEST === "true",
    prorate: true,
  });

  return redirect("/app/plans?billing_updated=1");
};
