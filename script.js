export async function fetchAllAssetData(db, admin) {
  try {
    // console.log("Fetching assetData...", db);
    const CollectionRef = db.collection("assetData");
    const snapshot = await CollectionRef.get();
    if (snapshot.empty) {
      console.log("No projects found in assetData collection.");
      return;
    }
    snapshot.forEach(async (doc) => {
        if ( doc.id === 'RWkr3hKiUeJtqN2W6MEa' ) {
            try {
              const response = await fetch(`https://pdf-server-masal.onrender.com/download-pdf?projectId=${doc.id}`);
              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }
              console.log("PDF download successful for project:", doc.id);
            } catch (err) {
              console.error("Error downloading PDF:", err);
            }
            console.log(`Project ID: ${doc.id}`);
        }
    });
  } catch (error) {
    console.error("Error fetching assetData:", error);
  }
}
