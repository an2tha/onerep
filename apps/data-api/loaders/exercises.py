import json
from elasticsearch import helpers

def load(client, es_client):
    db = client["onerep-data"]
    collection = db["exercises"]
    
    with open("datasets/free-exercise-db/dist/exercises.json", "r") as f:
        exercises = json.load(f)
    
    processed_exercises = []
    for doc in exercises:
        p_doc = dict(doc)
        
        if "id" in p_doc:
            p_doc["_id"] = p_doc["id"]
            
        processed_exercises.append(p_doc)

    print(f"Syncing {len(processed_exercises)} exercises...")

    try:
        collection.insert_many([dict(d) for d in processed_exercises], ordered=False)
    except Exception as e:
        print(f"Mongo insertion note: {e}")

    actions = [
        {
            "_index": "exercises",
            "_id": str(doc.get("id")),
            "_source": doc
        }
        for doc in processed_exercises
    ]
    
    helpers.bulk(es_client, actions)
    print("Exercise sync complete.")