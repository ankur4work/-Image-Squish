import {
  Badge,
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
          padding="600"
          borderRadius="300"
          background="bg-fill-brand"
          style={{
            background: "linear-gradient(135deg, #0f3d3e 0%, #145b5c 48%, #e4a146 100%)",
            color: "#f7f2e8",
          }}
        >
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Badge tone="attention">New identity</Badge>
              <Text as="p" variant="bodySm">
                Active plan: {activePlan}
              </Text>
            </InlineStack>
            <BlockStack gap="200">
              <Text as="h1" variant="heading2xl">
                Turn raw product imagery into retail-ready assets.
              </Text>
              <Text as="p" variant="bodyLg">
                {BRAND.name} gives your team a tighter image workflow for Shopify: lighter files,
                clearer branding, and a cleaner handoff from ops to merchandising.
              </Text>
            </BlockStack>
            <InlineStack gap="300">
              <PersistentLink to="/app">
                <Button variant="primary">View plans</Button>
              </PersistentLink>
              <PersistentLink to={activePlan === "Scale" ? "/app/html" : "/app"}>
                <Button>{activePlan === "Scale" ? "Open studio" : "Review options"}</Button>
              </PersistentLink>
            </InlineStack>
          </BlockStack>
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
                Brand direction
              </Text>
              <Text as="p" variant="bodyMd">
                The refreshed UI leans into a studio-style presentation: warmer tones, editorial
                copy, and a more premium merchant-facing tone.
              </Text>
              <Text as="p" variant="bodyMd">
                That makes the app feel less like a generic utility and more like a focused product
                for creative operations.
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
