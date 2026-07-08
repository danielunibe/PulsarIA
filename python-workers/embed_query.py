import argparse
import json
import sys
import time

def embed_query(query: str):
    start_time = time.time()
    # Delayed import to optimize memory footprint
    from sentence_transformers import SentenceTransformer
    
    # Log inference start
    print(f"[Python] Generating embedding for query: '{query}'", file=sys.stderr, flush=True)
    
    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    emb = model.encode([query])[0]
    
    elapsed_ms = (time.time() - start_time) * 1000
    dim = len(emb)
    
    print(f"[Python] Success: Generated {dim}-d vector in {elapsed_ms:.2f}ms", file=sys.stderr, flush=True)
    
    # Return as JSON list of floats for Rust to deserialize
    print(json.dumps(emb.astype("float32").tolist()), flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("query", type=str, help="The search query to encode")
    args = parser.parse_args()
    
    try:
        embed_query(args.query)
    except Exception as e:
        # Print error as JSON dict to stderr and fail gracefully
        print(json.dumps({"error": str(e)}), file=sys.stderr, flush=True)
        sys.exit(1)
