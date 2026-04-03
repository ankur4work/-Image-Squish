// // app/routes/app.routes.jsx

// import { json } from "@remix-run/node";
// import { useLoaderData } from "@remix-run/react";
// import prisma from "../db.server";

// // Loader function to fetch shop data from the database
// export const loader = async () => {
//   try {
//     const shops = await prisma.shop.findMany();
//     console.log("Fetched shops:", shops); // Check if data is fetched correctly
//     return json({ shops });
//   } catch (error) {
//     console.error("Error fetching shops:", error);
//     return json({ shops: [] });
//   }
// };

// // React component that renders the shops
// export default function Shops() {
//   const data = useLoaderData();

//   // Check if the shops data is available
//   const shops = data?.shops || [];

//   return (
//     <div>
//       <h1>All Shops</h1>
//       {shops.length > 0 ? (
//         <ul>
//           {shops.map((shop) => (
//             <li key={shop.id}>
//               <strong>{shop.shop}</strong> — Token: {shop.accessToken}
//             </li>
//           ))}
//         </ul>
//       ) : (
//         <p>No shops found.</p>
//       )}
//     </div>
//   );
// }
