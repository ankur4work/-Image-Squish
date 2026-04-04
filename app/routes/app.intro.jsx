import {
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { BRAND, getDisplayPlanName } from "../lib/brand";
import { getBillingStatusOrFree } from "../lib/billing.server";
import { PersistentLink } from "./components/PersistentLink";

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  const { shop } = session;

  const monthlyPlan = "Core";
  const proMonthlyPlan = "Scale";

  const billingCheck = await getBillingStatusOrFree({
    request,
    billing,
    session,
    plans: [monthlyPlan, proMonthlyPlan],
  });

  let activePlan = "Free";

  if (billingCheck.hasActivePayment && billingCheck.appSubscriptions.length > 0) {
    activePlan = billingCheck.appSubscriptions[0].name;
  }

  return json({
    activePlan: getDisplayPlanName(activePlan),
  });
};

const workflowPoints = [
  "Compress product media before it slows down collection pages.",
  "Apply a store watermark when you need assets to stay on-brand off platform.",
  "Handle image updates directly inside Shopify without hopping between tools.",
];

const detailCards = [
  {
    eyebrow: "Fast setup",
    title: "Start with your existing catalog",
    body: "PixelMint Studio works with the products already in your store, so teams can begin polishing images on day one.",
  },
  {
    eyebrow: "Merchant friendly",
    title: "Built for repeatable edits",
    body: "The interface keeps the workflow lightweight so operators can batch through product cards without losing context.",
  },
  {
    eyebrow: "Brand safe",
    title: "Keep creative control",
    body: "Compression and watermarking stay inside your admin workflow, which makes approvals and QA easier to manage.",
  },
];

export default function IntroPage() {
  const { activePlan } = useLoaderData();

  return (
    <Page>
      <TitleBar title={BRAND.name} />
      <BlockStack gap="500">
        <Box
          padding="700"
          borderRadius="300"
          background="bg-fill-brand"
          style={{
            background: "linear-gradient(135deg, #0f3d3e 0%, #145b5c 48%, #e4a146 100%)",
            color: "#f7f2e8",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 0.9fr)",
              gap: "28px",
              alignItems: "stretch",
            }}
          >
            <BlockStack gap="400">
              <div
                style={{
                  display: "inline-flex",
                  alignSelf: "flex-start",
                  padding: "8px 14px",
                  borderRadius: "999px",
                  background: "rgba(255, 255, 255, 0.14)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                }}
              >
                <Text as="p" variant="bodySm">
                  Overview
                </Text>
              </div>

              <BlockStack gap="300">
                <div style={{ maxWidth: "980px" }}>
                  <Text as="h1" variant="heading2xl">
                    Turn raw product imagery into retail-ready assets.
                  </Text>
                </div>
                <div style={{ maxWidth: "760px" }}>
                  <Text as="p" variant="bodyLg">
                    {BRAND.name} gives your team a tighter image workflow for Shopify: lighter
                    files, clearer branding, and a cleaner handoff from ops to merchandising.
                  </Text>
                </div>
              </BlockStack>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "14px",
                }}
              >
                <PersistentLink to="/app">
                  <Button variant="primary">View plans</Button>
                </PersistentLink>
                <PersistentLink to="/app/html">
                  <Button>{activePlan === "Scale" ? "Open studio" : "Explore studio"}</Button>
                </PersistentLink>
              </div>
            </BlockStack>

            <div
              style={{
                borderRadius: "24px",
                padding: "24px",
                background: "rgba(255, 255, 255, 0.12)",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                display: "grid",
                gap: "18px",
                alignContent: "start",
              }}
            >
              <div>
                <Text as="p" variant="bodySm" tone="subdued">
                  Active plan
                </Text>
                <div style={{ marginTop: "8px" }}>
                  <Text as="h2" variant="headingLg">
                    {activePlan}
                  </Text>
                </div>
              </div>
              <div>
                <Text as="p" variant="bodySm" tone="subdued">
                  Access
                </Text>
                <div style={{ marginTop: "8px" }}>
                  <Text as="p" variant="bodyMd">
                    Starter opens the workspace preview, Core adds optimization, and Scale adds
                    watermarking.
                  </Text>
                </div>
              </div>
            </div>
          </div>
        </Box>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingLg">
                What the app does
              </Text>
              <List type="bullet">
                {workflowPoints.map((point) => (
                  <List.Item key={point}>{point}</List.Item>
                ))}
              </List>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingLg">
                How it fits into Shopify
              </Text>
              <Text as="p" variant="bodyMd">
                PixelMint Studio runs inside Shopify admin so merchants can manage image
                compression and watermarking without leaving their existing workflow.
              </Text>
              <Text as="p" variant="bodyMd">
                This keeps product media tasks close to the catalog and reduces back-and-forth
                between separate tools.
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          {detailCards.map((card) => (
            <Card key={card.title}>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  {card.eyebrow}
                </Text>
                <Text as="h3" variant="headingMd">
                  {card.title}
                </Text>
                <Text as="p" variant="bodyMd">
                  {card.body}
                </Text>
              </BlockStack>
            </Card>
          ))}
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
