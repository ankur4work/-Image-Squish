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
import { Form, useLoaderData, useNavigation, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import { BRAND } from "../lib/brand";
import { PersistentLink } from "./components/PersistentLink";

export async function loader({ request }) {
  const [
    {
      authenticate,
      PLAN_NAME,
      PLAN_AMOUNT,
      ANNUAL_PLAN_NAME,
      ANNUAL_PLAN_AMOUNT,
      BILLING_PLANS,
      billingEnabled,
    },
    { getUsageEntitlement },
  ] = await Promise.all([import("../shopify.server"), import("../lib/billing.server")]);

  if (!billingEnabled) {
    return redirect("/app");
  }

  const { billing, session } = await authenticate.admin(request);
  const entitlement = await getUsageEntitlement({
    request,
    billing,
    session,
    plans: BILLING_PLANS,
  });

  return json({
    hasPaidPlan: entitlement.hasPaidPlan,
    activePlanName: entitlement.activePlanName,
    freeUsageCount: entitlement.freeUsageCount,
    freeUsageRemaining: entitlement.freeUsageRemaining,
    freeUsageLimit: entitlement.freeUsageLimit,
    planName: PLAN_NAME,
    planAmount: PLAN_AMOUNT,
    annualPlanName: ANNUAL_PLAN_NAME,
    annualPlanAmount: ANNUAL_PLAN_AMOUNT,
  });
}

function PlanCard({ label, price, cadence, badge, features, isCurrent, canSubscribe, upgradeTo, ctaLabel }) {
  return (
    <div
      style={{
        flex: "1 1 280px",
        borderRadius: "16px",
        padding: "36px 28px",
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
        {label}
      </p>
      <p style={{ margin: "0 0 4px", fontSize: "48px", fontWeight: 700, lineHeight: 1 }}>
        ${price}
      </p>
      <p style={{ margin: "0 0 8px", fontSize: "15px", opacity: 0.8 }}>{cadence}</p>
      <p style={{ margin: "0 0 20px", fontSize: "13px", minHeight: "18px", fontWeight: 600, opacity: 0.95 }}>
        {badge || ""}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "320px", margin: "0 auto 28px", textAlign: "left" }}>
        {features.map((f) => (
          <div key={f} style={{ display: "flex", gap: "8px", fontSize: "15px" }}>
            <span style={{ flexShrink: 0 }}>&#10003;</span>
            {f}
          </div>
        ))}
      </div>

      {isCurrent ? (
        <Button disabled>You're on {label}</Button>
      ) : (
        <PersistentLink to={upgradeTo}>
          <Button variant="primary" size="large" disabled={!canSubscribe}>
            {ctaLabel}
          </Button>
        </PersistentLink>
      )}
    </div>
  );
}

export default function PlansPage() {
  const {
    hasPaidPlan,
    activePlanName,
    freeUsageCount,
    freeUsageRemaining,
    freeUsageLimit,
    planName,
    planAmount,
    annualPlanName,
    annualPlanAmount,
  } = useLoaderData();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const isCanceling = navigation.state === "submitting" && navigation.formAction?.endsWith("/app/cancel");

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("billing_updated") === "1") {
      revalidator.revalidate();
    }
  }, [revalidator]);

  const planFeatures = [
    `First ${freeUsageLimit} image operations free`,
    "One-click image compression",
    "Custom watermark uploads",
    "Unlimited product processing after upgrade",
  ];
  const annualSavings = Math.max(0, planAmount * 12 - annualPlanAmount);

  return (
    <Page>
      <TitleBar title={`${BRAND.name} — Plan`} />
      <BlockStack gap="500">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
          <PlanCard
            label={planName}
            price={planAmount}
            cadence="per month"
            badge="Billed every 30 days"
            features={planFeatures}
            isCurrent={hasPaidPlan && activePlanName !== annualPlanName}
            canSubscribe={!hasPaidPlan}
            upgradeTo="/app/upgrade?plan=monthly"
            ctaLabel={`Upgrade — $${planAmount}/mo`}
          />
          <PlanCard
            label={annualPlanName}
            price={annualPlanAmount}
            cadence="per year"
            badge={annualSavings > 0 ? `Save $${annualSavings} vs monthly` : "Billed once a year"}
            features={planFeatures}
            isCurrent={hasPaidPlan && activePlanName === annualPlanName}
            canSubscribe={!hasPaidPlan}
            upgradeTo="/app/upgrade?plan=annual"
            ctaLabel={`Upgrade — $${annualPlanAmount}/yr`}
          />
        </div>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              {hasPaidPlan ? "Unlimited access is active" : "Free plan status"}
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              {hasPaidPlan
                ? "Your paid plan includes unlimited image processing."
                : `${freeUsageCount} of ${freeUsageLimit} free image operations used. ${freeUsageRemaining} remaining before upgrade is required.`}
            </Text>
          </BlockStack>
        </Card>

        {hasPaidPlan ? (
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Need to cancel?</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  You'll return to the free tier with your existing usage count preserved.
                </Text>
              </BlockStack>
              <Form method="post" action="/app/cancel">
                <Button submit tone="critical" loading={isCanceling} disabled={isCanceling}>
                  Cancel plan
                </Button>
              </Form>
            </InlineStack>
          </Card>
        ) : null}
      </BlockStack>
    </Page>
  );
}
