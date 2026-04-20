import {
  BlockStack,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { BRAND } from "../lib/brand";
import { getBillingStatusOrFree } from "../lib/billing.server";
import { authenticate, PLAN_NAME, PLAN_AMOUNT, billingEnabled } from "../shopify.server";
import { PersistentLink } from "./components/PersistentLink";

export async function loader({ request }) {
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

  const hasPaidPlan =
    billingCheck.hasActivePayment && billingCheck.appSubscriptions.length > 0;

  return json({
    hasPaidPlan,
    planName: PLAN_NAME,
    planAmount: PLAN_AMOUNT,
  });
}

export default function PlansPage() {
  const { hasPaidPlan, planName, planAmount } = useLoaderData();

  return (
    <Page>
      <TitleBar title={`${BRAND.name} — Plan`} />
      <BlockStack gap="500">
        <div
          style={{
            borderRadius: "16px",
            padding: "40px 36px",
            background: "linear-gradient(135deg, #312E81 0%, #4F46E5 50%, #6366F1 100%)",
            color: "#fff",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            {planName} plan
          </p>
          <p style={{ margin: "0 0 4px", fontSize: "48px", fontWeight: 700, lineHeight: 1 }}>
            ${planAmount}
          </p>
          <p style={{ margin: "0 0 24px", fontSize: "15px", opacity: 0.8 }}>
            per month
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "320px", margin: "0 auto 28px", textAlign: "left" }}>
            {[
              "One-click image compression",
              "Custom watermark uploads",
              "Unlimited product processing",
              "Works inside Shopify admin",
            ].map((f) => (
              <div key={f} style={{ display: "flex", gap: "8px", fontSize: "15px" }}>
                <span style={{ flexShrink: 0 }}>&#10003;</span>
                {f}
              </div>
            ))}
          </div>

          {hasPaidPlan ? (
            <Button disabled>You're on {planName}</Button>
          ) : (
            <PersistentLink to="/app/upgrade">
              <Button variant="primary" size="large">
                Subscribe — ${planAmount}/mo
              </Button>
            </PersistentLink>
          )}
        </div>

        {hasPaidPlan ? (
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Need to cancel?</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  You'll return to the free tier with limited access.
                </Text>
              </BlockStack>
              <PersistentLink to="/app/cancel">
                <Button tone="critical">Cancel plan</Button>
              </PersistentLink>
            </InlineStack>
          </Card>
        ) : null}
      </BlockStack>
    </Page>
  );
}
