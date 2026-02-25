#!/bin/bash
cd /app/frontend
npx expo export --platform web 2>&1
sudo supervisorctl restart expo
echo "Frontend rebuilt and served"
