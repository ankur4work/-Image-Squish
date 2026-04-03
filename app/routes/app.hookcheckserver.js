// import { Shopify, ShopifyHeader } from "@shopify/shopify-api";
// import crypto from "crypto";

// export default function validateWebhookRequest(req, res, next) {
//     try {
//         const generatedHash = crypto
//             .createHmac("SHA256", Shopify.Context.API_SECRET_KEY)
//             .update(JSON.stringify(req.body), "utf8")
//             .digest("base64");
//         const hmac = req.get(ShopifyHeader.Hmac); // Equal to 'X-Shopify-Hmac-Sha256' at time of coding

//         const safeCompareResult = Shopify.Utils.safeCompare(generatedHash, hmac);

//         if (!safeCompareResult) {
//             res.status(200);
//             next();
//         } else {
//             return res.status(401).json({ succeeded: false, message: "Not Authorized" }).send();
//         }
//     } catch (error) {
//         console.log(error);
//         return res.status(401).json({ succeeded: false, message: "Error caught" }).send();
//     }
// }