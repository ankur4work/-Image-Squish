import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { BRAND, getDisplayPlanName } from "../lib/brand";
import { getBillingStatusOrFree } from "../lib/billing.server";
import { authenticate, MONTHLY_PLAN, PRO_MONTHLY_PLAN } from "../shopify.server";
import { PersistentLink } from "./components/PersistentLink";

export async function loader({ request }) {
  const { billing, session } = await authenticate.admin(request);

  const billingCheck = await getBillingStatusOrFree({
    request,
    billing,
    session,
    plans: [MONTHLY_PLAN, PRO_MONTHLY_PLAN],
  });

  let activePlan = { name: "Free" };

  if (billingCheck.hasActivePayment && billingCheck.appSubscriptions.length > 0) {
    activePlan = { name: billingCheck.appSubscriptions[0].name };
  }

  return json({
    plan: activePlan,
    shop: session.shop,
  });
}

const planData = [
  {
    title: "Starter",
    price: "$0",
    cadence: "for setup",
    matches: "Free",
    action: "Current tier",
    url: null,
    accent: "#3f8f6b",
    surface: "linear-gradient(180deg, #f7fff8 0%, #eef8f0 100%)",
    pill: "#ccf2d8",
    summary: "A lightweight starting point for evaluating the workflow inside your store.",
    features: [
      "Preview the product-image workflow",
      "See how the studio fits inside Shopify admin",
      "Prepare your team before enabling paid automation",
    ],
  },
  {
    title: "Core",
    price: "$30",
    cadence: "per month",
    matches: "Core",
    action: "Move to Core",
    url: "/app/upgrade?plan=monthly",
    accent: "#145b5c",
    surface: "linear-gradient(180deg, #f4fbfb 0%, #e7f2f2 100%)",
    pill: "#cbe9e8",
    summary: "The everyday plan for merchants who want faster product pages and a cleaner operations loop.",
    features: [
      "Image compression inside the embedded app",
      "Faster media cleanup for active product catalogs",
      "A practical setup for growing stores",
    ],
  },
  {
    title: "Scale",
    price: "$150",
    cadence: "per month",
    matches: "Scale",
    action: "Upgrade to Scale",
    url: "/app/upgrade?plan=pro_monthly",
    accent: "#c7781a",
    surface: "linear-gradient(180deg, #fff9f1 0%, #f9eddb 100%)",
    pill: "#ffe1b8",
    summary: "The premium tier for teams that need compression plus visual protection across a larger catalog.",
    features: [
      "Everything in Core",
      "Watermark workflow with custom uploads",
      "Better fit for brand-led merchandising teams",
    ],
  },
];

const styles = {
  plansGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "20px",
    alignItems: "stretch",
  },
  planCard: {
    height: "100%",
    minHeight: "540px",
    borderRadius: "26px",
    padding: "28px",
    border: "1px solid rgba(15, 61, 62, 0.12)",
    boxShadow: "0 18px 42px rgba(15, 61, 62, 0.08)",
    display: "flex",
    flexDirection: "column",
  },
  planHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
  },
  summary: {
    minHeight: "88px",
    marginTop: "10px",
  },
  priceRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: "10px",
    minHeight: "92px",
    marginTop: "18px",
  },
  features: {
    display: "grid",
    gap: "14px",
    marginTop: "18px",
    flex: 1,
    alignContent: "start",
  },
  featureItem: {
    padding: "12px 14px",
    borderRadius: "16px",
    background: "rgba(255, 255, 255, 0.65)",
    fontSize: "15px",
    lineHeight: 1.45,
    wordBreak: "break-word",
  },
  footer: {
    marginTop: "24px",
  },
};

export default function PricingPage() {
  const { plan } = useLoaderData();
  const activePlanName = plan.name;
  const activeDisplayName = getDisplayPlanName(activePlanName);

  return (
    <Page>
      <TitleBar title={`${BRAND.name} Plans`} />
      <BlockStack gap="500">
        <Box
          padding="600"
          borderRadius="300"
          style={{
            background: "linear-gradient(135deg, #f3ead8 0%, #fff8ef 48%, #dcefea 100%)",
            border: "1px solid rgba(15, 61, 62, 0.12)",
          }}
        >
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Badge tone="info">Pricing</Badge>
              <Text as="p" variant="bodySm">
                Active tier: {activeDisplayName}
              </Text>
            </InlineStack>
            <Text as="h1" variant="heading2xl">
              Choose the version of {BRAND.shortName} that fits your catalog.
            </Text>
            <Text as="p" variant="bodyLg">
              The refreshed plans page is positioned less like a template checkout and more like a
              product decision. It keeps the commercial tiers clear while still feeling branded.
            </Text>
          </BlockStack>
        </Box>

        <div style={styles.plansGrid}>
          {planData.map((planItem) => {
            const isActive =
              planItem.matches === activePlanName ||
              (planItem.matches === "Free" && activePlanName === "Free");

            return (
              <div
                key={planItem.title}
                style={{
                  ...styles.planCard,
                  background: planItem.surface,
                  borderColor: isActive ? planItem.accent : "rgba(15, 61, 62, 0.12)",
                  boxShadow: isActive
                    ? `0 22px 48px ${planItem.accent}22`
                    : "0 18px 42px rgba(15, 61, 62, 0.08)",
                }}
              >
                <div style={styles.planHeader}>
                  <div>
                    <Text as="h2" variant="headingXl">
                      {planItem.title}
                    </Text>
                    <div style={styles.summary}>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        {planItem.summary}
                      </Text>
                    </div>
                  </div>
                  {isActive ? <Badge tone="success">Active</Badge> : null}
                </div>

                <div
                  style={{
                    display: "inline-flex",
                    alignSelf: "flex-start",
                    padding: "8px 12px",
                    borderRadius: "999px",
                    background: planItem.pill,
                    color: planItem.accent,
                    fontWeight: 700,
                    fontSize: "12px",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {planItem.title} Plan
                </div>

                <div style={styles.priceRow}>
                  <Text as="p" variant="heading2xl">
                    {planItem.price}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {planItem.cadence}
                  </Text>
                </div>

                <div style={styles.features}>
                  {planItem.features.map((feature) => (
                    <div
                      key={feature}
                      style={{
                        ...styles.featureItem,
                        borderLeft: `4px solid ${planItem.accent}`,
                      }}
                    >
                      {feature}
                    </div>
                  ))}
                </div>

                <div style={styles.footer}>
                  {isActive ? (
                    <Button fullWidth disabled>
                      {planItem.action}
                    </Button>
                  ) : planItem.url ? (
                    <PersistentLink to={planItem.url}>
                      <Button fullWidth variant="primary">
                        {planItem.action}
                      </Button>
                    </PersistentLink>
                  ) : (
                    <Button fullWidth disabled>
                      {planItem.action}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Need to step back from a paid tier?
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                You can cancel your current paid subscription and return to a lighter setup from
                the account tools below.
              </Text>
            </BlockStack>
            <PersistentLink to="/app/cancel">
              <Button tone="critical">Cancel current plan</Button>
            </PersistentLink>
          </InlineStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
