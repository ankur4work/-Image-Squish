import { authenticate, MONTHLY_PLAN, PRO_MONTHLY_PLAN } from "../shopify.server";
import { isBillingTestMode } from "../lib/brand";
import { getBillingStatusOrFree } from "../lib/billing.server";

export const loader = async ({ request }) => {
  const { billing, session, redirect } = await authenticate.admin(request);
  const billingCheck = await getBillingStatusOrFree({
    request,
    billing,
    session,
    plans: [MONTHLY_PLAN, PRO_MONTHLY_PLAN],
  });

  if (!billingCheck.hasActivePayment || billingCheck.appSubscriptions.length === 0) {
    return redirect("/app");
  }

  const subscription = billingCheck.appSubscriptions[0];
  await billing.cancel({
    subscriptionId: subscription.id,
    isTest: isBillingTestMode(),
    prorate: true,
  });

  return redirect("/app");
};
