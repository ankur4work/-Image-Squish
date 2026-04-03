import { authenticate, MONTHLY_PLAN, PRO_MONTHLY_PLAN, FREE_PLAN } from "../shopify.server";
import { isBillingTestMode } from "../lib/brand";
import { requireBillingSafely } from "../lib/billing.server";

export const loader = async ({ request }) => {
  const { billing, session, redirect } = await authenticate.admin(request);
  const billingCheck = await requireBillingSafely({
    request,
    billing,
    session,
    plans: [MONTHLY_PLAN, PRO_MONTHLY_PLAN, FREE_PLAN],
    onFailure: async () => billing.request({ plan: FREE_PLAN }),
  });

  const subscription = billingCheck.appSubscriptions[0];
  await billing.cancel({
    subscriptionId: subscription.id,
    isTest: isBillingTestMode(),
    prorate: true,
  });

  return redirect("/app");
};
