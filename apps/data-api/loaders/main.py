import os
import dotenv
import pymongo
from elasticsearch import Elasticsearch
import foods
import exercises

dotenv.load_dotenv("../.env")

# Clients
mongo_client = pymongo.MongoClient(os.getenv("MONGO_URL"))
es_client = Elasticsearch(os.getenv("ELASTIC_URL"))
db = mongo_client["onerep-data"]

if not os.path.exists("datasets/foods.parquet"):
    os.system("./clone_datasets.sh")

# Load Foods
if db["foods"].count_documents({}) == 0:
    print("Loading foods into Mongo and Elastic...")
    foods.load(mongo_client, es_client)

# Load Exercises
if db["exercises"].count_documents({}) == 0:
    print("Loading exercises into Mongo and Elastic...")
    # Assuming exercises.load follows a similar pattern to foods.load
    exercises.load(mongo_client, es_client)

print("Data synchronization complete.")