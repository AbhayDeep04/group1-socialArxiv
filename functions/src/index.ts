import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { parsePdf } from "./utils/pdf-parser";
import { chunkPages } from "./utils/chunking";
import { generateEmbeddings } from "./utils/embeddings";
import { upsertPoints, generatePointId, QdrantPoint } from "./utils/qdrant";

// Initialize Firebase Admin
admin.initializeApp();

const QDRANT_COLLECTION = "paper_chunks";
const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Cloud Function triggered when a PDF is uploaded to Storage
 */
export const processPdfUpload = functions
  .runWith({
    timeoutSeconds: 540, // 9 minutes
    memory: "2GB",
    secrets: ["QDRANT_URL", "QDRANT_API_KEY", "OPENAI_API_KEY"],
  })
  .storage.bucket("social-arxiv-demo-63c41.firebasestorage.app")
  .object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    
    // Only process files in user-uploads directory
    if (!filePath || !filePath.startsWith("user-uploads/")) {
      console.log("Skipping non-user-upload file:", filePath);
      return;
    }

    // Parse path: user-uploads/{uid}/{paperId}/source.pdf
    const pathParts = filePath.split("/");
    if (pathParts.length !== 4 || pathParts[3] !== "source.pdf") {
      console.log("Skipping file with incorrect path structure:", filePath);
      return;
    }

    const userId = pathParts[1];
    const paperId = pathParts[2];

    console.log(`Processing PDF upload for user ${userId}, paper ${paperId}`);

    try {
      // 1. Fetch paper document from Firestore
      const paperRef = admin.firestore().collection("papers").doc(paperId);
      const paperDoc = await paperRef.get();

      if (!paperDoc.exists) {
        console.error(`Paper document ${paperId} not found`);
        return;
      }

      const paperData = paperDoc.data();
      
      if (paperData?.ownerId !== userId) {
        console.error(`Owner mismatch for paper ${paperId}`);
        return;
      }

      if (paperData?.status === "ready") {
        console.log(`Paper ${paperId} already processed, skipping`);
        return;
      }

      // Update status to processing
      await paperRef.update({
        status: "processing",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 2. Download PDF from Storage
      console.log("Downloading PDF from Storage...");
      const bucket = admin.storage().bucket();
      const file = bucket.file(filePath);
      const [buffer] = await file.download();

      // 3. Extract text from PDF
      console.log("Extracting text from PDF...");
      const pdfResult = await parsePdf(buffer);
      console.log(`Extracted ${pdfResult.totalPages} pages from PDF`);

      // 4. Chunk the text
      console.log("Chunking text...");
      const chunks = chunkPages(pdfResult.pages, {
        chunkSize: 1400,
        overlap: 200,
      });
      console.log(`Created ${chunks.length} chunks`);

      if (chunks.length === 0) {
        throw new Error("No text content extracted from PDF");
      }

      // 5. Generate embeddings
      console.log("Generating embeddings...");
      const texts = chunks.map((c) => c.text);
      const embeddings = await generateEmbeddings(texts);
      console.log(`Generated ${embeddings.length} embeddings`);

      // 6. Prepare Qdrant points
      console.log("Preparing Qdrant points...");
      const points: QdrantPoint[] = chunks.map((chunk, index) => ({
        id: generatePointId(paperId, chunk.chunkIndex),
        vector: embeddings[index],
        payload: {
          paperId,
          ownerId: userId,
          source: "upload",
          visibility: paperData?.visibility || "private",
          chunkIndex: chunk.chunkIndex,
          page: chunk.page,
          text: chunk.text,
          title: paperData?.title || "",
          authors: paperData?.authors || [],
          year: paperData?.year || null,
          createdAt: new Date().toISOString(),
        },
      }));

      // 7. Upsert to Qdrant
      console.log("Upserting to Qdrant...");
      await upsertPoints(QDRANT_COLLECTION, points);

      // 8. Update Firestore document
      await paperRef.update({
        status: "ready",
        pageCount: pdfResult.totalPages,
        chunkCount: chunks.length,
        embeddingModel: EMBEDDING_MODEL,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: null,
      });

      console.log(`Successfully processed paper ${paperId}`);
    } catch (error) {
      console.error(`Error processing paper ${paperId}:`, error);

      // Update Firestore with error
      try {
        await admin.firestore().collection("papers").doc(paperId).update({
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (updateError) {
        console.error("Failed to update error status:", updateError);
      }

      throw error;
    }
  });
