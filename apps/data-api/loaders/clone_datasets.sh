mkdir -p datasets
cd datasets

git clone https://github.com/yuhonas/free-exercise-db.git 2> /dev/null

echo "Downloading foods.parquet (This may take a while)..."
curl -L --progress-bar  "https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet?download=true" -o foods.parquet 