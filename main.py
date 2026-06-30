import io
import os
import time
import hashlib
import asyncio
import json
import pypdf
import docx2txt
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec

# Load environment variables
load_dotenv()

# Global thread pool for offloading synchronous Pinecone calls
executor = ThreadPoolExecutor(max_workers=10)

app = FastAPI(
    title="Pinecone Document Ingestion Pipeline",
    description="Backend API for uploading and indexing files to Pinecone using inference models.",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

INDEX_NAME = "knowledge"
EMBEDDING_MODEL = "llama-text-embed-v2"
DIMENSION = 1024  # llama-text-embed-v2 supports [384, 512, 768, 1024, 2048]

# Helper to initialize Pinecone
def get_pinecone_client() -> Pinecone:
    api_key = os.environ.get("PINECONE_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="PINECONE_API_KEY is not set in the environment. Please set this variable."
        )
    try:
        return Pinecone(api_key=api_key)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initialize Pinecone client: {str(e)}"
        )

# Helper to get or create index
def get_or_create_index(pc: Pinecone):
    try:
        if not pc.has_index(INDEX_NAME):
            print(f"Creating Pinecone index '{INDEX_NAME}'...")
            pc.create_index(
                name=INDEX_NAME,
                dimension=DIMENSION,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1")
            )
            # Wait until index is ready
            while not pc.describe_index(INDEX_NAME).status['ready']:
                time.sleep(1)
            print(f"Index '{INDEX_NAME}' is now ready.")
        return pc.Index(INDEX_NAME)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve or create Pinecone index: {str(e)}"
        )

def extract_text_from_file(file_content: bytes, filename: str) -> str:
    ext = filename.split(".")[-1].lower()
    if ext == "pdf":
        try:
            pdf_file = io.BytesIO(file_content)
            reader = pypdf.PdfReader(pdf_file)
            text_parts = []
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
            return "\n".join(text_parts)
        except Exception as e:
            raise ValueError(f"Error parsing PDF file: {str(e)}")
            
    elif ext == "docx":
        try:
            docx_file = io.BytesIO(file_content)
            text = docx2txt.process(docx_file)
            return text
        except Exception as e:
            raise ValueError(f"Error parsing Word Document (.docx): {str(e)}")
            
    else:
        # Fallback to general text decoding
        try:
            return file_content.decode("utf-8")
        except UnicodeDecodeError:
            try:
                # Try common European fallback
                return file_content.decode("latin-1")
            except Exception as e:
                raise ValueError(
                    f"Could not decode file content as text. Supported types: .pdf, .docx, or plain text (.txt, .md, etc.). Error: {str(e)}"
                )

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    text = text.strip()
    if not text:
        return []
    
    # Clean up excess whitespace/newlines
    text = "\n".join([line.strip() for line in text.splitlines() if line.strip()])
    
    chunks = []
    # If the text is shorter than the chunk size, keep it as is
    if len(text) <= chunk_size:
        return [text]
        
    start = 0
    while start < len(text):
        end = start + chunk_size
        
        # Try to find a clean break (space or newline) near the end to avoid splitting words
        if end < len(text):
            # Look back up to 80 characters for a newline or space
            space_idx = text.rfind('\n', end - 80, end)
            if space_idx == -1:
                space_idx = text.rfind(' ', end - 80, end)
            if space_idx != -1:
                end = space_idx
                
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
            
        start = end - overlap
        # Prevent infinite loops by forcing forward progress
        if start >= len(text) or end == len(text):
            break
        if start < 0:
            start = 0
        if start >= end:
            start = end + 1
            
    return chunks

async def retry_with_backoff(func, max_retries=5, initial_backoff=1.0, max_backoff=16.0, timeout=30.0):
    backoff = initial_backoff
    for attempt in range(max_retries):
        try:
            loop = asyncio.get_running_loop()
            res = await asyncio.wait_for(
                loop.run_in_executor(executor, func),
                timeout=timeout
            )
            return res
        except asyncio.TimeoutError:
            print(f"Timeout on attempt {attempt + 1}/{max_retries}")
            if attempt == max_retries - 1:
                raise TimeoutError(f"Operation timed out after {timeout} seconds and {max_retries} attempts.")
        except Exception as e:
            err_msg = str(e).lower()
            is_transient = any(msg in err_msg for msg in ["429", "rate limit", "throttled", "timeout", "connection", "server error", "500", "503", "rate_limit"])
            print(f"Error on attempt {attempt + 1}/{max_retries}: {e}")
            if attempt == max_retries - 1 or not is_transient:
                raise e
            
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, max_backoff)

# Mount static files folder
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse("static/index.html")

@app.get("/api/health")
async def health_check():
    """Verify that the API is running and check if the Pinecone API key is set."""
    api_key = os.environ.get("PINECONE_API_KEY")
    return {
        "status": "healthy",
        "pinecone_configured": bool(api_key),
        "timestamp": time.time()
    }

@app.get("/api/stats")
async def get_stats():
    """Retrieve index statistics from Pinecone."""
    pc = get_pinecone_client()
    try:
        if not pc.has_index(INDEX_NAME):
            return {
                "exists": False,
                "message": f"Index '{INDEX_NAME}' does not exist yet. It will be created on the first upload.",
                "total_vector_count": 0
            }
        
        index = pc.Index(INDEX_NAME)
        stats = index.describe_index_stats()
        return {
            "exists": True,
            "total_vector_count": stats.get("total_vector_count", 0),
            "namespaces": stats.get("namespaces", {}),
            "dimension": DIMENSION,
            "model": EMBEDDING_MODEL
        }
    except Exception as e:
        return {
            "exists": False,
            "error": f"Failed to retrieve index stats: {str(e)}",
            "total_vector_count": 0
        }

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Uploads a file, chunks its text, generates embeddings, and indexes them in Pinecone."""
    filename = file.filename
    content = await file.read()
    
    async def progress_generator():
        try:
            # Stage 1: Parsing
            yield f"data: {json.dumps({'stage': 'parsing', 'status': 'running', 'progress': 20})}\n\n"
            
            # Offload file parsing to executor to prevent blocking
            loop = asyncio.get_running_loop()
            text = await loop.run_in_executor(
                executor,
                lambda: extract_text_from_file(content, filename)
            )
            
            yield f"data: {json.dumps({'stage': 'parsing', 'status': 'running', 'progress': 70})}\n\n"
            
            chunks = chunk_text(text)
            if not chunks:
                yield f"data: {json.dumps({'status': 'error', 'detail': 'No readable text could be extracted from the file.'})}\n\n"
                return
                
            yield f"data: {json.dumps({'stage': 'parsing', 'status': 'complete', 'progress': 100, 'total_chunks': len(chunks)})}\n\n"
            
            # Stage 2 & 3 Init
            pc = get_pinecone_client()
            index = get_or_create_index(pc)
            
            doc_hash = hashlib.md5(content).hexdigest()[:8]
            clean_filename = "".join(c if c.isalnum() or c in "-_" else "_" for c in filename)
            doc_id = f"{clean_filename}_{doc_hash}"
            
            batch_size = 25  # Process 25 chunks per batch
            batches = [chunks[i : i + batch_size] for i in range(0, len(chunks), batch_size)]
            num_batches = len(batches)
            total_chunks = len(chunks)
            
            # Parallel worker setup
            queue = asyncio.Queue()
            sem = asyncio.Semaphore(2)  # Limit concurrent requests to Pinecone to 2 to avoid rate limits
            
            async def worker(batch_idx, batch_chunks):
                async with sem:
                    try:
                        # Inform queue that embedding has started for this batch
                        await queue.put({"type": "embed_start", "batch_idx": batch_idx, "count": len(batch_chunks)})
                        
                        # Perform embedding (concurrently in thread pool with retry & timeout)
                        embeddings_res = await retry_with_backoff(
                            lambda: pc.inference.embed(
                                model=EMBEDDING_MODEL,
                                inputs=batch_chunks,
                                parameters={"input_type": "passage", "truncate": "END", "dimension": DIMENSION}
                            ),
                            max_retries=5,
                            initial_backoff=1.0,
                            timeout=30.0
                        )
                        
                        await queue.put({"type": "embed_complete", "batch_idx": batch_idx, "count": len(batch_chunks)})
                        
                        # Prepare vectors list
                        vectors = []
                        for j, emb in enumerate(embeddings_res):
                            chunk_idx = batch_idx * batch_size + j
                            vector_id = f"{doc_id}_chunk_{chunk_idx}"
                            vectors.append({
                                "id": vector_id,
                                "values": emb["values"],
                                "metadata": {
                                    "filename": filename,
                                    "text": batch_chunks[j],
                                    "chunk_index": chunk_idx,
                                    "doc_id": doc_id,
                                    "timestamp": time.time()
                                }
                            })
                        
                        # Inform queue that upserting has started for this batch
                        await queue.put({"type": "upsert_start", "batch_idx": batch_idx, "count": len(vectors)})
                        
                        # Perform upsert (concurrently in thread pool with retry & timeout)
                        await retry_with_backoff(
                            lambda: index.upsert(vectors=vectors),
                            max_retries=5,
                            initial_backoff=1.0,
                            timeout=30.0
                        )
                        
                        await queue.put({"type": "upsert_complete", "batch_idx": batch_idx, "count": len(vectors)})
                        
                    except Exception as e:
                        await queue.put({"type": "error", "error": f"Batch {batch_idx} failed: {str(e)}"})
            
            # Fire all worker tasks
            tasks = [asyncio.create_task(worker(i, batch)) for i, batch in enumerate(batches)]
            
            embedded_count = 0
            upserted_count = 0
            completed_batches = 0
            start_time = time.time()
            
            # Initial SSE updates for embedding/upserting stages
            yield f"data: {json.dumps({'stage': 'embedding', 'status': 'running', 'progress': 0, 'current': 0, 'total': total_chunks})}\n\n"
            yield f"data: {json.dumps({'stage': 'upserting', 'status': 'pending', 'progress': 0, 'current': 0, 'total': total_chunks})}\n\n"
            
            while completed_batches < num_batches:
                msg = await queue.get()
                
                if msg["type"] == "error":
                    # Cancel all other tasks
                    for t in tasks:
                        t.cancel()
                    yield f"data: {json.dumps({'status': 'error', 'detail': msg['error']})}\n\n"
                    return
                
                elif msg["type"] == "embed_complete":
                    embedded_count += msg["count"]
                    progress = int((embedded_count / total_chunks) * 100)
                    yield f"data: {json.dumps({'stage': 'embedding', 'status': 'running' if embedded_count < total_chunks else 'complete', 'progress': progress, 'current': embedded_count, 'total': total_chunks})}\n\n"
                    
                elif msg["type"] == "upsert_start":
                    progress = int((upserted_count / total_chunks) * 100)
                    yield f"data: {json.dumps({'stage': 'upserting', 'status': 'running', 'progress': progress, 'current': upserted_count, 'total': total_chunks})}\n\n"
                    
                elif msg["type"] == "upsert_complete":
                    upserted_count += msg["count"]
                    progress = int((upserted_count / total_chunks) * 100)
                    completed_batches += 1
                    yield f"data: {json.dumps({'stage': 'upserting', 'status': 'running' if completed_batches < num_batches else 'complete', 'progress': progress, 'current': upserted_count, 'total': total_chunks})}\n\n"
            
            # Wait for all tasks to cleanly exit
            await asyncio.gather(*tasks, return_exceptions=True)
            
            elapsed_time = time.time() - start_time
            
            # Yield final success metadata
            yield f"data: {json.dumps({'status': 'success', 'filename': filename, 'document_id': doc_id, 'chunks_count': total_chunks, 'upserted_count': upserted_count, 'elapsed_seconds': round(elapsed_time, 2)})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'detail': f'Internal Ingestion Error: {str(e)}'})}\n\n"
            
    return StreamingResponse(progress_generator(), media_type="text/event-stream")

@app.get("/api/search")
async def search_index(
    query: str = Query(..., description="The query string to search for"),
    top_k: int = Query(5, description="Number of results to return")
):
    """Embeds the query and searches the Pinecone index for the most similar document chunks."""
    if not query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
        
    pc = get_pinecone_client()
    
    try:
        if not pc.has_index(INDEX_NAME):
            return {
                "query": query,
                "results": [],
                "message": "No index exists yet. Upload a file to initialize the system."
            }
            
        index = pc.Index(INDEX_NAME)
        
        # Step 1: Embed the search query
        embeddings_res = pc.inference.embed(
            model=EMBEDDING_MODEL,
            inputs=[query],
            parameters={"input_type": "query", "truncate": "END", "dimension": DIMENSION}
        )
        
        query_vector = embeddings_res[0]["values"]
        
        # Step 2: Query the Index
        results = index.query(
            vector=query_vector,
            top_k=top_k,
            include_metadata=True
        )
        
        matches = []
        for match in results.get("matches", []):
            matches.append({
                "id": match.get("id"),
                "score": round(match.get("score", 0.0), 4),
                "metadata": match.get("metadata", {})
            })
            
        return {
            "query": query,
            "results": matches
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
