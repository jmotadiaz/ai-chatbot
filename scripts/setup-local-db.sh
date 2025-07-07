#!/bin/bash

# Script to set up local PostgreSQL database for development

echo "🐘 Setting up local PostgreSQL database..."

# Start Docker containers
echo "📦 Starting Docker containers..."
docker-compose up -d

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10

# Check if database is ready
echo "🔍 Checking database connection..."
until docker-compose exec postgres pg_isready -U postgres; do
  echo "Waiting for PostgreSQL..."
  sleep 2
done

# Install pgvector extension
echo "🔧 Installing pgvector extension..."
docker-compose exec postgres psql -U postgres -d main -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run migrations
echo "🚀 Running database migrations..."
pnpm db:migrate

echo "✅ Local database setup complete!"
echo ""
echo "Your local PostgreSQL is now running on:"
echo "  - Host: localhost"
echo "  - Port: 5432"
echo "  - Database: main"
echo "  - User: postgres"
echo "  - Password: postgres"
echo ""
echo "To stop the database, run: docker-compose down"
echo "To view logs, run: docker-compose logs -f"