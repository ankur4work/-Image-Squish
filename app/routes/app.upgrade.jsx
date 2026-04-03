import { authenticate, MONTHLY_PLAN, PRO_MONTHLY_PLAN } from "../shopify.server";
import { getAppReturnUrl, isBillingTestMode } from "../lib/brand";
import { requestBillingSafely } from "../lib/billing.server";

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  const { shop } = session;

  const url = new URL(request.url);
  const selectedPlan = url.searchParams.get("plan");

  let planToUse = MONTHLY_PLAN;
  if (selectedPlan === "pro_monthly") {
    planToUse = PRO_MONTHLY_PLAN;
  }

  try {
    await requestBillingSafely({
      request,
      billing,
      session,
      plan: planToUse,
      isTest: isBillingTestMode(),
      returnUrl: getAppReturnUrl({ request, shopDomain: shop }),
    });
  } catch (error) {
    console.error("Upgrade error:", error);
    throw error;
  }
};
