import json
from elasticsearch import helpers

def load(client, es_client):
    db = client["onerep-data"]
    
    with open("datasets/free-exercise-db/dist/exercises.json", "r") as f:
        exercises = json.load(f)
    
    print("Loading exercises data into MongoDB...")
    db["exercises"].insert_many(exercises)

    print("Indexing exercises into Elasticsearch...")
    actions = [
        {
            "_index": "exercises",
            "_id": doc.get("id") or str(i),
            "_source": doc
        }
        for i, doc in enumerate(exercises)
    ]
    
    helpers.bulk(es_client, actions)