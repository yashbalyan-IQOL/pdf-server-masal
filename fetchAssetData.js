import "dotenv/config";
import admin from "firebase-admin";

let firebaseConfig;
if (
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
) {
  firebaseConfig = {
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  };
}

admin.initializeApp(firebaseConfig);
const db = admin.firestore();

export async function fetchAllAssetData() {
  try {
    const snapshot = await db.collection("assetData").get();
    if (snapshot.empty) {
      console.log("No projects found in assetData collection.");
      return;
    }
    snapshot.forEach((doc) => {
      console.log(`Project ID: ${doc.id}`);
      console.log(doc.data());
      console.log("----------------------");
    });
  } catch (error) {
    console.error("Error fetching assetData:", error);
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  fetchAllAssetData().then(() => process.exit());
}
