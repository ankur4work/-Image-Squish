import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
import { TitleBar } from "@shopify/app-bridge-react";
import sharp from "sharp";
import FormData from "form-data";
import path from "path";
import fs from "fs";
import { BRAND } from "../lib/brand";
import { PersistentLink } from "./components/PersistentLink";

const OPTIMIZED_ALT = "Image Squish optimized image";
const WATERMARKED_ALT = "Image Squish watermarked image";
const WATERMARK_UPLOAD_DIR = path.resolve("public/uploads/watermarks");
const ORIGINAL_BACKUP_DIR = path.resolve("public/uploads/originals");

const productQuery = `
{
  products(first: 200) {
    edges {
      node {
        id
        title
        media(first: 1) {
          edges {
            node {
              ... on MediaImage {
                id
                image {
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  }
}`;

const deleteMediaMutation = `
mutation productDeleteMedia($mediaIds: [ID!]!, $productId: ID!) {
  productDeleteMedia(mediaIds: $mediaIds, productId: $productId) {
    deletedMediaIds
    mediaUserErrors {
      message
    }
  }
}`;

const uploadMediaMutation = `
mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
  productCreateMedia(media: $media, productId: $productId) {
    media {
      id
      alt
      mediaContentType
      status
    }
    mediaUserErrors {
      message
    }
  }
}`;

function getSavedWatermarkPaths(shop) {
  const safeShopName = shop.replace(/[^a-z0-9.-]/gi, "_");
  return {
    imagePath: path.join(WATERMARK_UPLOAD_DIR, `${safeShopName}.png`),
    metaPath: path.join(WATERMARK_UPLOAD_DIR, `${safeShopName}.json`),
    publicPath: `/uploads/watermarks/${safeShopName}.png`,
  };
}

function readSavedWatermarkInfo(shop) {
  const { imagePath, metaPath, publicPath } = getSavedWatermarkPaths(shop);

  if (!fs.existsSync(imagePath)) {
    return null;
  }

  let originalName = "Saved watermark.png";

  if (fs.existsSync(metaPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (metadata?.originalName) {
        originalName = metadata.originalName;
      }
    } catch {
      // Fall back to a generic label if metadata is unreadable.
    }
  }

  return {
    name: originalName,
    publicPath,
    imagePath,
    metaPath,
  };
}

async function saveShopWatermark({ shop, sourceBuffer, originalName }) {
  const { imagePath, metaPath } = getSavedWatermarkPaths(shop);
  fs.mkdirSync(WATERMARK_UPLOAD_DIR, { recursive: true });

  const resizedWatermark = await sharp(sourceBuffer).resize(100).png().toBuffer();
  await fs.promises.writeFile(imagePath, resizedWatermark);
  await fs.promises.writeFile(
    metaPath,
    JSON.stringify(
      {
        originalName,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  return resizedWatermark;
}

function getOriginalBackupPaths(shop, productId) {
  const safeShopName = shop.replace(/[^a-z0-9.-]/gi, "_");
  const safeProductId = String(productId).replace(/[^a-z0-9]/gi, "_");
  const dir = path.join(ORIGINAL_BACKUP_DIR, safeShopName);
  return {
    dir,
    imagePath: path.join(dir, `${safeProductId}.bin`),
    metaPath: path.join(dir, `${safeProductId}.json`),
  };
}

function readOriginalBackup(shop, productId) {
  const { imagePath, metaPath } = getOriginalBackupPaths(shop, productId);

  if (!fs.existsSync(imagePath)) {
    return null;
  }

  let metadata = { mimeType: "image/jpeg", fileExtension: "jpg" };

  if (fs.existsSync(metaPath)) {
    try {
      metadata = { ...metadata, ...JSON.parse(fs.readFileSync(metaPath, "utf8")) };
    } catch {
      // Fall back to defaults if metadata is unreadable.
    }
  }

  return { imagePath, metaPath, ...metadata };
}

// Store the untouched original image the first time a product is processed so the
// merchant can always restore it (e.g. remove a watermark they no longer want).
async function saveOriginalBackup({ shop, productId, buffer, mimeType, fileExtension }) {
  const { dir, imagePath, metaPath } = getOriginalBackupPaths(shop, productId);
  fs.mkdirSync(dir, { recursive: true });
  await fs.promises.writeFile(imagePath, buffer);
  await fs.promises.writeFile(
    metaPath,
    JSON.stringify(
      {
        mimeType,
        fileExtension,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function deleteOriginalBackup(shop, productId) {
  const { imagePath, metaPath } = getOriginalBackupPaths(shop, productId);
  try {
    fs.unlinkSync(imagePath);
  } catch {
    // Ignore if it is already gone.
  }
  try {
    fs.unlinkSync(metaPath);
  } catch {
    // Ignore if it is already gone.
  }
}

function getMediaProcessingState(image) {
  const altText = image?.altText || "";

  if (altText === WATERMARKED_ALT) {
    return "watermarked";
  }

  if (altText === OPTIMIZED_ALT) {
    return "optimized";
  }

  return "original";
}

const stagedUploadsCreateMutation = `
mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets {
      url
      resourceUrl
      parameters {
        name
        value
      }
    }
    userErrors {
      field
      message
    }
  }
}`;

export const loader = async ({ request }) => {
  const [{ apiVersion, authenticate, billingEnabled, PLAN_NAME }, { getUsageEntitlement }] =
    await Promise.all([import("../shopify.server"), import("../lib/billing.server")]);
  const { billing, session } = await authenticate.admin(request);
  const { shop, accessToken } = session;
  const savedWatermark = readSavedWatermarkInfo(shop);

  const entitlement = billingEnabled
    ? await getUsageEntitlement({
        request,
        billing,
        session,
        plans: [PLAN_NAME],
      })
    : {
        hasPaidPlan: false,
        freeUsageCount: 0,
        freeUsageLimit: 0,
        freeUsageRemaining: 0,
        quotaExceeded: false,
        canProcess: true,
      };

  if (!accessToken) {
    return json({
      products: [],
      shop,
      savedWatermarkName: savedWatermark?.name || null,
      ...entitlement,
    });
  }

  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query: productQuery }),
  });

  const result = await response.json();
  const products = result?.data?.products?.edges || [];

  const restorableProductIds = products
    .filter(({ node }) => readOriginalBackup(shop, node.id))
    .map(({ node }) => node.id);

  return json({
    products,
    shop,
    savedWatermarkName: savedWatermark?.name || null,
    restorableProductIds,
    ...entitlement,
  });
};

export const action = async ({ request }) => {
  try {
    const [shopifyServer, billingServer] = await Promise.all([
      import("../shopify.server"),
      import("../lib/billing.server"),
    ]);
    const { apiVersion, authenticate, billingEnabled, PLAN_NAME } = shopifyServer;
    const { getUpgradeMessage, getUsageEntitlement, incrementFreeUsage } = billingServer;
    const { billing, session } = await authenticate.admin(request);
    const requestFormData = await request.formData();
    const { mediaId, imageSrc, type, productId } = Object.fromEntries(
      requestFormData.entries(),
    );
    const watermarkFile = requestFormData.get("watermark");

    if (!mediaId || !imageSrc || !type || !productId) {
      throw new Error("Missing required fields.");
    }

    const entitlement = billingEnabled
      ? await getUsageEntitlement({
          request,
          billing,
          session,
          plans: [PLAN_NAME],
        })
      : {
          hasPaidPlan: false,
          freeUsageCount: 0,
          freeUsageLimit: 0,
          freeUsageRemaining: 0,
          quotaExceeded: false,
          canProcess: true,
        };

    if (!entitlement.canProcess) {
      return json(
        {
          success: false,
          message: getUpgradeMessage(entitlement.freeUsageLimit),
        },
        { status: 403 },
      );
    }

    const { shop, accessToken } = session;

    if (!accessToken) {
      throw new Error("Access token not found.");
    }

    const imageUrl = imageSrc.split("?")[0];
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const originalSizeKB = (imageBuffer.length / 1024).toFixed(2);
    const sourceContentType = imageResponse.headers.get("content-type") || "";

    let processedBuffer;
    let mimeType = "image/jpeg";
    let fileExtension = "jpg";
    let outputAlt = "";
    let successMessage = "Image updated successfully.";
    let reportSizes = true;

    // Preserve the pristine original the first time we modify a product's image so
    // the merchant can restore it later (e.g. remove a watermark they dislike).
    if (type === "compress" || type === "watermark") {
      if (!readOriginalBackup(shop, productId)) {
        const originalExtension = sourceContentType.includes("png")
          ? "png"
          : sourceContentType.includes("webp")
          ? "webp"
          : "jpg";
        await saveOriginalBackup({
          shop,
          productId,
          buffer: imageBuffer,
          mimeType: sourceContentType || "image/jpeg",
          fileExtension: originalExtension,
        });
      }
    }

    if (type === "compress") {
      processedBuffer = await sharp(imageBuffer)
        .jpeg({ quality: 50, progressive: true })
        .toBuffer();
      outputAlt = OPTIMIZED_ALT;
      successMessage = "Image optimized successfully.";
    } else if (type === "watermark") {
      let watermarkBuffer;

      if (watermarkFile && typeof watermarkFile === "object" && watermarkFile.size > 0) {
        const uploadedWatermarkBuffer = Buffer.from(await watermarkFile.arrayBuffer());
        watermarkBuffer = await saveShopWatermark({
          shop,
          sourceBuffer: uploadedWatermarkBuffer,
          originalName: watermarkFile.name || "Custom watermark.png",
        });
      } else {
        const savedWatermark = readSavedWatermarkInfo(shop);

        if (savedWatermark?.imagePath && fs.existsSync(savedWatermark.imagePath)) {
          watermarkBuffer = await fs.promises.readFile(savedWatermark.imagePath);
        } else {
          const defaultPath = path.resolve("public/watermark.png");
          if (!fs.existsSync(defaultPath)) {
            throw new Error("Default watermark missing.");
          }
          watermarkBuffer = await sharp(defaultPath).resize(100).png().toBuffer();
        }
      }

      processedBuffer = await sharp(imageBuffer)
        .composite([{ input: watermarkBuffer, top: 14, left: 14 }])
        .png()
        .toBuffer();
      mimeType = "image/png";
      fileExtension = "png";
      outputAlt = WATERMARKED_ALT;
      successMessage = "Watermark applied successfully.";
    } else if (type === "remove") {
      const backup = readOriginalBackup(shop, productId);

      if (!backup) {
        throw new Error(
          "No saved original found for this product. Watermarks can only be removed from images that were processed with Image Squish.",
        );
      }

      processedBuffer = await fs.promises.readFile(backup.imagePath);
      mimeType = backup.mimeType || "image/jpeg";
      fileExtension = backup.fileExtension || "jpg";
      outputAlt = "";
      successMessage = "Watermark removed. Original image restored.";
      reportSizes = false;
    } else {
      throw new Error("Unknown processing type.");
    }

    const processedSizeKB = (processedBuffer.length / 1024).toFixed(2);
    const filename = `imagesquish-${Date.now()}.${fileExtension}`;

    const stagedUploadResponse = await fetch(
      `https://${shop}/admin/api/${apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: stagedUploadsCreateMutation,
          variables: {
            input: [
              {
                resource: "PRODUCT_IMAGE",
                filename,
                mimeType,
                httpMethod: "POST",
              },
            ],
          },
        }),
      },
    );

    const stagedUploadResult = await stagedUploadResponse.json();
    const stagedUploadErrors = stagedUploadResult?.data?.stagedUploadsCreate?.userErrors;

    if (stagedUploadErrors?.length) {
      throw new Error(
        `Staged upload failed: ${stagedUploadErrors.map((error) => error.message).join(", ")}`,
      );
    }

    const stagedTarget = stagedUploadResult?.data?.stagedUploadsCreate?.stagedTargets?.[0];

    if (!stagedTarget) {
      throw new Error("Failed to receive a staged upload target.");
    }

    const uploadFormData = new FormData();
    stagedTarget.parameters.forEach(({ name, value }) => {
      uploadFormData.append(name, value);
    });
    uploadFormData.append("file", processedBuffer, {
      filename,
      contentType: mimeType,
    });

    const uploadBody = uploadFormData.getBuffer();
    const uploadHeaders = uploadFormData.getHeaders();
    uploadHeaders["content-length"] = uploadBody.length;

    const cdnUploadResponse = await fetch(stagedTarget.url, {
      method: "POST",
      body: uploadBody,
      headers: uploadHeaders,
    });

    if (!cdnUploadResponse.ok) {
      const cdnBody = await cdnUploadResponse.text();
      console.error("CDN upload error:", cdnUploadResponse.status, cdnBody);
      throw new Error(`CDN upload failed with status ${cdnUploadResponse.status}.`);
    }

    const deleteResponse = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: deleteMediaMutation,
        variables: { mediaIds: [mediaId], productId },
      }),
    });

    const deleteResult = await deleteResponse.json();
    const deleteErrors = deleteResult?.data?.productDeleteMedia?.mediaUserErrors;

    if (deleteErrors?.length) {
      throw new Error(`Delete failed: ${deleteErrors.map((error) => error.message).join(", ")}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const uploadResponse = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: uploadMediaMutation,
        variables: {
          productId,
          media: [
            {
              originalSource: stagedTarget.resourceUrl,
              mediaContentType: "IMAGE",
              alt: outputAlt,
            },
          ],
        },
      }),
    });

    const uploadResult = await uploadResponse.json();
    const uploadErrors = uploadResult?.data?.productCreateMedia?.mediaUserErrors;

    if (uploadErrors?.length) {
      throw new Error(`Upload failed: ${uploadErrors.map((error) => error.message).join(", ")}`);
    }

    const newMediaId = uploadResult?.data?.productCreateMedia?.media?.[0]?.id;

    // The original has been restored, so drop the backup and let the merchant
    // start fresh if they process this product again.
    if (type === "remove") {
      deleteOriginalBackup(shop, productId);
    }

    // Restoring the original does not consume a free-plan credit.
    if (billingEnabled && !entitlement.hasPaidPlan && type !== "remove") {
      await incrementFreeUsage(shop);
    }

    return json({
      success: true,
      type,
      message: successMessage,
      originalSizeKB: reportSizes ? originalSizeKB : null,
      processedSizeKB: reportSizes ? processedSizeKB : null,
      productId,
      newImageUrl: stagedTarget.resourceUrl,
      newMediaId,
    });
  } catch (error) {
    return json(
      {
        success: false,
        message: error.message || "An unexpected error occurred.",
      },
      { status: 500 },
    );
  }
};

/* ── Styles ── */

const styles = {
  page: {
    minHeight: "100vh",
    padding: "24px",
    background: "#F8FAFC",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#1E293B",
  },
  shell: {
    maxWidth: "1280px",
    margin: "0 auto",
  },
  hero: {
    borderRadius: "16px",
    padding: "32px",
    background: "linear-gradient(135deg, #312E81 0%, #4F46E5 50%, #6366F1 100%)",
    color: "#fff",
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "24px",
    alignItems: "center",
  },
  badge: {
    display: "inline-block",
    borderRadius: "6px",
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    background: "rgba(255,255,255,0.15)",
    marginBottom: "12px",
  },
  heroTitle: {
    margin: "0 0 8px",
    fontSize: "28px",
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
  },
  heroBody: {
    margin: 0,
    fontSize: "15px",
    lineHeight: 1.6,
    opacity: 0.85,
    maxWidth: "520px",
  },
  statsRow: {
    display: "flex",
    gap: "12px",
    marginTop: "20px",
  },
  stat: {
    padding: "12px 16px",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.1)",
    minWidth: "120px",
  },
  statNumber: {
    margin: 0,
    fontSize: "22px",
    fontWeight: 700,
  },
  statLabel: {
    margin: "4px 0 0",
    fontSize: "12px",
    opacity: 0.7,
  },
  sidePanel: {
    borderRadius: "12px",
    padding: "20px",
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.12)",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    minWidth: "220px",
  },
  sideLabel: {
    margin: 0,
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    opacity: 0.6,
  },
  sideValue: {
    margin: "4px 0 0",
    fontSize: "16px",
    fontWeight: 600,
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "280px 1fr",
    gap: "20px",
    marginTop: "20px",
  },
  sidebar: {
    borderRadius: "14px",
    padding: "20px",
    background: "#fff",
    border: "1px solid #E2E8F0",
  },
  sidebarTitle: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 600,
    color: "#1E293B",
  },
  sidebarBody: {
    margin: "8px 0 0",
    fontSize: "13px",
    lineHeight: 1.6,
    color: "#64748B",
  },
  uploadField: {
    marginTop: "16px",
    padding: "16px",
    borderRadius: "10px",
    border: "1.5px dashed #CBD5E1",
    background: "#F8FAFC",
    cursor: "pointer",
    display: "block",
    transition: "border-color 150ms ease",
  },
  uploadName: {
    marginTop: "10px",
    padding: "8px 12px",
    borderRadius: "8px",
    background: "#EEF2FF",
    color: "#4F46E5",
    fontSize: "13px",
    fontWeight: 600,
  },
  noteList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginTop: "16px",
  },
  noteItem: {
    padding: "10px 12px",
    borderRadius: "8px",
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    fontSize: "13px",
    lineHeight: 1.5,
    color: "#64748B",
  },
  banner: {
    marginBottom: "16px",
    borderRadius: "10px",
    padding: "14px 16px",
  },
  productGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "16px",
  },
  productCard: {
    overflow: "hidden",
    borderRadius: "12px",
    background: "#fff",
    border: "1px solid #E2E8F0",
    transition: "box-shadow 150ms ease",
  },
  mediaFrame: {
    height: "220px",
    background: "#F1F5F9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
  },
  mediaImage: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    borderRadius: "8px",
  },
  cardBody: {
    padding: "16px",
  },
  cardTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "center",
  },
  productTitle: {
    margin: 0,
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: 1.3,
    color: "#1E293B",
  },
  statusPill: {
    flexShrink: 0,
    borderRadius: "6px",
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  actionRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    marginTop: "12px",
  },
  button: {
    border: "none",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 150ms ease",
  },
  emptyState: {
    borderRadius: "14px",
    padding: "48px",
    textAlign: "center",
    background: "#fff",
    border: "1px solid #E2E8F0",
  },
};

function SummaryStat({ number, label }) {
  return (
    <div style={styles.stat}>
      <p style={styles.statNumber}>{number}</p>
      <p style={styles.statLabel}>{label}</p>
    </div>
  );
}

function NotificationBanner({ notification }) {
  if (!notification) {
    return null;
  }

  const isSuccess = notification.type === "success";

  return (
    <div
      style={{
        ...styles.banner,
        background: isSuccess ? "#F0FDF4" : "#FEF2F2",
        border: isSuccess ? "1px solid #BBF7D0" : "1px solid #FECACA",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "14px",
          fontWeight: 600,
          color: isSuccess ? "#166534" : "#991B1B",
        }}
      >
        {notification.message}
      </p>
      {notification.details ? (
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: isSuccess ? "#15803D" : "#B91C1C" }}>
          {notification.details.original} KB &rarr; {notification.details.processed} KB ({notification.details.savings}% saved)
        </p>
      ) : null}
    </div>
  );
}

export default function StudioPage() {
  const {
    products,
    shop,
    billingEnabled: isBillingEnabled,
    hasPaidPlan,
    freeUsageCount,
    freeUsageLimit,
    freeUsageRemaining,
    quotaExceeded,
    savedWatermarkName,
    restorableProductIds,
  } = useLoaderData();
  const fetcher = useFetcher();
  const [loadingId, setLoadingId] = useState(null);
  const [watermark, setWatermark] = useState(null);
  const [processedImages, setProcessedImages] = useState({});
  const [notification, setNotification] = useState(null);
  const [restorableIds, setRestorableIds] = useState(
    () => new Set(restorableProductIds || []),
  );
  const canUseFreePlan = hasPaidPlan || !quotaExceeded;
  const quotaMessage = hasPaidPlan
    ? "Unlimited processing is active on your paid plan."
    : quotaExceeded
    ? `You have used all ${freeUsageLimit} free image operations. Upgrade to continue.`
    : `${freeUsageRemaining} of ${freeUsageLimit} free image operations remaining.`;
  const quotaTone = hasPaidPlan ? "#EFF6FF" : quotaExceeded ? "#FEF2F2" : "#F0FDF4";
  const quotaBorder = hasPaidPlan ? "#BFDBFE" : quotaExceeded ? "#FECACA" : "#BBF7D0";
  const quotaColor = hasPaidPlan ? "#1D4ED8" : quotaExceeded ? "#991B1B" : "#166534";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }

    if (fetcher.data.success) {
      const { type, message, originalSizeKB, processedSizeKB, productId, newImageUrl, newMediaId } =
        fetcher.data;

      const savings =
        originalSizeKB && processedSizeKB
          ? (((originalSizeKB - processedSizeKB) / originalSizeKB) * 100).toFixed(1)
          : 0;

      setNotification({
        type: "success",
        message,
        details:
          originalSizeKB && processedSizeKB
            ? {
                original: originalSizeKB,
                processed: processedSizeKB,
                savings,
              }
            : null,
      });

      const nextState =
        type === "watermark" ? "watermarked" : type === "compress" ? "optimized" : "original";

      if (newImageUrl && productId) {
        setProcessedImages((previous) => ({
          ...previous,
          [productId]: {
            url: `${newImageUrl}?t=${Date.now()}`,
            mediaId: newMediaId || previous[productId]?.mediaId,
            state: nextState,
          },
        }));
      }

      // Track whether a restorable original backup exists for this product.
      if (productId) {
        setRestorableIds((previous) => {
          const next = new Set(previous);
          if (type === "remove") {
            next.delete(productId);
          } else {
            next.add(productId);
          }
          return next;
        });
      }
    } else {
      setNotification({
        type: "error",
        message: fetcher.data.message || "Something went wrong while updating the image.",
      });
    }

    setLoadingId(null);
    const timer = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(timer);
  }, [fetcher.state, fetcher.data]);

  const handleClick = (mediaId, imageSrc, type, productId) => {
    setLoadingId(mediaId);
    setNotification(null);

    const formData = new FormData();
    formData.append("mediaId", mediaId);
    formData.append("imageSrc", imageSrc);
    formData.append("type", type);
    formData.append("shop", shop);
    formData.append("productId", productId);

    if (type === "watermark" && watermark) {
      formData.append("watermark", watermark);
    }

    fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
  };

  const processedProductIds = new Set(
    products
      .filter(({ node }) => getMediaProcessingState(node.media.edges[0]?.node?.image) !== "original")
      .map(({ node }) => node.id),
  );

  Object.keys(processedImages).forEach((productId) => {
    processedProductIds.add(productId);
  });

  const processedCount = processedProductIds.size;
  const effectiveWatermarkName = watermark?.name || savedWatermarkName;

  return (
    <div style={styles.page}>
      <TitleBar title={`${BRAND.shortName} Studio`} />
      <div style={styles.shell}>
        {/* Hero */}
        <section style={styles.hero}>
          <div style={styles.heroGrid}>
            <div>
              <div style={styles.badge}>Studio</div>
              <h1 style={styles.heroTitle}>Optimize your product images.</h1>
              <p style={styles.heroBody}>
                Compress for faster pages or add watermarks for brand protection — all from one workspace.
              </p>

              <div style={styles.statsRow}>
                <SummaryStat number={products.length} label="Products" />
                <SummaryStat number={processedCount} label="Processed" />
                <SummaryStat
                  number={hasPaidPlan ? "∞" : freeUsageRemaining}
                  label={hasPaidPlan ? "Remaining" : "Free left"}
                />
              </div>
            </div>

            <div style={styles.sidePanel}>
              <div>
                <p style={styles.sideLabel}>Watermark</p>
                <p style={styles.sideValue}>
                  {effectiveWatermarkName ? "Custom uploaded" : "Default"}
                </p>
              </div>
              <div>
                <p style={styles.sideLabel}>Compression</p>
                <p style={styles.sideValue}>JPEG @ 50%</p>
              </div>
              <div>
                <p style={styles.sideLabel}>Output</p>
                <p style={{ ...styles.sideValue, fontSize: "13px", fontWeight: 400, opacity: 0.8 }}>
                  Replaces the original media on each product.
                </p>
              </div>
              <div>
                <p style={styles.sideLabel}>Plan</p>
                <p style={{ ...styles.sideValue, fontSize: "13px", fontWeight: 400, opacity: 0.8 }}>
                  {hasPaidPlan
                    ? "Unlimited paid plan"
                    : `${freeUsageCount} used · ${freeUsageRemaining} free left`}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Content */}
        <div style={styles.contentGrid}>
          {/* Sidebar */}
          <aside style={styles.sidebar}>
            <h2 style={styles.sidebarTitle}>Watermark</h2>
            <p style={styles.sidebarBody}>
              Upload a PNG to use as your watermark. Without one, the default mark is used.
            </p>

            <input
              id="watermark-upload"
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(event) => setWatermark(event.target.files[0])}
            />

            <label htmlFor="watermark-upload" style={styles.uploadField}>
              <strong style={{ display: "block", marginBottom: "4px", color: "#1E293B", fontSize: "13px" }}>
                Upload watermark
              </strong>
              <span style={{ fontSize: "12px", color: "#64748B" }}>
                PNG recommended, placed at top-left corner.
              </span>
            </label>

            {effectiveWatermarkName ? (
              <div style={styles.uploadName}>{effectiveWatermarkName}</div>
            ) : null}

            <div style={styles.noteList}>
              <div style={styles.noteItem}>Compress outputs a lighter JPG for faster loading.</div>
              <div style={styles.noteItem}>Watermark outputs a PNG with your mark applied.</div>
              <div style={styles.noteItem}>
                Changed your mind? Use "Remove watermark" to restore the original image.
              </div>
              <div style={styles.noteItem}>Each update replaces the old media automatically.</div>
            </div>
          </aside>

          {/* Product grid */}
          <section>
            <NotificationBanner notification={notification} />
            {isBillingEnabled ? (
              <div
                style={{
                  ...styles.banner,
                  background: quotaTone,
                  border: `1px solid ${quotaBorder}`,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    fontWeight: 600,
                    color: quotaColor,
                  }}
                >
                  {quotaMessage}
                </p>
                {!hasPaidPlan ? (
                  <p style={{ margin: "4px 0 0", fontSize: "13px", color: quotaColor }}>
                    Upgrade any time for unlimited image processing.
                  </p>
                ) : null}
              </div>
            ) : null}

            {products.length === 0 ? (
              <div style={styles.emptyState}>
                <h2 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: 600, color: "#1E293B" }}>
                  No products found.
                </h2>
                <p style={{ margin: 0, fontSize: "14px", color: "#64748B", lineHeight: 1.6 }}>
                  Add products with images to your store, then come back here to optimize them.
                </p>
              </div>
            ) : (
              <div style={styles.productGrid}>
                {products.map(({ node }) => {
                  const media = node.media.edges[0]?.node;
                  const originalImage = media?.image;
                  const processedData = processedImages[node.id];
                  const currentImage = processedData?.url || originalImage?.url;
                  const currentMediaId = processedData?.mediaId || media?.id;
                  const isBusy = loadingId === currentMediaId;
                  const requestedType = fetcher.submission?.formData.get("type");
                  const persistedState = getMediaProcessingState(originalImage);
                  const currentState = processedData?.state || persistedState;
                  const isProcessed = currentState !== "original";
                  const isWatermarked = currentState === "watermarked";
                  const canRestore = isWatermarked && restorableIds.has(node.id);
                  const statusLabel =
                    currentState === "watermarked"
                      ? "Watermarked"
                      : currentState === "optimized"
                      ? "Optimized"
                      : "Original";

                  return (
                    <article key={node.id} style={styles.productCard}>
                      {currentImage ? (
                        <>
                          <div style={styles.mediaFrame}>
                            <img
                              key={currentImage}
                              src={currentImage}
                              alt={originalImage?.altText || "Product image"}
                              style={styles.mediaImage}
                            />
                          </div>
                          <div style={styles.cardBody}>
                            <div style={styles.cardTopRow}>
                              <h3 style={styles.productTitle}>{node.title}</h3>
                              <span
                                style={{
                                  ...styles.statusPill,
                                  color: isProcessed ? "#4F46E5" : "#64748B",
                                  background: isProcessed ? "#EEF2FF" : "#F1F5F9",
                                }}
                              >
                                {statusLabel}
                              </span>
                            </div>

                            <div style={styles.actionRow}>
                              {canUseFreePlan ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() =>
                                      handleClick(currentMediaId, currentImage, "compress", node.id)
                                    }
                                    style={{
                                      ...styles.button,
                                      background: isBusy ? "#94A3B8" : "#4F46E5",
                                      color: "#fff",
                                      opacity: isBusy && requestedType !== "compress" ? 0.6 : 1,
                                    }}
                                  >
                                    {isBusy && requestedType === "compress"
                                      ? "Compressing..."
                                      : currentState === "optimized" || currentState === "watermarked"
                                      ? "Re-compress"
                                      : "Compress"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() =>
                                      handleClick(currentMediaId, currentImage, "watermark", node.id)
                                    }
                                    style={{
                                      ...styles.button,
                                      background: isBusy ? "#94A3B8" : "#1E293B",
                                      color: "#fff",
                                      opacity: isBusy && requestedType !== "watermark" ? 0.6 : 1,
                                    }}
                                  >
                                    {isBusy && requestedType === "watermark"
                                      ? "Applying..."
                                      : currentState === "watermarked"
                                      ? "Re-watermark"
                                      : "Watermark"}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <PersistentLink to="/app/upgrade" style={{ flex: 1 }}>
                                    <button
                                      type="button"
                                      style={{
                                        ...styles.button,
                                        width: "100%",
                                        background: "#4F46E5",
                                        color: "#fff",
                                      }}
                                    >
                                      Upgrade to continue
                                    </button>
                                  </PersistentLink>
                                  <PersistentLink to="/app/plans" style={{ flex: 1 }}>
                                    <button
                                      type="button"
                                      style={{
                                        ...styles.button,
                                        width: "100%",
                                        background: "#1E293B",
                                        color: "#fff",
                                      }}
                                    >
                                      View plan
                                    </button>
                                  </PersistentLink>
                                </>
                              )}
                            </div>

                            {canRestore ? (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  handleClick(currentMediaId, currentImage, "remove", node.id)
                                }
                                style={{
                                  ...styles.button,
                                  width: "100%",
                                  marginTop: "8px",
                                  background: "#fff",
                                  color: "#B91C1C",
                                  border: "1px solid #FECACA",
                                  opacity: isBusy && requestedType !== "remove" ? 0.6 : 1,
                                }}
                              >
                                {isBusy && requestedType === "remove"
                                  ? "Removing..."
                                  : "Remove watermark"}
                              </button>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <div style={{ ...styles.cardBody, padding: "32px 20px" }}>
                          <h3 style={{ ...styles.productTitle, marginBottom: "6px" }}>{node.title}</h3>
                          <p style={{ margin: 0, fontSize: "13px", color: "#64748B", lineHeight: 1.5 }}>
                            No image attached to this product yet.
                          </p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
